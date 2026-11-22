import type { CheckoutLanguage, GuestInput, QuoteCreate, RoomRequest } from "@pms/shared";
import { eq } from "drizzle-orm";
import { runBatch, type Db } from "./db";
import { pendingConfirmationEmail } from "./confirmation-emails";
import {
  confirmationEmails,
  guests,
  payments,
  quotes,
  reservationAccess,
  reservations,
  type QuotedRoom,
} from "./db/schema";
import { HttpError, rethrowConflict } from "./http";
import { loadRoomTypes, occupiedCounts, roomCounts } from "./inventory";
import { confirmationCode } from "./lib/codes";
import { ratePlans, termColumns } from "./lib/rate-plans";
import { reservationAccessValues } from "./reservation-access";
import type { OnlineArrivalCalendar } from "./property-calendar";
import { acceptPhone, requireNewOnlineArrival, requireStay } from "./rules";
import { lineWrites } from "./workflow";
import { priceRooms } from "./workflow-plan";

const QUOTE_MINUTES = 10;

export type Quote = typeof quotes.$inferSelect;

export type StayRequest = { checkIn: string; checkOut: string; rooms: RoomRequest[] };

export async function priceQuote(
  db: Db,
  input: QuoteCreate,
  context: OnlineArrivalCalendar & { now: Date; checkoutId: string; published: string[] },
): Promise<Quote> {
  requireStay(input.checkIn, input.checkOut);
  requireNewOnlineArrival(input.checkIn, context);
  await requireSellableRooms(db, input, context.published);
  const terms = ratePlans[input.ratePlan];
  const nights = await priceRooms(db, input, input.rooms, terms);
  const rooms: QuotedRoom[] = input.rooms.map((room, index) => ({
    roomTypeId: room.roomTypeId,
    adults: room.adults,
    children: room.children,
    nights: nights[index]!,
  }));
  return {
    id: crypto.randomUUID(),
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    rooms,
    terms,
    createdAt: context.now.toISOString(),
    expiresAt: new Date(context.now.getTime() + QUOTE_MINUTES * 60_000).toISOString(),
    checkoutId: context.checkoutId,
  };
}

export const roomRequestField = (index: number) => `rooms.${index}`;

export async function requireSellableRooms(db: Db, stay: StayRequest, published: string[] | null) {
  const typeIds = [...new Set(stay.rooms.map((room) => room.roomTypeId))];
  const [types, occupied, counts] = await Promise.all([
    loadRoomTypes(db, typeIds),
    occupiedCounts(db, stay.checkIn, stay.checkOut),
    roomCounts(db),
  ]);
  const requested = new Map<string, number>();
  stay.rooms.forEach((room, index) => {
    const field = roomRequestField(index);
    const type = types.find((candidate) => candidate.id === room.roomTypeId);
    if (!type || (published && !published.includes(type.id)))
      throw new HttpError(404, "room type not found", field);
    if (room.adults > type.maxAdults || room.children > type.maxChildren)
      throw new HttpError(400, "too many guests for this room type", field);
    const wanted = (requested.get(type.id) ?? 0) + 1;
    requested.set(type.id, wanted);
    if ((occupied.get(type.id) ?? 0) + wanted > (counts.get(type.id) ?? 0))
      throw new HttpError(409, "no availability", field);
  });
}

export const quoteExpired = (quote: Pick<Quote, "expiresAt">, now: Date) =>
  Date.parse(quote.expiresAt) <= now.getTime();

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
    confirmation?: { recipient: string; language: CheckoutLanguage } | null;
    notes?: string | null;
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
  const status = options.status ?? "confirmed";
  const recipient = status === "confirmed" ? (options.confirmation ?? null) : null;
  const confirmation = recipient
    ? [
        db
          .insert(confirmationEmails)
          .values(
            pendingConfirmationEmail({ reservationId: id, kind: "automatic", ...recipient }, now),
          ),
      ]
    : [];
  const accessRow =
    options.publicCheckoutId != null ? reservationAccessValues(id, quote.checkOut, now) : null;
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
        notes: options.notes ?? null,
        quoteId,
        publicCheckoutId: options.publicCheckoutId ?? null,
        status,
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
      ...quote.rooms.flatMap((room) =>
        lineWrites(
          db,
          {
            id: crypto.randomUUID(),
            reservationId: id,
            roomTypeId: room.roomTypeId,
            roomId: null,
            adults: room.adults,
            children: room.children,
            createdAt: now,
            nights: room.nights,
          },
          false,
        ),
      ),
      ...access,
      ...confirmation,
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
