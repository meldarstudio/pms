import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "./db";
import { complaintEmails } from "./db/schema";
import { complaintReceiptMessage } from "./complaint-email";
import { complaintView } from "./complaints";
import { configuredComplaintBook } from "./complaint-config";
import type { Env } from "./env";
import { resendForEnv } from "./resend";
import { loopbackUrl } from "./loopback";

export async function sendComplaintEmails(db: Db, env: Env["Bindings"]) {
  const config = configuredComplaintBook(env.COMPLAINT_BOOK);
  if (!config) return;
  const simulatorUrl = loopbackUrl(env.RESEND_API_URL);
  if (config.receiptDelivery === "simulated" && !simulatorUrl) return;
  const resend = resendForEnv({
    RESEND_API_KEY: env.RESEND_API_KEY,
    RESEND_API_URL: config.receiptDelivery === "simulated" ? simulatorUrl : undefined,
  });
  if (!resend.configured) return;
  const due = await db
    .select()
    .from(complaintEmails)
    .where(
      and(
        eq(complaintEmails.status, "pending"),
        lte(complaintEmails.nextAttemptAt, new Date().toISOString()),
      ),
    )
    .orderBy(asc(complaintEmails.nextAttemptAt))
    .limit(10);
  for (const row of due) {
    if (
      row.deliveryUncertain &&
      row.firstAttemptAt &&
      Date.now() - Date.parse(row.firstAttemptAt) >= 23 * 60 * 60 * 1000
    ) {
      await db
        .update(complaintEmails)
        .set({ status: "failed", lastError: "retry_window_expired", nextAttemptAt: null })
        .where(
          and(
            eq(complaintEmails.id, row.id),
            eq(complaintEmails.attempts, row.attempts),
            eq(complaintEmails.status, "pending"),
          ),
        );
      continue;
    }
    const sheet = await complaintView(db, row.complaintId);
    const request =
      row.pendingRequest ?? JSON.stringify(complaintReceiptMessage(sheet, config.emailFrom));
    const nextAttemptAt = new Date(
      Date.now() + 60000 * 2 ** Math.min(row.attempts, 5),
    ).toISOString();
    const [claimed] = await db
      .update(complaintEmails)
      .set({
        pendingRequest: request,
        attempts: row.attempts + 1,
        nextAttemptAt,
        deliveryUncertain: true,
        firstAttemptAt:
          row.firstAttemptAt &&
          (row.deliveryUncertain || Date.now() - Date.parse(row.firstAttemptAt) < 23 * 3600000)
            ? row.firstAttemptAt
            : new Date().toISOString(),
      })
      .where(
        and(
          eq(complaintEmails.id, row.id),
          eq(complaintEmails.status, "pending"),
          eq(complaintEmails.attempts, row.attempts),
        ),
      )
      .returning();
    if (!claimed) continue;
    const result = await resend.send({ idempotencyKey: row.id, body: request });
    await db
      .update(complaintEmails)
      .set(
        result.kind === "sent"
          ? {
              status: "sent",
              deliveryUncertain: false,
              sentAt: new Date().toISOString(),
              providerMessageId: result.id,
              nextAttemptAt: null,
              lastError: null,
            }
          : {
              status: result.kind === "failed" || claimed.attempts >= 5 ? "failed" : "pending",
              lastError: result.error,
              deliveryUncertain: result.kind === "retry" || row.deliveryUncertain,
              nextAttemptAt:
                result.kind === "retry" && claimed.attempts < 5
                  ? new Date(
                      Date.now() +
                        Math.max(
                          60000 * 2 ** Math.min(row.attempts, 5),
                          Math.min(result.retryAfterMs, 3600000),
                        ),
                    ).toISOString()
                  : null,
            },
      )
      .where(
        and(
          eq(complaintEmails.id, row.id),
          eq(complaintEmails.attempts, claimed.attempts),
          eq(complaintEmails.status, "pending"),
        ),
      );
  }
}
