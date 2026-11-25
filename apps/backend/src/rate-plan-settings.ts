import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { ratePlanPriceAdjustments } from "./db/schema";
import { defaultRatePlans, type RatePlanCode, type RatePlans } from "./lib/rate-plans";

const adjustablePlan = "non_refundable";

export async function currentRatePlan(db: Db, plan: RatePlanCode) {
  const terms = defaultRatePlans[plan];
  if (plan !== adjustablePlan) return terms;
  const [adjustment] = await db
    .select({ priceAdjustmentPercent: ratePlanPriceAdjustments.priceAdjustmentPercent })
    .from(ratePlanPriceAdjustments)
    .where(eq(ratePlanPriceAdjustments.ratePlan, plan));
  return adjustment ? { ...terms, ...adjustment } : terms;
}

export async function currentRatePlans(db: Db): Promise<RatePlans> {
  return { ...defaultRatePlans, [adjustablePlan]: await currentRatePlan(db, adjustablePlan) };
}

export async function setNonRefundablePriceAdjustment(
  db: Db,
  reductionPercent: number,
): Promise<RatePlans> {
  const adjustment = { priceAdjustmentPercent: -reductionPercent };
  await db
    .insert(ratePlanPriceAdjustments)
    .values({ ratePlan: adjustablePlan, ...adjustment })
    .onConflictDoUpdate({ target: ratePlanPriceAdjustments.ratePlan, set: adjustment });
  return {
    ...defaultRatePlans,
    [adjustablePlan]: { ...defaultRatePlans[adjustablePlan], ...adjustment },
  };
}
