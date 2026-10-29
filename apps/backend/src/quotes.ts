import type { GuestInput, QuoteCreate } from "@pms/shared";
import { eq } from "drizzle-orm";
import { runBatch, type Db } from "./db";
import { guests, payments, quotes, reservations, roomTypes } from "./db/schema";
import { HttpError, rethrowConflict } from "./http";
import { occupiedCounts, roomCounts } from "./inventory";
import { confirmationCode } from "./lib/codes";
import { ratePlans, termColumns } from "./lib/rate-plans";
import { reservationBill } from "./lib/workflow-billing";
import { acceptPhone, requireStay } from "./rules";
import { lineWrites } from "./workflow";
import { price } from "./workflow-plan";

const QUOTE_MINUTES = 10;

type Quote = typeof quotes.$inferSelect;

export async function createQuote(
  db: Db,
  input: QuoteCreate,
  context: { today: string; now: Date },
) {
  requireStay(input.checkIn, input.checkOut);
  if (input.checkIn <= context.today)
    throw new HttpError(400, "online check-in must be after today", "checkIn");
  const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, input.roomTypeId));
  if (!type) throw new HttpError(404, "room type not found");
  if (input.adults > type.maxAdults || input.children > type.maxChildren)
    throw new HttpError(400, "too many guests for this room type");
  const { ratePlan, ...stay } = input;
  const terms = ratePlans[ratePlan];
  const [nights, occupied, counts] = await Promise.all([
    price(db, stay, terms),
    occupiedCounts(db, stay.checkIn, stay.checkOut),
    roomCounts(db),
  ]);
  const quote: Quote = {
    id: crypto.randomUUID(),
    ...stay,
    nights,
    terms,
    createdAt: context.now.toISOString(),
    expiresAt: new Date(context.now.getTime() + QUOTE_MINUTES * 60_000).toISOString(),
  };
  await db.insert(quotes).values(quote);
  return presentQuote(quote, (occupied.get(type.id) ?? 0) < (counts.get(type.id) ?? 0));
}

function presentQuote(quote: Quote, available: boolean) {
  const bill = reservationBill([quote], [], 0, {
    released: false,
    paymentSchedule: quote.terms.paymentSchedule,
  });
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
  options: { status?: "confirmed" | "unfulfilled"; payment?: QuotePayment } = {},
): Promise<string> {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quote) throw new HttpError(404, "quote not found");
  const saved = await savedReservation(db, quoteId);
  if (saved) return saved;
  const now = new Date().toISOString(),
    id = crypto.randomUUID(),
    guestId = crypto.randomUUID();
  const phone = acceptPhone(guest.phone);
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
    ]);
  } catch (error) {
    const saved = await savedReservation(db, quoteId);
    if (saved) return saved;
    rethrowConflict(error);
  }
  return id;
}

async function savedReservation(db: Db, quoteId: string) {
  const [row] = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.quoteId, quoteId));
  return row?.id;
}
