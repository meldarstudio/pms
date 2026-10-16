import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";

import { CURRENCY, formatMajor, formatMoney, parseMajorToCents } from "../src/lib/money.ts";
import { contiguousRanges, datesBetween } from "../src/lib/rate-ranges.ts";

describe("parseMajorToCents", () => {
  it("parses whole and fractional major units without binary rounding", () => {
    assert.equal(parseMajorToCents("310"), 31000);
    assert.equal(parseMajorToCents("310.5"), 31050);
    assert.equal(parseMajorToCents("10.10"), 1010);
    assert.equal(parseMajorToCents("0.01"), 1);
  });

  it("rejects empty, negative, and extra fraction digits", () => {
    assert.equal(parseMajorToCents(""), null);
    assert.equal(parseMajorToCents("-1"), null);
    assert.equal(parseMajorToCents("10.105"), null);
    assert.equal(parseMajorToCents("10.1.0"), null);
  });
});

describe("formatMajor", () => {
  it("writes cents as a two-decimal major amount", () => {
    assert.equal(formatMajor(1010), "10.10");
    assert.equal(formatMajor(31000), "310.00");
  });
});

describe("Peruvian soles", () => {
  it("formats whole, fractional, and negative balances in soles", () => {
    assert.equal(CURRENCY, "PEN");
    const normalized = (cents: number) => formatMoney(cents).replace(/\s/g, " ");
    assert.equal(normalized(10000), "S/ 100");
    assert.equal(normalized(125050), "S/ 1,250.50");
    assert.equal(normalized(-1250), "-S/ 12.50");
  });
});

describe("rate ranges", () => {
  it("keeps visible dates between two endpoints", () => {
    const days = ["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27"];
    assert.deepEqual(datesBetween(days, "2026-12-26", "2026-12-24"), [
      "2026-12-24",
      "2026-12-25",
      "2026-12-26",
    ]);
  });

  it("groups dates into contiguous ranges", () => {
    assert.deepEqual(contiguousRanges(["2026-12-24", "2026-12-26", "2026-12-27"]), [
      { from: "2026-12-24", to: "2026-12-24" },
      { from: "2026-12-26", to: "2026-12-27" },
    ]);
  });
});
