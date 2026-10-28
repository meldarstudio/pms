import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Culqi } from "./culqi";
import { runBatch, type Db } from "./db";
import { refunds, reservations } from "./db/schema";
import type { Refund } from "./lib/refunds";

/**
 * Sends each newly requested Culqi refund once, after its request is saved. Culqi has
 * no refund idempotency, so nothing here retries: a refund Culqi did not clearly
 * complete is completed only if the charge's refunded amount proves it, and otherwise
 * stays requested ("Reembolso pendiente") for staff to check CulqiPanel and record.
 */
export async function sendCulqiRefunds(
  db: Db,
  culqi: Culqi,
  requested: Refund[],
  context: { today: string; account: { id: string } },
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
      // A lost or unclear response may still have refunded: the charge's total tells.
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
      // The request stays pending for staff; the command itself was saved.
      console.error("Culqi refund", refund.id, error);
    }
  }
}

function complete(
  db: Db,
  refund: Refund,
  context: { today: string; account: { id: string } },
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
    // A command planned against the requested refund must replan instead of overwriting it.
    db
      .update(reservations)
      .set({ revision: sql`${reservations.revision} + 1` })
      .where(eq(reservations.id, refund.reservationId)),
  ]);
}
