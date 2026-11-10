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
const accessMigration = journal.entries.findIndex((entry) =>
  migration(entry.tag).includes("reservation_access"),
);

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
});

afterEach(() => db.close());

describe("reservation access migration", () => {
  it("creates no access credentials for reservations that already exist", () => {
    expect(accessMigration).toBeGreaterThan(0);
    for (const entry of journal.entries.slice(0, accessMigration)) db.exec(migration(entry.tag));
    db.exec(`
      INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
        VALUES ('type', 'Standard', 2, 10000, '2026-10-05');
      INSERT INTO guests (id, full_name, email, phone, created_at)
        VALUES ('contact', 'Ana', 'ana@example.com', '+51987654321', '2026-10-05');
      INSERT INTO reservations (id, code, guest_id, check_in, check_out, source, created_at)
        VALUES ('online', 'ONLINE', 'contact', '2026-10-20', '2026-10-21', 'online', '2026-10-05'),
               ('desk', 'DESK01', 'contact', '2026-10-22', '2026-10-23', 'desk', '2026-10-05');
    `);
    const before = db.prepare("SELECT * FROM reservations ORDER BY id").all();

    db.exec(migration(journal.entries[accessMigration]!.tag));

    expect(db.prepare("SELECT * FROM reservations ORDER BY id").all()).toEqual(before);
    expect(db.prepare("SELECT * FROM reservation_access").all()).toEqual([]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("lets a reservation saved after the upgrade store access without granting it to older stays", () => {
    expect(accessMigration).toBeGreaterThan(0);
    for (const entry of journal.entries.slice(0, accessMigration)) db.exec(migration(entry.tag));
    db.exec(`
      INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
        VALUES ('type', 'Standard', 2, 10000, '2026-10-05');
      INSERT INTO guests (id, full_name, created_at) VALUES ('contact', 'Ana', '2026-10-05');
      INSERT INTO reservations (id, code, guest_id, check_in, check_out, source, created_at)
        VALUES ('legacy', 'LEGACY', 'contact', '2026-10-20', '2026-10-21', 'online', '2026-10-05');
    `);

    db.exec(migration(journal.entries[accessMigration]!.tag));
    db.exec(`
      INSERT INTO reservations (id, code, guest_id, check_in, check_out, source, created_at)
        VALUES ('later', 'LATER1', 'contact', '2026-11-01', '2026-11-02', 'online', '2026-11-01');
      INSERT INTO reservation_access (reservation_id, token_hash, token, expires_on, created_at)
        VALUES ('later', 'hash', 'later-token', '2026-12-01', '2026-11-01');
    `);

    expect(
      db.prepare("SELECT reservation_id FROM reservation_access ORDER BY reservation_id").all(),
    ).toEqual([{ reservation_id: "later" }]);
  });
});
