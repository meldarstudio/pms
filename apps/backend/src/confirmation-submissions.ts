import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  confirmationIntents,
  confirmationResends,
  confirmationSubmissionAttempts,
  confirmationSubmissions,
  reservationAccess,
  reservations,
  roomTypes,
} from "./db/schema";
import type { Env } from "./env";
import {
  renderConfirmationEmail,
  confirmationEmailText,
  confirmationEmailAttachments,
  type ConfirmationEmailSection,
} from "./confirmation-email";
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
import { propertyCalendar } from "./property-calendar";
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

type Intent = typeof confirmationIntents.$inferSelect & { deliberateWorkId?: string };
type Submission = typeof confirmationSubmissions.$inferSelect;

function submissionLinkExpiredSql(today: string) {
  return sql<number>`(coalesce(${confirmationSubmissions.linkExpiresOn} < ${today}, 0) OR EXISTS (
    SELECT 1 FROM ${reservationAccess}
    INNER JOIN ${confirmationIntents} ON ${confirmationIntents.reservationId} = ${reservationAccess.reservationId}
    WHERE ${confirmationIntents.id} = ${confirmationSubmissions.intentId}
      AND ${reservationAccess.expiresOn} < ${today}
      AND instr(${confirmationSubmissions.requestJson}, ${reservationAccess.token}) > 0
  ))`;
}

function submissionTruthCurrentSql(today: string) {
  return sql<number>`EXISTS (SELECT 1 FROM ${confirmationIntents}
  INNER JOIN ${reservations} ON ${reservations.id} = ${confirmationIntents.reservationId}
  WHERE ${confirmationIntents.id} = ${confirmationSubmissions.intentId}
  AND ((${confirmationSubmissions.deliberateWorkId} IS NULL AND ${reservations.status} = 'confirmed')
    OR (${confirmationSubmissions.deliberateWorkId} IS NOT NULL AND ${reservations.revision} = ${confirmationSubmissions.snapshotRevision}))
  AND NOT ${submissionLinkExpiredSql(today)})`;
}

export async function sendConfirmationSubmissions(
  db: Db,
  env: Pick<
    Env["Bindings"],
    "RESEND_API_KEY" | "RESEND_API_URL" | "CURRENCY" | "PROPERTY_TIME_ZONE"
  >,
) {
  try {
    await deliverConfirmations(db, resendForEnv(env), env.CURRENCY, env.PROPERTY_TIME_ZONE);
  } catch {
    console.error("confirmation submission scan failed");
  }
}

export async function confirmationSubmissionView(
  db: Db,
  intentId: string,
  deliberateWorkId: string | null = null,
) {
  const [row] = await db
    .select()
    .from(confirmationSubmissions)
    .where(
      and(
        eq(confirmationSubmissions.intentId, intentId),
        deliberateWorkId === null
          ? isNull(confirmationSubmissions.deliberateWorkId)
          : eq(confirmationSubmissions.deliberateWorkId, deliberateWorkId),
      ),
    );
  if (!row) return null;
  return {
    id: row.id,
    endpoint: row.endpoint,
    status: row.status,
    providerMessageId: row.providerMessageId,
    failureCode: row.failureCode,
    sendKey: row.sendKey,
    firstPossibleAt: row.firstPossibleAt,
    nextAttemptAt: row.nextAttemptAt,
    createdAt: row.createdAt,
    possiblyAcceptedPosts: row.possiblyAcceptedPosts,
    snapshotRevision: row.snapshotRevision,
    linkExpiresOn: row.linkExpiresOn,
    attempts: await db
      .select({
        id: confirmationSubmissionAttempts.id,
        startedAt: confirmationSubmissionAttempts.startedAt,
        completedAt: confirmationSubmissionAttempts.completedAt,
        outcome: confirmationSubmissionAttempts.outcome,
        failureCode: confirmationSubmissionAttempts.failureCode,
        providerMessageId: confirmationSubmissionAttempts.providerMessageId,
      })
      .from(confirmationSubmissionAttempts)
      .where(eq(confirmationSubmissionAttempts.submissionId, row.id))
      .orderBy(
        asc(confirmationSubmissionAttempts.startedAt),
        asc(confirmationSubmissionAttempts.id),
      ),
    delivery: await confirmationDeliveryView(db, row),
  };
}

async function deliverConfirmations(db: Db, resend: Resend, currency: string, timeZone: string) {
  if (!(await readEmailSubmissionAdmission(db)).admitted || !resend.configured) return;
  const now = new Date();
  const due = await dueSubmissions(db, now.toISOString(), ATTEMPTS_PER_TICK);
  const fresh =
    due.length < ATTEMPTS_PER_TICK ? await freshIntents(db, ATTEMPTS_PER_TICK - due.length) : [];
  for (const item of [
    ...due.map((row) => ({
      reservationId: row.reservationId,
      submission: row.submission,
      intent: null,
    })),
    ...fresh.map((intent) => ({ reservationId: intent.reservationId, submission: null, intent })),
  ]) {
    try {
      if (!(await readEmailSubmissionAdmission(db)).admitted) break;
      if (item.submission) await retrySubmission(db, resend, item.submission, new Date(), timeZone);
      else if (item.intent)
        await openSubmission(db, resend, item.intent, new Date(), currency, timeZone);
    } catch {
      console.error("confirmation submission failed", item.reservationId);
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
  const originals = await db
    .select({ intent: confirmationIntents, reservationId: confirmationIntents.reservationId })
    .from(confirmationIntents)
    .leftJoin(
      confirmationSubmissions,
      and(
        eq(confirmationSubmissions.intentId, confirmationIntents.id),
        isNull(confirmationSubmissions.deliberateWorkId),
      ),
    )
    .where(isNull(confirmationSubmissions.id))
    .orderBy(asc(confirmationIntents.createdAt), asc(confirmationIntents.id))
    .limit(limit)
    .then((rows) => rows.map((row) => row.intent));
  if (originals.length === limit) return originals;
  const deliberate = await db
    .select({ intent: confirmationIntents, work: confirmationResends })
    .from(confirmationResends)
    .innerJoin(confirmationIntents, eq(confirmationIntents.id, confirmationResends.intentId))
    .leftJoin(
      confirmationSubmissions,
      eq(confirmationSubmissions.deliberateWorkId, confirmationResends.id),
    )
    .where(isNull(confirmationSubmissions.id))
    .orderBy(asc(confirmationResends.createdAt), asc(confirmationResends.id))
    .limit(limit - originals.length);
  return [
    ...originals,
    ...deliberate.map(({ intent, work }) => ({
      ...intent,
      deliberateWorkId: work.id,
      recipientEmail: work.recipientEmail,
      language: work.language,
    })),
  ];
}

async function retrySubmission(
  db: Db,
  resend: Resend,
  row: Submission,
  now: Date,
  timeZone: string,
) {
  if (await stopChangedTruth(db, row.id, now, propertyCalendar(timeZone).today)) return;
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
  await postSubmission(db, resend, row, timeZone);
}

async function postSubmission(db: Db, resend: Resend, row: Submission, timeZone: string) {
  if (!(await readEmailSubmissionAdmission(db)).admitted) return;
  const now = new Date();
  const attemptId = crypto.randomUUID();
  const [, startedRows] = await db.batch([
    db.insert(confirmationSubmissionAttempts).select(
      db
        .select({
          id: sql<string>`${attemptId}`.as("attempt_id"),
          submissionId: confirmationSubmissions.id,
          startedAt: sql<string>`${now.toISOString()}`.as("started_at"),
          completedAt: sql<null>`NULL`.as("completed_at"),
          outcome: sql<null>`NULL`.as("outcome"),
          failureCode: sql<null>`NULL`.as("failure_code"),
          providerMessageId: sql<null>`NULL`.as("provider_message_id"),
        })
        .from(confirmationSubmissions)
        .where(
          and(
            eq(confirmationSubmissions.id, row.id),
            inArray(confirmationSubmissions.status, ["uncertain", "unsent"]),
            isNotNull(confirmationSubmissions.nextAttemptAt),
            emailSubmissionAdmittedSql,
            submissionTruthCurrentSql(propertyCalendar(timeZone).today),
            sql`NOT ${recipientBlockedSql()}`,
            sql`(${confirmationSubmissions.possiblyAcceptedPosts} = 0 OR ${confirmationSubmissions.firstPossibleAt} > ${new Date(now.getTime() - SUBMISSION_WINDOW_MS).toISOString()})`,
          ),
        ),
    ),
    db
      .update(confirmationSubmissions)
      .set({
        possiblyAcceptedPosts: sql`${confirmationSubmissions.possiblyAcceptedPosts} + 1`,
        firstPossibleAt: sql`coalesce(${confirmationSubmissions.firstPossibleAt}, ${now.toISOString()})`,
        status: "uncertain",
      })
      .where(
        and(
          eq(confirmationSubmissions.id, row.id),
          sql`EXISTS (SELECT 1 FROM ${confirmationSubmissionAttempts} WHERE ${confirmationSubmissionAttempts.id} = ${attemptId})`,
        ),
      )
      .returning(),
  ]);
  const [started] = startedRows;
  if (!started) {
    await stopChangedTruth(db, row.id, new Date(), propertyCalendar(timeZone).today);
    await stopBlocked(db, row.id);
    return;
  }
  const [ready] = await db
    .select({
      admitted: emailSubmissionAdmittedSql,
      current: submissionTruthCurrentSql(propertyCalendar(timeZone).today),
      expired: submissionLinkExpiredSql(propertyCalendar(timeZone).today),
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
    await finishAttempt(db, attemptId, "not_posted", "recipient_blocked");
    return;
  }
  if (!ready.current) {
    await stopChangedTruth(db, started.id, new Date(), propertyCalendar(timeZone).today, 1);
    await finishAttempt(
      db,
      attemptId,
      "not_posted",
      ready.expired
        ? "access_expired"
        : started.deliberateWorkId
          ? "snapshot_changed"
          : "not_confirmed",
    );
    return;
  }
  if (!ready.nextAttemptAt || !["uncertain", "unsent"].includes(ready.status)) {
    await finishAttempt(db, attemptId, "not_posted");
    return;
  }
  if (!ready.admitted) {
    await scheduleRetry(db, started, { kind: "unsent", minimumBackoffMs: 0 }, new Date());
    await finishAttempt(db, attemptId, "not_posted");
    return;
  }
  if (
    started.possiblyAcceptedPosts > 1 &&
    Date.now() >= Date.parse(started.firstPossibleAt!) + SUBMISSION_WINDOW_MS
  ) {
    await markAttention(db, started.id, new Date());
    await finishAttempt(db, attemptId, "not_posted");
    return;
  }
  const result = await resend.send({
    endpoint: started.endpoint!,
    idempotencyKey: started.sendKey!,
    body: started.requestJson!,
  });
  await applyResult(db, started, result, new Date());
  await finishAttempt(
    db,
    attemptId,
    result.kind,
    result.kind === "accepted" ? null : result.failureCode,
    result.kind === "accepted" ? result.id : null,
  );
}

async function finishAttempt(
  db: Db,
  id: string,
  outcome: NonNullable<(typeof confirmationSubmissionAttempts.$inferSelect)["outcome"]>,
  failureCode?: string | null,
  providerMessageId: string | null = null,
) {
  await db
    .update(confirmationSubmissionAttempts)
    .set({ completedAt: new Date().toISOString(), outcome, failureCode, providerMessageId })
    .where(eq(confirmationSubmissionAttempts.id, id));
}

async function stopChangedTruth(db: Db, id: string, now: Date, today: string, unpostedAttempt = 0) {
  const stopped = await db
    .update(confirmationSubmissions)
    .set({
      possiblyAcceptedPosts: sql`max(0, ${confirmationSubmissions.possiblyAcceptedPosts} - ${unpostedAttempt})`,
      status: sql`CASE WHEN ${confirmationSubmissions.possiblyAcceptedPosts} <= ${unpostedAttempt} THEN 'unsent' ELSE 'attention' END`,
      failureCode: sql`CASE WHEN ${submissionLinkExpiredSql(today)} THEN 'access_expired' WHEN ${confirmationSubmissions.deliberateWorkId} IS NOT NULL THEN 'snapshot_changed' ELSE 'not_confirmed' END`,
      nextAttemptAt: null,
      updatedAt: now.toISOString(),
    })
    .where(
      and(
        eq(confirmationSubmissions.id, id),
        inArray(confirmationSubmissions.status, ["uncertain", "unsent"]),
        isNotNull(confirmationSubmissions.nextAttemptAt),
        sql`NOT ${submissionTruthCurrentSql(today)}`,
      ),
    )
    .returning({ id: confirmationSubmissions.id });
  return stopped.length > 0;
}

async function openSubmission(
  db: Db,
  resend: Resend,
  intent: Intent,
  now: Date,
  currency: string,
  timeZone: string,
) {
  const today = propertyCalendar(timeZone).today;
  if (await recipientIsBlocked(db, resend.emailsUrl, intent.recipientEmail)) {
    await insertTerminalSubmission(db, intent, now, "attention", "recipient_blocked");
    return;
  }
  const state = await loadReservation(db, intent.reservationId);
  if (!intent.deliberateWorkId && state.reservation.status !== "confirmed") {
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
    const token = today <= access.expiresOn ? access.token : null;
    requestJson = JSON.stringify(
      intent.deliberateWorkId
        ? deliberateRequest(
            state,
            intent,
            token,
            currency,
            room,
            submissionId,
            now.toISOString(),
            access.expiresOn,
          )
        : confirmationRequest(state, intent, token, currency, room, submissionId, access.expiresOn),
    );
  } catch {
    await insertTerminalSubmission(db, intent, now, "attention", "snapshot_failed");
    return;
  }
  const nowIso = now.toISOString();
  const row: Submission = {
    id: submissionId,
    intentId: intent.id,
    deliberateWorkId: intent.deliberateWorkId ?? null,
    snapshotRevision: intent.deliberateWorkId ? state.reservation.revision : null,
    linkExpiresOn: today <= access.expiresOn ? access.expiresOn : null,
    sendKey: intent.deliberateWorkId
      ? `confirmation-resend/${intent.deliberateWorkId}`
      : `confirmation/${intent.id}`,
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
  await postSubmission(db, resend, row, timeZone);
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
      deliberateWorkId: intent.deliberateWorkId ?? null,
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
  token: string | null,
  currency: string,
  room: string,
  submissionId: string,
  expiresOn: string,
) {
  const language = intent.language === "en" ? "en" : "es";
  const bill = reservationBill(state);
  const terms = acceptedTerms(state.reservation);
  const outstandingCents = Math.max(0, bill.balanceCents);
  const facts = messageFacts({
    currency,
    language,
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
  return emailRequest(intent, submissionId, state.reservation.code, facts, token, expiresOn);
}

function emailRequest(
  intent: Intent,
  submissionId: string,
  code: string,
  sections: ConfirmationEmailSection[],
  token: string | null,
  expiresOn: string,
  kind: "confirmation" | "summary" = "confirmation",
) {
  const language = intent.language === "en" ? "en" : "es";
  const link = token ? summaryLink(language, token) : null;
  const assistance =
    language === "en"
      ? `Online access expired on ${expiresOn}. Contact the hotel for assistance.`
      : `El acceso en línea venció el ${expiresOn}. Contacta al hotel para obtener asistencia.`;
  return {
    from: FROM,
    to: [intent.recipientEmail],
    reply_to: REPLY_TO,
    subject:
      language === "en" ? `Reservation confirmation ${code}` : `Confirmación de reserva ${code}`,
    html: renderConfirmationEmail({ language, code, kind, sections, link, assistance }),
    text: [
      language === "en" ? `Reference: ${code}` : `Reserva: ${code}`,
      ...sections.flatMap((section) => confirmationEmailText(section, language)),
      link ?? assistance,
    ].join("\n"),
    attachments: confirmationEmailAttachments,
    tags: [
      { name: "category", value: "confirmation" },
      { name: "submission_id", value: submissionId },
    ],
  };
}

function deliberateRequest(
  state: State,
  intent: Intent,
  token: string | null,
  currency: string,
  room: string,
  submissionId: string,
  snapshotAt: string,
  expiresOn: string,
) {
  const language = intent.language === "en" ? "en" : "es";
  const bill = reservationBill(state);
  const amount = (cents: number) => money(cents, currency);
  const statuses: Record<string, { en: string; es: string }> = {
    confirmed: { en: "Confirmed", es: "Confirmada" },
    checked_in: { en: "Checked in", es: "Hospedada" },
    checked_out: { en: "Checked out", es: "Finalizada" },
    cancelled: { en: "Cancelled", es: "Cancelada" },
    no_show: { en: "No-show", es: "No se presentó" },
    unfulfilled: { en: "Unfulfilled — not confirmed", es: "Sin disponibilidad — no confirmada" },
  };
  const status = statuses[state.reservation.status]?.[language];
  if (!status) throw new Error("unknown reservation status");
  const facts: ConfirmationEmailSection[] = [
    {
      title: language === "en" ? "Reservation status" : "Estado de la reserva",
      lines: [
        language === "en"
          ? `Summary as of ${snapshotAt}. This is not a new confirmation.`
          : `Resumen al ${snapshotAt}. No es una nueva confirmación.`,
        language === "en" ? `Status: ${status}` : `Estado: ${status}`,
      ],
    },
    {
      stay: {
        checkIn: state.reservation.checkIn,
        checkOut: state.reservation.checkOut,
        room,
        plan: PLAN_NAME[language][acceptedTerms(state.reservation).plan],
      },
    },
    {
      title:
        language === "en" ? "Accepted cancellation terms" : "Condiciones de cancelación aceptadas",
      lines: [
        language === "en"
          ? `Accepted free-cancellation deadline: ${freeCancellationUntil(acceptedTerms(state.reservation).cancellationPolicy, state.reservation.checkIn) ?? "none"}`
          : `Fecha límite de cancelación gratuita aceptada: ${freeCancellationUntil(acceptedTerms(state.reservation).cancellationPolicy, state.reservation.checkIn) ?? "ninguna"}`,
        language === "en"
          ? `Accepted policy charge: ${amount(chargeableCents(acceptedTerms(state.reservation).cancellationPolicy, state.lines, state.reservation.discountCents))}`
          : `Cargo según la política aceptada: ${amount(chargeableCents(acceptedTerms(state.reservation).cancellationPolicy, state.lines, state.reservation.discountCents))}`,
      ],
    },
    {
      title: language === "en" ? "Payment and refunds" : "Pago y devoluciones",
      lines: [
        `Total: ${amount(bill.totalCents)}`,
        language === "en" ? `Paid: ${amount(bill.paidCents)}` : `Pagado: ${amount(bill.paidCents)}`,
        language === "en"
          ? `Outstanding balance: ${amount(Math.max(0, bill.balanceCents))}`
          : `Saldo pendiente: ${amount(Math.max(0, bill.balanceCents))}`,
        language === "en"
          ? `Refund due: ${amount(bill.refundDueCents)}`
          : `Por devolver: ${amount(bill.refundDueCents)}`,
        language === "en"
          ? `Completed refunds: ${amount(bill.refundedCents)}`
          : `Devoluciones completadas: ${amount(bill.refundedCents)}`,
        language === "en"
          ? `Pending refunds (not returned): ${amount(bill.pendingRefundCents)}`
          : `Devoluciones pendientes (no devueltas): ${amount(bill.pendingRefundCents)}`,
        language === "en"
          ? `Coupon settlement (not cash): ${amount(bill.couponAppliedCents)}`
          : `Pagado con cupón (no efectivo): ${amount(bill.couponAppliedCents)}`,
        language === "en"
          ? `Converted into coupons (not refunded): ${amount(bill.couponIssuedCents)}`
          : `Pasado a cupón (no devuelto): ${amount(bill.couponIssuedCents)}`,
      ],
    },
    { action: true },
    {
      title: language === "en" ? "Need help?" : "¿Necesitas ayuda?",
      lines: [
        language === "en"
          ? `For current information and assistance, contact the hotel. Phone: ${PHONE}. Email: ${REPLY_TO}`
          : `Para información actual y asistencia, contacta al hotel. Teléfono: ${PHONE}. Correo: ${REPLY_TO}`,
      ],
    },
  ];
  return {
    ...emailRequest(
      intent,
      submissionId,
      state.reservation.code,
      facts,
      token,
      expiresOn,
      "summary",
    ),
    subject:
      language === "en"
        ? `Reservation summary ${state.reservation.code}`
        : `Resumen de reserva ${state.reservation.code}`,
  };
}

function messageFacts(input: {
  currency: string;
  language: "es" | "en";
  checkIn: string;
  checkOut: string;
  room: string;
  plan: string;
  freeUntil: string | null;
  chargeCents: number;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
}): ConfirmationEmailSection[] {
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
    {
      stay: {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        room: input.room,
        plan: input.plan,
      },
    },
    {
      payment: [
        { label: "Total", value: amount(input.totalCents) },
        {
          label: input.language === "en" ? "Paid" : "Pagado",
          value: amount(input.paidCents),
        },
        {
          label: input.language === "en" ? "Outstanding balance" : "Saldo pendiente",
          value: amount(input.outstandingCents),
          emphasis: true,
        },
      ],
      note: paidInFull,
    },
    { action: true },
    {
      title: input.language === "en" ? "Cancellation" : "Cancelación",
      lines: [cancellation],
    },
    {
      title: input.language === "en" ? "Need help?" : "¿Necesitas ayuda?",
      lines: [
        input.language === "en" ? `Phone: ${PHONE}` : `Teléfono: ${PHONE}`,
        input.language === "en" ? `Email: ${REPLY_TO}` : `Correo: ${REPLY_TO}`,
      ],
    },
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
