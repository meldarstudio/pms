import type { Db } from "./db";
import { complaintEmails } from "./db/schema";
import { complaintReceiptMessage } from "./complaint-email";
import { complaintView } from "./complaints";
import { complaintBook } from "./complaint-config";
import { sendDueEmails } from "./email-outbox";
import type { Env } from "./env";
import { resendForEnv } from "./resend";

const RETRY_WINDOW_WITHIN_RESEND_DEDUPLICATION_MS = 12 * 60 * 60_000;

export async function sendComplaintEmails(db: Db, env: Env["Bindings"]) {
  await sendDueEmails(db, resendForEnv(env), {
    table: complaintEmails,
    failureLog: "complaint receipt handoff failed",
    keepsRequestAfterSettling: true,
    async prepare(email) {
      if (
        email.firstAttemptAt &&
        Date.now() - Date.parse(email.firstAttemptAt) >= RETRY_WINDOW_WITHIN_RESEND_DEDUPLICATION_MS
      )
        return { failure: "retry_window_expired" };
      return {
        request:
          email.pendingRequest ??
          JSON.stringify(
            complaintReceiptMessage(
              await complaintView(db, email.complaintId),
              complaintBook.emailFrom,
            ),
          ),
      };
    },
    claimChange: (email) => ({ firstAttemptAt: email.firstAttemptAt ?? new Date().toISOString() }),
  });
}
