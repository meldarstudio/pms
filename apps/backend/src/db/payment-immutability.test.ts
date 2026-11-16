/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";

const migrationsDir = new URL("../../drizzle/", import.meta.url);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8")) as {
  entries: { tag: string }[];
};

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const entry of journal.entries) {
    db.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
  }
  db.exec(`
    INSERT INTO user (id, name, email, created_at, updated_at)
      VALUES ('staff', 'Reception', 'staff@example.com', 0, 0);
    INSERT INTO guests (id, full_name, created_at)
      VALUES ('guest', 'Ada Lovelace', '2026-10-10');
    INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at)
      VALUES ('reservation', 'R1', 'guest', '2026-10-10', '2026-10-13', '2026-10-10');
    INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at)
      VALUES ('payment', 'reservation', 30000, 'cash', '2026-10-10', '2026-10-10');
    INSERT INTO payment_voids (payment_id, reason, voided_at, account_id)
      VALUES ('payment', 'Recorded twice', '2026-10-10T15:00:00Z', 'staff');
  `);
});

afterEach(() => db.close());

it.each([
  ["payments", "id", "UPDATE payments SET amount_cents = 20000 WHERE id = ?"],
  [
    "payment_voids",
    "payment_id",
    "UPDATE payment_voids SET reason = 'Changed' WHERE payment_id = ?",
  ],
])("refuses to rewrite saved financial history in %s", (table, key, sql) => {
  const select = db.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`);
  const original = select.get("payment");

  expect(() => db.prepare(sql).run("payment")).toThrow();
  expect(select.get("payment")).toEqual(original);
});
