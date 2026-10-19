import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { buildResetSql, referenceDate } from "../../scripts/seed-data.mjs";
import { buildSchemaResetSql } from "../../scripts/schema-reset.mjs";

const backendDir = new URL("../../", import.meta.url);
const migrationsDir = new URL("drizzle/", backendDir);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8"));
const tables = [
  "room_types",
  "rooms",
  "guests",
  "reservations",
  "reservation_rooms",
  "reservation_room_nights",
  "reservation_guests",
  "reservation_requests",
  "payments",
  "room_type_rates",
  "room_closures",
];
let db;

function snapshot() {
  return Object.fromEntries(
    tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]),
  );
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const entry of journal.entries) {
    db.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
  }
  db.exec(
    "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO d1_migrations VALUES (1, 'applied');",
  );
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

describe("local dummy data reset", () => {
  it("rebuilds existing PMS tables, legacy tables, triggers, and migration history", () => {
    db.exec(buildResetSql("2026-10-06"));
    const baseline = snapshot();
    db.exec(`
      CREATE TABLE financial_entries (id TEXT PRIMARY KEY, reservation_id TEXT REFERENCES reservations(id));
      CREATE TABLE reservation_events (id TEXT PRIMARY KEY, reservation_id TEXT REFERENCES reservations(id));
      INSERT INTO financial_entries VALUES ('old', 'reservation-arrival');
      INSERT INTO reservation_events VALUES ('old', 'reservation-arrival');
      CREATE TRIGGER old_financial_guard BEFORE INSERT ON financial_entries BEGIN SELECT 1; END;
      CREATE TABLE unrelated (id TEXT PRIMARY KEY);
      INSERT INTO unrelated VALUES ('keep');
    `);
    const objects = db
      .prepare("SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table','trigger')")
      .all();
    db.exec(buildSchemaResetSql(objects));
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([
      { name: "unrelated" },
    ]);
    for (const entry of journal.entries)
      db.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
    db.exec(buildResetSql("2026-10-06"));
    expect(snapshot()).toEqual(baseline);
    expect(db.prepare("SELECT * FROM unrelated").all()).toEqual([{ id: "keep" }]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("restores every application table after edits, deletions, assignments, and additions", () => {
    const sql = buildResetSql("2026-10-06");
    db.exec(sql);
    const baseline = snapshot();
    const triggers = db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all();
    db.exec(`
      UPDATE room_types SET name = 'Edited Standard', base_rate_cents = 12345 WHERE id = 'type-standard';
      UPDATE rooms SET number = 'edited-101' WHERE id = 'room-101';
      UPDATE guests SET full_name = 'Edited', notes = 'Changed in portal' WHERE id = 'guest-arrival';
      UPDATE reservations SET notes = 'Edited booking' WHERE id = 'reservation-arrival';
      UPDATE reservation_rooms SET room_id = NULL WHERE id = 'line-arrival-1';
      UPDATE reservations SET status = 'checked_in' WHERE id = 'reservation-alex';
      UPDATE reservation_room_nights SET price_cents = 1 WHERE reservation_room_id = 'line-arrival-1';
      UPDATE reservations SET discount_cents = 1 WHERE id = 'reservation-arrival';
      UPDATE payments SET amount_cents = 100 WHERE id = 'payment-family';
      DELETE FROM payments WHERE id = 'payment-cancelled';
      DELETE FROM room_type_rates WHERE room_type_id = 'type-suite';
      DELETE FROM room_closures WHERE id = 'closure-110';
      DELETE FROM reservation_room_nights WHERE reservation_room_id = 'line-sam-1';
      DELETE FROM reservation_rooms WHERE id = 'line-sam-1';
      DELETE FROM reservations WHERE id = 'reservation-sam';
      DELETE FROM guests WHERE id = 'guest-sam';
      INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
        VALUES ('custom', 'Custom', 2, 5000, '2026-10-06');
      INSERT INTO rooms VALUES ('custom', '999', 'custom');
      INSERT INTO guests (id, full_name, created_at) VALUES ('custom', 'New Guest', '2026-10-06');
      INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at)
        VALUES ('custom', 'CUSTOM', 'custom', '2026-10-06', '2026-10-07', '2026-10-06');
      INSERT INTO reservation_rooms (id, reservation_id, room_type_id, room_id, adults, created_at)
        VALUES ('custom', 'custom', 'custom', 'custom', 1, '2026-10-06');
      INSERT INTO reservation_room_nights VALUES ('custom', 'custom', '2026-10-06', 5000);
      INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at)
        VALUES ('custom', 'custom', 5000, 'cash', '2026-10-06', '2026-10-06T12:00:00.000Z');
      INSERT INTO room_type_rates VALUES ('custom', 'custom', '2026-10-07', 6000);
      INSERT INTO room_closures (id, room_id, starts, ends, created_at)
        VALUES ('custom', 'custom', '2026-10-07', '2026-10-08', '2026-10-06');
    `);
    expect(snapshot()).not.toEqual(baseline);
    db.exec(sql);
    expect(snapshot()).toEqual(baseline);
    db.exec(sql);
    expect(snapshot()).toEqual(baseline);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("SELECT * FROM d1_migrations").all()).toEqual([{ id: 1, name: "applied" }]);
    expect(
      db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all(),
    ).toEqual(triggers);
  });

  it("creates valid stays, occupancies, nightly prices, payments, and closures", () => {
    db.exec(buildResetSql("2026-10-06"));
    expect(db.prepare("SELECT COUNT(*) AS count FROM rooms").get().count).toBe(24);
    expect(db.prepare("SELECT COUNT(*) AS count FROM reservations").get().count).toBeGreaterThan(
      600,
    );
    expect(db.prepare("SELECT COUNT(*) AS count FROM room_closures").get().count).toBe(3);
    expect(
      db
        .prepare("SELECT DISTINCT status FROM reservations ORDER BY status")
        .all()
        .map((row) => row.status),
    ).toEqual(["cancelled", "checked_in", "checked_out", "confirmed"]);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM reservation_rooms rr JOIN reservations r ON r.id=rr.reservation_id WHERE rr.room_id IS NULL AND r.status='confirmed'",
        )
        .get().count,
    ).toBeGreaterThan(4);
    expect(
      db
        .prepare(
          `SELECT rr.id FROM reservation_rooms rr
      JOIN room_types t ON t.id = rr.room_type_id
      WHERE rr.adults > t.max_occupancy OR rr.children > t.max_children`,
        )
        .all(),
    ).toEqual([]);
    expect(
      db
        .prepare(
          `SELECT rr.id FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      LEFT JOIN reservation_room_nights n ON n.reservation_room_id = rr.id
            GROUP BY rr.id HAVING COUNT(n.id) != julianday(r.check_out) - julianday(r.check_in)
      OR MIN(n.date) != r.check_in OR MAX(n.date) != date(r.check_out, '-1 day')`,
        )
        .all(),
    ).toEqual([]);
    expect(
      db
        .prepare(
          `SELECT n.id FROM reservation_room_nights n
      JOIN reservation_rooms rr ON rr.id = n.reservation_room_id
      JOIN room_types t ON t.id = rr.room_type_id
      LEFT JOIN room_type_rates rate ON rate.room_type_id = t.id AND rate.date = n.date
      WHERE n.price_cents != CASE WHEN rr.id = 'line-long-stay-1' THEN 9500 ELSE COALESCE(rate.price_cents, t.base_rate_cents) END`,
        )
        .all(),
    ).toEqual([]);
    expect(
      db
        .prepare(
          "SELECT SUM(amount_cents) AS paid FROM payments WHERE reservation_id = 'reservation-cancelled'",
        )
        .get().paid,
    ).toBeGreaterThan(0);
    expect(
      db.prepare("SELECT full_name FROM guests WHERE id = 'guest-arrival'").get().full_name,
    ).toBe("Camila O'Brien");
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it.each(["2026-10-06", "2028-02-28"])(
    "keeps 90 nights 80–90%% booked without counting cancellations or closures as occupied: %s",
    (anchor) => {
      db.exec(buildResetSql(anchor));
      const days = db
        .prepare(`
        WITH RECURSIVE days(day) AS (
          SELECT date(?, '-45 days')
          UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < date(?, '+44 days')
        )
        SELECT day,
          (SELECT COUNT(*) FROM reservation_rooms rr JOIN reservations r ON r.id=rr.reservation_id
            WHERE r.status != 'cancelled' AND r.check_in <= day AND r.check_out > day) AS booked,
          (SELECT COUNT(*) FROM rooms) -
          (SELECT COUNT(*) FROM room_closures WHERE starts <= day AND ends > day) AS sellable
        FROM days
      `)
        .all(anchor, anchor);
      expect(days).toHaveLength(90);
      for (const { day, booked, sellable } of days) {
        expect(booked / sellable, day).toBeGreaterThanOrEqual(0.8);
        expect(booked / sellable, day).toBeLessThanOrEqual(0.9);
        for (const type of db
          .prepare(`
          SELECT t.name,
            (SELECT COUNT(*) FROM reservation_rooms rr JOIN reservations r ON r.id=rr.reservation_id
              WHERE rr.room_type_id=t.id AND r.status != 'cancelled' AND r.check_in <= ? AND r.check_out > ?) AS booked,
            (SELECT COUNT(*) FROM rooms WHERE room_type_id=t.id) -
            (SELECT COUNT(*) FROM room_closures c JOIN rooms rm ON rm.id=c.room_id
              WHERE rm.room_type_id=t.id AND c.starts <= ? AND c.ends > ?) AS sellable
          FROM room_types t
        `)
          .all(day, day, day, day)) {
          expect(type.booked, `${day}: ${type.name}`).toBeLessThanOrEqual(type.sellable);
        }
      }
    },
  );

  it("seeds discounted totals, full discounts, multiple payments, and early-departure credits", () => {
    db.exec(buildResetSql("2026-10-06"));
    const balance = (id) =>
      db
        .prepare(
          `
      SELECT
        (SELECT SUM((SELECT SUM(price_cents) FROM reservation_room_nights WHERE reservation_room_id = rr.id))
          FROM reservation_rooms rr WHERE rr.reservation_id = r.id AND r.status != 'cancelled') - r.discount_cents
        - COALESCE((SELECT SUM(amount_cents) FROM payments WHERE reservation_id = r.id), 0) AS balance
      FROM reservations r WHERE r.id = ?
    `,
        )
        .get(id).balance;
    expect(balance("reservation-family")).toBe(0);
    expect(balance("reservation-installments")).toBe(0);
    expect(balance("reservation-discount")).toBe(0);
    expect(balance("reservation-early-departure")).toBe(-5000);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM payments WHERE reservation_id = 'reservation-installments'",
        )
        .get().count,
    ).toBe(3);
    expect(
      db
        .prepare("SELECT DISTINCT method FROM payments ORDER BY method")
        .all()
        .map((row) => row.method),
    ).toEqual(["card", "cash", "other", "transfer"]);
    expect(
      db
        .prepare(
          `SELECT rr.id FROM reservation_rooms rr
      JOIN reservations r ON r.id=rr.reservation_id
      JOIN reservation_room_nights n ON n.reservation_room_id = rr.id
      GROUP BY r.id HAVING r.discount_cents < 0 OR r.discount_cents > SUM(n.price_cents)`,
        )
        .all(),
    ).toEqual([]);
    expect(
      db
        .prepare(
          "SELECT check_in, check_out FROM reservations WHERE id = 'reservation-early-departure'",
        )
        .get(),
    ).toEqual({ check_in: "2026-10-05", check_out: "2026-10-06" });
    expect(
      db
        .prepare(
          `SELECT rr.id, r.status, COUNT(n.id) AS nights FROM reservation_rooms rr
      JOIN reservations r ON r.id=rr.reservation_id
      JOIN reservation_room_nights n ON n.reservation_room_id = rr.id
      WHERE rr.reservation_id = 'reservation-split-departure' GROUP BY rr.id ORDER BY rr.id`,
        )
        .all(),
    ).toEqual([
      { id: "line-split-departure-1", status: "checked_in", nights: 3 },
      { id: "line-split-departure-2", status: "checked_in", nights: 3 },
    ]);
    expect(
      db
        .prepare(
          `SELECT rr.id FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reservation_id
      JOIN reservation_room_nights n ON n.reservation_room_id = rr.id
      WHERE r.status = 'checked_out' GROUP BY rr.id
      HAVING COUNT(n.id) < 1 OR MIN(n.date) != r.check_in
      OR MAX(n.date) >= r.check_out`,
        )
        .all(),
    ).toEqual([]);
  });

  it("moves scenarios across month boundaries using UTC dates and leap days", () => {
    db.exec(buildResetSql("2028-02-28"));
    expect(
      db
        .prepare("SELECT check_in, check_out FROM reservations WHERE id = 'reservation-turnover'")
        .get(),
    ).toEqual({ check_in: "2028-03-01", check_out: "2028-03-04" });
    expect(
      db
        .prepare(
          "SELECT date FROM reservation_room_nights WHERE reservation_room_id = 'line-arrival-1' ORDER BY date",
        )
        .all(),
    ).toEqual([{ date: "2028-02-28" }, { date: "2028-02-29" }, { date: "2028-03-01" }]);
  });

  it("defaults to today in UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T20:30:00-08:00"));
    expect(referenceDate()).toBe("2027-01-01");
    db.exec(buildResetSql());
    expect(
      db.prepare("SELECT check_in FROM reservations WHERE id = 'reservation-arrival'").get()
        .check_in,
    ).toBe("2027-01-01");
  });

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-1-01",
    "not-a-date",
    "9999-12-31",
    "0000-01-01",
  ])("rejects an invalid reference or out-of-range scenario date: %s", (value) => {
    expect(() => buildResetSql(value)).toThrow("Date must be a valid UTC calendar date");
  });

  it.each([
    ["--remote"],
    ["--date=2026-02-30"],
    ["--date"],
    ["--date=2026-10-06", "--date=2026-10-07"],
  ])("rejects invalid CLI arguments before running Wrangler: %j", (...args) => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("scripts/seed-reset.mjs", backendDir)), ...args],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toBeTruthy();
    expect(result.stdout).toBe("");
  });
});
