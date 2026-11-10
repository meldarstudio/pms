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
const submissionMigration = journal.entries.findIndex((entry) =>
  migration(entry.tag).includes("confirmation_submissions"),
);

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
});

afterEach(() => db.close());

describe("confirmation submission migration", () => {
  it("leaves email submission off and creates no submission rows for existing records", () => {
    expect(submissionMigration).toBeGreaterThan(0);
    for (const entry of journal.entries.slice(0, submissionMigration))
      db.exec(migration(entry.tag));
    db.exec(`
      INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
        VALUES ('type', 'Standard', 2, 10000, '2026-10-05');
      INSERT INTO guests (id, full_name, email, created_at)
        VALUES ('contact', 'Ana', 'ana@example.com', '2026-10-05');
      INSERT INTO reservations (id, code, guest_id, check_in, check_out, source, created_at)
        VALUES ('desk', 'DESK01', 'contact', '2026-10-22', '2026-10-23', 'desk', '2026-10-05');
      INSERT INTO operation_controls (id, public_payments_admitted, updated_at, updated_by)
        VALUES (1, 1, '2026-10-05', 'owner-account');
    `);

    db.exec(migration(journal.entries[submissionMigration]!.tag));

    expect(db.prepare("SELECT count(*) AS n FROM confirmation_submissions").all()).toEqual([
      { n: 0 },
    ]);
    expect(
      db
        .prepare(
          "SELECT public_payments_admitted, email_submission_admitted FROM operation_controls",
        )
        .all(),
    ).toEqual([{ public_payments_admitted: 1, email_submission_admitted: 0 }]);
    expect(db.prepare("SELECT id, confirmation_owed FROM reservations").all()).toEqual([
      { id: "desk", confirmation_owed: 0 },
    ]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("has the submission table and a default-off email switch on a fresh install", () => {
    for (const entry of journal.entries) db.exec(migration(entry.tag));

    expect(db.prepare("SELECT count(*) AS n FROM confirmation_submissions").all()).toEqual([
      { n: 0 },
    ]);
    db.exec(`
      INSERT INTO operation_controls (id, public_payments_admitted, updated_at, updated_by)
        VALUES (1, 0, '2026-11-01', 'owner-account');
    `);
    expect(db.prepare("SELECT email_submission_admitted FROM operation_controls").all()).toEqual([
      { email_submission_admitted: 0 },
    ]);
  });
});
