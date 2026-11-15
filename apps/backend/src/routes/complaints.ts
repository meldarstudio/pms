import { complaintSheets, complaintResponses, complaintEmails } from "../db/schema";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { requireOwner } from "../session";
import { complaintResponseSchema, complaintBackupSchema } from "@pms/shared";
import { runBatch } from "../db";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { complaintView } from "../complaints";
import { HttpError, currency, validate } from "../http";
import { Hono } from "hono";
import type { Env } from "../env";
import {
  complaintCalendarSource,
  complaintSheetReference,
  complaintResponseDueDate,
  complaintBook,
} from "../complaint-config";
import { complaintAttachmentRoutes } from "./complaint-attachments";

export const ownerComplaintRoutes = new Hono<Env>();
ownerComplaintRoutes.use("*", requireOwner);
ownerComplaintRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
ownerComplaintRoutes.route("/", complaintAttachmentRoutes);
ownerComplaintRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(complaintSheets).orderBy(asc(complaintSheets.dueDate));
  const views = await Promise.all(rows.map((row) => complaintView(db, row.id)));
  const today = c.var.propertyCalendar.today;
  return c.json(
    views
      .map((sheet) => ({
        id: sheet.id,
        reference: sheet.reference,
        fullName: sheet.input.fullName,
        category: sheet.input.category,
        filedAt: sheet.filedAt,
        dueDate: sheet.dueDate,
        responseStatus: sheet.responses.length ? "recorded" : "pending",
        overdue: !sheet.responses.length && sheet.dueDate < today,
        email: sheet.email,
      }))
      .sort(
        (a, b) =>
          Number(a.responseStatus === "recorded") - Number(b.responseStatus === "recorded") ||
          a.dueDate.localeCompare(b.dueDate),
      ),
  );
});
ownerComplaintRoutes.get("/configuration", (c) => c.json(complaintBook));
ownerComplaintRoutes.get("/:id", async (c) =>
  c.json(await complaintView(getDb(c.env.DB), c.req.param("id"))),
);
ownerComplaintRoutes.post(
  "/:id/responses",
  validate("json", complaintResponseSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const input = c.req.valid("json");
    const sheet = await complaintView(db, c.req.param("id"));
    const payload = JSON.stringify(input);
    const [prior] = await db
      .select()
      .from(complaintResponses)
      .where(eq(complaintResponses.id, input.requestId));
    if (prior) {
      if (prior.complaintId !== sheet.id || prior.payload !== payload)
        throw new HttpError(409, "complaint response retry differs");
      return c.json(await complaintView(db, sheet.id));
    }
    if (
      Date.parse(input.sentAt) > Date.now() ||
      Date.parse(input.sentAt) < Date.parse(sheet.filedAt)
    )
      throw new HttpError(400, "invalid complaint response sending time");
    if (input.correctsId && !sheet.responses.some((response) => response.id === input.correctsId))
      throw new HttpError(400, "invalid complaint response correction");
    await db
      .insert(complaintResponses)
      .values({
        id: input.requestId,
        complaintId: sheet.id,
        payload,
        text: input.text,
        channel: input.channel,
        recipient: input.recipient,
        sentAt: new Date(input.sentAt).toISOString(),
        evidence: input.evidence,
        correctsId: input.correctsId,
        recordedAt: new Date().toISOString(),
        recordedBy: c.var.account.id,
      })
      .onConflictDoNothing();
    const [saved] = await db
      .select()
      .from(complaintResponses)
      .where(eq(complaintResponses.id, input.requestId));
    if (saved!.complaintId !== sheet.id || saved!.payload !== payload)
      throw new HttpError(409, "complaint response retry differs");
    return c.json(await complaintView(db, sheet.id), 201);
  },
);

ownerComplaintRoutes.post("/backups", validate("json", complaintBackupSchema), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const payload = JSON.stringify(body);
  const [previous] = await db
    .select()
    .from(complaintSheets)
    .where(eq(complaintSheets.id, body.requestId));
  if (previous) {
    if (previous.requestPayload !== payload || previous.source !== "physical")
      throw new HttpError(409, "complaint retry differs from saved sheet");
    return c.json(await complaintView(db, previous.id));
  }
  const now = new Date().toISOString();
  if (
    Date.parse(body.filedAt) > Date.parse(body.restoredAt) ||
    Date.parse(body.restoredAt) > Date.now()
  )
    throw new HttpError(400, "invalid complaint backup time");
  if (body.input.policyVersion !== complaintBook.policyVersion)
    throw new HttpError(409, "complaint privacy information changed");
  const [duplicate] = await db
    .select()
    .from(complaintSheets)
    .where(eq(complaintSheets.originalReference, body.originalReference));
  if (duplicate) throw new HttpError(409, "physical complaint reference already imported");
  const number = sql<number>`(SELECT coalesce(max(number), ${complaintBook.firstNumber - 1}) + 1 FROM complaint_sheets WHERE book_id = ${complaintBook.bookId})`;
  await runBatch(db, [
    db.insert(complaintSheets).values({
      id: body.requestId,
      requestPayload: payload,
      bookId: complaintBook.bookId,
      number,
      reference: complaintSheetReference(number, body.filedAt, c.env.PROPERTY_TIME_ZONE),
      establishmentId: complaintBook.establishmentId,
      provider: complaintBook.provider,
      input: body.input,
      currency: currency(c),
      timeZone: c.env.PROPERTY_TIME_ZONE,
      filedAt: body.filedAt,
      registeredAt: now,
      dueDate: complaintResponseDueDate(body.filedAt, c.env.PROPERTY_TIME_ZONE),
      calendarSource: complaintCalendarSource,
      policy: JSON.stringify({
        version: complaintBook.policyVersion,
        collectionNotice: complaintBook.collectionNotice,
        privacyInformation: complaintBook.privacyInformation,
        retentionAndDisposal: complaintBook.retentionAndDisposal,
      }),
      source: "physical",
      originalReference: body.originalReference,
      restoredAt: body.restoredAt,
    }),
    db.insert(complaintEmails).values({
      id: crypto.randomUUID(),
      complaintId: body.requestId,
      status: "not_requested",
      createdAt: now,
    }),
  ]);
  return c.json(await complaintView(db, body.requestId), 201);
});

ownerComplaintRoutes.post(
  "/:id/email-retry",
  validate("json", z.object({ requestId: z.uuid() }).strict()),
  async (c) => {
    const db = getDb(c.env.DB);
    const sheet = await complaintView(db, c.req.param("id"));
    const requestId = c.req.valid("json").requestId;
    const [email] = await db
      .select()
      .from(complaintEmails)
      .where(eq(complaintEmails.complaintId, sheet.id));
    if (email!.retryRequestId === requestId) return c.json(sheet);
    if (email!.status !== "failed") throw new HttpError(409, "complaint receipt is not failed");
    if (
      email!.deliveryUncertain &&
      email!.firstAttemptAt &&
      Date.now() - Date.parse(email!.firstAttemptAt) >= 23 * 60 * 60 * 1000
    )
      throw new HttpError(409, "complaint receipt retry window expired; send a copy manually");
    await db
      .update(complaintEmails)
      .set({
        status: "pending",
        lastError: null,
        nextAttemptAt: new Date().toISOString(),
        retryRequestId: requestId,
      })
      .where(and(eq(complaintEmails.id, email!.id), eq(complaintEmails.status, "failed")));
    return c.json(await complaintView(db, sheet.id));
  },
);
