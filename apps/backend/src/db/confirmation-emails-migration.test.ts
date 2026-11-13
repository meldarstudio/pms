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
const outboxMigration = journal.entries.findIndex((entry) =>
  migration(entry.tag).includes("CREATE TABLE `confirmation_emails`"),
);
const tables = () =>
  (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'confirmation%'")
      .all() as { name: string }[]
  ).map((row) => row.name);

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  expect(outboxMigration).toBeGreaterThan(0);
  for (const entry of journal.entries.slice(0, outboxMigration)) db.exec(migration(entry.tag));
  db.exec(`
    INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
      VALUES ('type', 'Standard', 2, 10000, '2026-10-05');
    INSERT INTO guests (id, full_name, created_at) VALUES ('contact', 'Ana', '2026-10-05');
    INSERT INTO reservations (id, code, guest_id, check_in, check_out, source, created_at, confirmation_owed)
      VALUES ('online', 'ONLINE', 'contact', '2026-10-20', '2026-10-21', 'online', '2026-10-05', 1),
             ('desk', 'DESK01', 'contact', '2026-10-22', '2026-10-23', 'desk', '2026-10-05', 0);
  `);
});

afterEach(() => db.close());

describe("confirmation email outbox migration", () => {
  it("replaces the confirmation delivery tables and keeps every reservation", () => {
    const before = db.prepare("SELECT * FROM reservations ORDER BY id").all();

    db.exec(migration(journal.entries[outboxMigration]!.tag));

    expect(db.prepare("SELECT * FROM reservations ORDER BY id").all()).toEqual(
      before.map(({ confirmation_owed: _owed, ...row }) => row),
    );
    expect(tables()).toEqual(["confirmation_emails"]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("holds one automatic confirmation per reservation but any number of resends", () => {
    db.exec(migration(journal.entries[outboxMigration]!.tag));
    const insert = db.prepare(`INSERT INTO confirmation_emails
      (id, reservation_id, recipient, language, kind, status, created_at)
      VALUES (?, 'online', 'ana@example.com', 'es', ?, 'pending', '2026-10-05')`);

    insert.run("automatic", "automatic");
    insert.run("resend-1", "resend");
    insert.run("resend-2", "resend");

    expect(() => insert.run("automatic-2", "automatic")).toThrow(/UNIQUE/);
    expect(() => insert.run("other", "reminder")).toThrow(/CHECK/);
  });
});
