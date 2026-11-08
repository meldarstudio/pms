import assert from "node:assert/strict";
import { it } from "vite-plus/test";
import { nationalityCodes } from "@pms/shared";
import { flagUrl, nationalities } from "../src/lib/countries.ts";

it("offers exactly the nationalities the backend accepts, each with a flag", () => {
  assert.deepEqual(new Set(nationalities.map((item) => item.code)), nationalityCodes);
  for (const { code } of nationalities) assert.ok(flagUrl(code), `Missing flag for ${code}`);
});

it("names nationalities in Spanish, sorted alphabetically", () => {
  const names = nationalities.map((item) => item.name);
  assert.ok(names.includes("Perú"));
  assert.ok(!names.includes("Pseudoacentos"));
  assert.deepEqual(
    names,
    names.toSorted((a, b) => a.localeCompare(b, "es")),
  );
});
