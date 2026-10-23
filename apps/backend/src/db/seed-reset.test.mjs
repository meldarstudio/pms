import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { buildResetSql } from "../../scripts/seed-data.mjs";

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
});

describe("local dummy data reset", () => {
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
      UPDATE rooms SET housekeeping_status = 'clean', housekeeping_changed_at = NULL;
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
      INSERT INTO rooms (id, number, room_type_id) VALUES ('custom', '999', 'custom');
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
    const days = db
      .prepare(`
      WITH RECURSIVE days(day) AS (
        SELECT date('2026-10-06', '-45 days')
        UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < date('2026-10-06', '+44 days')
      ) SELECT day FROM days
    `)
      .all();
    for (const { day } of days) {
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
    // Vacated today and not yet re-occupied; 106 and 204 already have their next guest.
    expect(
      db
        .prepare("SELECT number FROM rooms WHERE housekeeping_status = 'dirty' ORDER BY number")
        .all()
        .map(({ number }) => number),
    ).toEqual(["102", "103", "107", "111", "203", "206", "303", "304"]);
  });

  it.each([["--remote"]])("refuses remote reset before running Wrangler: %j", (...args) => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("scripts/seed-reset.mjs", backendDir)), ...args],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown option: --remote");
    expect(result.stdout).toBe("");
  });
});
