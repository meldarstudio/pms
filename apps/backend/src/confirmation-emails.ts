import type { CheckoutLanguage, ConfirmationResend } from "@pms/shared";
import { and, asc, desc, eq, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { SignedInAccount } from "./auth";
import { confirmationMessage } from "./confirmation-email";
import { runBatch, type Db } from "./db";
import {
  confirmationEmails,
  paymentAttempts,
  reservationAccess,
  reservationRequests,
  roomTypes,
  user,
} from "./db/schema";
import type { Env } from "./env";
import { HttpError } from "./http";
import { propertyCalendar } from "./property-calendar";
import { staffReservationAccess } from "./reservation-access";
import { loadReservation, type State } from "./reservation-read";
import { resendForEnv, type Resend, type ResendSendResult } from "./resend";

const EMAILS_PER_RUN = 10;
export const MAX_SEND_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const MAX_RETRY_AFTER_MS = 60 * 60_000;

type ConfirmationEmail = typeof confirmationEmails.$inferSelect;
type SendEnv = Pick<
  Env["Bindings"],
  "RESEND_API_KEY" | "RESEND_API_URL" | "CURRENCY" | "PROPERTY_TIME_ZONE"
>;

export function pendingConfirmationEmail(
  email: Pick<ConfirmationEmail, "reservationId" | "recipient" | "language" | "kind"> &
    Partial<Pick<ConfirmationEmail, "id" | "requestedBy">>,
  now: string,
): ConfirmationEmail {
  return {
    id: crypto.randomUUID(),
    requestedBy: null,
    ...email,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    providerMessageId: null,
    lastError: null,
    pendingRequest: null,
    createdAt: now,
    sentAt: null,
  };
}

export async function sendConfirmationEmails(db: Db, env: SendEnv) {
  const resend = resendForEnv(env);
  if (!resend.configured) return;
  const due = await db
    .select()
    .from(confirmationEmails)
    .where(
      and(
        eq(confirmationEmails.status, "pending"),
        lte(confirmationEmails.nextAttemptAt, new Date().toISOString()),
      ),
    )
    .orderBy(asc(confirmationEmails.nextAttemptAt), asc(confirmationEmails.createdAt))
    .limit(EMAILS_PER_RUN);
  for (const email of due) {
    try {
      await sendConfirmationEmail(db, resend, email, env);
    } catch {
      console.error("confirmation email failed", email.id);
    }
  }
}

async function sendConfirmationEmail(
  db: Db,
  resend: Resend,
  email: ConfirmationEmail,
  env: SendEnv,
) {
  if (email.attempts >= MAX_SEND_ATTEMPTS)
    return settle(db, email, { status: "failed", lastError: email.lastError ?? "attempt_limit" });
  const state = await loadReservation(db, email.reservationId);
  if (email.kind === "automatic" && state.reservation.status !== "confirmed")
    return settle(db, email, { status: "failed", lastError: "not_confirmed" });
  const request = email.pendingRequest ?? (await firstRequest(db, email, state, env));
  if (request === null) return;
  const attempt = email.attempts + 1;
  const [claimed] = await db
    .update(confirmationEmails)
    .set({ attempts: attempt, nextAttemptAt: retryAt(attempt, 0), pendingRequest: request })
    .where(
      and(
        eq(confirmationEmails.id, email.id),
        eq(confirmationEmails.status, "pending"),
        eq(confirmationEmails.attempts, email.attempts),
      ),
    )
    .returning();
  if (!claimed) return;
  const result = await resend.send({ idempotencyKey: email.id, body: request });
  await settle(db, claimed, outcome(result, attempt));
}

async function firstRequest(db: Db, email: ConfirmationEmail, state: State, env: SendEnv) {
  const [access] = await db
    .select()
    .from(reservationAccess)
    .where(eq(reservationAccess.reservationId, email.reservationId));
  if (!access) {
    await settle(db, email, { status: "failed", lastError: "missing_access" });
    return null;
  }
  const { today } = propertyCalendar(env.PROPERTY_TIME_ZONE);
  return JSON.stringify(
    confirmationMessage({
      state,
      kind: email.kind,
      recipient: email.recipient,
      language: email.language,
      room: await roomTypeNames(db, state),
      currency: env.CURRENCY,
      token: today <= access.expiresOn ? access.token : null,
      expiresOn: access.expiresOn,
      today,
    }),
  );
}

function outcome(
  result: ResendSendResult,
  attempt: number,
): Pick<ConfirmationEmail, "status" | "lastError"> & Partial<ConfirmationEmail> {
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

async function settle(
  db: Db,
  email: Pick<ConfirmationEmail, "id" | "attempts">,
  change: Pick<ConfirmationEmail, "status" | "lastError"> & Partial<ConfirmationEmail>,
) {
  await db
    .update(confirmationEmails)
    .set(
      change.status === "pending"
        ? change
        : { nextAttemptAt: null, pendingRequest: null, ...change },
    )
    .where(
      and(
        eq(confirmationEmails.id, email.id),
        eq(confirmationEmails.status, "pending"),
        eq(confirmationEmails.attempts, email.attempts),
      ),
    );
}

async function roomTypeNames(db: Db, state: State) {
  const ids = [...new Set(state.lines.map((line) => line.roomTypeId))];
  const types = ids.length
    ? await db
        .select({ id: roomTypes.id, name: roomTypes.name })
        .from(roomTypes)
        .where(inArray(roomTypes.id, ids))
    : [];
  const names = new Map(types.map((type) => [type.id, type.name]));
  return state.lines
    .map((line) => names.get(line.roomTypeId) ?? "")
    .filter(Boolean)
    .join(", ");
}

export async function reservationConfirmationEmails(db: Db, reservationId: string) {
  await loadReservation(db, reservationId);
  return confirmationEmailViews(db, eq(confirmationEmails.reservationId, reservationId));
}

async function confirmationEmailViews(db: Db, where: SQL): Promise<ReturnType<typeof present>[]> {
  const rows = await db
    .select({ email: confirmationEmails, username: user.username })
    .from(confirmationEmails)
    .leftJoin(user, eq(user.id, confirmationEmails.requestedBy))
    .where(where)
    .orderBy(desc(confirmationEmails.createdAt), desc(sql`${confirmationEmails}.rowid`));
  return rows.map(present);
}

function present({ email, username }: { email: ConfirmationEmail; username: string | null }) {
  return {
    id: email.id,
    kind: email.kind,
    recipient: email.recipient,
    language: email.language,
    status: email.status,
    attempts: email.attempts,
    nextAttemptAt: email.nextAttemptAt,
    lastError: email.lastError,
    providerMessageId: email.providerMessageId,
    requestedBy: email.requestedBy ? { id: email.requestedBy, username } : null,
    createdAt: email.createdAt,
    sentAt: email.sentAt,
  };
}

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
    const [email] = await confirmationEmailViews(db, eq(confirmationEmails.id, command.requestId));
    if (!email) throw new Error("committed confirmation resend has no email");
    return email;
  };
  const seen = await replay();
  if (seen) return { replayed: true, email: seen };
  await staffReservationAccess(db, reservationId, today);
  const now = new Date().toISOString();
  try {
    await runBatch(db, [
      db.insert(reservationRequests).values({
        id: command.requestId,
        reservationId,
        payload,
        createdAt: now,
      }),
      db.insert(confirmationEmails).values(
        pendingConfirmationEmail(
          {
            id: command.requestId,
            reservationId,
            recipient: command.recipientEmail,
            language: await bookingLanguage(db, reservationId),
            kind: "resend",
            requestedBy: account.id,
          },
          now,
        ),
      ),
    ]);
  } catch (error) {
    const committed = await replay();
    if (committed) return { replayed: true, email: committed };
    throw error;
  }
  const [email] = await confirmationEmailViews(db, eq(confirmationEmails.id, command.requestId));
  return { replayed: false, email: email! };
}

async function bookingLanguage(db: Db, reservationId: string): Promise<CheckoutLanguage> {
  const [attempt] = await db
    .select({ language: paymentAttempts.language })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.reservationId, reservationId))
    .limit(1);
  return attempt?.language ?? "es";
}
