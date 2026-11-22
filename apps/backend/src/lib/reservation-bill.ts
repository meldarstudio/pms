import { inArray, sql } from "drizzle-orm";
import {
  cancellationWaivers,
  couponMovements,
  payments,
  paymentVoids,
  refunds,
  reservationCancellations,
  reservationRoomNights,
  reservationRooms,
  reservations,
  type ReservationStatus,
} from "../db/schema";
import type { Cancellation, Waiver } from "./cancellation";
import type { CouponMoney } from "./coupons";
import type { PaymentSchedule } from "./rate-plans";
import type { Refund } from "./refunds";
import { holdsInventory, inventoryStatuses } from "./statuses";

type BillableRoom = { nights: { date: string; priceCents: number }[] };
type PaymentMoney = { amountCents: number; void?: object | null };
type RefundMoney = Pick<Refund, "amountCents" | "status">;
type ChargedCancellation = Pick<Cancellation, "policyChargeCents"> & {
  waivers: Pick<Waiver, "amountCents">[];
};

export type BillableReservation = {
  reservation: Pick<
    typeof reservations.$inferSelect,
    "status" | "discountCents" | "paymentSchedule"
  >;
  lines: BillableRoom[];
  payments: PaymentMoney[];
  cancellations: (ChargedCancellation & Pick<Cancellation, "restoredAt">)[];
  refunds: RefundMoney[];
  couponMovements: CouponMoney[];
};

export function reservationBill(input: BillableReservation) {
  const released = !holdsInventory(input.reservation.status);
  const active = input.cancellations.find((cancellation) => cancellation.restoredAt === null);
  return settle({
    rooms: released ? [] : input.lines,
    released,
    cancellationChargeCents: active ? cancellationCharge(active).finalChargeCents : 0,
    discountCents: input.reservation.discountCents,
    paymentSchedule: input.reservation.paymentSchedule as PaymentSchedule,
    payments: input.payments.filter((payment) => !payment.void),
    refunds: input.refunds,
    couponMovements: input.couponMovements,
  });
}

export const stayBill = (
  rooms: BillableRoom[],
  terms: { discountCents: number; paymentSchedule: PaymentSchedule },
) =>
  settle({
    rooms,
    released: false,
    cancellationChargeCents: 0,
    ...terms,
    payments: [],
    refunds: [],
    couponMovements: [],
  });

export const quoteBill = (quote: {
  rooms: BillableRoom[];
  terms: { paymentSchedule: PaymentSchedule };
}) => stayBill(quote.rooms, { discountCents: 0, paymentSchedule: quote.terms.paymentSchedule });

export function roomCharges(room: BillableRoom, released: boolean) {
  const subtotalCents = room.nights.reduce((sum, night) => sum + night.priceCents, 0);
  return { subtotalCents, discountCents: 0, totalCents: released ? 0 : subtotalCents };
}

export function cancellationCharge(cancellation: ChargedCancellation) {
  const waivedCents = cancellation.waivers.reduce((sum, waiver) => sum + waiver.amountCents, 0);
  return {
    policyChargeCents: cancellation.policyChargeCents,
    waivedCents,
    finalChargeCents: cancellation.policyChargeCents - waivedCents,
  };
}

export const refundCents = (rows: RefundMoney[], status: "requested" | "completed") =>
  rows.reduce((sum, refund) => sum + (refund.status === status ? refund.amountCents : 0), 0);

const movementCents = (movements: CouponMoney[], kind: CouponMoney["kind"]) =>
  movements.reduce((sum, movement) => sum + (movement.kind === kind ? movement.amountCents : 0), 0);

export const couponAppliedCents = (movements: CouponMoney[]) =>
  movementCents(movements, "redeem") - movementCents(movements, "return");

const subtotalSql = sql<number>`coalesce((
  select sum(${reservationRoomNights.priceCents}) from ${reservationRooms}
  inner join ${reservationRoomNights} on ${reservationRoomNights.reservationRoomId} = ${reservationRooms.id}
  where ${reservationRooms.reservationId} = ${reservations.id}
), 0)`;
const finalChargeSql = sql<number>`coalesce((
  select ${reservationCancellations.policyChargeCents} - coalesce((
    select sum(${cancellationWaivers.amountCents}) from ${cancellationWaivers}
    where ${cancellationWaivers.cancellationId} = ${reservationCancellations.id}
  ), 0) from ${reservationCancellations}
  where ${reservationCancellations.reservationId} = ${reservations.id}
    and ${reservationCancellations.restoredAt} is null
), 0)`;
const paidSql = sql<number>`coalesce((
  select sum(${payments.amountCents}) from ${payments}
  where ${payments.reservationId} = ${reservations.id} and not exists (
    select 1 from ${paymentVoids} where ${paymentVoids.paymentId} = ${payments.id}
  )
), 0)`;
const refundedSql = sql<number>`coalesce((
  select sum(${refunds.amountCents}) from ${refunds}
  where ${refunds.reservationId} = ${reservations.id} and ${refunds.status} = 'completed'
), 0)`;
const couponIssuedSql = sql<number>`coalesce((
  select sum(${couponMovements.amountCents}) from ${couponMovements}
  where ${couponMovements.reservationId} = ${reservations.id} and ${couponMovements.kind} = 'issue'
), 0)`;
const couponAppliedSql = sql<number>`coalesce((
  select sum(case ${couponMovements.kind} when 'redeem' then ${couponMovements.amountCents}
    when 'return' then -${couponMovements.amountCents} else 0 end) from ${couponMovements}
  where ${couponMovements.reservationId} = ${reservations.id}
), 0)`;
const totalSql = sql<number>`case when ${inArray(reservations.status, inventoryStatuses)}
  then max(${subtotalSql} - ${reservations.discountCents}, 0) else ${finalChargeSql} end`;

export const balanceCentsSql = sql<number>`(${totalSql} - ${couponAppliedSql}
  - (${paidSql} - ${refundedSql} - ${couponIssuedSql}))`;

const stayOverStatuses: ReservationStatus[] = ["checked_out", "cancelled", "no_show"];

export const unresolvedBillSql = sql<boolean>`(case
  when ${inArray(reservations.status, stayOverStatuses)} then ${balanceCentsSql} <> 0
  else ${balanceCentsSql} < 0 end)`;

function settle(terms: {
  rooms: BillableRoom[];
  released: boolean;
  cancellationChargeCents: number;
  discountCents: number;
  paymentSchedule: PaymentSchedule;
  payments: PaymentMoney[];
  refunds: RefundMoney[];
  couponMovements: CouponMoney[];
}) {
  const subtotalCents = terms.released
    ? terms.cancellationChargeCents
    : terms.rooms.reduce((sum, room) => sum + roomCharges(room, false).subtotalCents, 0);
  const discountCents = terms.released ? 0 : Math.min(terms.discountCents, subtotalCents);
  const totalCents = subtotalCents - discountCents;
  const paidCents = terms.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const refundedCents = refundCents(terms.refunds, "completed");
  const couponIssuedCents = movementCents(terms.couponMovements, "issue");
  const appliedCents = couponAppliedCents(terms.couponMovements);
  const settledCents = appliedCents + paidCents - refundedCents - couponIssuedCents;
  const balanceCents = totalCents - settledCents;
  const creditCents = Math.max(0, -balanceCents);
  const requiredInitialPaymentCents = terms.released
    ? 0
    : terms.paymentSchedule === "full_upfront"
      ? totalCents
      : Math.min(firstNightCents(terms.rooms), totalCents);
  return {
    subtotalCents,
    discountCents,
    totalCents,
    paidCents,
    refundedCents,
    couponIssuedCents,
    couponAppliedCents: appliedCents,
    balanceCents,
    creditCents,
    initialPaymentDueCents: Math.max(0, requiredInitialPaymentCents - settledCents),
    pendingRefundCents: refundCents(terms.refunds, "requested"),
    refundDueCents: creditCents,
    requiredInitialPaymentCents,
    remainingScheduledCents: terms.released ? 0 : totalCents - requiredInitialPaymentCents,
  };
}

function firstNightCents(rooms: BillableRoom[]) {
  return rooms.reduce((sum, room) => {
    const first = room.nights.reduce<BillableRoom["nights"][number] | undefined>(
      (earliest, night) => (!earliest || night.date < earliest.date ? night : earliest),
      undefined,
    );
    return sum + (first?.priceCents ?? 0);
  }, 0);
}
