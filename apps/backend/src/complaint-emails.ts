import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "./db";
import { complaintEmails } from "./db/schema";
import { complaintReceiptMessage } from "./complaint-email";
import { complaintView } from "./complaints";
import { complaintBook } from "./complaint-config";
import type { Env } from "./env";
import { resendForEnv, type Resend, type ResendSendResult } from "./resend";

type ComplaintEmail = typeof complaintEmails.$inferSelect;

const EMAILS_PER_RUN = 10;
const MAX_RECEIPT_HANDOFF_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const MAX_RETRY_AFTER_MS = 60 * 60_000;
const RETRY_WINDOW_WITHIN_RESEND_DEDUPLICATION_MS = 12 * 60 * 60_000;

export async function sendComplaintEmails(db: Db, env: Env["Bindings"]) {
  const resend = resendForEnv(env);
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
    .orderBy(asc(complaintEmails.nextAttemptAt), asc(complaintEmails.createdAt))
    .limit(EMAILS_PER_RUN);
  for (const email of due) {
    try {
      await handOff(db, resend, email);
    } catch {
      console.error("complaint receipt handoff failed", email.id);
    }
  }
}

async function handOff(db: Db, resend: Resend, email: ComplaintEmail) {
  if (email.attempts >= MAX_RECEIPT_HANDOFF_ATTEMPTS)
    return settle(db, email, { status: "failed", lastError: email.lastError ?? "attempt_limit" });
  if (
    email.firstAttemptAt &&
    Date.now() - Date.parse(email.firstAttemptAt) >= RETRY_WINDOW_WITHIN_RESEND_DEDUPLICATION_MS
  )
    return settle(db, email, { status: "failed", lastError: "retry_window_expired" });
  const request =
    email.pendingRequest ??
    JSON.stringify(
      complaintReceiptMessage(await complaintView(db, email.complaintId), complaintBook.emailFrom),
    );
  const attempt = email.attempts + 1;
  const [claimed] = await db
    .update(complaintEmails)
    .set({
      attempts: attempt,
      nextAttemptAt: retryAt(attempt, 0),
      pendingRequest: request,
      firstAttemptAt: email.firstAttemptAt ?? new Date().toISOString(),
    })
    .where(
      and(
        eq(complaintEmails.id, email.id),
        eq(complaintEmails.status, "pending"),
        eq(complaintEmails.attempts, email.attempts),
      ),
    )
    .returning();
  if (!claimed) return;
  const result = await resend.send({ idempotencyKey: email.id, body: request });
  await settle(db, claimed, outcome(result, attempt));
}

function outcome(
  result: ResendSendResult,
  attempt: number,
): Pick<ComplaintEmail, "status" | "lastError"> & Partial<ComplaintEmail> {
  if (result.kind === "sent")
    return {
      status: "sent",
      providerMessageId: result.id,
      lastError: null,
      sentAt: new Date().toISOString(),
    };
  if (result.kind === "failed" || attempt >= MAX_RECEIPT_HANDOFF_ATTEMPTS)
    return { status: "failed", lastError: result.error };
  return {
    status: "pending",
    lastError: result.error,
    nextAttemptAt: retryAt(attempt, result.retryAfterMs),
  };
}

function retryAt(attempt: number, retryAfterMs: number) {
  const backoff = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length) - 1]!;
  return new Date(
    Date.now() + Math.max(backoff, Math.min(retryAfterMs, MAX_RETRY_AFTER_MS)),
  ).toISOString();
}

async function settle(
  db: Db,
  email: Pick<ComplaintEmail, "id" | "attempts">,
  change: Pick<ComplaintEmail, "status" | "lastError"> & Partial<ComplaintEmail>,
) {
  await db
    .update(complaintEmails)
    .set(change.status === "pending" ? change : { nextAttemptAt: null, ...change })
    .where(
      and(
        eq(complaintEmails.id, email.id),
        eq(complaintEmails.status, "pending"),
        eq(complaintEmails.attempts, email.attempts),
      ),
    );
}
