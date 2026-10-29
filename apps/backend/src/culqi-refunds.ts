import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Culqi } from "./culqi";
import { runBatch, type Db } from "./db";
import { refunds, reservations } from "./db/schema";
import type { Refund } from "./lib/refunds";
import type { CommandContext } from "./workflow";

type RefundContext = Pick<CommandContext, "today" | "account">;

export async function sendCulqiRefunds(
  db: Db,
  culqi: Culqi,
  requested: Refund[],
  context: RefundContext,
) {
  for (const refund of requested) {
    const chargeId = refund.culqiChargeId!;
    try {
      const result = await culqi.createRefund({ chargeId, amountCents: refund.amountCents });
      if (result.kind === "completed") {
        await complete(db, refund, context, {
          reference: result.refundId,
          refundId: result.refundId,
        });
        continue;
      }
      const [charge, [before]] = await Promise.all([
        culqi.getCharge(chargeId),
        db
          .select({ cents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)` })
          .from(refunds)
          .where(
            and(
              eq(refunds.culqiChargeId, chargeId),
              eq(refunds.status, "completed"),
              ne(refunds.id, refund.id),
            ),
          ),
      ]);
      if (charge.amount_refunded === before!.cents + refund.amountCents)
        await complete(db, refund, context, { reference: chargeId, refundId: result.refundId });
    } catch (error) {
      console.error("Culqi refund", refund.id, error);
    }
  }
}

function complete(
  db: Db,
  refund: Refund,
  context: RefundContext,
  outcome: { reference: string; refundId: string | null },
) {
  return runBatch(db, [
    db
      .update(refunds)
      .set({
        status: "completed",
        refundDate: context.today,
        completionReference: outcome.reference,
        culqiRefundId: outcome.refundId,
        resolvedAt: new Date().toISOString(),
        resolvedAccountId: context.account.id,
      })
      .where(
        and(
          eq(refunds.id, refund.id),
          eq(refunds.status, "requested"),
          isNotNull(refunds.culqiChargeId),
        ),
      ),
    db
      .update(reservations)
      .set({ revision: sql`${reservations.revision} + 1` })
      .where(eq(reservations.id, refund.reservationId)),
  ]);
}
