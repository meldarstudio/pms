import { and, asc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import type { Context } from "hono";
import { getDb, runBatch, type Db } from "./db";
import { confirmationReports, confirmationSubmissions } from "./db/schema";
import type { Env } from "./env";
import { resendEmailsUrl, resendForEnv } from "./resend";
import {
  prepareResendReportVerification,
  decodeResendReport,
  foldRecipientAsciiCase,
} from "./resend-reports";

type Submission = typeof confirmationSubmissions.$inferSelect;

const conflictAttention = {
  reportConflict: true,
  status: sql`CASE WHEN status = 'accepted' THEN status ELSE 'attention' END`,
  failureCode: sql`CASE WHEN status = 'accepted' THEN failure_code ELSE coalesce(failure_code, 'report_conflict') END`,
  nextAttemptAt: null,
};

export async function receiveConfirmationReport(c: Context<Env>) {
  c.header("Cache-Control", "no-store");
  const verify = await prepareResendReportVerification(
    c.req.raw.headers,
    c.env.RESEND_WEBHOOK_SECRET,
  );
  if (!verify) return c.json({ error: "invalid email report" }, 401);
  let body: Uint8Array<ArrayBuffer> | null;
  try {
    body = await boundedReportBody(c.req.raw);
  } catch {
    return c.json({ error: "invalid email report" }, 400);
  }
  if (!body) return c.json({ error: "invalid email report" }, 413);
  const eventId = await verify(body);
  if (!eventId) return c.json({ error: "invalid email report" }, 401);
  const report = decodeResendReport(body);
  if (!report) return c.json({ error: "invalid email report" }, 400);
  if (report === "ignored") return c.json({ received: true });
  const digest = await crypto.subtle.digest("SHA-256", body);
  const bodyDigest = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  try {
    const db = getDb(c.env.DB);
    const context = resendEmailsUrl(c.env.RESEND_API_URL);
    const observedAt = new Date().toISOString();
    await runBatch(db, [
      db
        .insert(confirmationReports)
        .values({
          id: crypto.randomUUID(),
          context,
          eventId,
          bodyDigest,
          source: "callback",
          observedAt,
          ...report,
        })
        .onConflictDoNothing(),
      db
        .update(confirmationReports)
        .set({
          details: sql`json_set(coalesce(${confirmationReports.details}, '{}'), '$.eventIdConflict', json('true'))`,
        })
        .where(
          and(
            eq(confirmationReports.context, context),
            eq(confirmationReports.eventId, eventId),
            sql`${confirmationReports.bodyDigest} != ${bodyDigest}`,
          ),
        ),
      db
        .update(confirmationSubmissions)
        .set(conflictAttention)
        .where(
          sql`id IN (SELECT submission_id FROM confirmation_reports WHERE context = ${context} AND event_id = ${eventId} AND json_extract(details, '$.eventIdConflict') = 1)`,
        ),
      ...associationStatements(db, context, report.providerMessageId),
    ]);
    return c.json({ received: true });
  } catch {
    console.error("confirmation report persistence failed");
    return c.json({ error: "internal error" }, 500);
  }
}

async function boundedReportBody(request: Request) {
  const maximumBytes = 64 * 1024;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maximumBytes) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

const positiveTypesSql = sql`('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained')`;
const LOOKUP_INTERVAL_MS = 15 * 60_000;
const terminalDeliveryFactSql = sql`EXISTS (SELECT 1 FROM confirmation_reports terminal
  WHERE terminal.submission_id = confirmation_submissions.id AND terminal.conflict = 0
  AND terminal.type IN ('delivered', 'failed', 'bounced', 'complained', 'suppressed'))`;

function recipientBlockingFactSql(type: SQL, details: SQL) {
  return sql`(${type} IN ('complained', 'suppressed') OR (${type} = 'bounced' AND json_extract(${details}, '$.permanent') = 1))`;
}

function associationStatements(db: Db, context: string, providerMessageId: string) {
  const scope = sql`context = ${context} AND provider_message_id = ${providerMessageId}`;
  const savedFrom = sql`json_extract(s.request_json, '$.from')`;
  const savedMailbox = sql`lower(trim(CASE WHEN instr(${savedFrom}, '<') > 0 THEN substr(${savedFrom}, instr(${savedFrom}, '<') + 1, instr(${savedFrom}, '>') - instr(${savedFrom}, '<') - 1) ELSE ${savedFrom} END))`;
  const positiveEvidence = sql`EXISTS (SELECT 1 FROM confirmation_reports r WHERE r.context = ${context} AND r.provider_message_id = ${providerMessageId} AND r.submission_id = confirmation_submissions.id AND r.conflict = 0 AND r.type IN ${positiveTypesSql})`;
  return [
    db
      .update(confirmationReports)
      .set({
        submissionId: sql`coalesce(
      (SELECT s.id FROM confirmation_submissions s WHERE s.endpoint = confirmation_reports.context AND s.provider_message_id = confirmation_reports.provider_message_id LIMIT 1),
      (SELECT response.submission_id FROM confirmation_reports response WHERE response.context = confirmation_reports.context AND response.provider_message_id = confirmation_reports.provider_message_id AND response.source = 'response' LIMIT 1),
      (SELECT s.id FROM confirmation_submissions s WHERE s.id = confirmation_reports.submission_tag)
    )`,
      })
      .where(sql`${scope} AND submission_id IS NULL`),
    db.update(confirmationReports).set({ conflict: true })
      .where(sql`${scope} AND submission_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM confirmation_submissions s WHERE s.id = confirmation_reports.submission_id
      AND s.endpoint = confirmation_reports.context AND s.first_possible_at IS NOT NULL
      AND (s.provider_message_id IS NULL OR s.provider_message_id = confirmation_reports.provider_message_id)
      AND (source = 'response' OR (
        lower(s.recipient_email) = confirmation_reports.recipient_email
        AND ${savedMailbox} = confirmation_reports.sender
        AND (confirmation_reports.category IS NULL OR confirmation_reports.category = 'confirmation')
        AND (confirmation_reports.submission_tag IS NULL OR EXISTS (
          SELECT 1 FROM json_each(s.request_json, '$.tags') t WHERE json_extract(t.value, '$.name') = 'submission_id' AND json_extract(t.value, '$.value') = confirmation_reports.submission_tag
        ))
        AND (s.provider_message_id = confirmation_reports.provider_message_id OR EXISTS (
          SELECT 1 FROM confirmation_reports response WHERE response.source = 'response' AND response.submission_id = s.id AND response.context = s.endpoint AND response.provider_message_id = confirmation_reports.provider_message_id
        ) OR EXISTS (
          SELECT 1 FROM json_each(s.request_json, '$.tags') t WHERE json_extract(t.value, '$.name') = 'submission_id' AND json_extract(t.value, '$.value') = confirmation_reports.submission_tag
        ))
      ))
      AND NOT EXISTS (SELECT 1 FROM confirmation_submissions other WHERE other.id != s.id AND other.endpoint = s.endpoint AND other.provider_message_id = confirmation_reports.provider_message_id)
    )`),
    db.update(confirmationSubmissions).set(conflictAttention).where(sql`id IN (
      SELECT submission_id FROM confirmation_reports WHERE ${scope} AND (conflict = 1 OR json_extract(details, '$.eventIdConflict') = 1)
    )`),
    db
      .update(confirmationSubmissions)
      .set({
        providerMessageId: sql`coalesce(provider_message_id, ${providerMessageId})`,
        status: sql`CASE WHEN status = 'accepted' OR ${positiveEvidence} THEN 'accepted' ELSE 'attention' END`,
        possiblyAcceptedPosts: sql`CASE WHEN ${positiveEvidence} THEN 0 ELSE acceptance_possible END`,
        nextAttemptAt: null,
        failureCode: sql`CASE WHEN ${positiveEvidence} THEN NULL ELSE failure_code END`,
        nextLookupAt: sql`CASE WHEN ${terminalDeliveryFactSql} THEN NULL ELSE coalesce(next_lookup_at, ${new Date(Date.now() + LOOKUP_INTERVAL_MS).toISOString()}) END`,
      })
      .where(
        sql`id IN (SELECT submission_id FROM confirmation_reports WHERE ${scope} AND conflict = 0)`,
      ),
    db
      .update(confirmationSubmissions)
      .set({ status: "attention", failureCode: "recipient_blocked", nextAttemptAt: null })
      .where(
        sql`status IN ('unsent', 'uncertain') AND next_attempt_at IS NOT NULL AND ${recipientBlockedSql()}`,
      ),
  ];
}

export function recipientBlockedSql() {
  return sql`EXISTS (SELECT 1 FROM confirmation_reports blocked
    WHERE blocked.context = confirmation_submissions.endpoint AND blocked.recipient_email = lower(confirmation_submissions.recipient_email)
    AND ${recipientBlockingFactSql(sql`blocked.type`, sql`blocked.details`)})`;
}

export async function recipientIsBlocked(db: Db, endpoint: string, recipientEmail: string) {
  const [blocked] = await db
    .select({ id: confirmationReports.id })
    .from(confirmationReports)
    .where(
      and(
        eq(confirmationReports.context, endpoint),
        eq(confirmationReports.recipientEmail, foldRecipientAsciiCase(recipientEmail)),
        recipientBlockingFactSql(
          sql`${confirmationReports.type}`,
          sql`${confirmationReports.details}`,
        ),
      ),
    )
    .limit(1);
  return Boolean(blocked);
}

export async function recordSubmissionAcceptance(
  db: Db,
  submissionId: string,
  providerMessageId: string,
  now: Date,
) {
  const [row] = await db
    .select()
    .from(confirmationSubmissions)
    .where(eq(confirmationSubmissions.id, submissionId));
  if (!row?.endpoint)
    throw new Error("accepted confirmation requires a persisted submission endpoint");
  await runBatch(db, [
    db
      .insert(confirmationReports)
      .values({
        id: crypto.randomUUID(),
        context: row.endpoint,
        eventId: `response:${row.id}:${providerMessageId}`,
        source: "response",
        type: "sent",
        providerMessageId,
        submissionId: row.id,
        observedAt: now.toISOString(),
        recipientEmail: foldRecipientAsciiCase(row.recipientEmail),
      })
      .onConflictDoNothing(),
    ...associationStatements(db, row.endpoint, providerMessageId),
  ]);
}

export async function reconcileConfirmationReports(
  db: Db,
  env: Pick<Env["Bindings"], "RESEND_API_KEY" | "RESEND_API_URL">,
) {
  const resend = resendForEnv(env);
  if (!resend.configured) return;
  try {
    const now = new Date();
    const due = sql`(next_lookup_at IS NULL OR next_lookup_at <= ${now.toISOString()})`;
    const fingerprint = await resend.credentialFingerprint();
    if (!fingerprint) return;
    const rows = await db
      .select()
      .from(confirmationSubmissions)
      .where(
        and(
          isNotNull(confirmationSubmissions.providerMessageId),
          isNotNull(confirmationSubmissions.endpoint),
          eq(confirmationSubmissions.credentialFingerprint, fingerprint),
          sql`first_possible_at >= ${new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString()}`,
          due,
          sql`NOT ${terminalDeliveryFactSql}`,
        ),
      )
      .orderBy(asc(confirmationSubmissions.nextLookupAt))
      .limit(2);
    for (const row of rows) {
      try {
        if (
          !row.endpoint ||
          !row.credentialFingerprint ||
          row.credentialFingerprint !== fingerprint
        )
          continue;
        const claimed = await db
          .update(confirmationSubmissions)
          .set({ nextLookupAt: new Date(now.getTime() + LOOKUP_INTERVAL_MS).toISOString() })
          .where(
            and(eq(confirmationSubmissions.id, row.id), due, sql`NOT ${terminalDeliveryFactSql}`),
          )
          .returning({ id: confirmationSubmissions.id });
        if (claimed.length === 0) continue;
        const evidence = await resend.getEmail(row.endpoint, row.providerMessageId!);
        if (!evidence) continue;
        const { id, ...facts } = evidence;
        await runBatch(db, [
          db
            .insert(confirmationReports)
            .values({
              id: crypto.randomUUID(),
              context: row.endpoint,
              eventId: `lookup:${row.id}:${facts.type}`,
              source: "lookup",
              providerMessageId: id,
              observedAt: new Date().toISOString(),
              ...facts,
            })
            .onConflictDoNothing(),
          ...associationStatements(db, row.endpoint, id),
        ]);
      } catch {
        console.error("confirmation lookup failed");
      }
    }
  } catch {
    console.error("confirmation lookup scan failed");
  }
}

export async function confirmationDeliveryView(db: Db, row: Submission) {
  const reports = await db
    .select()
    .from(confirmationReports)
    .where(eq(confirmationReports.submissionId, row.id))
    .orderBy(asc(confirmationReports.observedAt), asc(confirmationReports.id));
  const valid = reports.filter((report) => !report.conflict);
  const has = (type: string) => valid.some((report) => report.type === type);
  return {
    accepted: row.status === "accepted",
    delivered: has("delivered"),
    delayed: has("delivery_delayed"),
    failed: has("failed"),
    bounced: has("bounced"),
    permanentlyBounced: valid.some(
      (report) => report.type === "bounced" && report.details?.permanent === true,
    ),
    complained: has("complained"),
    suppressed: has("suppressed"),
    uncertain: row.possiblyAcceptedPosts > 0 && row.status !== "accepted" && valid.length === 0,
    conflict: row.reportConflict,
    recipientBlocked:
      row.failureCode === "recipient_blocked" ||
      Boolean(row.endpoint && (await recipientIsBlocked(db, row.endpoint, row.recipientEmail))),
    history: reports.map((report) => ({
      eventId: report.eventId,
      source: report.source,
      type: report.type,
      providerMessageId: report.providerMessageId,
      messageId: report.messageId,
      occurredAt: report.occurredAt,
      observedAt: report.observedAt,
      details: report.details,
      conflict: report.conflict,
    })),
  };
}
