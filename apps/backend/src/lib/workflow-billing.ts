import type { PaymentSchedule } from "./rate-plans";

type BillableRoom = { nights: { date: string; priceCents: number }[] };
type RefundMoney = { amountCents: number; status: string };

export function bill(
  charges: number,
  payments: { amountCents: number }[],
  discountCents: number,
  options: { released?: boolean; refundedCents?: number } = {},
) {
  const appliedDiscount = options.released ? 0 : Math.min(discountCents, charges);
  const totalCents = charges - appliedDiscount;
  const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const refundedCents = options.refundedCents ?? 0;
  // Only completed refunds return money; the balance is against the net retained.
  const balanceCents = totalCents - (paidCents - refundedCents);
  return {
    subtotalCents: charges,
    discountCents: appliedDiscount,
    totalCents,
    paidCents,
    refundedCents,
    balanceCents,
    creditCents: Math.max(0, -balanceCents),
  };
}

/**
 * One reserved room's charges as every read presents them. Room charges carry no
 * share of the reservation discount, and a released reservation charges no room.
 */
export function roomCharges(room: BillableRoom, released: boolean) {
  const subtotalCents = room.nights.reduce((sum, night) => sum + night.priceCents, 0);
  return { subtotalCents, discountCents: 0, totalCents: released ? 0 : subtotalCents };
}

/** The sum of refunds in one status. */
export const refundCents = (refunds: RefundMoney[], status: "requested" | "completed") =>
  refunds.reduce((sum, refund) => sum + (refund.status === status ? refund.amountCents : 0), 0);

/**
 * The reservation bill with its payment schedule's required initial payment and
 * the remaining scheduled amount. Detail, list, and preview reads share this.
 * Cancellation or No-show (`released`) replaces the stay charges with the final
 * cancellation charge. Net money retained beyond the total is a refund due on
 * any reservation; requested refunds do not reduce it until they complete.
 */
export function reservationBill(
  rooms: BillableRoom[],
  payments: { amountCents: number }[],
  discountCents: number,
  terms: {
    released: boolean;
    paymentSchedule: PaymentSchedule;
    cancellationChargeCents?: number;
    refunds?: RefundMoney[];
  },
) {
  const billable = terms.released ? [] : rooms;
  const charges = terms.released
    ? (terms.cancellationChargeCents ?? 0)
    : billable.reduce((sum, room) => sum + roomCharges(room, false).subtotalCents, 0);
  const refunds = terms.refunds ?? [];
  const totals = bill(charges, payments, discountCents, {
    released: terms.released,
    refundedCents: refundCents(refunds, "completed"),
  });
  // A deposit never exceeds the final total after the reservation discount.
  const requiredInitialPaymentCents = terms.released
    ? 0
    : terms.paymentSchedule === "full_upfront"
      ? totals.totalCents
      : Math.min(firstNightCents(billable), totals.totalCents);
  return {
    ...totals,
    pendingRefundCents: refundCents(refunds, "requested"),
    refundDueCents: totals.creditCents,
    requiredInitialPaymentCents,
    // The payment schedule covers a stay; a released reservation has none left.
    remainingScheduledCents: terms.released ? 0 : totals.totalCents - requiredInitialPaymentCents,
  };
}

/** The sum of each reserved room's first saved nightly price. */
function firstNightCents(rooms: BillableRoom[]) {
  return rooms.reduce((sum, room) => {
    const first = room.nights.reduce<BillableRoom["nights"][number] | undefined>(
      (earliest, night) => (!earliest || night.date < earliest.date ? night : earliest),
      undefined,
    );
    return sum + (first?.priceCents ?? 0);
  }, 0);
}
