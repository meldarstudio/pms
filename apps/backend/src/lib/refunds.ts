import type { refunds } from "../db/schema";

export type Refund = typeof refunds.$inferSelect & {
  requestedBy: string | null;
  resolvedBy: string | null;
};

const byRequest = (a: Refund, b: Refund) =>
  a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id);

/** Every refund of a reservation, oldest request first, as reads present them. */
export function presentRefunds(rows: Refund[]) {
  return rows.toSorted(byRequest).map((refund) => ({
    id: refund.id,
    paymentId: refund.paymentId,
    amountCents: refund.amountCents,
    method: refund.method,
    reference: refund.reference,
    reason: refund.reason,
    status: refund.status,
    requestedAt: refund.requestedAt,
    requestedBy: refund.requestedBy,
    resolvedAt: refund.resolvedAt,
    resolvedBy: refund.resolvedBy,
    refundDate: refund.refundDate,
    completionReference: refund.completionReference,
    failureReason: refund.failureReason,
  }));
}
