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
      "newer production history (rollback across histories)",
      ledger([...rows, { id: 4, name: "0003_future.sql" }]),
    ],
    [
      "different history (renamed migration)",
      ledger([{ id: 1, name: "0000_other.sql" }, ...rows.slice(1)]),
    ],
    ["out-of-order history", ledger([rows[1], rows[0], rows[2]])],
    ["nonsequential ids", ledger(rows.map((row) => ({ ...row, id: row.id + 1 })))],
    ["duplicate row", ledger([rows[0], rows[0], rows[2]])],
    ["malformed row", ledger([{ id: "1", name: names[0] }, ...rows.slice(1)])],
    ["empty production history", ledger([])],
    ["failed query envelope", [{ success: false, results: rows }]],
    ["missing query envelope", []],
    ["malformed query envelope", [{ success: true, results: {} }]],
    ["extra query results", [...ledger(rows), ...ledger(rows)]],
  ])("blocks deployment for %s", (_, response) => {
    expect(() => checkLedger(names, response)).toThrow(/does not exactly match/);
  });

  it("blocks deployment when the selected commit registers no migrations", () => {
    expect(() => checkLedger([], ledger([]))).toThrow(/does not exactly match/);
  });

  const journal = (...tags) => ({ entries: tags.map((tag, idx) => ({ idx, tag })) });
  const sql = (name, text = "SELECT 1;") => ({ name, regular: true, sql: text });
  const registered = () => [sql("0000_schema.sql"), sql("0001_rooms.sql")];

  it("accepts registered, nonempty SQL in journal order", () => {
    const manifest = validateMigrationManifest(journal("0000_schema", "0001_rooms"), registered());
    expect(manifest.map(({ name }) => name)).toEqual(["0000_schema.sql", "0001_rooms.sql"]);
  });

  it.each([
    ["missing journal entries", { entries: undefined }, registered(), /Invalid migration journal/],
    [
      "journal index mismatch",
      {
        entries: [
          { idx: 1, tag: "0000_schema" },
          { idx: 1, tag: "0001_rooms" },
        ],
      },
      registered(),
      /Invalid migration journal/,
    ],
    [
      "malformed journal tag",
      journal("0000_schema", "rooms"),
      registered(),
      /Invalid migration journal/,
    ],
    ["empty journal", journal(), [], /disagree/],
    ["unregistered SQL file", journal("0000_schema"), registered(), /disagree/],
    [
      "missing SQL file",
      journal("0000_schema", "0001_rooms"),
      [sql("0000_schema.sql")],
      /disagree/,
    ],
    [
      "nonregular SQL file",
      journal("0000_schema", "0001_rooms"),
      [sql("0000_schema.sql"), { name: "0001_rooms.sql", regular: false, sql: "" }],
      /regular files/,
    ],
    [
      "out-of-order journal",
      journal("0001_rooms", "0000_schema"),
      registered(),
      /ascending journal order/,
    ],
    [
      "empty SQL file",
      journal("0000_schema", "0001_rooms"),
      [sql("0000_schema.sql"), sql("0001_rooms.sql", "\n")],
      /Empty migration: 0001_rooms.sql/,
    ],
  ])("rejects a manifest with %s", (_, manifestJournal, files, error) => {
    expect(() => validateMigrationManifest(manifestJournal, files)).toThrow(error);
  });

  const id = "00000000-0000-4000-8000-000000000000";
  const production = { type: "d1", name: "pms-production", id };
  const config = (env) => ({ worker: { name: "pms-api", env } });

  it("accepts the single production database bound as DB", () => {
    expect(productionTarget(config({ DB: production }))).toBe(production);
  });

  it.each([
    ["malformed database identity", config({ DB: { ...production, id: "not-a-uuid" } })],
    ["second binding to the production database", config({ DB: production, OTHER: production })],
    ["DB bound to another database", config({ DB: { ...production, name: "other" } })],
    ["no database binding", config({})],
  ])("rejects a production target with %s", (_, cloudflareConfig) => {
    expect(() => productionTarget(cloudflareConfig)).toThrow(/Unexpected production configuration/);
  });
});
