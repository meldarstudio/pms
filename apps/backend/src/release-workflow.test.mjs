import { describe, expect, it } from "vite-plus/test";
import { checkLedger } from "../scripts/check-production-readiness.mjs";
import { productionTarget, validateMigrationManifest } from "../scripts/production-migrations.mjs";

describe("production readiness rules", () => {
  const names = ["0000_schema.sql", "0001_rooms.sql", "0002_rates.sql"];
  const rows = names.map((name, index) => ({ id: index + 1, name }));
  const ledger = (results) => [{ success: true, results }];

  it("accepts a ledger that exactly matches the selected commit", () => {
    expect(() => checkLedger(names, ledger(rows))).not.toThrow();
  });

  it.each([
    ["pending migration (code deployed before its schema)", ledger(rows.slice(0, -1))],
    [
      "different history (renamed migration)",
      ledger([{ id: 1, name: "0000_other.sql" }, ...rows.slice(1)]),
    ],
  ])("blocks deployment for %s", (_, response) => {
    expect(() => checkLedger(names, response)).toThrow(/does not exactly match/);
  });

  const journal = (...tags) => ({ entries: tags.map((tag, idx) => ({ idx, tag })) });
  const sql = (name) => ({ name, regular: true, sql: "SELECT 1;" });
  const registered = () => [sql("0000_schema.sql"), sql("0001_rooms.sql")];

  it("accepts registered, nonempty SQL in journal order", () => {
    const manifest = validateMigrationManifest(journal("0000_schema", "0001_rooms"), registered());
    expect(manifest.map(({ name }) => name)).toEqual(["0000_schema.sql", "0001_rooms.sql"]);
  });

  it("rejects a manifest with an unregistered SQL file", () => {
    expect(() => validateMigrationManifest(journal("0000_schema"), registered())).toThrow(
      /disagree/,
    );
  });

  const id = "00000000-0000-4000-8000-000000000000";
  const production = { type: "d1", name: "pms-production", id };
  const config = (env) => ({ worker: { name: "pms-api", env } });

  it("accepts the single production database bound as DB", () => {
    expect(productionTarget(config({ DB: production }))).toBe(production);
  });

  it("rejects a production target with DB bound to another database", () => {
    expect(() => productionTarget(config({ DB: { ...production, name: "other" } }))).toThrow(
      /Unexpected production configuration/,
    );
  });
});
