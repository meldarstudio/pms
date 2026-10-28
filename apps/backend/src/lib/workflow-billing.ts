import type { PaymentSchedule } from "./rate-plans";

type BillableRoom = { nights: { date: string; priceCents: number }[] };

export function bill(
  charges: number,
  payments: { amountCents: number }[],
  discountCents: number,
  options: { cancelled?: boolean } = {},
) {
  const appliedDiscount = options.cancelled ? 0 : Math.min(discountCents, charges);
  const totalCents = charges - appliedDiscount;
  const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const balanceCents = totalCents - paidCents;
  return {
    subtotalCents: charges,
    discountCents: appliedDiscount,
    totalCents,
    paidCents,
    balanceCents,
    creditCents: Math.max(0, -balanceCents),
  };
}

/**
 * The reservation bill with its payment schedule's required initial payment and
 * the remaining scheduled amount. Detail, list, and preview reads share this.
 * Cancellation replaces the stay charges with the final cancellation charge, and
 * any money retained beyond it is a refund due.
 */
export function reservationBill(
  rooms: BillableRoom[],
  payments: { amountCents: number }[],
  discountCents: number,
  terms: { cancelled: boolean; paymentSchedule: PaymentSchedule; cancellationChargeCents?: number },
) {
  const billable = terms.cancelled ? [] : rooms;
  const charges = terms.cancelled
    ? (terms.cancellationChargeCents ?? 0)
    : billable.reduce(
        (sum, room) => sum + room.nights.reduce((s, night) => s + night.priceCents, 0),
        0,
      );
  const totals = bill(charges, payments, discountCents, { cancelled: terms.cancelled });
  // A deposit never exceeds the final total after the reservation discount.
  const requiredInitialPaymentCents = terms.cancelled
    ? 0
    : terms.paymentSchedule === "full_upfront"
      ? totals.totalCents
      : Math.min(firstNightCents(billable), totals.totalCents);
  return {
    ...totals,
    // Completed refunds count as zero until refunds are recorded.
    refundDueCents: terms.cancelled ? totals.creditCents : 0,
    requiredInitialPaymentCents,
    // The payment schedule covers a stay; a cancelled reservation has none left.
    remainingScheduledCents: terms.cancelled ? 0 : totals.totalCents - requiredInitialPaymentCents,
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
