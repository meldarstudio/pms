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

export function roomCharges(room: BillableRoom, released: boolean) {
  const subtotalCents = room.nights.reduce((sum, night) => sum + night.priceCents, 0);
  return { subtotalCents, discountCents: 0, totalCents: released ? 0 : subtotalCents };
}

export const refundCents = (refunds: RefundMoney[], status: "requested" | "completed") =>
  refunds.reduce((sum, refund) => sum + (refund.status === status ? refund.amountCents : 0), 0);

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
    remainingScheduledCents: terms.released ? 0 : totals.totalCents - requiredInitialPaymentCents,
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
