import type { ConfirmationResend } from "@pms/shared";
import { asc, eq } from "drizzle-orm";
import { runBatch, type Db } from "./db";
import { confirmationIntents, confirmationResends, reservationRequests } from "./db/schema";
import type { SignedInAccount } from "./auth";
import { HttpError } from "./http";
import { CONFIRMATION_NOT_ESTABLISHED } from "./confirmation-intents";
import { loadReservation } from "./reservation-read";
import { staffReservationAccess } from "./reservation-access";
import { confirmationSubmissionView } from "./confirmation-submissions";

export async function requestConfirmationResend(
  db: Db,
  reservationId: string,
  command: ConfirmationResend,
  account: SignedInAccount,
  today: string,
) {
  const payload = JSON.stringify({ type: "confirmation-resend", ...command });
  const replay = async () => {
    const [receipt] = await db
      .select()
      .from(reservationRequests)
      .where(eq(reservationRequests.id, command.requestId));
    if (!receipt) return null;
    if (receipt.reservationId !== reservationId || receipt.payload !== payload)
      throw new HttpError(409, "request ID reused with a different payload");
    const [work] = await db
      .select()
      .from(confirmationResends)
      .where(eq(confirmationResends.id, command.requestId));
    if (!work) throw new Error("committed confirmation resend requires audited work");
    return work;
  };
  const seen = await replay();
  if (seen) return { replayed: true, work: await confirmationResendView(db, seen) };
  await loadReservation(db, reservationId);
  const [intent] = await db
    .select()
    .from(confirmationIntents)
    .where(eq(confirmationIntents.reservationId, reservationId));
  if (!intent) throw new HttpError(404, CONFIRMATION_NOT_ESTABLISHED);
  await staffReservationAccess(db, reservationId, today);
  const now = new Date().toISOString();
  const work: typeof confirmationResends.$inferSelect = {
    id: command.requestId,
    intentId: intent.id,
    recipientEmail: command.recipientEmail,
    language: intent.language,
    accountId: account.id,
    accountUsername: account.username,
    accountRole: account.role,
    createdAt: now,
  };
  try {
    await runBatch(db, [
      db.insert(reservationRequests).values({
        id: command.requestId,
        reservationId,
        payload,
        createdAt: now,
      }),
      db.insert(confirmationResends).values(work),
    ]);
  } catch (error) {
    const committed = await replay();
    if (committed) return { replayed: true, work: await confirmationResendView(db, committed) };
    throw error;
  }
  return { replayed: false, work: await confirmationResendView(db, work) };
}

export async function confirmationResendHistory(db: Db, intentId: string) {
  const rows = await db
    .select()
    .from(confirmationResends)
    .where(eq(confirmationResends.intentId, intentId))
    .orderBy(asc(confirmationResends.createdAt), asc(confirmationResends.id));
  return Promise.all(rows.map((row) => confirmationResendView(db, row)));
}

async function confirmationResendView(db: Db, row: typeof confirmationResends.$inferSelect) {
  return {
    id: row.id,
    kind: "deliberate_resend" as const,
    recipientEmail: row.recipientEmail,
    language: row.language,
    createdAt: row.createdAt,
    requestedBy: { id: row.accountId, username: row.accountUsername, role: row.accountRole },
    mayDuplicateEarlierDelivery: true,
    submission: await confirmationSubmissionView(db, row.intentId, row.id),
  };
}
