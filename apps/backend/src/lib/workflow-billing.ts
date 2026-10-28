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
 */
export function reservationBill(
  rooms: BillableRoom[],
  payments: { amountCents: number }[],
  discountCents: number,
  terms: { cancelled: boolean; paymentSchedule: PaymentSchedule },
) {
  const billable = terms.cancelled ? [] : rooms;
  const charges = billable.reduce(
    (sum, room) => sum + room.nights.reduce((s, night) => s + night.priceCents, 0),
    0,
  );
  const totals = bill(charges, payments, discountCents, { cancelled: terms.cancelled });
  // A deposit never exceeds the final total after the reservation discount.
  const requiredInitialPaymentCents =
    terms.paymentSchedule === "full_upfront"
      ? totals.totalCents
      : Math.min(firstNightCents(billable), totals.totalCents);
  return {
    ...totals,
    requiredInitialPaymentCents,
    remainingScheduledCents: totals.totalCents - requiredInitialPaymentCents,
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
