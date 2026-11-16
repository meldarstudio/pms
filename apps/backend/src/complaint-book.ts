import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  ComplaintBackupRequest,
  ComplaintInput,
  ComplaintReceiptCopyRequest,
  ComplaintResponseRequest,
  ComplaintResponseVoidRequest,
} from "@pms/shared";
import { runBatch, type Db } from "./db";
import {
  complaintAttachments,
  complaintEmails,
  complaintResponseVoids,
  complaintResponses,
  complaintSheets,
} from "./db/schema";
import {
  complaintBook,
  complaintCalendarSource,
  complaintSheetReference,
  complaintResponseDueDate,
} from "./complaint-config";
import { HttpError, rethrowConflict } from "./http";
import { propertyCalendar } from "./property-calendar";

export type ComplaintSheet = Awaited<ReturnType<typeof readSheet>>;
export type OwnerSheet = Awaited<ReturnType<typeof readOwnerSheet>>;
type RegistrationContext = { currency: string; timeZone: string };
type OwnerWrite = { accountId: string; today: string };

export async function complaintTokenHash(authorization: string | undefined) {
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{64,200})$/)?.[1];
  if (!token) throw new HttpError(401, "invalid complaint receipt credential");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const receiptEmailColumns = {
  id: complaintEmails.id,
  kind: complaintEmails.kind,
  status: complaintEmails.status,
  attempts: complaintEmails.attempts,
  sentAt: complaintEmails.sentAt,
  lastError: complaintEmails.lastError,
  createdAt: complaintEmails.createdAt,
  requestedBy: complaintEmails.requestedBy,
};
const latestReceiptEmailFirst = [
  desc(complaintEmails.createdAt),
  desc(sql`${complaintEmails}.rowid`),
];

const pendingReceiptEmail = (now: string) => ({
  status: "pending" as const,
  nextAttemptAt: now,
  createdAt: now,
});

function sheetStatus(dueDate: string, answered: boolean, today: string) {
  return {
    responseStatus: answered ? ("recorded" as const) : ("pending" as const),
    overdue: !answered && dueDate < today,
  };
}

export async function readSheet(db: Db, id: string) {
  const [sheet] = await db.select().from(complaintSheets).where(eq(complaintSheets.id, id));
  if (!sheet) throw new HttpError(404, "complaint not found");
  const emails = await db
    .select(receiptEmailColumns)
    .from(complaintEmails)
    .where(eq(complaintEmails.complaintId, id))
    .orderBy(...latestReceiptEmailFirst);
  const responses = await db
    .select({
      id: complaintResponses.id,
      text: complaintResponses.text,
      channel: complaintResponses.channel,
      recipient: complaintResponses.recipient,
      sentOn: complaintResponses.sentOn,
      evidence: complaintResponses.evidence,
      correctsId: complaintResponses.correctsId,
      recordedAt: complaintResponses.recordedAt,
      recordedBy: complaintResponses.recordedBy,
      voidReason: complaintResponseVoids.reason,
      voidedAt: complaintResponseVoids.voidedAt,
      voidedBy: complaintResponseVoids.voidedBy,
    })
    .from(complaintResponses)
    .leftJoin(complaintResponseVoids, eq(complaintResponseVoids.responseId, complaintResponses.id))
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
    email: emails[0]!,
    emails,
    responses: responses.map(({ voidReason, voidedAt, voidedBy, ...response }) => ({
      ...response,
      voided:
        voidReason === null
          ? null
          : { reason: voidReason, voidedAt: voidedAt!, voidedBy: voidedBy! },
      attachments: attachments
        .filter((attachment) => attachment.responseId === response.id)
        .map(({ responseId: _responseId, ...attachment }) => attachment),
    })),
  };
}

export async function readOwnerSheet(db: Db, id: string, today: string) {
  const sheet = await readSheet(db, id);
  return {
    ...sheet,
    ...sheetStatus(
      sheet.dueDate,
      sheet.responses.some((response) => !response.voided),
      today,
    ),
  };
}

export async function listSheets(db: Db, today: string) {
  const [sheets, answers, emails] = await Promise.all([
    db
      .select({
        id: complaintSheets.id,
        reference: complaintSheets.reference,
        input: complaintSheets.input,
        filedAt: complaintSheets.filedAt,
        dueDate: complaintSheets.dueDate,
      })
      .from(complaintSheets)
      .orderBy(asc(complaintSheets.dueDate)),
    db
      .selectDistinct({ sheetId: complaintResponses.complaintId })
      .from(complaintResponses)
      .leftJoin(
        complaintResponseVoids,
        eq(complaintResponseVoids.responseId, complaintResponses.id),
      )
      .where(isNull(complaintResponseVoids.responseId)),
    db
      .select({ sheetId: complaintEmails.complaintId, ...receiptEmailColumns })
      .from(complaintEmails)
      .orderBy(...latestReceiptEmailFirst),
  ]);
  const answered = new Set(answers.map(({ sheetId }) => sheetId));
  const latestEmail = new Map<string, Omit<(typeof emails)[number], "sheetId">>();
  for (const { sheetId, ...email } of emails)
    if (!latestEmail.has(sheetId)) latestEmail.set(sheetId, email);
  return sheets
    .map(({ input, ...sheet }) => ({
      id: sheet.id,
      reference: sheet.reference,
      fullName: input.fullName,
      category: input.category,
      filedAt: sheet.filedAt,
      dueDate: sheet.dueDate,
      ...sheetStatus(sheet.dueDate, answered.has(sheet.id), today),
      email: latestEmail.get(sheet.id)!,
    }))
    .sort(
      (a, b) =>
        Number(a.responseStatus === "recorded") - Number(b.responseStatus === "recorded") ||
        a.dueDate.localeCompare(b.dueDate),
    );
}

type SheetEntry = {
  id: string;
  tokenHash: string | null;
  requestPayload: string;
  input: ComplaintInput;
  filedAt: string;
  emailsReceipt: boolean;
} & ({ source: "virtual" } | { source: "physical"; originalReference: string; restoredAt: string });

async function registerSheet(
  db: Db,
  entry: SheetEntry,
  { currency, timeZone }: RegistrationContext,
  now: string,
) {
  const registered = async () => {
    const [saved] = await db.select().from(complaintSheets).where(eq(complaintSheets.id, entry.id));
    if (!saved) return false;
    if (saved.requestPayload !== entry.requestPayload || saved.source !== entry.source)
      throw new HttpError(409, "complaint retry differs from saved sheet");
    return true;
  };
  const refuseTranscribedReference = async () => {
    if (entry.source !== "physical") return;
    const [transcribed] = await db
      .select({ id: complaintSheets.id })
      .from(complaintSheets)
      .where(eq(complaintSheets.originalReference, entry.originalReference));
    if (transcribed) throw new HttpError(409, "physical complaint reference already imported");
  };
  if (await registered()) return { created: false };
  if (
    entry.source === "physical" &&
    (Date.parse(entry.filedAt) > Date.parse(entry.restoredAt) ||
      Date.parse(entry.restoredAt) > Date.parse(now))
  )
    throw new HttpError(400, "invalid complaint backup time");
  if (entry.input.policyVersion !== complaintBook.policyVersion)
    throw new HttpError(409, "complaint privacy information changed");
  await refuseTranscribedReference();
  const number = sql<number>`(SELECT coalesce(max(number), ${complaintBook.firstNumber - 1}) + 1 FROM complaint_sheets WHERE book_id = ${complaintBook.bookId})`;
  try {
    await runBatch(db, [
      db.insert(complaintSheets).values({
        id: entry.id,
        tokenHash: entry.tokenHash,
        requestPayload: entry.requestPayload,
        bookId: complaintBook.bookId,
        number,
        reference: complaintSheetReference(number, entry.filedAt, timeZone),
        establishmentId: complaintBook.establishmentId,
        provider: complaintBook.provider,
        input: entry.input,
        currency,
        timeZone,
        filedAt: entry.filedAt,
        registeredAt: now,
        dueDate: complaintResponseDueDate(entry.filedAt, timeZone),
        calendarSource: complaintCalendarSource,
        policy: JSON.stringify({
          version: complaintBook.policyVersion,
          collectionNotice: complaintBook.collectionNotice,
          privacyInformation: complaintBook.privacyInformation,
          retentionAndDisposal: complaintBook.retentionAndDisposal,
        }),
        source: entry.source,
        ...(entry.source === "physical"
          ? { originalReference: entry.originalReference, restoredAt: entry.restoredAt }
          : {}),
      }),
      db.insert(complaintEmails).values({
        id: crypto.randomUUID(),
        complaintId: entry.id,
        ...(entry.emailsReceipt
          ? pendingReceiptEmail(now)
          : { status: "not_requested" as const, createdAt: now }),
      }),
    ]);
  } catch (error) {
    if (!(await registered())) {
      await refuseTranscribedReference();
      throw error;
    }
  }
  return { created: true };
}

function guestReceipt({ email, emails: _emails, ...sheet }: ComplaintSheet) {
  return { ...sheet, email: { status: email.status }, responses: [] };
}

export async function fileSheet(
  db: Db,
  input: ComplaintInput,
  tokenHash: string,
  context: RegistrationContext,
) {
  const now = new Date().toISOString();
  const { created } = await registerSheet(
    db,
    {
      id: tokenHash,
      tokenHash,
      requestPayload: JSON.stringify(input),
      input,
      filedAt: now,
      emailsReceipt: Boolean(input.email),
      source: "virtual",
    },
    context,
    now,
  );
  return { created, sheet: guestReceipt(await readSheet(db, tokenHash)) };
}

export async function transcribeBackupSheet(
  db: Db,
  backup: ComplaintBackupRequest,
  context: RegistrationContext,
  today: string,
) {
  const { created } = await registerSheet(
    db,
    {
      id: backup.requestId,
      tokenHash: null,
      requestPayload: JSON.stringify(backup),
      input: backup.input,
      filedAt: backup.filedAt,
      emailsReceipt: false,
      source: "physical",
      originalReference: backup.originalReference,
      restoredAt: backup.restoredAt,
    },
    context,
    new Date().toISOString(),
  );
  return { created, sheet: await readOwnerSheet(db, backup.requestId, today) };
}

export async function receiptForToken(db: Db, tokenHash: string) {
  const [sheet] = await db
    .select({ id: complaintSheets.id })
    .from(complaintSheets)
    .where(and(eq(complaintSheets.tokenHash, tokenHash), eq(complaintSheets.source, "virtual")));
  if (!sheet) throw new HttpError(401, "invalid complaint receipt credential");
  return guestReceipt(await readSheet(db, sheet.id));
}

export async function recordSheetResponse(
  db: Db,
  sheetId: string,
  input: ComplaintResponseRequest,
  { accountId, today }: OwnerWrite,
) {
  const sheet = await readSheet(db, sheetId);
  const payload = JSON.stringify(input);
  const recorded = async () => {
    const [saved] = await db
      .select()
      .from(complaintResponses)
      .where(eq(complaintResponses.id, input.requestId));
    if (!saved) return false;
    if (saved.complaintId !== sheet.id || saved.payload !== payload)
      throw new HttpError(409, "complaint response retry differs");
    return true;
  };
  if (await recorded()) return { created: false, sheet: await readOwnerSheet(db, sheet.id, today) };
  if (
    input.sentOn > today ||
    input.sentOn < propertyCalendar(sheet.timeZone, new Date(sheet.filedAt)).today
  )
    throw new HttpError(400, "invalid complaint response sending date");
  await db
    .insert(complaintResponses)
    .values({
      id: input.requestId,
      complaintId: sheet.id,
      payload,
      text: input.text,
      channel: input.channel,
      recipient: input.recipient,
      sentOn: input.sentOn,
      evidence: input.evidence,
      recordedAt: new Date().toISOString(),
      recordedBy: accountId,
    })
    .onConflictDoNothing();
  await recorded();
  return { created: true, sheet: await readOwnerSheet(db, sheet.id, today) };
}

export async function voidSheetResponse(
  db: Db,
  sheetId: string,
  responseId: string,
  { reason }: ComplaintResponseVoidRequest,
  { accountId, today }: OwnerWrite,
) {
  const voidedWithThisReason = (sheet: OwnerSheet) => {
    const response = sheet.responses.find(({ id }) => id === responseId);
    if (!response) throw new HttpError(404, "complaint response not found");
    if (response.voided && response.voided.reason !== reason)
      throw new HttpError(409, "complaint response already voided");
    return Boolean(response.voided);
  };
  const sheet = await readOwnerSheet(db, sheetId, today);
  if (voidedWithThisReason(sheet)) return { created: false, sheet };
  await db
    .insert(complaintResponseVoids)
    .values({ responseId, reason, voidedAt: new Date().toISOString(), voidedBy: accountId })
    .onConflictDoNothing();
  const saved = await readOwnerSheet(db, sheetId, today);
  voidedWithThisReason(saved);
  return { created: true, sheet: saved };
}

export async function queueReceiptCopy(
  db: Db,
  sheetId: string,
  { requestId }: ComplaintReceiptCopyRequest,
  { accountId, today }: OwnerWrite,
) {
  const sheet = await readOwnerSheet(db, sheetId, today);
  const queued = async () => {
    const [copy] = await db
      .select({ complaintId: complaintEmails.complaintId, kind: complaintEmails.kind })
      .from(complaintEmails)
      .where(eq(complaintEmails.id, requestId));
    if (copy && (copy.complaintId !== sheet.id || copy.kind !== "copy"))
      throw new HttpError(409, "complaint receipt copy request differs");
    return Boolean(copy);
  };
  if (await queued()) return { created: false, sheet };
  if (sheet.email.status !== "failed")
    throw new HttpError(409, "complaint receipt does not need attention");
  try {
    await db.insert(complaintEmails).values({
      id: requestId,
      complaintId: sheet.id,
      kind: "copy",
      requestedBy: accountId,
      ...pendingReceiptEmail(new Date().toISOString()),
    });
  } catch (error) {
    if (await queued()) return { created: false, sheet: await readOwnerSheet(db, sheet.id, today) };
    rethrowConflict(error);
  }
  return { created: true, sheet: await readOwnerSheet(db, sheet.id, today) };
}
