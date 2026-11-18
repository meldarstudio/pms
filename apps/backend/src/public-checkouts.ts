import type { CheckoutAcceptance, PublicCheckoutCreate } from "@pms/shared";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { runBatch, type Db } from "./db";
import { checkoutAcceptances, paymentAttempts, publicCheckouts, quotes } from "./db/schema";
import { HttpError } from "./http";
import { latestCheckoutAttempt } from "./payment-attempts";
import { addDays, nightsBetween } from "./lib/dates";
import { offerAmounts } from "./public-offers";
import { priceQuote, quoteExpired, type Quote } from "./quotes";
import type { OnlineArrivalCalendar } from "./property-calendar";
import { acceptPhone, requireOnlineArrivalNotPast } from "./rules";

export type PublicCheckout = Omit<typeof publicCheckouts.$inferSelect, "reservedOnce">;

type CheckoutAcceptanceRow = typeof checkoutAcceptances.$inferSelect;

type CheckoutContext = OnlineArrivalCalendar & { now: Date; published: string[] };

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
    { ...context, checkoutId: checkout.id },
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

let afterReplacementPriced: (() => Promise<void>) | null = null;

export function whenReplacementIsPriced(hook: (() => Promise<void>) | null) {
  afterReplacementPriced = hook;
}

export async function requoteCheckout(db: Db, checkout: PublicCheckout, context: CheckoutContext) {
  if (await latestCheckoutAttempt(db, checkout.id, { open: true }))
    throw new HttpError(409, CHECKOUT_HAS_PAYMENT);
  const quote = await availableQuote(db, checkout, context);
  const priced = afterReplacementPriced;
  afterReplacementPriced = null;
  if (priced) await priced();
  const previous = await latestAcceptance(db, checkout.id);
  const accepted = previous ? await quoteForAcceptance(db, previous) : null;
  const retain = previous && accepted && sameMaterialOffer(accepted, quote) ? previous : null;
  if (retain && (await acceptanceCount(db, checkout.id)) >= MAX_ACCEPTANCES_PER_CHECKOUT)
    throw new HttpError(429, "too many acceptances for this checkout");
  const acceptance = retain ? retainedAcceptance(checkout, quote, retain, context) : null;
  if (!(await insertQuoteUnlessOpenPayment(db, quote)))
    throw new HttpError(409, CHECKOUT_HAS_PAYMENT);
  if (acceptance) await db.insert(checkoutAcceptances).values(acceptance);
  return presentCheckout(checkout, quote, acceptance ?? previous, context);
}

async function insertQuoteUnlessOpenPayment(db: Db, quote: Quote) {
  await db.run(sql`INSERT INTO ${quotes} (
      id, room_type_id, check_in, check_out, adults, children, nights, terms, created_at, expires_at,
      checkout_id
    )
    SELECT ${quote.id}, ${quote.roomTypeId}, ${quote.checkIn}, ${quote.checkOut}, ${quote.adults},
      ${quote.children}, ${JSON.stringify(quote.nights)}, ${JSON.stringify(quote.terms)},
      ${quote.createdAt}, ${quote.expiresAt}, ${quote.checkoutId}
    WHERE NOT EXISTS (
      SELECT 1 FROM ${paymentAttempts}
      WHERE ${paymentAttempts.checkoutId} = ${quote.checkoutId}
        AND ${paymentAttempts.status} IN ('unknown', 'review', 'succeeded', 'saved')
    )`);
  const [inserted] = await db.select({ id: quotes.id }).from(quotes).where(eq(quotes.id, quote.id));
  return Boolean(inserted);
}

export async function acceptCheckoutQuote(
  db: Db,
  checkout: PublicCheckout,
  input: CheckoutAcceptance,
  context: CheckoutContext,
) {
  const quote = await requireCurrentQuote(db, checkout, input.quoteId, context);
  if (await latestCheckoutAttempt(db, checkout.id, { open: true }))
    throw new HttpError(409, CHECKOUT_HAS_PAYMENT);
  const terms = {
    quoteId: quote.id,
    ...input.contact,
    phone: acceptPhone(input.contact.phone),
    notes: input.notes || null,
    language: input.language,
  };
  const previous = await latestAcceptance(db, checkout.id);
  if (previous && sameAcceptance(previous, terms))
    return presentCheckout(checkout, quote, previous, context);
  if ((await acceptanceCount(db, checkout.id)) >= MAX_ACCEPTANCES_PER_CHECKOUT)
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
  requireOnlineArrivalNotPast(checkout.checkIn, context.today);
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

async function acceptanceCount(db: Db, checkoutId: string) {
  const [{ accepted }] = await db
    .select({ accepted: count() })
    .from(checkoutAcceptances)
    .where(eq(checkoutAcceptances.checkoutId, checkoutId));
  return accepted;
}

async function quoteForAcceptance(db: Db, acceptance: CheckoutAcceptanceRow) {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, acceptance.quoteId));
  return quote ?? null;
}

function retainedAcceptance(
  checkout: PublicCheckout,
  quote: Quote,
  previous: CheckoutAcceptanceRow,
  context: CheckoutContext,
): CheckoutAcceptanceRow {
  return {
    id: crypto.randomUUID(),
    checkoutId: checkout.id,
    quoteId: quote.id,
    fullName: previous.fullName,
    email: previous.email,
    phone: previous.phone,
    notes: previous.notes,
    language: previous.language,
    acceptedAt: context.now.toISOString(),
  };
}

function sameMaterialOffer(accepted: Quote, next: Quote) {
  return (
    accepted.roomTypeId === next.roomTypeId &&
    accepted.checkIn === next.checkIn &&
    accepted.checkOut === next.checkOut &&
    accepted.adults === next.adults &&
    accepted.children === next.children &&
    sameNights(accepted.nights, next.nights) &&
    sameTerms(accepted.terms, next.terms)
  );
}

function sameNights(accepted: Quote["nights"], next: Quote["nights"]) {
  return (
    accepted.length === next.length &&
    accepted.every((night, index) => {
      const other = next[index];
      return (
        other !== undefined &&
        night.date === other.date &&
        night.priceCents === other.priceCents &&
        night.adjustmentCents === other.adjustmentCents &&
        night.discountCents === other.discountCents
      );
    })
  );
}

function sameTerms(accepted: Quote["terms"], next: Quote["terms"]) {
  return (
    accepted.plan === next.plan &&
    accepted.paymentSchedule === next.paymentSchedule &&
    accepted.priceAdjustmentPercent === next.priceAdjustmentPercent &&
    accepted.cancellationPolicy.chargeBasis === next.cancellationPolicy.chargeBasis &&
    accepted.cancellationPolicy.freeUntilDaysBeforeCheckIn ===
      next.cancellationPolicy.freeUntilDaysBeforeCheckIn
  );
}

const sameAcceptance = (
  previous: CheckoutAcceptanceRow,
  next: Pick<
    CheckoutAcceptanceRow,
    "quoteId" | "fullName" | "email" | "phone" | "notes" | "language"
  >,
) =>
  previous.quoteId === next.quoteId &&
  previous.fullName === next.fullName &&
  previous.email === next.email &&
  previous.phone === next.phone &&
  previous.notes === next.notes &&
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
