import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { complaintAttachmentMetadataSchema } from "@pms/shared";
import type { Env } from "../env";
import { getDb } from "../db";
import { complaintAttachments, complaintResponses } from "../db/schema";
import { complaintView } from "../complaints";
import { HttpError } from "../http";

export const complaintAttachmentRoutes = new Hono<Env>();
const route = "/:id/responses/:responseId/attachments/:attachmentId";

complaintAttachmentRoutes.use(route, async (c, next) => {
  if (!z.uuid().safeParse(c.req.param("attachmentId")).success)
    throw new HttpError(400, "invalid complaint attachment");
  const [response] = await getDb(c.env.DB)
    .select({ id: complaintResponses.id })
    .from(complaintResponses)
    .where(
      and(
        eq(complaintResponses.id, c.req.param("responseId")!),
        eq(complaintResponses.complaintId, c.req.param("id")!),
      ),
    );
  if (!response) throw new HttpError(404, "complaint response not found");
  if (!c.env.COMPLAINT_ATTACHMENTS)
    throw new HttpError(503, "complaint attachment storage is unavailable");
  await next();
});

complaintAttachmentRoutes.put(
  route,
  bodyLimit({
    maxSize: 5 * 1024 * 1024,
    onError: () => {
      throw new HttpError(400, "complaint attachment exceeds 5 MB");
    },
  }),
  async (c) => {
    let name: string;
    try {
      name = decodeURIComponent(c.req.header("X-Attachment-Name") ?? "");
    } catch {
      throw new HttpError(400, "invalid complaint attachment name");
    }
    const parsed = complaintAttachmentMetadataSchema.safeParse({
      name,
      contentType: c.req.header("content-type") ?? "",
    });
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]!.message);
    const bytes = await c.req.arrayBuffer();
    if (!bytes.byteLength) throw new HttpError(400, "complaint attachment is empty");
    const { contentType } = parsed.data;
    const signatures = {
      "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
      "image/jpeg": [0xff, 0xd8, 0xff],
      "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    };
    const header = new Uint8Array(bytes);
    if (signatures[contentType].some((byte, index) => header[index] !== byte))
      throw new HttpError(400, "unsupported complaint attachment type");
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const attachmentId = c.req.param("attachmentId");
    const responseId = c.req.param("responseId");
    const db = getDb(c.env.DB);
    const metadata = { complaintId: c.req.param("id"), responseId, name, contentType, sha256 };
    const key = `complaint-evidence/${attachmentId}`;
    const bucket = c.env.COMPLAINT_ATTACHMENTS!;
    const object =
      (await bucket.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        customMetadata: { ...metadata, uploadedBy: c.var.account.id },
      })) ?? (await bucket.head(key));
    if (!object) throw new HttpError(503, "complaint attachment storage is unavailable");
    if (Object.entries(metadata).some(([field, value]) => object.customMetadata?.[field] !== value))
      throw new HttpError(409, "complaint attachment retry differs");
    const [prior] = await db
      .select()
      .from(complaintAttachments)
      .where(eq(complaintAttachments.id, attachmentId));
    await db
      .insert(complaintAttachments)
      .values({
        id: attachmentId,
        responseId,
        name,
        contentType,
        size: bytes.byteLength,
        sha256,
        uploadedAt: object.uploaded.toISOString(),
        uploadedBy: object.customMetadata!.uploadedBy!,
      })
      .onConflictDoNothing();
    return c.json(await complaintView(db, c.req.param("id")), prior ? 200 : 201);
  },
);

complaintAttachmentRoutes.get(route, async (c) => {
  const [attachment] = await getDb(c.env.DB)
    .select()
    .from(complaintAttachments)
    .where(
      and(
        eq(complaintAttachments.id, c.req.param("attachmentId")),
        eq(complaintAttachments.responseId, c.req.param("responseId")),
      ),
    );
  if (!attachment) throw new HttpError(404, "complaint attachment not found");
  const object = await c.env.COMPLAINT_ATTACHMENTS!.get(`complaint-evidence/${attachment.id}`);
  if (!object) throw new HttpError(503, "complaint attachment storage is unavailable");
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Length", String(attachment.size));
  c.header(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Security-Policy", "sandbox");
  return c.body(object.body);
});
