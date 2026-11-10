import type { GuestInput, QuoteCreate } from "@pms/shared";
import { eq } from "drizzle-orm";
import { runBatch, type Db } from "./db";
import { guests, payments, quotes, reservationAccess, reservations, roomTypes } from "./db/schema";
import { HttpError, rethrowConflict } from "./http";
import { occupiedCounts, roomCounts } from "./inventory";
import { confirmationCode } from "./lib/codes";
import { ratePlans, termColumns } from "./lib/rate-plans";
import { quoteBill } from "./lib/reservation-bill";
import { reservationAccessValues } from "./reservation-access";
import { acceptPhone, requireOnlineArrival, requireStay } from "./rules";
import { lineWrites } from "./workflow";
import { price } from "./workflow-plan";

const QUOTE_MINUTES = 10;

export type Quote = typeof quotes.$inferSelect;

export async function createQuote(
  db: Db,
  input: QuoteCreate,
  context: { today: string; now: Date },
) {
  const { quote, available } = await priceQuote(db, input, { ...context, checkoutId: null });
  await db.insert(quotes).values(quote);
  return presentQuote(quote, available);
}

export async function priceQuote(
  db: Db,
  input: QuoteCreate,
  context: { today: string; now: Date; checkoutId: string | null },
): Promise<{ quote: Quote; available: boolean }> {
  requireStay(input.checkIn, input.checkOut);
  requireOnlineArrival(input.checkIn, context.today);
  const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, input.roomTypeId));
  if (!type) throw new HttpError(404, "room type not found");
  if (input.adults > type.maxAdults || input.children > type.maxChildren)
    throw new HttpError(400, "too many guests for this room type");
  const { ratePlan, ...stay } = input;
  const terms = ratePlans[ratePlan];
  const [nights, available] = await Promise.all([
    price(db, stay, terms),
    quoteAvailable(db, input),
  ]);
  const quote: Quote = {
    id: crypto.randomUUID(),
    ...stay,
    nights,
    terms,
    createdAt: context.now.toISOString(),
    expiresAt: new Date(context.now.getTime() + QUOTE_MINUTES * 60_000).toISOString(),
    checkoutId: context.checkoutId,
  };
  return { quote, available };
}

export async function quoteAvailable(
  db: Db,
  stay: Pick<Quote, "roomTypeId" | "checkIn" | "checkOut">,
) {
  const [occupied, counts] = await Promise.all([
    occupiedCounts(db, stay.checkIn, stay.checkOut),
    roomCounts(db),
  ]);
  return (occupied.get(stay.roomTypeId) ?? 0) < (counts.get(stay.roomTypeId) ?? 0);
}

export const quoteExpired = (quote: Pick<Quote, "expiresAt">, now: Date) =>
  Date.parse(quote.expiresAt) <= now.getTime();

function presentQuote(quote: Quote, available: boolean) {
  const bill = quoteBill(quote);
  return {
    id: quote.id,
    roomTypeId: quote.roomTypeId,
    checkIn: quote.checkIn,
    checkOut: quote.checkOut,
    adults: quote.adults,
    children: quote.children,
    ratePlan: quote.terms,
    nights: quote.nights.map(({ date, priceCents }) => ({ date, priceCents })),
    totalCents: bill.totalCents,
    requiredInitialPaymentCents: bill.requiredInitialPaymentCents,
    remainingScheduledCents: bill.remainingScheduledCents,
    expiresAt: quote.expiresAt,
    available,
  };
}

type QuotePayment = Pick<
  typeof payments.$inferInsert,
  "amountCents" | "method" | "reference" | "paymentDate" | "culqiChargeId"
>;

export async function saveQuote(
  db: Db,
  quoteId: string,
  guest: GuestInput,
  options: {
    status?: "confirmed" | "unfulfilled";
    payment?: QuotePayment;
    publicCheckoutId?: string | null;
  } = {},
): Promise<string> {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quote) throw new HttpError(404, "quote not found");
  const saved = await savedReservation(db, quoteId);
  if (saved) return saved;
  const now = new Date().toISOString(),
    id = crypto.randomUUID(),
    guestId = crypto.randomUUID();
  const phone = acceptPhone(guest.phone);
  const accessRow =
    options.publicCheckoutId != null
      ? await reservationAccessValues(id, quote.checkOut, now)
      : null;
  const access = accessRow ? [db.insert(reservationAccess).values(accessRow)] : [];
  try {
    await runBatch(db, [
      db.insert(guests).values({ id: guestId, ...guest, phone, createdAt: now }),
      db.insert(reservations).values({
        id,
        code: confirmationCode(),
        guestId,
        checkIn: quote.checkIn,
        checkOut: quote.checkOut,
        source: "online",
        quoteId,
        publicCheckoutId: options.publicCheckoutId ?? null,
        status: options.status ?? "confirmed",
        createdAt: now,
        ...termColumns(quote.terms),
      }),
      ...(options.payment
        ? [
            db.insert(payments).values({
              id: crypto.randomUUID(),
              reservationId: id,
              ...options.payment,
              createdAt: now,
            }),
          ]
        : []),
      ...lineWrites(
        db,
        {
          id: crypto.randomUUID(),
          reservationId: id,
          roomTypeId: quote.roomTypeId,
          roomId: null,
          adults: quote.adults,
          children: quote.children,
          createdAt: now,
          nights: quote.nights,
        },
        false,
      ),
      ...access,
    ]);
  } catch (error) {
    const saved = await savedReservation(db, quoteId);
    if (saved) return saved;
    rethrowConflict(accessRow ? redactToken(error, accessRow.token) : error);
  }
  return id;
}

function redactToken(error: unknown, token: string): unknown {
  if (!(error instanceof Error)) return error;
  return new Error(error.message.replaceAll(token, "[redacted]"), {
    cause: error.cause === undefined ? undefined : redactToken(error.cause, token),
  });
}

async function savedReservation(db: Db, quoteId: string) {
  const [row] = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.quoteId, quoteId));
  return row?.id;
}
