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
  it("preserves populated submissions without inventing old credentials or assuming no acceptance", () => {
    const fingerprintMigration = journal.entries.findIndex((entry) =>
      migration(entry.tag).includes("ADD `credential_fingerprint`"),
    );
    expect(fingerprintMigration).toBeGreaterThan(submissionMigration);
    for (const entry of journal.entries.slice(0, fingerprintMigration))
      db.exec(migration(entry.tag));
    db.exec(`
      INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
        VALUES ('type', 'Standard', 2, 10000, '2026-10-05');
      INSERT INTO public_checkouts (id, token_hash, room_type_id, check_in, check_out, adults, children, rate_plan, language, created_at)
        VALUES ('checkout', 'hash', 'type', '2026-10-20', '2026-10-21', 2, 0, 'flexible', 'en', '2026-10-05');
      INSERT INTO quotes (id, room_type_id, check_in, check_out, adults, children, nights, terms, created_at, expires_at, checkout_id)
        VALUES ('quote', 'type', '2026-10-20', '2026-10-21', 2, 0, '[]', '{}', '2026-10-05', '2026-10-05', 'checkout');
      INSERT INTO checkout_acceptances (id, checkout_id, quote_id, full_name, email, phone, language, accepted_at)
        VALUES ('accept', 'checkout', 'quote', 'Ana', 'ana@example.com', '+51987654321', 'en', '2026-10-05');
      INSERT INTO guests (id, full_name, created_at) VALUES ('contact', 'Ana', '2026-10-05');
      INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at)
        VALUES ('reservation', 'ONLINE', 'contact', '2026-10-20', '2026-10-21', '2026-10-05');
      INSERT INTO payment_attempts (id, quote_id, amount_cents, currency, email, guest, source_id, status, created_at, called_at)
        VALUES ('attempt', 'quote', 10000, 'PEN', 'ana@example.com', '{}', 'tkn_a', 'saved', '2026-10-05', '2026-10-05');
      INSERT INTO confirmation_intents (id, reservation_id, attempt_id, checkout_id, acceptance_id, recipient_email, language, created_at)
        VALUES ('intent', 'reservation', 'attempt', 'checkout', 'accept', 'ana@example.com', 'en', '2026-10-05');
      INSERT INTO confirmation_submissions (id, intent_id, send_key, endpoint, request_json, recipient_email, language, first_possible_at, status, next_attempt_at, created_at, updated_at)
        VALUES ('submission', 'intent', 'confirmation/intent', 'https://api.resend.com/emails', '{"text":"saved message"}', 'ana@example.com', 'en', '2026-10-05T15:00:00.000Z', 'uncertain', '2026-10-05T15:01:00.000Z', '2026-10-05T15:00:00.000Z', '2026-10-05T15:00:00.000Z');
    `);
    const context =
      "SELECT id, intent_id, send_key, endpoint, request_json, recipient_email, language, first_possible_at, status, next_attempt_at, created_at, updated_at FROM confirmation_submissions";
    const before = db.prepare(context).all();

    for (const entry of journal.entries.slice(fingerprintMigration)) db.exec(migration(entry.tag));

    expect(db.prepare(context).all()).toEqual(before);
    expect(
      db.prepare("SELECT report_conflict, next_lookup_at FROM confirmation_submissions").all(),
    ).toEqual([{ report_conflict: 0, next_lookup_at: null }]);
    expect(db.prepare("SELECT count(*) AS n FROM confirmation_reports").all()).toEqual([{ n: 0 }]);
    expect(
      db
        .prepare("SELECT credential_fingerprint, acceptance_possible FROM confirmation_submissions")
        .all(),
    ).toEqual([{ credential_fingerprint: null, acceptance_possible: 1 }]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

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
    expect(db.prepare("SELECT count(*) AS n FROM confirmation_reports").all()).toEqual([{ n: 0 }]);
    db.exec(`
      INSERT INTO operation_controls (id, public_payments_admitted, updated_at, updated_by)
        VALUES (1, 0, '2026-11-01', 'owner-account');
    `);
    expect(db.prepare("SELECT email_submission_admitted FROM operation_controls").all()).toEqual([
      { email_submission_admitted: 0 },
    ]);
  });
});
