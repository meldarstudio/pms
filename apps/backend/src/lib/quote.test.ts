import { describe, expect, it } from "vite-plus/test";
import { quoteNights, totalCents } from "./quote";

describe("quote", () => {
  const dates = ["2026-12-24", "2026-12-25", "2026-12-26"];

  it("uses the room type base price when a date has no override", () => {
    const nights = quoteNights(dates, 10000, new Map([["2026-12-25", 14000]]));
    expect(nights).toEqual([
      { date: "2026-12-24", priceCents: 10000 },
      { date: "2026-12-25", priceCents: 14000 },
      { date: "2026-12-26", priceCents: 10000 },
    ]);
    expect(totalCents(nights)).toBe(34000);
  });

  it("uses a flat rate instead of overrides or the base rate", () => {
    const quoted = quoteNights(dates, 10000, new Map([["2026-12-25", 14000]]), 8000);
    expect(quoted).toEqual([
      { date: "2026-12-24", priceCents: 8000 },
      { date: "2026-12-25", priceCents: 8000 },
      { date: "2026-12-26", priceCents: 8000 },
    ]);
  });
});
