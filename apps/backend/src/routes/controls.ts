import { publicPaymentAdmissionSchema } from "@pms/shared";
import { Hono } from "hono";
import { getDb } from "../db";
import type { Env } from "../env";
import { validate } from "../http";
import { readPublicPaymentAdmission, setPublicPaymentAdmission } from "../operation-controls";
import { requireOwner } from "../session";

export const controlRoutes = new Hono<Env>();

controlRoutes.get("/public-payments", requireOwner, async (c) =>
  c.json(await readPublicPaymentAdmission(getDb(c.env.DB))),
);

controlRoutes.put(
  "/public-payments",
  requireOwner,
  validate("json", publicPaymentAdmissionSchema),
  async (c) =>
    c.json(
      await setPublicPaymentAdmission(getDb(c.env.DB), c.req.valid("json").admitted, {
        accountId: c.var.account.id,
        now: new Date(),
      }),
    ),
);
