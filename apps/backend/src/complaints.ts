import { and, asc, eq, sql } from "drizzle-orm";
import type { ComplaintInput } from "@pms/shared";
import { runBatch, type Db } from "./db";
import {
  complaintAttachments,
  complaintEmails,
  complaintResponses,
  complaintSheets,
} from "./db/schema";
import {
  complaintCalendarSource,
  complaintSheetReference,
  complaintResponseDueDate,
  type ComplaintBookConfig,
} from "./complaint-config";
import { HttpError } from "./http";

export async function complaintTokenHash(authorization: string | undefined) {
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{64,200})$/)?.[1];
  if (!token) throw new HttpError(401, "invalid complaint receipt credential");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function complaintView(db: Db, id: string) {
  const [sheet] = await db.select().from(complaintSheets).where(eq(complaintSheets.id, id));
  if (!sheet) throw new HttpError(404, "complaint not found");
  const [email] = await db
    .select({
      status: complaintEmails.status,
      attempts: complaintEmails.attempts,
      sentAt: complaintEmails.sentAt,
      lastError: complaintEmails.lastError,
    })
    .from(complaintEmails)
    .where(eq(complaintEmails.complaintId, id));
  const responses = await db
    .select({
      id: complaintResponses.id,
      text: complaintResponses.text,
      channel: complaintResponses.channel,
      recipient: complaintResponses.recipient,
      sentAt: complaintResponses.sentAt,
      evidence: complaintResponses.evidence,
      correctsId: complaintResponses.correctsId,
      recordedAt: complaintResponses.recordedAt,
      recordedBy: complaintResponses.recordedBy,
    })
    .from(complaintResponses)
    .where(eq(complaintResponses.complaintId, id))
    .orderBy(asc(complaintResponses.recordedAt), asc(sql`${complaintResponses}.rowid`));
  const { tokenHash: _tokenHash, requestPayload: _requestPayload, ...saved } = sheet;
  const attachments = await db
    .select({
      id: complaintAttachments.id,
      responseId: complaintAttachments.responseId,
      name: complaintAttachments.name,
      contentType: complaintAttachments.contentType,
      size: complaintAttachments.size,
      uploadedAt: complaintAttachments.uploadedAt,
      uploadedBy: complaintAttachments.uploadedBy,
    })
    .from(complaintAttachments)
    .innerJoin(complaintResponses, eq(complaintResponses.id, complaintAttachments.responseId))
    .where(eq(complaintResponses.complaintId, id))
    .orderBy(asc(complaintAttachments.uploadedAt), asc(complaintAttachments.id));
  return {
    ...saved,
    email: email!,
    responses: responses.map((response) => ({
      ...response,
      attachments: attachments
        .filter((attachment) => attachment.responseId === response.id)
        .map(({ responseId: _responseId, ...attachment }) => attachment),
    })),
  };
}

export async function fileComplaint(
  db: Db,
  input: ComplaintInput,
  tokenHash: string,
  config: ComplaintBookConfig,
  currency: string,
  timeZone: string,
) {
  const payload = JSON.stringify(input);
  const existing = await db
    .select()
    .from(complaintSheets)
    .where(eq(complaintSheets.tokenHash, tokenHash));
  if (existing[0]) {
    if (existing[0].requestPayload !== payload)
      throw new HttpError(409, "complaint retry differs from saved sheet");
    return { created: false, sheet: await complaintView(db, existing[0].id) };
  }
  if (input.policyVersion !== config.policyVersion)
    throw new HttpError(409, "complaint privacy information changed");
  const now = new Date().toISOString();
  const number = sql<number>`(SELECT coalesce(max(number), ${config.firstNumber - 1}) + 1 FROM complaint_sheets WHERE book_id = ${config.bookId})`;
  await runBatch(db, [
    db
      .insert(complaintSheets)
      .values({
        id: tokenHash,
        tokenHash,
        requestPayload: payload,
        bookId: config.bookId,
        number,
        reference: complaintSheetReference(number, now, timeZone),
        establishmentId: config.establishmentId,
        provider: config.provider,
        input,
        currency,
        timeZone,
        filedAt: now,
        registeredAt: now,
        dueDate: complaintResponseDueDate(now, timeZone),
        calendarSource: complaintCalendarSource,
        policy: JSON.stringify({
          version: config.policyVersion,
          collectionNotice: config.collectionNotice,
          privacyInformation: config.privacyInformation,
          retentionAndDisposal: config.retentionAndDisposal,
        }),
        source: "virtual",
      })
      .onConflictDoNothing({ target: complaintSheets.tokenHash }),
    db
      .insert(complaintEmails)
      .values({
        id: crypto.randomUUID(),
        complaintId: tokenHash,
        status: input.email ? "pending" : "not_requested",
        nextAttemptAt: input.email ? now : null,
        createdAt: now,
      })
      .onConflictDoNothing({ target: complaintEmails.complaintId }),
  ]);
  const sheet = await complaintView(db, tokenHash);
  if (JSON.stringify(sheet.input) !== payload)
    throw new HttpError(409, "complaint retry differs from saved sheet");
  return { created: true, sheet };
}

export async function receiptForToken(db: Db, tokenHash: string) {
  const [sheet] = await db
    .select({ id: complaintSheets.id })
    .from(complaintSheets)
    .where(and(eq(complaintSheets.tokenHash, tokenHash), eq(complaintSheets.source, "virtual")));
  if (!sheet) throw new HttpError(401, "invalid complaint receipt credential");
  const saved = await complaintView(db, sheet.id);
  return { ...saved, responses: [] };
}
