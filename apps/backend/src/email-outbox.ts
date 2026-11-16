import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "./db";
import type { complaintEmails, confirmationEmails } from "./db/schema";
import type { Resend, ResendSendResult } from "./resend";

const MAX_SEND_ATTEMPTS = 5;
const EMAILS_PER_RUN = 10;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const MAX_RETRY_AFTER_MS = 60 * 60_000;

type OutboxTable = typeof confirmationEmails | typeof complaintEmails;
type Row<T extends OutboxTable> = T["$inferSelect"];
type Change = Partial<OutboxTable["$inferInsert"]>;

export type Preparation = { request: string } | { failure: string };

export type Outbox<T extends OutboxTable> = {
  table: T;
  failureLog: string;
  keepsRequestAfterSettling: boolean;
  prepare(email: Row<T>): Promise<Preparation>;
  claimChange?(email: Row<T>): Partial<T["$inferInsert"]>;
};

export async function sendDueEmails<T extends OutboxTable>(
  db: Db,
  resend: Resend,
  outbox: Outbox<T>,
) {
  if (!resend.configured) return;
  const table = outboxColumns(outbox);
  const due = (await db
    .select()
    .from(table)
    .where(and(eq(table.status, "pending"), lte(table.nextAttemptAt, new Date().toISOString())))
    .orderBy(asc(table.nextAttemptAt), asc(table.createdAt))
    .limit(EMAILS_PER_RUN)) as Row<T>[];
  for (const email of due) {
    try {
      await sendEmail(db, resend, outbox, email);
    } catch {
      console.error(outbox.failureLog, email.id);
    }
  }
}

async function sendEmail<T extends OutboxTable>(
  db: Db,
  resend: Resend,
  outbox: Outbox<T>,
  email: Row<T>,
) {
  if (email.attempts >= MAX_SEND_ATTEMPTS)
    return settle(db, outbox, email, {
      status: "failed",
      lastError: email.lastError ?? "attempt_limit",
    });
  const prepared = await outbox.prepare(email);
  if ("failure" in prepared)
    return settle(db, outbox, email, { status: "failed", lastError: prepared.failure });
  const attempt = email.attempts + 1;
  const [claimed] = await updatePending(db, outbox, email, {
    ...(outbox.claimChange?.(email) as Change | undefined),
    attempts: attempt,
    nextAttemptAt: retryAt(attempt, 0),
    pendingRequest: prepared.request,
  });
  if (!claimed) return;
  const result = await resend.send({ idempotencyKey: email.id, body: prepared.request });
  await settle(db, outbox, claimed, outcome(result, attempt));
}

function outcome(result: ResendSendResult, attempt: number): Change {
  if (result.kind === "sent")
    return {
      status: "sent",
      providerMessageId: result.id,
      lastError: null,
      sentAt: new Date().toISOString(),
    };
  if (result.kind === "failed" || attempt >= MAX_SEND_ATTEMPTS)
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

async function settle<T extends OutboxTable>(
  db: Db,
  outbox: Outbox<T>,
  email: Pick<Row<OutboxTable>, "id" | "attempts">,
  change: Change,
) {
  const settled =
    change.status === "pending"
      ? {}
      : {
          nextAttemptAt: null,
          ...(outbox.keepsRequestAfterSettling ? {} : { pendingRequest: null }),
        };
  await updatePending(db, outbox, email, { ...settled, ...change });
}

function updatePending<T extends OutboxTable>(
  db: Db,
  outbox: Outbox<T>,
  email: Pick<Row<OutboxTable>, "id" | "attempts">,
  change: Change,
) {
  const table = outboxColumns(outbox);
  return db
    .update(table)
    .set(change as Partial<typeof confirmationEmails.$inferInsert>)
    .where(
      and(eq(table.id, email.id), eq(table.status, "pending"), eq(table.attempts, email.attempts)),
    )
    .returning();
}

const outboxColumns = (outbox: Outbox<OutboxTable>) => outbox.table as typeof confirmationEmails;
