import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  confirmationIntents,
  confirmationSubmissions,
  reservationAccess,
  reservations,
  roomTypes,
} from "./db/schema";
import type { Env } from "./env";
import {
  confirmationDeliveryView,
  recordSubmissionAcceptance,
  recipientIsBlocked,
  recipientBlockedSql,
} from "./confirmation-reports";
import { chargeableCents, freeCancellationUntil } from "./lib/cancellation";
import { acceptedTerms, type RatePlanCode } from "./lib/rate-plans";
import { reservationBill } from "./lib/reservation-bill";
import { emailSubmissionAdmittedSql, readEmailSubmissionAdmission } from "./operation-controls";
import { loadReservation, type State } from "./reservation-read";
import {
  QUOTA_BACKOFF_MS,
  resendForEnv,
  type Resend,
  type ResendFailureCode,
  type ResendSendResult,
} from "./resend";

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

const reservationIsConfirmedSql = sql<number>`EXISTS (SELECT 1 FROM ${confirmationIntents}
  INNER JOIN ${reservations} ON ${reservations.id} = ${confirmationIntents.reservationId}
  WHERE ${confirmationIntents.id} = ${confirmationSubmissions.intentId} AND ${reservations.status} = 'confirmed')`;

export async function sendConfirmationSubmissions(
  db: Db,
  env: Pick<Env["Bindings"], "RESEND_API_KEY" | "RESEND_API_URL" | "CURRENCY">,
) {
  try {
    await deliverConfirmations(db, resendForEnv(env), env.CURRENCY);
  } catch {
    console.error("confirmation submission scan failed");
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
    delivery: await confirmationDeliveryView(db, row),
  };
}

async function deliverConfirmations(db: Db, resend: Resend, currency: string) {
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
      if (!(await readEmailSubmissionAdmission(db)).admitted) break;
      const dueRow = due.find((row) => row.reservationId === reservationId);
      if (dueRow) await retrySubmission(db, resend, dueRow.submission, new Date());
      else {
        const intent = fresh.find((row) => row.reservationId === reservationId);
        if (intent) await openSubmission(db, resend, intent, new Date(), currency);
      }
    } catch {
      console.error("confirmation submission failed", reservationId);
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
        inArray(confirmationSubmissions.status, ["uncertain", "unsent"]),
        or(
          lte(confirmationSubmissions.nextAttemptAt, now),
          and(
            gt(confirmationSubmissions.possiblyAcceptedPosts, 0),
            lte(
              confirmationSubmissions.firstPossibleAt,
              new Date(Date.parse(now) - SUBMISSION_WINDOW_MS).toISOString(),
            ),
          ),
        ),
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
  if (await stopNotConfirmed(db, row.id, now)) return;
  if (await stopBlocked(db, row.id)) return;
  if (
    !row.credentialFingerprint ||
    row.credentialFingerprint !== (await resend.credentialFingerprint())
  ) {
    await markAttention(db, row.id, now, "credential_changed");
    return;
  }
  if (
    row.possiblyAcceptedPosts > 0 &&
    (!row.firstPossibleAt ||
      now.getTime() >= Date.parse(row.firstPossibleAt) + SUBMISSION_WINDOW_MS)
  ) {
    await markAttention(db, row.id, now);
    return;
  }
  if (!row.endpoint || !row.sendKey || row.requestJson === null) {
    await markAttention(db, row.id, now);
    return;
  }
  await postSubmission(db, resend, row);
}

async function postSubmission(db: Db, resend: Resend, row: Submission) {
  if (!(await readEmailSubmissionAdmission(db)).admitted) return;
  const now = new Date();
  const [started] = await db
    .update(confirmationSubmissions)
    .set({
      possiblyAcceptedPosts: sql`${confirmationSubmissions.possiblyAcceptedPosts} + 1`,
      firstPossibleAt: sql`coalesce(${confirmationSubmissions.firstPossibleAt}, ${now.toISOString()})`,
      status: "uncertain",
    })
    .where(
      and(
        eq(confirmationSubmissions.id, row.id),
        inArray(confirmationSubmissions.status, ["uncertain", "unsent"]),
        isNotNull(confirmationSubmissions.nextAttemptAt),
        emailSubmissionAdmittedSql,
        reservationIsConfirmedSql,
        sql`NOT ${recipientBlockedSql()}`,
        sql`(${confirmationSubmissions.possiblyAcceptedPosts} = 0 OR ${confirmationSubmissions.firstPossibleAt} > ${new Date(now.getTime() - SUBMISSION_WINDOW_MS).toISOString()})`,
      ),
    )
    .returning();
  if (!started) {
    await stopNotConfirmed(db, row.id, new Date());
    await stopBlocked(db, row.id);
    return;
  }
  const [ready] = await db
    .select({
      admitted: emailSubmissionAdmittedSql,
      confirmed: sql<number>`${reservations.status} = 'confirmed'`,
      status: confirmationSubmissions.status,
      nextAttemptAt: confirmationSubmissions.nextAttemptAt,
      blocked: recipientBlockedSql(),
    })
    .from(confirmationSubmissions)
    .innerJoin(confirmationIntents, eq(confirmationIntents.id, confirmationSubmissions.intentId))
    .innerJoin(reservations, eq(reservations.id, confirmationIntents.reservationId))
    .where(eq(confirmationSubmissions.id, started.id));
  if (!ready) return;
  if (ready.blocked) {
    await stopBlocked(db, started.id, 1);
    return;
  }
  if (!ready.confirmed) {
    await stopNotConfirmed(db, started.id, new Date(), 1);
    return;
  }
  if (!ready.nextAttemptAt || !["uncertain", "unsent"].includes(ready.status)) return;
  if (!ready.admitted) {
    await scheduleRetry(db, started, { kind: "unsent", minimumBackoffMs: 0 }, new Date());
    return;
  }
  if (
    started.possiblyAcceptedPosts > 1 &&
    Date.now() >= Date.parse(started.firstPossibleAt!) + SUBMISSION_WINDOW_MS
  ) {
    await markAttention(db, started.id, new Date());
    return;
  }
  await applyResult(
    db,
    started,
    await resend.send({
      endpoint: started.endpoint!,
      idempotencyKey: started.sendKey!,
      body: started.requestJson!,
    }),
    new Date(),
  );
}

async function stopNotConfirmed(db: Db, id: string, now: Date, unpostedAttempt = 0) {
  const stopped = await db
    .update(confirmationSubmissions)
    .set({
      possiblyAcceptedPosts: sql`max(0, ${confirmationSubmissions.possiblyAcceptedPosts} - ${unpostedAttempt})`,
      status: sql`CASE WHEN ${confirmationSubmissions.possiblyAcceptedPosts} <= ${unpostedAttempt} THEN 'unsent' ELSE 'attention' END`,
      failureCode: "not_confirmed",
      nextAttemptAt: null,
      updatedAt: now.toISOString(),
    })
    .where(
      and(
        eq(confirmationSubmissions.id, id),
        inArray(confirmationSubmissions.status, ["uncertain", "unsent"]),
        sql`NOT ${reservationIsConfirmedSql}`,
      ),
    )
    .returning({ id: confirmationSubmissions.id });
  return stopped.length > 0;
}

async function openSubmission(db: Db, resend: Resend, intent: Intent, now: Date, currency: string) {
  if (await recipientIsBlocked(db, resend.emailsUrl, intent.recipientEmail)) {
    await insertTerminalSubmission(db, intent, now, "attention", "recipient_blocked");
    return;
  }
  const state = await loadReservation(db, intent.reservationId);
  if (state.reservation.status !== "confirmed") {
    await insertTerminalSubmission(db, intent, now, "unsent", "not_confirmed");
    return;
  }
  const [access] = await db
    .select()
    .from(reservationAccess)
    .where(eq(reservationAccess.reservationId, intent.reservationId));
  if (!access) {
    await insertTerminalSubmission(db, intent, now, "attention", "missing_access");
    return;
  }
  const room = await roomTypeNames(db, state);
  const submissionId = crypto.randomUUID();
  let requestJson: string;
  try {
    requestJson = JSON.stringify(
      confirmationRequest(state, intent, access.token, currency, room, submissionId),
    );
  } catch {
    await insertTerminalSubmission(db, intent, now, "attention", "snapshot_failed");
    return;
  }
  const nowIso = now.toISOString();
  const row: Submission = {
    id: submissionId,
    intentId: intent.id,
    sendKey: `confirmation/${intent.id}`,
    endpoint: resend.emailsUrl,
    credentialFingerprint: await resend.credentialFingerprint(),
    possiblyAcceptedPosts: 0,
    requestJson,
    recipientEmail: intent.recipientEmail,
    language: intent.language,
    firstPossibleAt: null,
    status: "unsent",
    providerMessageId: null,
    reportConflict: false,
    nextLookupAt: null,
    failureCode: null,
    nextAttemptAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  try {
    if (!(await readEmailSubmissionAdmission(db)).admitted) return;
    await db.insert(confirmationSubmissions).values(row);
  } catch (error) {
    if (isUnique(error)) return;
    throw error;
  }
  await postSubmission(db, resend, row);
}

async function stopBlocked(db: Db, id: string, unpostedAttempt = 0) {
  const stopped = await db
    .update(confirmationSubmissions)
    .set({
      status: "attention",
      failureCode: "recipient_blocked",
      nextAttemptAt: null,
      possiblyAcceptedPosts: sql`max(0, ${confirmationSubmissions.possiblyAcceptedPosts} - ${unpostedAttempt})`,
    })
    .where(
      and(
        eq(confirmationSubmissions.id, id),
        inArray(confirmationSubmissions.status, ["unsent", "uncertain"]),
        isNotNull(confirmationSubmissions.nextAttemptAt),
        recipientBlockedSql(),
      ),
    )
    .returning({ id: confirmationSubmissions.id });
  return stopped.length > 0;
}

async function insertTerminalSubmission(
  db: Db,
  intent: Intent,
  now: Date,
  status: "unsent" | "attention",
  failureCode: string,
) {
  const nowIso = now.toISOString();
  try {
    if (!(await readEmailSubmissionAdmission(db)).admitted) return;
    await db.insert(confirmationSubmissions).values({
      id: crypto.randomUUID(),
      intentId: intent.id,
      recipientEmail: intent.recipientEmail,
      language: intent.language,
      status,
      possiblyAcceptedPosts: 0,
      failureCode,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } catch (error) {
    if (isUnique(error)) return;
    throw error;
  }
}

function confirmationRequest(
  state: State,
  intent: Intent,
  token: string,
  currency: string,
  room: string,
  submissionId: string,
) {
  const language = intent.language === "en" ? "en" : "es";
  const bill = reservationBill(state);
  const terms = acceptedTerms(state.reservation);
  const outstandingCents = Math.max(0, bill.balanceCents);
  const link = summaryLink(language, token);
  const facts = messageFacts({
    currency,
    language,
    code: state.reservation.code,
    checkIn: state.reservation.checkIn,
    checkOut: state.reservation.checkOut,
    room,
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
    tags: [
      { name: "category", value: "confirmation" },
      { name: "submission_id", value: submissionId },
    ],
  };
}

function messageFacts(input: {
  currency: string;
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
  const amount = (cents: number) => money(cents, input.currency);
  const charge = amount(input.chargeCents);
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
    `Total: ${amount(input.totalCents)}`,
    input.language === "en"
      ? `Paid: ${amount(input.paidCents)}`
      : `Pagado: ${amount(input.paidCents)}`,
    input.language === "en"
      ? `Outstanding balance: ${amount(input.outstandingCents)}`
      : `Saldo pendiente: ${amount(input.outstandingCents)}`,
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

function money(cents: number, currency: string) {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  return `${negative ? "-" : ""}${currency} ${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
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
    await recordSubmissionAcceptance(db, row.id, result.id, now);
    return;
  }
  if (result.kind === "attention") {
    await db
      .update(confirmationSubmissions)
      .set({ status: "attention", failureCode: result.failureCode, updatedAt: now.toISOString() })
      .where(
        and(
          eq(confirmationSubmissions.id, row.id),
          inArray(confirmationSubmissions.status, ["uncertain", "unsent"]),
        ),
      );
    return;
  }
  await scheduleRetry(db, row, result, now);
}

async function scheduleRetry(
  db: Db,
  row: Pick<Submission, "id" | "nextAttemptAt" | "updatedAt">,
  result: {
    kind: "uncertain" | "unsent";
    failureCode?: ResendFailureCode | null;
    minimumBackoffMs: number;
  },
  now: Date,
) {
  const minimum = Math.max(
    result.minimumBackoffMs,
    result.failureCode === "quota" ? QUOTA_BACKOFF_MS : 0,
  );
  await db
    .update(confirmationSubmissions)
    .set({
      possiblyAcceptedPosts:
        result.kind === "unsent"
          ? sql`max(0, ${confirmationSubmissions.possiblyAcceptedPosts} - 1)`
          : undefined,
      status:
        result.kind === "unsent"
          ? sql`CASE WHEN ${confirmationSubmissions.possiblyAcceptedPosts} <= 1 THEN 'unsent' ELSE 'uncertain' END`
          : "uncertain",
      failureCode: result.failureCode,
      nextAttemptAt: sql`max(coalesce(${confirmationSubmissions.nextAttemptAt}, ${now.toISOString()}), ${new Date(now.getTime() + nextDelayMs(row, minimum)).toISOString()})`,
      updatedAt: now.toISOString(),
    })
    .where(
      and(
        eq(confirmationSubmissions.id, row.id),
        inArray(confirmationSubmissions.status, ["uncertain", "unsent"]),
      ),
    );
}

function nextDelayMs(row: Pick<Submission, "nextAttemptAt" | "updatedAt">, minimumMs: number) {
  const last = row.nextAttemptAt ? Date.parse(row.nextAttemptAt) - Date.parse(row.updatedAt) : 0;
  const next = BACKOFF_MS.find((step) => step > last + 1000) ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
  return Math.max(next, minimumMs);
}

async function markAttention(db: Db, id: string, now: Date, failureCode?: string) {
  await db
    .update(confirmationSubmissions)
    .set({
      status: "attention",
      updatedAt: now.toISOString(),
      ...(failureCode ? { failureCode } : {}),
    })
    .where(
      and(
        eq(confirmationSubmissions.id, id),
        inArray(confirmationSubmissions.status, ["uncertain", "unsent"]),
      ),
    );
}

function isUnique(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  const text = `${error instanceof Error ? error.message : String(error)} ${
    cause instanceof Error ? cause.message : ""
  }`;
  return text.includes("UNIQUE");
}
