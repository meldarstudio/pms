import { complaintSubmissionSchema } from "@pms/shared";
import { getDb } from "../db";
import { complaintTokenHash, fileSheet, receiptForToken } from "../complaint-book";
import { zValidator } from "@hono/zod-validator";
import { currency } from "../http";
import { requireTurnstile } from "../turnstile";
import { limitBySourceIp, trustedSourceIp } from "../rate-limit";
import { Hono } from "hono";
import type { Env } from "../env";
import { complaintBook } from "../complaint-config";

const namedComplaintProblems = new Set([
  "minor representative is required",
  "response email is required",
]);

export const publicComplaintRoutes = new Hono<Env>();
publicComplaintRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
publicComplaintRoutes.get("/config", (c) =>
  c.json({
    provider: complaintBook.provider,
    establishmentId: complaintBook.establishmentId,
    collectionNotice: complaintBook.collectionNotice,
    privacyInformation: complaintBook.privacyInformation,
    policyVersion: complaintBook.policyVersion,
  }),
);

publicComplaintRoutes.post(
  "/",
  limitBySourceIp("QUOTE_LIMITER", "too many complaints; retry in one minute"),
  zValidator("json", complaintSubmissionSchema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path[0];
      if (typeof field === "string") c.header("X-Error-Field", field);
      return c.json(
        {
          error:
            field === "turnstileToken"
              ? "complaint security check failed"
              : issue && namedComplaintProblems.has(issue.message)
                ? issue.message
                : "invalid complaint fields",
        },
        400,
      );
    }
  }),
  async (c) => {
    const tokenHash = await complaintTokenHash(c.req.header("authorization"));
    const { turnstileToken, ...input } = c.req.valid("json");
    await requireTurnstile(c.env, turnstileToken, trustedSourceIp(c), {
      action: "complaint",
      failed: "complaint security check failed",
      unavailable: "complaint security check is unavailable",
    });
    const result = await fileSheet(getDb(c.env.DB), input, tokenHash, {
      currency: currency(c),
      timeZone: c.env.PROPERTY_TIME_ZONE,
    });
    return c.json(result.sheet, result.created ? 201 : 200);
  },
);
publicComplaintRoutes.get("/receipt", async (c) =>
  c.json(
    await receiptForToken(getDb(c.env.DB), await complaintTokenHash(c.req.header("authorization"))),
  ),
);
