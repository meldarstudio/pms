import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { parseMajorToCents } from "../src/lib/money.ts";
describe("money input", () => {
  it.each([
    { rule: "whole units", value: "310", cents: 31000 },
    { rule: "single decimal", value: "310.5", cents: 31050 },
    { rule: "binary rounding", value: "10.10", cents: 1010 },
    { rule: "one cent", value: "0.01", cents: 1 },
    { rule: "empty", value: "", cents: null },
    { rule: "negative", value: "-1", cents: null },
    { rule: "fractional cent", value: "10.105", cents: null },
    { rule: "multiple decimal points", value: "10.1.0", cents: null },
  ])("parses $rule", ({ value, cents }) => {
    assert.equal(parseMajorToCents(value), cents);
  });
});
