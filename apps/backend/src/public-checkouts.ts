import type { CheckoutAcceptance, PublicCheckoutCreate } from "@pms/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { runBatch, type Db } from "./db";
import { checkoutAcceptances, publicCheckouts, quotes } from "./db/schema";
import { HttpError } from "./http";
import { nightsBetween } from "./lib/dates";
import { offerAmounts } from "./public-offers";
import { priceQuote, quoteExpired, type Quote } from "./quotes";
import { acceptPhone } from "./rules";

export type PublicCheckout = typeof publicCheckouts.$inferSelect;

type CheckoutContext = { today: string; now: Date; published: string[] };

const TOKEN_BYTES = 32;

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function availableQuote(db: Db, checkout: PublicCheckout, context: CheckoutContext) {
  if (!context.published.includes(checkout.roomTypeId))
    throw new HttpError(404, "room type not found");
  const { quote, available } = await priceQuote(
    db,
    {
      roomTypeId: checkout.roomTypeId,
      checkIn: checkout.checkIn,
      checkOut: checkout.checkOut,
      adults: checkout.adults,
      children: checkout.children,
      ratePlan: checkout.ratePlan,
    },
    { today: context.today, now: context.now, checkoutId: checkout.id },
  );
  if (!available) throw new HttpError(409, "no availability");
  return quote;
}

export async function startCheckout(db: Db, input: PublicCheckoutCreate, context: CheckoutContext) {
  const token = newToken();
  const checkout: PublicCheckout = {
    id: crypto.randomUUID(),
    tokenHash: await tokenHash(token),
    ...input,
    createdAt: context.now.toISOString(),
  };
  const quote = await availableQuote(db, checkout, context);
  await runBatch(db, [
    db.insert(publicCheckouts).values(checkout),
    db.insert(quotes).values(quote),
  ]);
  return { token, view: presentCheckout(checkout, quote, null, context) };
}

export async function checkoutForToken(db: Db, authorization: string | undefined) {
  const token = /^Bearer ([\w-]{43})$/.exec(authorization ?? "")?.[1];
  const [checkout] = token
    ? await db
        .select()
        .from(publicCheckouts)
        .where(eq(publicCheckouts.tokenHash, await tokenHash(token)))
    : [];
  if (!checkout) throw new HttpError(401, "invalid checkout token");
  return checkout;
}

export async function requoteCheckout(db: Db, checkout: PublicCheckout, context: CheckoutContext) {
  const quote = await availableQuote(db, checkout, context);
  await db.insert(quotes).values(quote);
  return presentCheckout(checkout, quote, await latestAcceptance(db, checkout.id), context);
}

export async function acceptCheckoutQuote(
  db: Db,
  checkout: PublicCheckout,
  input: CheckoutAcceptance,
  context: CheckoutContext,
) {
  const [quote] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, input.quoteId), eq(quotes.checkoutId, checkout.id)));
  if (!quote) throw new HttpError(404, "quote not found");
  if (quoteExpired(quote, context.now)) throw new HttpError(400, "quote has expired");
  const acceptance = {
    id: crypto.randomUUID(),
    checkoutId: checkout.id,
    quoteId: quote.id,
    ...input.contact,
    phone: acceptPhone(input.contact.phone),
    language: input.language,
    acceptedAt: context.now.toISOString(),
  };
  await db.insert(checkoutAcceptances).values(acceptance);
  return presentCheckout(checkout, await latestQuote(db, checkout.id), acceptance, context);
}

export async function readCheckout(db: Db, checkout: PublicCheckout, context: CheckoutContext) {
  const [quote, acceptance] = await Promise.all([
    latestQuote(db, checkout.id),
    latestAcceptance(db, checkout.id),
  ]);
  return presentCheckout(checkout, quote, acceptance, context);
}

async function latestQuote(db: Db, checkoutId: string) {
  const [quote] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.checkoutId, checkoutId))
    .orderBy(desc(quotes.createdAt), desc(sql`rowid`))
    .limit(1);
  return quote!;
}

export async function latestAcceptance(db: Db, checkoutId: string) {
  const [acceptance] = await db
    .select()
    .from(checkoutAcceptances)
    .where(eq(checkoutAcceptances.checkoutId, checkoutId))
    .orderBy(desc(checkoutAcceptances.acceptedAt), desc(sql`rowid`))
    .limit(1);
  return acceptance ?? null;
}

function presentCheckout(
  checkout: PublicCheckout,
  quote: Quote,
  acceptance: { quoteId: string; acceptedAt: string } | null,
  context: Pick<CheckoutContext, "today" | "now">,
) {
  return {
    roomTypeId: checkout.roomTypeId,
    checkIn: checkout.checkIn,
    checkOut: checkout.checkOut,
    nights: nightsBetween(checkout.checkIn, checkout.checkOut).length,
    adults: checkout.adults,
    children: checkout.children,
    ratePlan: checkout.ratePlan,
    language: checkout.language,
    quote: {
      id: quote.id,
      expired: quoteExpired(quote, context.now),
      nights: quote.nights.map(({ date, priceCents }) => ({ date, priceCents })),
      ...offerAmounts(quote, context.today),
    },
    acceptance: acceptance && { quoteId: acceptance.quoteId, acceptedAt: acceptance.acceptedAt },
  };
}
