/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

const migrationsDir = new URL("../../drizzle/", import.meta.url);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8")) as {
  entries: { tag: string }[];
};

let db: DatabaseSync;

function reservation(id: string, checkIn = "2026-10-05", checkOut = "2026-10-07") {
  db.prepare(`INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at)
    VALUES (?, ?, 'guest', ?, ?, '2026-10-05')`).run(id, id, checkIn, checkOut);
}

function line(id: string, roomId: string | null = null, status = "confirmed") {
  db.prepare("UPDATE reservations SET status = ? WHERE id = ?").run(status, id);
  db.prepare(`INSERT INTO reservation_rooms
    (id, reservation_id, room_type_id, room_id, adults, created_at)
    VALUES (?, ?, 'type', ?, 1, '2026-10-05')`).run(id, id, roomId);
}

function closure(id: string, roomId: string, starts = "2026-10-05", ends = "2026-10-07") {
  db.prepare(`INSERT INTO room_closures (id, room_id, starts, ends, created_at)
    VALUES (?, ?, ?, ?, '2026-10-05')`).run(id, roomId, starts, ends);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const entry of journal.entries) {
    db.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
  }
  db.exec(`
    INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
      VALUES ('type', 'Standard', 2, 10000, '2026-10-05');
    INSERT INTO rooms (id, number, room_type_id) VALUES ('room-101', '101', 'type'), ('room-102', '102', 'type');
    INSERT INTO guests (id, full_name, created_at) VALUES ('guest', 'Ada Lovelace', '2026-10-05');
  `);
  closure("existing", "room-102", "2026-11-01", "2026-11-02");
});

afterEach(() => db.close());

function changeType(roomId: string, typeId: string, today = "2026-10-31") {
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO property_write_context (id, property_date) VALUES (1, ?)").run(today);
    db.prepare("UPDATE rooms SET room_type_id = ? WHERE id = ?").run(typeId, roomId);
    db.exec("DELETE FROM property_write_context; COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

describe("property-date room type guards", () => {
  beforeEach(() => {
    db.exec(`INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
      VALUES ('other', 'Other', 2, 10000, '2026-10-31')`);
  });

  it("requires a write-local date rather than implicitly using SQLite UTC now", () => {
    expect(() => db.exec("UPDATE rooms SET room_type_id = 'other' WHERE id = 'room-101'")).toThrow(
      "property date context required",
    );
  });

  it("protects current and future assigned stays and releases them on their checkout date", () => {
    reservation("future", "2099-01-01", "2099-01-03");
    line("future", "room-102");
    expect(() => changeType("room-102", "other")).toThrow("room has an assigned stay");
    reservation("assigned", "2026-10-31", "2026-11-01");
    line("assigned", "room-101");
    expect(() => changeType("room-101", "other")).toThrow("room has an assigned stay");
    expect(() => changeType("room-101", "other", "2026-11-01")).not.toThrow();
    expect(db.prepare("SELECT * FROM property_write_context").all()).toEqual([]);
  });

  it("protects unassigned inventory reduced by closures through the property night", () => {
    closure("local-night", "room-102", "2026-10-31", "2026-11-01");
    reservation("unassigned", "2026-10-31", "2026-11-01");
    line("unassigned");
    expect(() => changeType("room-101", "other")).toThrow("no availability");
    expect(db.prepare("SELECT room_type_id FROM rooms WHERE id = 'room-101'").get()).toEqual({
      room_type_id: "type",
    });
    expect(db.prepare("SELECT * FROM property_write_context").all()).toEqual([]);
    changeType("room-101", "other", "2026-11-01");
  });

  it("upgrades the populated previous schema without changing saved date labels or timestamps", () => {
    const previous = new DatabaseSync(":memory:");
    try {
      previous.exec("PRAGMA foreign_keys = ON");
      const split = journal.entries.findIndex((entry) => entry.tag === "0003_property_calendar");
      expect(split).toBeGreaterThan(0);
      for (const entry of journal.entries.slice(0, split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      previous.exec(`
        INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
          VALUES ('type', 'Standard', 2, 10000, '2026-11-01T01:00:00Z'), ('other', 'Other', 2, 20000, '2026-11-01T01:00:00Z');
        INSERT INTO rooms VALUES ('room', '101', 'type'), ('closed', '102', 'type');
        INSERT INTO guests (id, full_name, created_at) VALUES ('guest', 'Ada', '2026-11-01T01:00:00Z');
        INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at)
          VALUES ('stay', 'LEGACY', 'guest', '2026-10-31', '2026-11-01', '2026-11-01T01:00:00Z');
        INSERT INTO reservation_rooms (id, reservation_id, room_type_id, room_id, adults, created_at)
          VALUES ('line', 'stay', 'type', 'room', 1, '2026-11-01T01:00:00Z');
        INSERT INTO reservation_room_nights VALUES ('night', 'line', '2026-10-31', 9000);
        INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at)
          VALUES ('payment', 'stay', 4000, 'cash', '2026-11-01', '2026-11-01T01:00:00Z');
        INSERT INTO room_closures (id, room_id, starts, ends, created_at)
          VALUES ('closure', 'closed', '2026-10-31', '2026-11-01', '2026-11-01T01:00:00Z');
        INSERT INTO room_type_rates VALUES ('rate', 'type', '2026-10-31', 12000);
      `);
      const tables = [
        "room_types",
        "rooms",
        "guests",
        "reservations",
        "reservation_rooms",
        "reservation_room_nights",
        "payments",
        "room_closures",
        "room_type_rates",
      ];
      const snapshot = () =>
        tables.map((table) => previous.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
      const before = snapshot();
      for (const entry of journal.entries.slice(split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      expect(snapshot()).toMatchObject(before);
      previous.exec("INSERT INTO property_write_context VALUES (1, '2026-10-31')");
      expect(() =>
        previous.exec("UPDATE rooms SET room_type_id = 'other' WHERE id = 'room'"),
      ).toThrow("room has an assigned stay");
      previous.exec("DELETE FROM property_write_context");
      expect(previous.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      previous.close();
    }
  });

  it("upgrades existing rooms to clean with no recorded change", () => {
    const previous = new DatabaseSync(":memory:");
    try {
      const split = journal.entries.findIndex((entry) => entry.tag === "0004_housekeeping_status");
      expect(split).toBeGreaterThan(0);
      for (const entry of journal.entries.slice(0, split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      previous.exec(`
        INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
          VALUES ('type', 'Standard', 2, 10000, '2026-11-01T01:00:00Z');
        INSERT INTO rooms VALUES ('room', '101', 'type');
      `);
      for (const entry of journal.entries.slice(split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      expect(previous.prepare("SELECT * FROM rooms").all()).toEqual([
        {
          id: "room",
          number: "101",
          room_type_id: "type",
          housekeeping_status: "clean",
          housekeeping_changed_at: null,
        },
      ]);
    } finally {
      previous.close();
    }
  });
});

describe("separate adult and child limits", () => {
  it("accepts both limits together and rejects excess adults or children on insert and update, including a zero-child limit", () => {
    reservation("family");
    db.exec(`INSERT INTO reservation_rooms
      (id, reservation_id, room_type_id, adults, children, created_at)
      VALUES ('family', 'family', 'type', 2, 2, '2026-10-05')`);
    for (const [adults, children] of [
      [3, 0],
      [1, 3],
      [0, 1],
      [1, -1],
    ]) {
      expect(() =>
        db
          .prepare("UPDATE reservation_rooms SET adults = ?, children = ? WHERE id = 'family'")
          .run(adults, children),
      ).toThrow("invalid occupancy");
      reservation("invalid");
      expect(() =>
        db
          .prepare(`INSERT INTO reservation_rooms
          (id, reservation_id, room_type_id, adults, children, created_at)
          VALUES ('invalid', 'invalid', 'type', ?, ?, '2026-10-05')`)
          .run(adults, children),
      ).toThrow("invalid occupancy");
      db.exec("DELETE FROM reservations WHERE id = 'invalid'");
    }
    expect(
      db.prepare("SELECT adults, children FROM reservation_rooms WHERE id = 'family'").get(),
    ).toEqual({ adults: 2, children: 2 });
    db.exec("UPDATE reservation_rooms SET adults = 1, children = 1 WHERE id = 'family'");
    db.exec("UPDATE reservation_rooms SET adults = 2, children = 0 WHERE id = 'family'");
    db.exec("UPDATE room_types SET max_children = 0 WHERE id = 'type'");
    expect(() => db.exec("UPDATE reservation_rooms SET children = 1 WHERE id = 'family'")).toThrow(
      "invalid occupancy",
    );
  });

  it("upgrades a populated previous schema without changing reservations, prices, or payments", () => {
    const previous = new DatabaseSync(":memory:");
    try {
      previous.exec("PRAGMA foreign_keys = ON");
      const split = journal.entries.findIndex((entry) => entry.tag === "0002_room_occupancy");
      expect(split).toBeGreaterThan(0);
      for (const entry of journal.entries.slice(0, split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      previous.exec(`
        INSERT INTO room_types VALUES ('legacy', 'Family', 4, 10000, '2026-10-05');
        INSERT INTO rooms VALUES ('legacy-room', '201', 'legacy');
        INSERT INTO guests (id, full_name, created_at) VALUES ('legacy-guest', 'Family Guest', '2026-10-05');
        INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at)
          VALUES ('legacy-stay', 'LEGACY', 'legacy-guest', '2026-10-05', '2026-10-06', '2026-10-05');
        INSERT INTO reservation_rooms (id, reservation_id, room_type_id, room_id, adults, children, created_at)
          VALUES ('legacy-line', 'legacy-stay', 'legacy', 'legacy-room', 1, 3, '2026-10-05');
        INSERT INTO reservation_room_nights VALUES ('legacy-night', 'legacy-line', '2026-10-05', 9000);
        INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at)
          VALUES ('legacy-payment', 'legacy-stay', 4000, 'cash', '2026-10-05', '2026-10-05');
      `);
      const tables = [
        "rooms",
        "guests",
        "reservations",
        "reservation_rooms",
        "reservation_room_nights",
        "payments",
      ];
      const snapshot = () =>
        tables.map((table) => previous.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
      const before = snapshot();
      for (const entry of journal.entries.slice(split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      expect(snapshot()).toMatchObject(before);
      expect(previous.prepare("SELECT max_occupancy, max_children FROM room_types").all()).toEqual([
        { max_occupancy: 4, max_children: 2 },
      ]);
      previous.exec("UPDATE reservations SET notes = 'Preserved' WHERE id = 'legacy-stay'");
      expect(() =>
        previous.exec(
          "UPDATE reservation_rooms SET room_type_id = room_type_id WHERE id = 'legacy-line'",
        ),
      ).toThrow("invalid occupancy");
      previous.exec(
        "UPDATE reservation_rooms SET adults = 4, children = 2 WHERE id = 'legacy-line'",
      );
      expect(previous.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      previous.close();
    }
  });
});

describe("closure-only room inventory", () => {
  it("includes every room in capacity and assignment", () => {
    reservation("first");
    line("first", "room-101");
    reservation("second");
    line("second", "room-102");
    reservation("third");
    expect(() => line("third")).toThrow("no availability");
  });

  it("subtracts closures from booking capacity and allows reopening-day arrivals", () => {
    closure("closed", "room-101");
    reservation("first");
    line("first", "room-102");
    reservation("second");
    expect(() => line("second")).toThrow("no availability");
    reservation("arrival", "2026-10-07", "2026-10-08");
    expect(() => line("arrival", "room-101")).not.toThrow();
  });

  it("checks capacity when reactivating a cancelled reservation", () => {
    closure("closed", "room-101");
    reservation("first");
    line("first");
    reservation("cancelled");
    line("cancelled", null, "cancelled");
    expect(() =>
      db.exec("UPDATE reservations SET status = 'confirmed' WHERE id = 'cancelled'"),
    ).toThrow("no availability");
  });

  it("checks capacity when moving a reservation into a closed range", () => {
    closure("closed", "room-101");
    reservation("first");
    line("first");
    reservation("moving", "2026-10-07", "2026-10-08");
    line("moving");
    expect(() =>
      db.exec("UPDATE reservations SET check_in = '2026-10-05' WHERE id = 'moving'"),
    ).toThrow("no availability");
  });

  it("prevents closing inventory consumed by unassigned reservations", () => {
    reservation("first");
    line("first");
    reservation("second");
    line("second");
    expect(() => closure("closed", "room-101")).toThrow("no availability");
  });

  it("checks capacity when extending a closure", () => {
    closure("closed", "room-101", "2026-10-07", "2026-10-08");
    reservation("first");
    line("first");
    reservation("second");
    line("second");
    expect(() =>
      db.exec("UPDATE room_closures SET starts = '2026-10-05' WHERE id = 'closed'"),
    ).toThrow("no availability");
  });

  it("allows a stay that covers non-overlapping bookings", () => {
    reservation("early", "2026-10-01", "2026-10-03");
    line("early", "room-101");
    reservation("late", "2026-10-05", "2026-10-07");
    line("late", "room-102");
    reservation("span", "2026-10-01", "2026-10-07");
    expect(() => line("span")).not.toThrow();
  });

  it("rejects a stay whose busiest night is already full", () => {
    reservation("early", "2026-10-01", "2026-10-04");
    line("early");
    reservation("late", "2026-10-02", "2026-10-05");
    line("late");
    reservation("span", "2026-10-01", "2026-10-05");
    expect(() => line("span")).toThrow("no availability");
  });

  it("counts a checked-out line over its final saved dates", () => {
    reservation("left", "2026-10-05", "2026-10-07");
    line("left", "room-101", "checked_out");
    reservation("stay", "2026-10-05", "2026-10-07");
    line("stay", "room-102");
    reservation("another", "2026-10-05", "2026-10-07");
    expect(() => line("another", "room-101")).toThrow("no availability");
  });

  it("rejects a closure overlapping the final dates of a checked-out stay", () => {
    reservation("left", "2026-10-05", "2026-10-07");
    line("left", "room-101", "checked_out");
    expect(() => closure("after", "room-101")).toThrow("closure overlaps stay");
  });

  it("rejects a room type change that would overbook a future night", () => {
    db.exec(`INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
      VALUES ('deluxe', 'Deluxe', 2, 20000, '2026-10-05')`);
    reservation("early", "2099-01-01", "2099-01-03");
    line("early");
    reservation("late", "2099-01-05", "2099-01-07");
    line("late");
    expect(() => changeType("room-101", "deluxe")).not.toThrow();
    changeType("room-101", "type");
    reservation("overlap", "2099-01-01", "2099-01-03");
    line("overlap");
    expect(() => changeType("room-101", "deluxe")).toThrow("no availability");
  });

  it("keeps assignment and closure overlap protections", () => {
    closure("closed", "room-101");
    reservation("first");
    line("first");
    expect(() =>
      db.exec("UPDATE reservation_rooms SET room_id = 'room-101' WHERE id = 'first'"),
    ).toThrow("room closed");
    expect(() =>
      db.exec(
        "UPDATE room_closures SET starts = '2026-11-01', ends = '2026-11-02' WHERE id = 'closed'",
      ),
    ).not.toThrow();
    db.exec("UPDATE reservation_rooms SET room_id = 'room-101' WHERE id = 'first'");
    expect(() => closure("overlap", "room-101")).toThrow("closure overlaps stay");
  });
});

describe("staying guest assignment", () => {
  it("rejects a reserved room belonging to a different reservation on insert and update", () => {
    reservation("first");
    line("first", "room-101");
    reservation("second", "2026-10-07", "2026-10-09");
    expect(() =>
      db.exec(`INSERT INTO reservation_guests (id,reservation_id,reservation_room_id,full_name,created_at)
        VALUES ('wrong','second','first','Test Guest','2026-10-05')`),
    ).toThrow("guest room must belong to this reservation");
    db.exec(`INSERT INTO reservation_guests (id,reservation_id,reservation_room_id,full_name,created_at)
      VALUES ('valid','first','first','Test Guest','2026-10-05')`);
    expect(() =>
      db.exec("UPDATE reservation_guests SET reservation_id='second' WHERE id='valid'"),
    ).toThrow("guest room must belong to this reservation");
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});

describe("cancellation charges", () => {
  it("adds cancellation charges without changing existing data and allows one active cancellation", () => {
    const previous = new DatabaseSync(":memory:");
    try {
      previous.exec("PRAGMA foreign_keys = ON");
      const split = journal.entries.findIndex((entry) => entry.tag === "0007_cancellation_charges");
      expect(split).toBeGreaterThan(0);
      for (const entry of journal.entries.slice(0, split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      previous.exec(`
        INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
          VALUES ('legacy', 'Double', 2, 10000, '2026-10-05');
        INSERT INTO rooms (id, number, room_type_id) VALUES ('legacy-room', '201', 'legacy');
        INSERT INTO guests (id, full_name, created_at) VALUES ('legacy-guest', 'Ada Lovelace', '2026-10-05');
        INSERT INTO reservations (id, code, guest_id, status, cancelled_at, cancellation_reason, check_in, check_out, created_at)
          VALUES ('cancelled', 'OLD1', 'legacy-guest', 'cancelled', '2026-10-06T12:00:00.000Z', 'Plans changed', '2026-10-08', '2026-10-10', '2026-10-05'),
                 ('active', 'OLD2', 'legacy-guest', 'confirmed', NULL, NULL, '2026-10-08', '2026-10-10', '2026-10-05');
        INSERT INTO reservation_rooms (id, reservation_id, room_type_id, adults, created_at)
          VALUES ('cancelled-line', 'cancelled', 'legacy', 1, '2026-10-05'), ('active-line', 'active', 'legacy', 1, '2026-10-05');
        INSERT INTO reservation_room_nights VALUES ('cancelled-night', 'cancelled-line', '2026-10-08', 9000);
        INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at)
          VALUES ('cancelled-payment', 'cancelled', 4000, 'cash', '2026-10-05', '2026-10-05');
        INSERT INTO "user" (id, name, email, username, role, created_at, updated_at)
          VALUES ('staff', 'Staff', 'staff@example.test', 'staff', 'staff', 0, 0);
      `);
      const tables = ["reservations", "reservation_rooms", "reservation_room_nights", "payments"];
      const snapshot = () =>
        tables.map((table) => previous.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
      const before = snapshot();
      previous.exec(
        readFileSync(new URL(`${journal.entries[split].tag}.sql`, migrationsDir), "utf8"),
      );
      expect(snapshot()).toMatchObject(before);
      expect(previous.prepare("SELECT * FROM reservation_cancellations").all()).toEqual([]);
      expect(previous.prepare("SELECT * FROM cancellation_waivers").all()).toEqual([]);

      const cancellation = previous.prepare(`INSERT INTO reservation_cancellations
        (id, reservation_id, recorded_at, policy_charge_cents, account_id, restored_at)
        VALUES (?, 'active', '2026-10-07T12:00:00.000Z', ?, 'staff', ?)`);
      cancellation.run("restored", 9000, "2026-10-07T13:00:00.000Z");
      cancellation.run("current", 9000, null);
      expect(() => cancellation.run("duplicate", 9000, null)).toThrow("UNIQUE");
      expect(() => cancellation.run("negative", -1, "2026-10-07T13:00:00.000Z")).toThrow(
        "reservation_cancellations_charge",
      );
      const waiver = previous.prepare(`INSERT INTO cancellation_waivers
        (id, cancellation_id, amount_cents, reason, recorded_at, account_id)
        VALUES (?, 'current', ?, 'Goodwill', '2026-10-07T14:00:00.000Z', ?)`);
      waiver.run("waiver", 3000, "staff");
      expect(() => waiver.run("zero", 0, "staff")).toThrow("cancellation_waivers_amount");
      expect(() => waiver.run("unknown", 1, "nobody")).toThrow("FOREIGN KEY");
      expect(previous.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      previous.close();
    }
  });

  it("reads every cancellation recorded before no-show outcomes as a cancellation, keeping its charge", () => {
    const previous = new DatabaseSync(":memory:");
    try {
      previous.exec("PRAGMA foreign_keys = ON");
      const split = journal.entries.findIndex((entry) => entry.tag === "0008_no_show_outcome");
      expect(split).toBeGreaterThan(0);
      for (const entry of journal.entries.slice(0, split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      previous.exec(`
        INSERT INTO guests (id, full_name, created_at) VALUES ('guest', 'Ada Lovelace', '2026-10-05');
        INSERT INTO reservations (id, code, guest_id, status, cancelled_at, check_in, check_out, created_at)
          VALUES ('cancelled', 'OLD1', 'guest', 'cancelled', '2026-10-06T12:00:00.000Z', '2026-10-08', '2026-10-10', '2026-10-05');
        INSERT INTO "user" (id, name, email, username, role, created_at, updated_at)
          VALUES ('staff', 'Staff', 'staff@example.test', 'staff', 'staff', 0, 0);
        INSERT INTO reservation_cancellations (id, reservation_id, recorded_at, free_until, policy_charge_cents, account_id, restored_at)
          VALUES ('restored', 'cancelled', '2026-10-06T11:00:00.000Z', '2026-10-06T20:00:00.000Z', 0, 'staff', '2026-10-06T11:30:00.000Z'),
                 ('current', 'cancelled', '2026-10-06T12:00:00.000Z', '2026-10-06T20:00:00.000Z', 9000, 'staff', NULL);
        INSERT INTO cancellation_waivers (id, cancellation_id, amount_cents, reason, recorded_at, account_id)
          VALUES ('waiver', 'current', 3000, 'Goodwill', '2026-10-06T13:00:00.000Z', 'staff');
      `);
      const rows = () =>
        previous.prepare("SELECT * FROM reservation_cancellations ORDER BY id").all();
      const before = rows();
      const waivers = previous.prepare("SELECT * FROM cancellation_waivers").all();
      previous.exec(
        readFileSync(new URL(`${journal.entries[split].tag}.sql`, migrationsDir), "utf8"),
      );
      expect(rows()).toEqual(before.map((row) => ({ ...row, outcome: "cancelled" })));
      expect(previous.prepare("SELECT * FROM cancellation_waivers").all()).toEqual(waivers);
      expect(previous.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      previous.close();
    }
  });
});

describe("refunds", () => {
  it("adds refunds without changing existing money and keeps each outcome's record complete", () => {
    const previous = new DatabaseSync(":memory:");
    try {
      previous.exec("PRAGMA foreign_keys = ON");
      const split = journal.entries.findIndex((entry) => entry.tag === "0009_refunds");
      expect(split).toBeGreaterThan(0);
      for (const entry of journal.entries.slice(0, split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      previous.exec(`
        INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
          VALUES ('legacy', 'Double', 2, 10000, '2026-10-05');
        INSERT INTO guests (id, full_name, created_at) VALUES ('guest', 'Ada Lovelace', '2026-10-05');
        INSERT INTO reservations (id, code, guest_id, status, cancelled_at, check_in, check_out, created_at)
          VALUES ('cancelled', 'OLD1', 'guest', 'cancelled', '2026-10-06T12:00:00.000Z', '2026-10-08', '2026-10-10', '2026-10-05');
        INSERT INTO reservation_rooms (id, reservation_id, room_type_id, adults, created_at)
          VALUES ('line', 'cancelled', 'legacy', 1, '2026-10-05');
        INSERT INTO reservation_room_nights VALUES ('night', 'line', '2026-10-08', 9000);
        INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at)
          VALUES ('payment', 'cancelled', 30000, 'cash', '2026-10-05', '2026-10-05');
        INSERT INTO "user" (id, name, email, username, role, created_at, updated_at)
          VALUES ('staff', 'Staff', 'staff@example.test', 'staff', 'staff', 0, 0);
        INSERT INTO reservation_cancellations (id, reservation_id, outcome, recorded_at, policy_charge_cents, account_id)
          VALUES ('current', 'cancelled', 'cancelled', '2026-10-06T12:00:00.000Z', 9000, 'staff');
      `);
      const tables = [
        "reservations",
        "reservation_rooms",
        "reservation_room_nights",
        "payments",
        "reservation_cancellations",
      ];
      const snapshot = () =>
        tables.map((table) => previous.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
      const before = snapshot();
      previous.exec(
        readFileSync(new URL(`${journal.entries[split].tag}.sql`, migrationsDir), "utf8"),
      );
      expect(snapshot()).toMatchObject(before);
      expect(previous.prepare("SELECT * FROM refunds").all()).toEqual([]);

      const refund = previous.prepare(`INSERT INTO refunds
        (id, reservation_id, payment_id, amount_cents, method, reason, status, requested_at,
          requested_account_id, resolved_at, resolved_account_id, refund_date, completion_reference, failure_reason)
        VALUES (?, 'cancelled', ?, ?, 'cash', 'Cancelled stay', ?, '2026-10-07T12:00:00.000Z', 'staff', ?, ?, ?, ?, ?)`);
      const resolved = ["2026-10-07T13:00:00.000Z", "staff"] as const;
      refund.run("requested", "payment", 1000, "requested", null, null, null, null, null);
      refund.run(
        "completed",
        "payment",
        1000,
        "completed",
        ...resolved,
        "2026-10-07",
        "OP-1",
        null,
      );
      refund.run("failed", "payment", 1000, "failed", ...resolved, null, null, "Wrong account");
      for (const [id, status, date, reference, reason] of [
        ["no-reference", "completed", "2026-10-07", null, null],
        ["no-reason", "failed", null, null, null],
        ["unresolved", "requested", "2026-10-07", null, null],
        ["unknown", "pending", null, null, null],
      ] as const)
        expect(() =>
          refund.run(id, "payment", 1000, status, ...resolved, date, reference, reason),
        ).toThrow("refunds_outcome");
      expect(() =>
        refund.run("zero", "payment", 0, "requested", null, null, null, null, null),
      ).toThrow("refunds_amount");
      expect(() =>
        refund.run("orphan", "missing", 1000, "requested", null, null, null, null, null),
      ).toThrow("FOREIGN KEY");
      expect(() => previous.exec("DELETE FROM payments WHERE id = 'payment'")).toThrow(
        "FOREIGN KEY",
      );
      expect(previous.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      previous.close();
    }
  });
});

describe("optional refund completion reference", () => {
  it("rebuilds refunds keeping every row, index and guard while allowing a completion without a reference", () => {
    const previous = new DatabaseSync(":memory:");
    try {
      previous.exec("PRAGMA foreign_keys = ON");
      const split = journal.entries.findIndex(
        (entry) => entry.tag === "0015_optional_refund_reference",
      );
      expect(split).toBeGreaterThan(0);
      for (const entry of journal.entries.slice(0, split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      previous.exec(`
        INSERT INTO guests (id, full_name, created_at) VALUES ('guest', 'Ada Lovelace', '2026-10-05');
        INSERT INTO reservations (id, code, guest_id, status, cancelled_at, check_in, check_out, created_at)
          VALUES ('cancelled', 'OLD1', 'guest', 'cancelled', '2026-10-06T12:00:00.000Z', '2026-10-08', '2026-10-10', '2026-10-05');
        INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at, culqi_charge_id)
          VALUES ('cash', 'cancelled', 30000, 'cash', '2026-10-05', '2026-10-05', NULL),
                 ('card', 'cancelled', 20000, 'card', '2026-10-05', '2026-10-05', 'chr_1');
        INSERT INTO "user" (id, name, email, username, role, created_at, updated_at)
          VALUES ('staff', 'Staff', 'staff@example.test', 'staff', 'staff', 0, 0);
        INSERT INTO refunds (id, reservation_id, payment_id, amount_cents, method, reference, reason, status,
            requested_at, requested_account_id, resolved_at, resolved_account_id, refund_date,
            completion_reference, failure_reason, culqi_charge_id, culqi_refund_id)
          VALUES ('requested', 'cancelled', 'cash', 1000, 'transfer', 'OP-1', 'Cancelled stay', 'requested',
                    '2026-10-07T12:00:00.000Z', 'staff', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
                 ('completed', 'cancelled', 'cash', 2000, 'cash', NULL, 'Cancelled stay', 'completed',
                    '2026-10-07T12:00:00.000Z', 'staff', '2026-10-07T13:00:00.000Z', 'staff', '2026-10-07', 'OP-2', NULL, NULL, NULL),
                 ('failed', 'cancelled', 'cash', 3000, 'transfer', NULL, 'Cancelled stay', 'failed',
                    '2026-10-07T12:00:00.000Z', 'staff', '2026-10-07T13:00:00.000Z', 'staff', NULL, NULL, 'Wrong account', NULL, NULL),
                 ('culqi', 'cancelled', 'card', 4000, 'card', NULL, 'Cancelled stay', 'completed',
                    '2026-10-07T12:00:00.000Z', 'staff', '2026-10-07T13:00:00.000Z', 'staff', '2026-10-07', 'ref_1', NULL, 'chr_1', 'ref_1');
      `);
      const rows = () => previous.prepare("SELECT * FROM refunds ORDER BY id").all();
      const schema = () =>
        previous
          .prepare(
            "SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
          )
          .all();
      const before = rows();
      const objects = schema();
      previous.exec("BEGIN");
      previous.exec(
        readFileSync(new URL(`${journal.entries[split].tag}.sql`, migrationsDir), "utf8"),
      );
      previous.exec("COMMIT");
      expect(rows()).toEqual(before);
      expect(schema()).toEqual(objects);
      expect(
        previous
          .prepare(
            "SELECT name FROM sqlite_master WHERE tbl_name = 'refunds' AND type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all()
          .map(({ name }) => name),
      ).toEqual(["refunds_date", "refunds_payment", "refunds_reservation"]);
      expect(previous.prepare("PRAGMA foreign_key_list(refunds)").all()).toHaveLength(4);
      expect(
        previous.prepare("SELECT sql FROM sqlite_master WHERE name = 'refunds'").get()?.sql,
      ).not.toContain("__new_refunds");

      const refund = previous.prepare(`INSERT INTO refunds
        (id, reservation_id, payment_id, amount_cents, method, reason, status, requested_at,
          requested_account_id, resolved_at, resolved_account_id, refund_date, completion_reference, failure_reason)
        VALUES (?, 'cancelled', ?, ?, 'cash', 'Cancelled stay', ?, '2026-10-08T12:00:00.000Z', 'staff', ?, ?, ?, ?, ?)`);
      const resolved = ["2026-10-08T13:00:00.000Z", "staff"] as const;
      refund.run("handed-back", "cash", 1000, "completed", ...resolved, "2026-10-08", null, null);
      for (const [id, status, date, reference, reason] of [
        ["undated", "completed", null, null, null],
        ["no-reason", "failed", null, null, null],
        ["failed-reference", "failed", null, "OP-3", "Wrong account"],
        ["unresolved", "requested", "2026-10-08", null, null],
      ] as const)
        expect(() =>
          refund.run(id, "cash", 1000, status, ...resolved, date, reference, reason),
        ).toThrow("refunds_outcome");
      expect(() =>
        refund.run("zero", "cash", 0, "requested", null, null, null, null, null),
      ).toThrow("refunds_amount");
      expect(() =>
        refund.run("orphan", "missing", 1000, "requested", null, null, null, null, null),
      ).toThrow("FOREIGN KEY");
      expect(() => previous.exec("DELETE FROM payments WHERE id = 'cash'")).toThrow("FOREIGN KEY");
      expect(previous.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      previous.close();
    }
  });
});

describe("free-cancellation days", () => {
  it("adds free-cancellation days from accepted hours and converts recorded deadlines to dates", () => {
    const previous = new DatabaseSync(":memory:");
    try {
      previous.exec("PRAGMA foreign_keys = ON");
      const split = journal.entries.findIndex(
        (entry) => entry.tag === "0011_free_cancellation_days",
      );
      expect(split).toBeGreaterThan(0);
      for (const entry of journal.entries.slice(0, split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      previous.exec(`
        INSERT INTO guests (id, full_name, created_at) VALUES ('guest', 'Ada Lovelace', '2026-10-05');
        INSERT INTO reservations (id, code, guest_id, status, cancelled_at, check_in, check_out, created_at)
          VALUES ('flexible', 'OLD1', 'guest', 'cancelled', '2026-10-06T12:00:00.000Z', '2026-10-08', '2026-10-10', '2026-10-05');
        INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at, rate_plan,
            cancellation_charge_basis, free_cancellation_hours, payment_schedule, price_adjustment_percent)
          VALUES ('non-refundable', 'OLD2', 'guest', '2026-10-08', '2026-10-10', '2026-10-05', 'non_refundable',
            'final_total', NULL, 'full_upfront', -10);
        INSERT INTO "user" (id, name, email, username, role, created_at, updated_at)
          VALUES ('staff', 'Staff', 'staff@example.test', 'staff', 'staff', 0, 0);
        INSERT INTO reservation_cancellations (id, reservation_id, outcome, recorded_at, free_until, policy_charge_cents, account_id, restored_at)
          VALUES ('restored', 'flexible', 'cancelled', '2026-10-06T11:00:00.000Z', '2026-10-06T20:00:00.000Z', 0, 'staff', '2026-10-06T11:30:00.000Z'),
                 ('no-show', 'flexible', 'no_show', '2026-10-09T12:00:00.000Z', NULL, 9000, 'staff', NULL);
      `);
      const reservations = () =>
        previous.prepare("SELECT * FROM reservations ORDER BY id").all() as Record<
          string,
          unknown
        >[];
      const cancellations = () =>
        previous.prepare("SELECT * FROM reservation_cancellations ORDER BY id").all();
      const before = reservations();
      const recorded = cancellations();
      previous.exec(
        readFileSync(new URL(`${journal.entries[split].tag}.sql`, migrationsDir), "utf8"),
      );
      expect(reservations()).toEqual(
        before.map((row) => ({
          ...row,
          free_cancellation_days: row.free_cancellation_hours === null ? null : 2,
        })),
      );
      expect(cancellations()).toEqual([
        recorded[0],
        { ...(recorded[1] as object), free_until: "2026-10-06" },
      ]);
      expect(previous.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      previous.close();
    }
  });
});

describe("night price breakdown", () => {
  it("upgrades saved nights to no adjustment or discount without changing their prices", () => {
    const previous = new DatabaseSync(":memory:");
    try {
      previous.exec("PRAGMA foreign_keys = ON");
      const split = journal.entries.findIndex(
        (entry) => entry.tag === "0010_night_price_breakdown",
      );
      expect(split).toBeGreaterThan(0);
      for (const entry of journal.entries.slice(0, split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      previous.exec(`
        INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
          VALUES ('legacy', 'Double', 2, 10000, '2026-10-05');
        INSERT INTO rooms (id, number, room_type_id) VALUES ('legacy-room', '201', 'legacy');
        INSERT INTO guests (id, full_name, created_at) VALUES ('guest', 'Ada Lovelace', '2026-10-05');
        INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at)
          VALUES ('stay', 'OLD1', 'guest', '2026-10-08', '2026-10-10', '2026-10-05');
        INSERT INTO reservation_rooms (id, reservation_id, room_type_id, adults, created_at)
          VALUES ('line', 'stay', 'legacy', 1, '2026-10-05');
        INSERT INTO reservation_room_nights VALUES ('first', 'line', '2026-10-08', 9000), ('second', 'line', '2026-10-09', 12000);
      `);
      for (const entry of journal.entries.slice(split))
        previous.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
      expect(
        previous
          .prepare(
            "SELECT id, price_cents, adjustment_cents, discount_cents FROM reservation_room_nights ORDER BY id",
          )
          .all(),
      ).toEqual([
        { id: "first", price_cents: 9000, adjustment_cents: 0, discount_cents: 0 },
        { id: "second", price_cents: 12000, adjustment_cents: 0, discount_cents: 0 },
      ]);
    } finally {
      previous.close();
    }
  });

  it("rejects a negative night price or discount on insert and update", () => {
    reservation("stay");
    line("stay");
    const insert = db.prepare(`INSERT INTO reservation_room_nights
      (id, reservation_room_id, date, price_cents, adjustment_cents, discount_cents)
      VALUES (?, 'stay', ?, ?, ?, ?)`);
    expect(() => insert.run("negative", "2026-10-05", -1, 0, 0)).toThrow("invalid night price");
    expect(() => insert.run("over", "2026-10-05", -1000, 0, 11000)).toThrow("invalid night price");
    expect(() => insert.run("negative-discount", "2026-10-05", 10000, 0, -1)).toThrow(
      "invalid night price",
    );
    insert.run("free", "2026-10-05", 0, 0, 10000);
    insert.run("reduced", "2026-10-06", 9000, -1000, 0);
    expect(() =>
      db.exec("UPDATE reservation_room_nights SET price_cents = -1 WHERE id = 'free'"),
    ).toThrow("invalid night price");
    expect(() =>
      db.exec("UPDATE reservation_room_nights SET discount_cents = -1 WHERE id = 'reduced'"),
    ).toThrow("invalid night price");
  });
});
