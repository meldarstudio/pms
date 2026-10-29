import type {
  reservationGuests,
  payments,
  guests,
  reservationRoomNights,
  reservationRooms,
  reservations,
  roomTypes,
  rooms,
} from "./db/schema";
import { cancellationFields, type Cancellation } from "./lib/cancellation";
import { nightsBetween } from "./lib/dates";
import { acceptedTerms } from "./lib/rate-plans";
import { presentRefunds, type Refund } from "./lib/refunds";
import { couponFields, type Coupon, type CouponMovement } from "./lib/coupons";
import { holdsInventory } from "./lib/statuses";
import { reservationBill, roomCharges } from "./lib/workflow-billing";

type Guest = typeof guests.$inferSelect;
type Reservation = typeof reservations.$inferSelect;
type Line = typeof reservationRooms.$inferSelect;
type Night = Pick<
  typeof reservationRoomNights.$inferSelect,
  "reservationRoomId" | "date" | "priceCents"
>;
type RoomType = typeof roomTypes.$inferSelect;
type Room = typeof rooms.$inferSelect;

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

export function presentReservation(input: {
  reservation: Reservation;
  guest: Guest;
  lines: Line[];
  nights: Night[];
  types: RoomType[];
  roomRows: Room[];
  payments: (typeof payments.$inferSelect)[];
  currency: string;
  stayingGuests?: (typeof reservationGuests.$inferSelect)[];
  cancellations: Cancellation[];
  refunds: Refund[];
  coupons: Coupon[];
  couponMovements: CouponMovement[];
}) {
  const typeById = new Map(input.types.map((type) => [type.id, type]));
  const roomById = new Map(input.roomRows.map((room) => [room.id, room]));
  const nightsByLine = new Map<string, Night[]>();
  for (const night of input.nights) {
    const list = nightsByLine.get(night.reservationRoomId) ?? [];
    list.push(night);
    nightsByLine.set(night.reservationRoomId, list);
  }

  const roomsOut = input.lines.map((line) => {
    const nights = (nightsByLine.get(line.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    return {
      ...line,
      id: line.id,
      roomTypeId: line.roomTypeId,
      roomTypeName: typeById.get(line.roomTypeId)?.name ?? null,
      roomId: line.roomId,
      roomNumber: line.roomId ? (roomById.get(line.roomId)?.number ?? null) : null,
      housekeepingStatus: line.roomId
        ? (roomById.get(line.roomId)?.housekeepingStatus ?? null)
        : null,
      adults: line.adults,
      children: line.children,
      ...roomCharges({ nights }, released(input.reservation)),
      nights: nights.map(presentNight),
    };
  });

  const ratePlan = acceptedTerms(input.reservation);
  const cancellation = cancellationFields(input.cancellations);
  const totals = reservationBill(roomsOut, input.payments, input.reservation.discountCents, {
    released: released(input.reservation),
    paymentSchedule: ratePlan.paymentSchedule,
    cancellationChargeCents: cancellation.cancellation?.finalChargeCents ?? 0,
    refunds: input.refunds,
    couponMovements: input.couponMovements,
  });

  return {
    id: input.reservation.id,
    code: input.reservation.code,
    status: input.reservation.status,
    cancellationReason: input.reservation.cancellationReason,
    cancelledAt: input.reservation.cancelledAt,
    guestId: input.reservation.guestId,
    guest: presentGuest(input.guest),
    stayingGuests: input.stayingGuests ?? [],
    checkIn: input.reservation.checkIn,
    checkOut: input.reservation.checkOut,
    source: input.reservation.source,
    notes: input.reservation.notes,
    createdAt: input.reservation.createdAt,
    currency: input.currency,
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
