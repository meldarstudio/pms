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
    INSERT INTO rooms VALUES ('room-101', '101', 'type'), ('room-102', '102', 'type');
    INSERT INTO guests (id, full_name, created_at) VALUES ('guest', 'Ada Lovelace', '2026-10-05');
  `);
  closure("existing", "room-102", "2026-11-01", "2026-11-02");
});

afterEach(() => db.close());

describe("separate adult and child limits", () => {
  it("accepts both limits together and rejects excess adults or children on insert and update", () => {
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
  });

  it("enforces a zero-child limit without reducing the adult allowance", () => {
    db.exec("UPDATE room_types SET max_children = 0 WHERE id = 'type'");
    reservation("adults");
    db.exec(`INSERT INTO reservation_rooms
      (id, reservation_id, room_type_id, adults, children, created_at)
      VALUES ('adults', 'adults', 'type', 2, 0, '2026-10-05')`);
    expect(() => db.exec("UPDATE reservation_rooms SET children = 1 WHERE id = 'adults'")).toThrow(
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
      expect(snapshot()).toEqual(before);
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
    expect(() => line("another", "room-101")).toThrow();
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
    expect(() =>
      db.exec(`UPDATE rooms SET room_type_id = 'deluxe' WHERE id = 'room-101'`),
    ).not.toThrow();
    db.exec(`UPDATE rooms SET room_type_id = 'type' WHERE id = 'room-101'`);
    reservation("overlap", "2099-01-01", "2099-01-03");
    line("overlap");
    expect(() => db.exec(`UPDATE rooms SET room_type_id = 'deluxe' WHERE id = 'room-101'`)).toThrow(
      "no availability",
    );
  });

  it("rejects a room type change while a future stay is assigned to that room", () => {
    db.exec(`INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
      VALUES ('deluxe', 'Deluxe', 2, 20000, '2026-10-05')`);
    reservation("assigned", "2099-01-01", "2099-01-03");
    line("assigned", "room-101");
    expect(() => db.exec(`UPDATE rooms SET room_type_id = 'deluxe' WHERE id = 'room-101'`)).toThrow(
      "room has an assigned stay",
    );
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
    expect(() => closure("overlap", "room-101")).toThrow(/closure overlaps stay|no availability/);
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
