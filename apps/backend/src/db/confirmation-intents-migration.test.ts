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
const intentMigration = journal.entries.findIndex((entry) =>
  migration(entry.tag).includes("confirmation_intents"),
);

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
});

afterEach(() => db.close());

describe("confirmation intent migration", () => {
  it("creates no intents for reservations that already exist", () => {
    expect(intentMigration).toBeGreaterThan(0);
    for (const entry of journal.entries.slice(0, intentMigration)) db.exec(migration(entry.tag));
    db.exec(`
      INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
        VALUES ('type', 'Standard', 2, 10000, '2026-10-05');
      INSERT INTO public_checkouts (id, token_hash, room_type_id, check_in, check_out, adults, children, rate_plan, language, created_at)
        VALUES ('checkout', 'hash', 'type', '2026-10-20', '2026-10-21', 2, 0, 'flexible', 'en', '2026-10-05');
      INSERT INTO quotes (id, room_type_id, check_in, check_out, adults, children, nights, terms, created_at, expires_at, checkout_id)
        VALUES ('quote', 'type', '2026-10-20', '2026-10-21', 2, 0, '[]', '{}', '2026-10-05', '2026-10-05', 'checkout');
      INSERT INTO checkout_acceptances (id, checkout_id, quote_id, full_name, email, phone, language, accepted_at)
        VALUES ('accept', 'checkout', 'quote', 'Ana', 'ana@example.com', '+51987654321', 'en', '2026-10-05');
      INSERT INTO guests (id, full_name, email, created_at)
        VALUES ('contact', 'Ana', 'ana@example.com', '2026-10-05');
      INSERT INTO reservations (id, code, guest_id, check_in, check_out, source, quote_id, public_checkout_id, created_at)
        VALUES ('online', 'ONLINE', 'contact', '2026-10-20', '2026-10-21', 'online', 'quote', 'checkout', '2026-10-05'),
               ('desk', 'DESK01', 'contact', '2026-10-22', '2026-10-23', 'desk', NULL, NULL, '2026-10-05');
      INSERT INTO payment_attempts (
        id, quote_id, amount_cents, currency, email, guest, source_id, status, created_at, called_at,
        reservation_id, checkout_id, acceptance_id, language, confirmation_email_eligible
      ) VALUES (
        'saved', 'quote', 10000, 'PEN', 'ana@example.com', '{"fullName":"Ana"}', 'tkn_a', 'saved',
        '2026-10-05', '2026-10-05', 'online', 'checkout', 'accept', 'en', 1
      );
    `);

    db.exec(migration(journal.entries[intentMigration]!.tag));

    expect(db.prepare("SELECT count(*) AS n FROM confirmation_intents").all()).toEqual([{ n: 0 }]);
    expect(db.prepare("SELECT id, confirmation_owed FROM reservations ORDER BY id").all()).toEqual([
      { id: "desk", confirmation_owed: 0 },
      { id: "online", confirmation_owed: 0 },
    ]);
    db.exec(`
      INSERT INTO reservations (id, code, guest_id, check_in, check_out, source, created_at)
        VALUES ('later', 'LATER1', 'contact', '2026-11-01', '2026-11-02', 'desk', '2026-11-01');
    `);
    expect(
      db.prepare("SELECT confirmation_owed FROM reservations WHERE id = 'later'").all(),
    ).toEqual([{ confirmation_owed: 0 }]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("has the confirmation intent table on a fresh install", () => {
    for (const entry of journal.entries) db.exec(migration(entry.tag));

    expect(db.prepare("SELECT count(*) AS n FROM confirmation_intents").all()).toEqual([{ n: 0 }]);
  });
});
