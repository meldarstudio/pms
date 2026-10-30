import type { guests, roomTypes, rooms } from "./db/schema";
import { cancellationFields } from "./lib/cancellation";
import { nightsBetween } from "./lib/dates";
import { acceptedTerms } from "./lib/rate-plans";
import { presentRefunds } from "./lib/refunds";
import { couponFields } from "./lib/coupons";
import { holdsInventory } from "./lib/statuses";
import { reservationBill, roomCharges } from "./lib/reservation-bill";
import type { State } from "./reservation-read";

type Guest = typeof guests.$inferSelect;
type Reservation = State["reservation"];
export type RoomLookups = {
  roomTypes: ReadonlyMap<string, typeof roomTypes.$inferSelect>;
  rooms: ReadonlyMap<string, typeof rooms.$inferSelect>;
};

const released = (reservation: Reservation) => !holdsInventory(reservation.status);

export const presentNight = (night: { date: string; priceCents: number }) => ({
  date: night.date,
  priceCents: night.priceCents,
});

export function presentGuest(guest: Omit<Guest, "revision">) {
  return {
    id: guest.id,
    fullName: guest.fullName,
    email: guest.email,
    phone: guest.phone,
    documentType: guest.documentType,
    documentNumber: guest.documentNumber,
    notes: guest.notes,
    createdAt: guest.createdAt,
  };
}

export function presentReservation(input: State, lookups: RoomLookups, currency: string) {
  const roomsOut = input.lines.map(({ nights: savedNights, ...line }) => {
    const nights = savedNights.toSorted((a, b) => a.date.localeCompare(b.date));
    const room = line.roomId ? lookups.rooms.get(line.roomId) : undefined;
    return {
      ...line,
      roomTypeName: lookups.roomTypes.get(line.roomTypeId)?.name ?? null,
      roomNumber: room?.number ?? null,
      housekeepingStatus: room?.housekeepingStatus ?? null,
      ...roomCharges({ nights }, released(input.reservation)),
      nights: nights.map(presentNight),
    };
  });

  const ratePlan = acceptedTerms(input.reservation);
  const cancellation = cancellationFields(input.cancellations);
  const totals = reservationBill(input);

  return {
    id: input.reservation.id,
    code: input.reservation.code,
    status: input.reservation.status,
    cancellationReason: input.reservation.cancellationReason,
    cancelledAt: input.reservation.cancelledAt,
    guestId: input.reservation.guestId,
    guest: presentGuest(input.contact),
    stayingGuests: input.stayingGuests,
    checkIn: input.reservation.checkIn,
    checkOut: input.reservation.checkOut,
    source: input.reservation.source,
    notes: input.reservation.notes,
    createdAt: input.reservation.createdAt,
    currency,
    nights: nightsBetween(input.reservation.checkIn, input.reservation.checkOut).length,
    ratePlan,
    ...totals,
    ...cancellation,
    savedDiscountCents: input.reservation.discountCents,
    rooms: roomsOut,
    payments: input.payments,
    refunds: presentRefunds(input.refunds),
    ...couponFields(input.reservation.id, input.coupons, input.couponMovements),
  };
}
