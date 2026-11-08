import type { CheckoutAcceptance, PublicCheckoutCreate } from "@pms/shared";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { runBatch, type Db } from "./db";
import { checkoutAcceptances, publicCheckouts, quotes } from "./db/schema";
import { HttpError } from "./http";
import { latestCheckoutAttempt } from "./payment-attempts";
import { addDays, nightsBetween } from "./lib/dates";
import { offerAmounts } from "./public-offers";
import { priceQuote, quoteExpired, type Quote } from "./quotes";
import { acceptPhone, requireOnlineArrival } from "./rules";

export type PublicCheckout = typeof publicCheckouts.$inferSelect;

type CheckoutAcceptanceRow = typeof checkoutAcceptances.$inferSelect;

type CheckoutContext = { today: string; now: Date; published: string[] };

const TOKEN_BYTES = 32;
const TOKEN_LENGTH = Math.ceil((TOKEN_BYTES * 4) / 3);
const BEARER_TOKEN = new RegExp(`^bearer ([\\w-]{${TOKEN_LENGTH}})$`, "i");
const ACCESS_DAYS_AFTER_CHECKOUT = 30;
const MAX_ACCEPTANCES_PER_CHECKOUT = 20;

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

const accessUntil = (checkout: Pick<PublicCheckout, "checkOut">) =>
  addDays(checkout.checkOut, ACCESS_DAYS_AFTER_CHECKOUT);

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

export async function checkoutForToken(
  db: Db,
  authorization: string | undefined,
  context: Pick<CheckoutContext, "today">,
) {
  const token = BEARER_TOKEN.exec(authorization ?? "")?.[1];
  const [checkout] = token
    ? await db
        .select()
        .from(publicCheckouts)
        .where(eq(publicCheckouts.tokenHash, await tokenHash(token)))
    : [];
  if (!checkout || context.today > accessUntil(checkout))
    throw new HttpError(401, "invalid checkout token");
  return checkout;
}

export const CHECKOUT_HAS_PAYMENT = "checkout already has a payment";

export async function requoteCheckout(db: Db, checkout: PublicCheckout, context: CheckoutContext) {
  if (await latestCheckoutAttempt(db, checkout.id, { open: true }))
    throw new HttpError(409, CHECKOUT_HAS_PAYMENT);
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
  const quote = await requireCurrentQuote(db, checkout, input.quoteId, context);
  const terms = {
    quoteId: quote.id,
    ...input.contact,
    phone: acceptPhone(input.contact.phone),
    language: input.language,
  };
  const previous = await latestAcceptance(db, checkout.id);
  if (previous && sameAcceptance(previous, terms))
    return presentCheckout(checkout, quote, previous, context);
  const [{ accepted }] = await db
    .select({ accepted: count() })
    .from(checkoutAcceptances)
    .where(eq(checkoutAcceptances.checkoutId, checkout.id));
  if (accepted >= MAX_ACCEPTANCES_PER_CHECKOUT)
    throw new HttpError(429, "too many acceptances for this checkout");
  const acceptance: CheckoutAcceptanceRow = {
    id: crypto.randomUUID(),
    checkoutId: checkout.id,
    ...terms,
    acceptedAt: context.now.toISOString(),
  };
  await db.insert(checkoutAcceptances).values(acceptance);
  return presentCheckout(checkout, quote, acceptance, context);
}

export async function requireCurrentQuote(
  db: Db,
  checkout: PublicCheckout,
  quoteId: string,
  context: Pick<CheckoutContext, "today" | "now">,
) {
  requireOnlineArrival(checkout.checkIn, context.today);
  const quote = await latestQuote(db, checkout.id);
  if (quote.id !== quoteId) {
    const [older] = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.id, quoteId), eq(quotes.checkoutId, checkout.id)));
    if (!older) throw new HttpError(404, "quote not found");
    throw new HttpError(409, "quote was replaced by a newer quote");
  }
  if (quoteExpired(quote, context.now)) throw new HttpError(400, "quote has expired");
  return quote;
}

const sameAcceptance = (
  previous: CheckoutAcceptanceRow,
  next: Pick<CheckoutAcceptanceRow, "quoteId" | "fullName" | "email" | "phone" | "language">,
) =>
  previous.quoteId === next.quoteId &&
  previous.fullName === next.fullName &&
  previous.email === next.email &&
  previous.phone === next.phone &&
  previous.language === next.language;

export async function readCheckout(db: Db, checkout: PublicCheckout, context: CheckoutContext) {
  const [quote, acceptance] = await Promise.all([
    latestQuote(db, checkout.id),
    latestAcceptance(db, checkout.id),
  ]);
  return presentCheckout(checkout, quote, acceptance, context);
}

export async function latestQuote(db: Db, checkoutId: string) {
  const [quote] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.checkoutId, checkoutId))
    .orderBy(desc(quotes.createdAt), desc(sql`rowid`))
    .limit(1);
  if (!quote) throw new Error(`public checkout ${checkoutId} has no quote`);
  return quote;
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
  acceptance: CheckoutAcceptanceRow | null,
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
    language: acceptance?.language ?? checkout.language,
    quote: {
      id: quote.id,
      expired: quoteExpired(quote, context.now),
      expiresAt: quote.expiresAt,
      nights: quote.nights.map(({ date, priceCents }) => ({ date, priceCents })),
      ...offerAmounts(quote, context.today),
    },
    acceptance: acceptance && { quoteId: acceptance.quoteId, acceptedAt: acceptance.acceptedAt },
  };
}
