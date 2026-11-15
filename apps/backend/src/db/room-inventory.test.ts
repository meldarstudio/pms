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
});

describe("closure-only room inventory", () => {
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

  it.each(["cancelled", "no_show", "unfulfilled"])(
    "lets a %s reservation keep its room without blocking a type change, closure, or rebooking",
    (status) => {
      db.exec(`INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
        VALUES ('other', 'Other', 2, 10000, '2026-10-31')`);
      reservation("released", "2026-11-05", "2026-11-07");
      line("released", "room-101", status);
      expect(() => changeType("room-101", "other")).not.toThrow();
      changeType("room-101", "type");
      expect(() => closure("repairs", "room-101", "2026-11-05", "2026-11-06")).not.toThrow();
      db.exec("DELETE FROM room_closures WHERE id = 'repairs'");
      reservation("rebooked", "2026-11-05", "2026-11-07");
      expect(() => line("rebooked", "room-101")).not.toThrow();
    },
  );
});

describe("night price breakdown", () => {
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
