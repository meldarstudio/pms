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
const paymentsMigration = journal.entries.findIndex(
  (entry) => entry.tag === "0019_public_payments",
);

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const entry of journal.entries.slice(0, paymentsMigration)) db.exec(migration(entry.tag));
  db.exec(`
    INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
      VALUES ('type', 'Standard', 2, 10000, '2026-10-05');
    INSERT INTO quotes (id, room_type_id, check_in, check_out, adults, children, nights, terms, created_at, expires_at)
      VALUES ('old-quote', 'type', '2026-10-20', '2026-10-21', 2, 0,
        '[{"date":"2026-10-20","priceCents":10000}]', '{"plan":"flexible"}', '2026-10-05T15:00:00Z', '2026-10-05T15:10:00Z');
    INSERT INTO guests (id, full_name, email, created_at) VALUES ('contact', 'Ana', 'ana@example.com', '2026-10-05');
    INSERT INTO reservations (id, code, guest_id, check_in, check_out, source, quote_id, created_at)
      VALUES ('online', 'ONLINE', 'contact', '2026-10-20', '2026-10-21', 'online', 'old-quote', '2026-10-05'),
             ('desk', 'DESK01', 'contact', '2026-10-22', '2026-10-23', 'desk', NULL, '2026-10-05');
    INSERT INTO payment_attempts (id, quote_id, amount_cents, currency, email, guest, source_id, status, created_at, called_at, reservation_id)
      VALUES ('saved', 'old-quote', 10000, 'PEN', 'ana@example.com', '{"fullName":"Ana"}', 'tkn_a', 'saved', '2026-10-05', '2026-10-05', 'online'),
             ('open', 'old-quote', 10000, 'PEN', 'ana@example.com', '{"fullName":"Ana"}', 'tkn_b', 'failed', '2026-10-05', '2026-10-05', NULL);
  `);
});

afterEach(() => db.close());

describe("public payments migration", () => {
  it("keeps existing reservations and attempts as legacy, without public provenance or confirmation eligibility", () => {
    const before = ["reservations", "payment_attempts"].map((table) =>
      db.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
    );

    db.exec(migration(journal.entries[paymentsMigration]!.tag));

    expect(db.prepare("SELECT * FROM reservations ORDER BY id").all()).toEqual(
      before[0]!.map((row) => ({ ...row, public_checkout_id: null })),
    );
    expect(db.prepare("SELECT * FROM payment_attempts ORDER BY id").all()).toEqual(
      before[1]!.map((row) => ({
        ...row,
        checkout_id: null,
        acceptance_id: null,
        language: null,
        confirmation_email_eligible: 0,
      })),
    );
    expect(db.prepare("SELECT * FROM operation_controls").all()).toEqual([]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
