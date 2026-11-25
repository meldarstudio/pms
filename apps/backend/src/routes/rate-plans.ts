import { nonRefundablePriceAdjustmentSchema } from "@pms/shared";
import { Hono } from "hono";
import { getDb } from "../db";
import type { Env } from "../env";
import { validate } from "../http";
import { currentRatePlans, setNonRefundablePriceAdjustment } from "../rate-plan-settings";
import { requireOwner } from "../session";

export const ratePlanRoutes = new Hono<Env>();

ratePlanRoutes.get("/", async (c) =>
  c.json(Object.values(await currentRatePlans(getDb(c.env.DB)))),
);

ratePlanRoutes.put(
  "/non-refundable",
  requireOwner,
  validate("json", nonRefundablePriceAdjustmentSchema),
  async (c) => {
    const { reductionPercent } = c.req.valid("json");
    const plans = await setNonRefundablePriceAdjustment(getDb(c.env.DB), reductionPercent);
    return c.json(Object.values(plans));
  },
);
