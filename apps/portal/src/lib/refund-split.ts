import type { ReservationDetail } from "./api.ts";
import { culqiMinRefundCents } from "./reservation-form-schemas.ts";

type RefundSource = Pick<ReservationDetail, "payments" | "refunds">;

function refundablePayments({ payments, refunds }: RefundSource) {
  return payments
    .map((payment) => ({
      payment,
      leftCents:
        payment.amountCents -
        refunds
          .filter((refund) => refund.paymentId === payment.id && refund.status !== "failed")
          .reduce((sum, refund) => sum + refund.amountCents, 0),
    }))
    .filter((entry) => entry.leftCents > 0)
    .sort(
      (a, b) =>
        Number(!!a.payment.culqiChargeId) - Number(!!b.payment.culqiChargeId) ||
        b.payment.paymentDate.localeCompare(a.payment.paymentDate) ||
        b.payment.createdAt.localeCompare(a.payment.createdAt),
    );
}

export function cardRefundPayments(detail: RefundSource) {
  return refundablePayments(detail).filter(
    (entry) => entry.payment.culqiChargeId && entry.leftCents >= culqiMinRefundCents,
  );
}

export function refundCapacityCents(detail: RefundSource) {
  return refundablePayments(detail).reduce((sum, entry) => sum + entry.leftCents, 0);
}

export function firstRefundPayment(detail: RefundSource) {
  return refundablePayments(detail)[0]?.payment;
}

export function splitRefund(detail: RefundSource, amountCents: number) {
  const parts: { paymentId: string; amountCents: number }[] = [];
  let rest = amountCents;
  for (const { payment, leftCents } of refundablePayments(detail)) {
    if (rest <= 0) break;
    const part = Math.min(rest, leftCents);
    parts.push({ paymentId: payment.id, amountCents: part });
    rest -= part;
  }
  return parts;
}
