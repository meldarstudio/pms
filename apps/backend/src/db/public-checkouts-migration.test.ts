/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

const migrationsDir = new URL("../../drizzle/", import.meta.url);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8")) as {
  entries: { tag: string }[];
};
const migration = (tag: string) => readFileSync(new URL(`${tag}.sql`, migrationsDir), "utf8");
const split = journal.entries.findIndex((entry) => entry.tag === "0018_public_checkouts");

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const entry of journal.entries.slice(0, split)) db.exec(migration(entry.tag));
  db.exec(`
    INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
      VALUES ('type', 'Standard', 2, 10000, '2026-10-05');
    INSERT INTO quotes (id, room_type_id, check_in, check_out, adults, children, nights, terms, created_at, expires_at)
      VALUES ('old-quote', 'type', '2026-10-20', '2026-10-21', 2, 0,
        '[{"date":"2026-10-20","priceCents":10000}]', '{"plan":"flexible"}', '2026-10-05T15:00:00Z', '2026-10-05T15:10:00Z');
    INSERT INTO guests (id, full_name, email, created_at) VALUES ('contact', 'Ana', 'ana@example.com', '2026-10-05');
    INSERT INTO reservations (id, code, guest_id, check_in, check_out, source, quote_id, created_at)
      VALUES ('online', 'ONLINE', 'contact', '2026-10-20', '2026-10-21', 'online', 'old-quote', '2026-10-05');
    INSERT INTO payment_attempts (id, quote_id, amount_cents, currency, email, guest, source_id, status, created_at, called_at)
      VALUES ('attempt', 'old-quote', 10000, 'PEN', 'ana@example.com', '{"fullName":"Ana"}', 'tkn', 'unknown', '2026-10-05', '2026-10-05');
  `);
});

afterEach(() => db.close());

describe("public checkout migration", () => {
  it("keeps populated quotes, reservations and open attempts, marking old quotes outside any checkout", () => {
    const tables = ["quotes", "reservations", "payment_attempts", "guests"];
    const before = tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all());

    db.exec(migration(journal.entries[split]!.tag));

    expect(tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())).toEqual(
      before.map((rows, index) =>
        tables[index] === "quotes" ? rows.map((row) => ({ ...row, checkout_id: null })) : rows,
      ),
    );
    expect(db.prepare("SELECT count(*) AS n FROM public_checkouts").get()).toEqual({ n: 0 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() =>
      db.exec(`INSERT INTO quotes (id, room_type_id, check_in, check_out, adults, children, nights, terms, created_at, expires_at, checkout_id)
        VALUES ('orphan', 'type', '2026-10-20', '2026-10-21', 2, 0, '[]', '{}', '2026-10-05', '2026-10-05', 'missing')`),
    ).toThrow(/FOREIGN KEY/);
  });
});
