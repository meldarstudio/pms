import { complaintInputSchema } from "@pms/shared";
import { getDb } from "../db";
import { complaintTokenHash, fileComplaint, receiptForToken } from "../complaints";
import { zValidator } from "@hono/zod-validator";
import { currency } from "../http";
import { limitBySourceIp } from "../rate-limit";
import { Hono } from "hono";
import type { Env } from "../env";
import { developmentComplaintConfig } from "../complaint-config";

export const publicComplaintRoutes = new Hono<Env>();
publicComplaintRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  developmentComplaintConfig(c.env.COMPLAINT_BOOK_DEVELOPMENT, c.req.url);
  await next();
});
publicComplaintRoutes.get("/config", (c) => {
  const config = developmentComplaintConfig(c.env.COMPLAINT_BOOK_DEVELOPMENT, c.req.url);
  return c.json({
    development: true,
    provider: config.provider,
    establishmentId: config.establishmentId,
    collectionNotice: config.collectionNotice,
    privacyInformation: config.privacyInformation,
    policyVersion: config.policyVersion,
  });
});

publicComplaintRoutes.post(
  "/",
  limitBySourceIp("QUOTE_LIMITER", "too many complaints; retry in one minute"),
  zValidator("json", complaintInputSchema, (result, c) => {
    if (!result.success) {
      const field = result.error.issues[0]?.path[0];
      if (typeof field === "string") c.header("X-Error-Field", field);
      return c.json({ error: "invalid complaint fields" }, 400);
    }
  }),
  async (c) => {
    const tokenHash = await complaintTokenHash(c.req.header("authorization"));
    const config = developmentComplaintConfig(c.env.COMPLAINT_BOOK_DEVELOPMENT, c.req.url);
    const result = await fileComplaint(
      getDb(c.env.DB),
      c.req.valid("json"),
      tokenHash,
      config,
      currency(c),
      c.env.PROPERTY_TIME_ZONE,
    );
    return c.json({ ...result.sheet, responses: [] }, result.created ? 201 : 200);
  },
);
publicComplaintRoutes.get("/receipt", async (c) =>
  c.json(
    await receiptForToken(getDb(c.env.DB), await complaintTokenHash(c.req.header("authorization"))),
  ),
);
