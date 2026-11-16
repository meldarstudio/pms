import { eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Db } from "./db";
import {
  cancellationWaivers,
  couponMovements,
  coupons,
  guests,
  payments,
  paymentVoids,
  refunds,
  reservationCancellations,
  reservationGuests,
  reservationRoomNights,
  reservationRooms,
  reservations,
  rooms,
  roomTypes,
  user,
} from "./db/schema";
import { HttpError } from "./http";
import type { Cancellation } from "./lib/cancellation";
import { chunks } from "./lib/chunks";
import { couponMovementQuery, type Coupon, type CouponMovement } from "./lib/coupons";
import type { Refund } from "./lib/refunds";
import { presentReservation, type RoomLookups } from "./present";

type Night = Pick<
  typeof reservationRoomNights.$inferSelect,
  "date" | "priceCents" | "adjustmentCents" | "discountCents"
>;
export type Stay = typeof reservationRooms.$inferSelect & { nights: Night[] };
export type PaymentVoid = typeof paymentVoids.$inferSelect & { voidedBy: string | null };
export type Payment = typeof payments.$inferSelect & {
  recordedBy: string | null;
  void: PaymentVoid | null;
};
export type State = {
  reservation: typeof reservations.$inferSelect;
  contact: typeof guests.$inferSelect;
  stayingGuests: (typeof reservationGuests.$inferSelect)[];
  lines: Stay[];
  payments: Payment[];
  cancellations: Cancellation[];
  refunds: Refund[];
  coupons: Coupon[];
  couponMovements: CouponMovement[];
};

const reservationsPerBatch = 80;

export async function loadReservation(db: Db, id: string): Promise<State> {
  const [state] = await loadReservations(db, [id]);
  return state;
}

export async function loadReservations(db: Db, ids: string[]): Promise<State[]> {
  const loaded = await Promise.all(
    chunks([...new Set(ids)], reservationsPerBatch).map((chunk) => loadBatch(db, chunk)),
  );
  const byId = new Map(loaded.flat().map((state) => [state.reservation.id, state]));
  return ids.map((id) => byId.get(id)!);
}

export async function presentReservations(db: Db, states: State[], currency: string) {
  if (!states.length) return [];
  const [types, physical] = await db.batch([db.select().from(roomTypes), db.select().from(rooms)]);
  const lookups = roomLookups(types, physical);
  return states.map((state) => presentReservation(state, lookups, currency));
}

export function roomLookups(
  types: (typeof roomTypes.$inferSelect)[],
  physical: (typeof rooms.$inferSelect)[],
): RoomLookups {
  return {
    roomTypes: new Map(types.map((type) => [type.id, type])),
    rooms: new Map(physical.map((room) => [room.id, room])),
  };
}

export async function readReservation(db: Db, id: string, currency: string) {
  const [detail] = await presentReservations(db, [await loadReservation(db, id)], currency);
  return detail;
}

async function loadBatch(db: Db, ids: string[]): Promise<State[]> {
  const [
    parents,
    contacts,
    stayingGuests,
    lines,
    nights,
    paymentRows,
    cancellationRows,
    waiverRows,
    refundRows,
    couponRows,
    movementRows,
  ] = await db.batch([
    db.select().from(reservations).where(inArray(reservations.id, ids)),
    db
      .select()
      .from(guests)
      .where(
        inArray(
          guests.id,
          db
            .select({ id: reservations.guestId })
            .from(reservations)
            .where(inArray(reservations.id, ids)),
        ),
      ),
    db.select().from(reservationGuests).where(inArray(reservationGuests.reservationId, ids)),
    db.select().from(reservationRooms).where(inArray(reservationRooms.reservationId, ids)),
    db
      .select({
        reservationRoomId: reservationRoomNights.reservationRoomId,
        date: reservationRoomNights.date,
        priceCents: reservationRoomNights.priceCents,
        adjustmentCents: reservationRoomNights.adjustmentCents,
        discountCents: reservationRoomNights.discountCents,
      })
      .from(reservationRoomNights)
      .innerJoin(reservationRooms, eq(reservationRooms.id, reservationRoomNights.reservationRoomId))
      .where(inArray(reservationRooms.reservationId, ids)),
    db
      .select({
        payment: payments,
        recordedBy: sql<string | null>`${recorder.username}`.as("payment_recorded_by"),
        void: paymentVoids,
        voidedBy: sql<string | null>`${voider.username}`.as("payment_voided_by"),
      })
      .from(payments)
      .leftJoin(recorder, eq(recorder.id, payments.recordedAccountId))
      .leftJoin(paymentVoids, eq(paymentVoids.paymentId, payments.id))
      .leftJoin(voider, eq(voider.id, paymentVoids.accountId))
      .where(inArray(payments.reservationId, ids)),
    db
      .select({ cancellation: reservationCancellations, recordedBy: user.username })
      .from(reservationCancellations)
      .leftJoin(user, eq(user.id, reservationCancellations.accountId))
      .where(inArray(reservationCancellations.reservationId, ids)),
    db
      .select({ waiver: cancellationWaivers, recordedBy: user.username })
      .from(cancellationWaivers)
      .innerJoin(
        reservationCancellations,
        eq(reservationCancellations.id, cancellationWaivers.cancellationId),
      )
      .leftJoin(user, eq(user.id, cancellationWaivers.accountId))
      .where(inArray(reservationCancellations.reservationId, ids)),
    db
      .select({
        refund: refunds,
        requestedBy: sql<string | null>`${requester.username}`.as("refund_requested_by"),
        resolvedBy: sql<string | null>`${resolver.username}`.as("refund_resolved_by"),
      })
      .from(refunds)
      .leftJoin(requester, eq(requester.id, refunds.requestedAccountId))
      .leftJoin(resolver, eq(resolver.id, refunds.resolvedAccountId))
      .where(inArray(refunds.reservationId, ids)),
    couponsUsedBy(db, ids),
    couponMovementQuery(db).where(inArray(couponMovements.reservationId, ids)),
  ]);
  const guestsOf = groupBy(stayingGuests, (guest) => guest.reservationId);
  const linesOf = groupBy(lines, (line) => line.reservationId);
  const nightsOf = groupBy(nights, (night) => night.reservationRoomId);
  const paymentsOf = groupBy(paymentRows, (row) => row.payment.reservationId);
  const cancellationsOf = groupBy(cancellationRows, (row) => row.cancellation.reservationId);
  const waiversOf = groupBy(waiverRows, (row) => row.waiver.cancellationId);
  const refundsOf = groupBy(refundRows, (row) => row.refund.reservationId);
  const movementsOf = groupBy(movementRows, (row) => row.movement.reservationId);
  const reservationById = new Map(parents.map((reservation) => [reservation.id, reservation]));
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  return ids.map((id) => {
    const reservation = reservationById.get(id);
    if (!reservation) throw new HttpError(404, "reservation not found");
    const contact = contactById.get(reservation.guestId);
    if (!contact) throw new HttpError(404, "guest not found");
    const movements = movementsOf(id).map(({ movement, recordedBy }): CouponMovement => ({
      ...movement,
      recordedBy,
    }));
    const used = new Set(movements.map((movement) => movement.couponId));
    return {
      reservation,
      contact,
      stayingGuests: guestsOf(id),
      lines: linesOf(id).map((line) => ({
        ...line,
        nights: nightsOf(line.id).map(({ date, priceCents, adjustmentCents, discountCents }) => ({
          date,
          priceCents,
          adjustmentCents,
          discountCents,
        })),
      })),
      payments: paymentsOf(id).map(({ payment, recordedBy, void: voided, voidedBy }) => ({
        ...payment,
        recordedBy,
        void: voided && { ...voided, voidedBy },
      })),
      cancellations: cancellationsOf(id).map(({ cancellation, recordedBy }) => ({
        ...cancellation,
        recordedBy,
        waivers: waiversOf(cancellation.id).map(({ waiver, recordedBy }) => ({
          ...waiver,
          recordedBy,
        })),
      })),
      refunds: refundsOf(id).map(({ refund, requestedBy, resolvedBy }) => ({
        ...refund,
        requestedBy,
        resolvedBy,
      })),
      coupons: couponRows
        .filter(({ coupon }) => coupon.sourceReservationId === id || used.has(coupon.id))
        .map(({ coupon, issuedBy }) => ({ ...coupon, issuedBy })),
      couponMovements: movements,
    };
  });
}

const requester = alias(user, "refund_requester");
const resolver = alias(user, "refund_resolver");
const recorder = alias(user, "payment_recorder");
const voider = alias(user, "payment_voider");

function couponsUsedBy(db: Db, ids: string[]) {
  const chosen = db
    .$with("chosen_reservations")
    .as(db.select({ id: reservations.id }).from(reservations).where(inArray(reservations.id, ids)));
  return db
    .with(chosen)
    .select({ coupon: coupons, issuedBy: user.username })
    .from(coupons)
    .leftJoin(user, eq(user.id, coupons.accountId))
    .where(
      or(
        inArray(coupons.sourceReservationId, db.select({ id: chosen.id }).from(chosen)),
        inArray(
          coupons.id,
          db
            .select({ id: couponMovements.couponId })
            .from(couponMovements)
            .where(
              inArray(couponMovements.reservationId, db.select({ id: chosen.id }).from(chosen)),
            ),
        ),
      ),
    );
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return (id: string) => groups.get(id) ?? [];
}
