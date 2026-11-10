import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import type { Db } from "./db";
import {
  confirmationIntents,
  confirmationSubmissions,
  reservationAccess,
  roomTypes,
} from "./db/schema";
import type { Env } from "./env";
import { chargeableCents, freeCancellationUntil } from "./lib/cancellation";
import { acceptedTerms, type RatePlanCode } from "./lib/rate-plans";
import { reservationBill } from "./lib/reservation-bill";
import { readEmailSubmissionAdmission } from "./operation-controls";
import { loadReservation, type State } from "./reservation-read";
import { QUOTA_BACKOFF_MS, resendForEnv, type Resend, type ResendSendResult } from "./resend";

export const SUBMISSION_WINDOW_MS = 20 * 60 * 60 * 1000;

const ATTEMPTS_PER_TICK = 10;
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const FROM = "Hotel Manantial <reservas@notificaciones.hotelmanantialchurin.com>";
const REPLY_TO = "hotelmanantialchurinperu@gmail.com";
const PHONE = "+51 992 755 015";
const SITE = "https://www.hotelmanantialchurin.com";

const PLAN_NAME: Record<"es" | "en", Record<RatePlanCode, string>> = {
  es: { flexible: "Flexible", non_refundable: "No reembolsable" },
  en: { flexible: "Flexible", non_refundable: "Non-refundable" },
};

type Intent = typeof confirmationIntents.$inferSelect;
type Submission = typeof confirmationSubmissions.$inferSelect;

export async function sendConfirmationSubmissions(
  db: Db,
  env: Pick<Env["Bindings"], "RESEND_API_KEY" | "RESEND_API_URL">,
) {
  try {
    await deliverConfirmations(db, resendForEnv(env));
  } catch (error) {
    console.error("confirmation submission", redactAddresses(error));
  }
}

export async function confirmationSubmissionView(db: Db, intentId: string) {
  const [row] = await db
    .select()
    .from(confirmationSubmissions)
    .where(eq(confirmationSubmissions.intentId, intentId));
  if (!row) return null;
  return {
    status: row.status,
    providerMessageId: row.providerMessageId,
    failureCode: row.failureCode,
    sendKey: row.sendKey,
    firstPossibleAt: row.firstPossibleAt,
    nextAttemptAt: row.nextAttemptAt,
    createdAt: row.createdAt,
  };
}

async function deliverConfirmations(db: Db, resend: Resend) {
  if (!(await readEmailSubmissionAdmission(db)).admitted || !resend.configured) return;
  const now = new Date();
  const due = await dueSubmissions(db, now.toISOString(), ATTEMPTS_PER_TICK);
  const fresh =
    due.length < ATTEMPTS_PER_TICK ? await freshIntents(db, ATTEMPTS_PER_TICK - due.length) : [];
  for (const reservationId of [
    ...due.map((row) => row.reservationId),
    ...fresh.map((row) => row.reservationId),
  ]) {
    try {
      const dueRow = due.find((row) => row.reservationId === reservationId);
      if (dueRow) await retrySubmission(db, resend, dueRow.submission, now);
      else {
        const intent = fresh.find((row) => row.reservationId === reservationId);
        if (intent) await openSubmission(db, resend, intent, now);
      }
    } catch (error) {
      console.error("confirmation submission", reservationId, redactAddresses(error));
    }
  }
}

async function dueSubmissions(db: Db, now: string, limit: number) {
  return db
    .select({
      submission: confirmationSubmissions,
      reservationId: confirmationIntents.reservationId,
    })
    .from(confirmationSubmissions)
    .innerJoin(confirmationIntents, eq(confirmationIntents.id, confirmationSubmissions.intentId))
    .where(
      and(
        eq(confirmationSubmissions.status, "uncertain"),
        lte(confirmationSubmissions.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(confirmationSubmissions.nextAttemptAt), asc(confirmationSubmissions.createdAt))
    .limit(limit);
}

async function freshIntents(db: Db, limit: number) {
  return db
    .select({ intent: confirmationIntents, reservationId: confirmationIntents.reservationId })
    .from(confirmationIntents)
    .leftJoin(confirmationSubmissions, eq(confirmationSubmissions.intentId, confirmationIntents.id))
    .where(isNull(confirmationSubmissions.id))
    .orderBy(asc(confirmationIntents.createdAt), asc(confirmationIntents.id))
    .limit(limit)
    .then((rows) => rows.map((row) => row.intent));
}

async function retrySubmission(db: Db, resend: Resend, row: Submission, now: Date) {
  if (
    !row.firstPossibleAt ||
    now.getTime() >= Date.parse(row.firstPossibleAt) + SUBMISSION_WINDOW_MS
  ) {
    await markAttention(db, row.id, now);
    return;
  }
  if (row.providerMessageId) {
    const found = await resend.getEmail(row.providerMessageId);
    if (found) await markAccepted(db, row.id, found.id, now);
    else
      await scheduleRetry(
        db,
        row,
        { kind: "uncertain", failureCode: null, minimumBackoffMs: 0 },
        now,
      );
    return;
  }
  if (!row.endpoint || !row.sendKey || row.requestJson === null) {
    await markAttention(db, row.id, now);
    return;
  }
  await applyResult(
    db,
    row,
    await resend.send({
      endpoint: row.endpoint,
      idempotencyKey: row.sendKey,
      body: row.requestJson,
    }),
    now,
  );
}

async function openSubmission(db: Db, resend: Resend, intent: Intent, now: Date) {
  const [access] = await db
    .select()
    .from(reservationAccess)
    .where(eq(reservationAccess.reservationId, intent.reservationId));
  if (!access) {
    console.error("confirmation submission", intent.reservationId);
    return;
  }
  const state = await loadReservation(db, intent.reservationId);
  if (state.reservation.status !== "confirmed") {
    await insertUnsent(db, intent, now);
    return;
  }
  const nowIso = now.toISOString();
  const row = {
    id: crypto.randomUUID(),
    intentId: intent.id,
    sendKey: `confirmation/${intent.id}`,
    endpoint: resend.emailsUrl,
    requestJson: JSON.stringify(await confirmationRequest(db, state, intent, access.token)),
    recipientEmail: intent.recipientEmail,
    language: intent.language,
    firstPossibleAt: nowIso,
    status: "uncertain",
    nextAttemptAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  try {
    await db.insert(confirmationSubmissions).values(row);
  } catch (error) {
    if (isUnique(error)) return;
    throw error;
  }
  await applyResult(
    db,
    row,
    await resend.send({
      endpoint: row.endpoint,
      idempotencyKey: row.sendKey,
      body: row.requestJson,
    }),
    new Date(),
  );
}

async function insertUnsent(db: Db, intent: Intent, now: Date) {
  const nowIso = now.toISOString();
  try {
    await db.insert(confirmationSubmissions).values({
      id: crypto.randomUUID(),
      intentId: intent.id,
      recipientEmail: intent.recipientEmail,
      language: intent.language,
      status: "unsent",
      failureCode: "not_confirmed",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } catch (error) {
    if (isUnique(error)) return;
    throw error;
  }
}

async function confirmationRequest(db: Db, state: State, intent: Intent, token: string) {
  const language = intent.language === "en" ? "en" : "es";
  const bill = reservationBill(state);
  const terms = acceptedTerms(state.reservation);
  const outstandingCents = Math.max(0, bill.balanceCents);
  const link = summaryLink(language, token);
  const facts = messageFacts({
    language,
    code: state.reservation.code,
    checkIn: state.reservation.checkIn,
    checkOut: state.reservation.checkOut,
    room: await roomTypeNames(db, state),
    plan: PLAN_NAME[language][terms.plan],
    freeUntil: freeCancellationUntil(terms.cancellationPolicy, state.reservation.checkIn),
    chargeCents: chargeableCents(
      terms.cancellationPolicy,
      state.lines,
      state.reservation.discountCents,
    ),
    totalCents: bill.totalCents,
    paidCents: bill.paidCents,
    outstandingCents,
  });
  return {
    from: FROM,
    to: [intent.recipientEmail],
    reply_to: REPLY_TO,
    subject:
      language === "en"
        ? `Reservation confirmation ${state.reservation.code}`
        : `Confirmación de reserva ${state.reservation.code}`,
    html: `<p>${facts.map(escapeHtml).join("<br>\n")}</p>\n<p><a href="${escapeHtml(link)}">${
      language === "en" ? "View your reservation" : "Ver su reserva"
    }</a></p>`,
    text: [...facts, link].join("\n"),
    tags: [{ name: "category", value: "confirmation" }],
  };
}

function messageFacts(input: {
  language: "es" | "en";
  code: string;
  checkIn: string;
  checkOut: string;
  room: string;
  plan: string;
  freeUntil: string | null;
  chargeCents: number;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
}) {
  const charge = soles(input.chargeCents);
  const cancellation =
    input.freeUntil === null
      ? input.language === "en"
        ? `No free cancellation. The charge is ${charge}.`
        : `Sin cancelación gratuita. El cargo es ${charge}.`
      : input.language === "en"
        ? `Free cancellation until ${input.freeUntil}. After that, the charge is ${charge}.`
        : `Cancelación sin cargo hasta el ${input.freeUntil}. Después, el cargo es ${charge}.`;
  const paidInFull =
    input.outstandingCents === 0
      ? input.language === "en"
        ? "Paid in full."
        : "Pagado en su totalidad."
      : null;
  return [
    input.language === "en" ? `Reference: ${input.code}` : `Reserva: ${input.code}`,
    input.language === "en" ? `Check-in: ${input.checkIn}` : `Llegada: ${input.checkIn}`,
    input.language === "en" ? `Check-out: ${input.checkOut}` : `Salida: ${input.checkOut}`,
    input.language === "en" ? `Room: ${input.room}` : `Habitación: ${input.room}`,
    `Plan: ${input.plan}`,
    cancellation,
    `Total: ${soles(input.totalCents)}`,
    input.language === "en"
      ? `Paid: ${soles(input.paidCents)}`
      : `Pagado: ${soles(input.paidCents)}`,
    input.language === "en"
      ? `Outstanding balance: ${soles(input.outstandingCents)}`
      : `Saldo pendiente: ${soles(input.outstandingCents)}`,
    ...(paidInFull ? [paidInFull] : []),
    input.language === "en" ? `Phone: ${PHONE}` : `Teléfono: ${PHONE}`,
    input.language === "en" ? `Email: ${REPLY_TO}` : `Correo: ${REPLY_TO}`,
  ];
}

function summaryLink(language: "es" | "en", token: string) {
  return `${SITE}${language === "en" ? "/en" : ""}/reservar/resumen/#${token}`;
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

function soles(cents: number) {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  return `${negative ? "-" : ""}S/ ${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function applyResult(
  db: Db,
  row: Pick<Submission, "id" | "nextAttemptAt" | "updatedAt">,
  result: ResendSendResult,
  now: Date,
) {
  if (result.kind === "accepted") {
    await markAccepted(db, row.id, result.id, now);
    return;
  }
  if (result.kind === "attention") {
    await db
      .update(confirmationSubmissions)
      .set({ status: "attention", failureCode: result.failureCode, updatedAt: now.toISOString() })
      .where(eq(confirmationSubmissions.id, row.id));
    return;
  }
  await scheduleRetry(db, row, result, now);
}

async function scheduleRetry(
  db: Db,
  row: Pick<Submission, "id" | "nextAttemptAt" | "updatedAt">,
  result: Extract<ResendSendResult, { kind: "uncertain" }>,
  now: Date,
) {
  const minimum = Math.max(
    result.minimumBackoffMs,
    result.failureCode === "quota" ? QUOTA_BACKOFF_MS : 0,
  );
  await db
    .update(confirmationSubmissions)
    .set({
      status: "uncertain",
      failureCode: result.failureCode,
      nextAttemptAt: new Date(now.getTime() + nextDelayMs(row, minimum)).toISOString(),
      updatedAt: now.toISOString(),
    })
    .where(eq(confirmationSubmissions.id, row.id));
}

function nextDelayMs(row: Pick<Submission, "nextAttemptAt" | "updatedAt">, minimumMs: number) {
  const last = row.nextAttemptAt ? Date.parse(row.nextAttemptAt) - Date.parse(row.updatedAt) : 0;
  const index = BACKOFF_MS.findIndex((step) => Math.abs(step - last) < 1000);
  const next = index < 0 ? BACKOFF_MS[0]! : BACKOFF_MS[Math.min(index + 1, BACKOFF_MS.length - 1)]!;
  return Math.max(next, minimumMs);
}

async function markAccepted(db: Db, id: string, providerMessageId: string, now: Date) {
  await db
    .update(confirmationSubmissions)
    .set({
      status: "accepted",
      providerMessageId,
      failureCode: null,
      nextAttemptAt: null,
      updatedAt: now.toISOString(),
    })
    .where(eq(confirmationSubmissions.id, id));
}

async function markAttention(db: Db, id: string, now: Date) {
  await db
    .update(confirmationSubmissions)
    .set({ status: "attention", updatedAt: now.toISOString() })
    .where(eq(confirmationSubmissions.id, id));
}

function isUnique(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  const text = `${error instanceof Error ? error.message : String(error)} ${
    cause instanceof Error ? cause.message : ""
  }`;
  return text.includes("UNIQUE");
}

function redactAddresses(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  return new Error(error.message.replace(/[\w.+-]+@[\w.-]+/g, "[redacted]"), {
    cause: error.cause === undefined ? undefined : redactAddresses(error.cause),
  });
}
