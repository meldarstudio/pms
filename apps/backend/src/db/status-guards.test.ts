/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { attemptStatuses, reservationStatuses } from "./schema";

const migrationsDir = new URL("../../drizzle/", import.meta.url);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8")) as {
  entries: { tag: string }[];
};
const migration = (tag: string) => readFileSync(new URL(`${tag}.sql`, migrationsDir), "utf8");
const guardMigration = journal.entries.findIndex(({ tag }) => tag === "0036_status_guards");

let db: DatabaseSync;

const applyGuards = () => {
  for (const entry of journal.entries.slice(guardMigration)) db.exec(migration(entry.tag));
};

type Guard = {
  table: string;
  statuses: readonly string[];
  typo: string;
  message: string;
  unrelatedColumn: string;
  insert(id: string, status: string): void;
};

const guards: Guard[] = [
  {
    table: "reservations",
    statuses: reservationStatuses,
    typo: "canceled",
    message: "invalid reservation status",
    unrelatedColumn: "notes",
    insert(id, status) {
      db.prepare(`INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at, status)
        VALUES (?, ?, 'guest', '2026-10-20', '2026-10-21', '2026-10-05', ?)`).run(id, id, status);
    },
  },
  {
    table: "payment_attempts",
    statuses: attemptStatuses,
    typo: "success",
    message: "invalid payment attempt status",
    unrelatedColumn: "failure_message",
    insert(id, status) {
      db.prepare(`INSERT INTO quotes (id, check_in, check_out, rooms, terms, created_at, expires_at)
        VALUES (?, '2026-10-20', '2026-10-21',
          '[{"roomTypeId":"type","adults":2,"children":0,"nights":[{"date":"2026-10-20","priceCents":10000}]}]',
          '{"plan":"flexible"}', '2026-10-05T15:00:00Z', '2026-10-05T15:10:00Z')`).run(id);
      db.prepare(`INSERT INTO payment_attempts (id, quote_id, amount_cents, currency, email, source_id, status, created_at, called_at)
        VALUES (?, ?, 10000, 'PEN', 'ana@example.com', 'tkn', ?, '2026-10-05', '2026-10-05')`).run(
        id,
        id,
        status,
      );
    },
  },
];

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  expect(guardMigration).toBeGreaterThan(0);
  for (const entry of journal.entries.slice(0, guardMigration)) db.exec(migration(entry.tag));
  db.exec(`
    INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
      VALUES ('type', 'Standard', 2, 10000, '2026-10-05');
    INSERT INTO guests (id, full_name, created_at) VALUES ('guest', 'Ana', '2026-10-05');
  `);
});

afterEach(() => db.close());

describe.each(guards)("$table status guard", (guard) => {
  const status = (id: string) =>
    (db.prepare(`SELECT status FROM ${guard.table} WHERE id = ?`).get(id) as { status: string })
      .status;
  const setStatus = (id: string, value: string) =>
    db.prepare(`UPDATE ${guard.table} SET status = ? WHERE id = ?`).run(value, id);

  it("rejects an unknown status on insert and update", () => {
    applyGuards();
    guard.insert("valid", guard.statuses[0]!);

    expect(() => guard.insert("typo", guard.typo)).toThrow(guard.message);
    expect(() => setStatus("valid", guard.typo)).toThrow(guard.message);
    expect(status("valid")).toBe(guard.statuses[0]);
  });
});
