import { describe, expect, it } from "vite-plus/test";
import { priceNights, totalCents } from "./pricing";
import { defaultRatePlans } from "./rate-plans";

describe("priceNights", () => {
  const dates = ["2026-12-24", "2026-12-25", "2026-12-26"];
  const overrides = new Map([["2026-12-25", 14000]]);
  const nonRefundable = defaultRatePlans.non_refundable;

  it("uses the date's override before the base rate, unadjusted under Flexible", () => {
    const nights = priceNights({
      dates,
      baseRateCents: 10000,
      overrides,
      terms: defaultRatePlans.flexible,
    });
    expect(nights).toEqual([
      { date: "2026-12-24", priceCents: 10000, adjustmentCents: 0, discountCents: 0 },
      { date: "2026-12-25", priceCents: 14000, adjustmentCents: 0, discountCents: 0 },
      { date: "2026-12-26", priceCents: 10000, adjustmentCents: 0, discountCents: 0 },
    ]);
    expect(totalCents(nights)).toBe(34000);
  });

  it("applies the plan adjustment to each ordinary night", () => {
    const nights = priceNights({ dates, baseRateCents: 10000, overrides, terms: nonRefundable });
    expect(nights.map((n) => [n.priceCents, n.adjustmentCents])).toEqual([
      [9000, -1000],
      [12600, -1400],
      [9000, -1000],
    ]);
  });

  it("rounds an exact half cent upward per night and sums the rounded nights", () => {
    const nights = priceNights({
      dates: dates.slice(0, 2),
      baseRateCents: 10005,
      overrides: new Map(),
      terms: nonRefundable,
    });
    expect(nights.map((n) => [n.priceCents, n.adjustmentCents])).toEqual([
      [9005, -1000],
      [9005, -1000],
    ]);
    expect(totalCents(nights)).toBe(18010);
  });

  it("rounds to the nearest cent away from ties", () => {
    const price = (baseRateCents: number) =>
      priceNights({
        dates: dates.slice(0, 1),
        baseRateCents,
        overrides: new Map(),
        terms: nonRefundable,
      })[0]?.priceCents;
    expect(price(10004)).toBe(9004);
    expect(price(10006)).toBe(9005);
    expect(price(1)).toBe(1);
  });
});
