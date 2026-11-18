import { requireOwner } from "../session";
import {
  complaintResponseSchema,
  complaintBackupSchema,
  complaintResponseVoidSchema,
  complaintReceiptCopySchema,
} from "@pms/shared";
import { getDb } from "../db";
import {
  listSheets,
  queueReceiptCopy,
  readOwnerSheet,
  recordSheetResponse,
  transcribeBackupSheet,
  voidSheetResponse,
} from "../complaint-book";
import { currency, validate } from "../http";
import { Hono } from "hono";
import type { Env } from "../env";
import { complaintBook } from "../complaint-config";
import { complaintAttachmentRoutes } from "./complaint-attachments";

export const ownerComplaintRoutes = new Hono<Env>();
ownerComplaintRoutes.use("*", requireOwner);
ownerComplaintRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
ownerComplaintRoutes.route("/", complaintAttachmentRoutes);
ownerComplaintRoutes.get("/", async (c) =>
  c.json(await listSheets(getDb(c.env.DB), c.var.propertyCalendar.today)),
);
ownerComplaintRoutes.get("/configuration", (c) => c.json(complaintBook));
ownerComplaintRoutes.get("/:id", async (c) =>
  c.json(await readOwnerSheet(getDb(c.env.DB), c.req.param("id"), c.var.propertyCalendar.today)),
);
ownerComplaintRoutes.post(
  "/:id/responses",
  validate("json", complaintResponseSchema),
  async (c) => {
    const { created, sheet } = await recordSheetResponse(
      getDb(c.env.DB),
      c.req.param("id"),
      c.req.valid("json"),
      { accountId: c.var.account.id, today: c.var.propertyCalendar.today },
    );
    return c.json(sheet, created ? 201 : 200);
  },
);

ownerComplaintRoutes.post(
  "/:id/responses/:responseId/void",
  validate("json", complaintResponseVoidSchema),
  async (c) => {
    const { created, sheet } = await voidSheetResponse(
      getDb(c.env.DB),
      c.req.param("id"),
      c.req.param("responseId"),
      c.req.valid("json"),
      { accountId: c.var.account.id, today: c.var.propertyCalendar.today },
    );
    return c.json(sheet, created ? 201 : 200);
  },
);

ownerComplaintRoutes.post("/backups", validate("json", complaintBackupSchema), async (c) => {
  const { created, sheet } = await transcribeBackupSheet(
    getDb(c.env.DB),
    c.req.valid("json"),
    { currency: currency(c), timeZone: c.env.PROPERTY_TIME_ZONE },
    c.var.propertyCalendar.today,
  );
  return c.json(sheet, created ? 201 : 200);
});

ownerComplaintRoutes.post(
  "/:id/email-copies",
  validate("json", complaintReceiptCopySchema),
  async (c) => {
    const { created, sheet } = await queueReceiptCopy(
      getDb(c.env.DB),
      c.req.param("id"),
      c.req.valid("json"),
      { accountId: c.var.account.id, today: c.var.propertyCalendar.today },
    );
    return c.json(sheet, created ? 201 : 200);
  },
);
