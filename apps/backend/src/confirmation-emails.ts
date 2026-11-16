import type { CheckoutLanguage, ConfirmationResend } from "@pms/shared";
import { desc, eq, inArray, sql, type SQL } from "drizzle-orm";
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
import { sendDueEmails, type Preparation } from "./email-outbox";
import { resendForEnv } from "./resend";

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
  await sendDueEmails(db, resendForEnv(env), {
    table: confirmationEmails,
    failureLog: "confirmation email failed",
    keepsRequestAfterSettling: false,
    prepare: (email) => prepareConfirmation(db, email, env),
  });
}

async function prepareConfirmation(
  db: Db,
  email: ConfirmationEmail,
  env: SendEnv,
): Promise<Preparation> {
  const state = await loadReservation(db, email.reservationId);
  if (email.kind === "automatic" && state.reservation.status !== "confirmed")
    return { failure: "not_confirmed" };
  if (email.pendingRequest !== null) return { request: email.pendingRequest };
  const [access] = await db
    .select()
    .from(reservationAccess)
    .where(eq(reservationAccess.reservationId, email.reservationId));
  if (!access) return { failure: "missing_access" };
  const { today } = propertyCalendar(env.PROPERTY_TIME_ZONE);
  return {
    request: JSON.stringify(
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
    ),
  };
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
