import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const dir = new URL("../../drizzle/", import.meta.url);
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", dir), "utf8")) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries) db.exec(readFileSync(new URL(`${tag}.sql`, dir), "utf8"));
});

afterEach(() => db.close());

it("creates the current schema without legacy financial and history tables", () => {
  expect(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => row.name),
  ).toEqual([
    "guests",
    "payments",
    "reservation_guests",
    "reservation_requests",
    "reservation_room_nights",
    "reservation_rooms",
    "reservations",
    "room_closures",
    "room_type_rates",
    "room_types",
    "rooms",
  ]);
  for (const table of ["guests", "reservation_guests"]) {
    const columns = db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name);
    expect(columns).toContain("full_name");
    expect(columns).not.toContain("first_name");
    expect(columns).not.toContain("last_name");
  }
  const reservationColumns = db
    .prepare("PRAGMA table_info(reservations)")
    .all()
    .map((row) => row.name);
  expect(reservationColumns).toContain("check_in");
  expect(reservationColumns).toContain("check_out");
  expect(reservationColumns).not.toContain("actual_arrival");
  expect(reservationColumns).not.toContain("actual_departure");
});

it("rejects a staying guest assigned to a different reservation", () => {
  db.exec(`
    INSERT INTO room_types VALUES ('t','Standard',2,10000,'2026-10-10');
    INSERT INTO rooms VALUES ('room','101','t');
    INSERT INTO guests (id,full_name,created_at) VALUES ('g','Ada Lovelace','2026-10-10');
    INSERT INTO reservations (id,code,guest_id,check_in,check_out,created_at)
      VALUES ('a','A','g','2026-10-10','2026-10-12','2026-10-10'),
      ('b','B','g','2026-10-12','2026-10-14','2026-10-10');
    INSERT INTO reservation_rooms (id,reservation_id,room_type_id,adults,created_at)
      VALUES ('line','a','t',1,'2026-10-10');
  `);
  expect(() =>
    db.exec(`INSERT INTO reservation_guests (id,reservation_id,reservation_room_id,full_name,created_at)
    VALUES ('wrong','b','line','Test Guest','2026-10-10')`),
  ).toThrow("guest room must belong to this reservation");
  db.exec(`INSERT INTO reservation_guests (id,reservation_id,reservation_room_id,full_name,created_at)
    VALUES ('valid','a','line','Test Guest','2026-10-10')`);
  expect(() =>
    db.exec("UPDATE reservation_guests SET reservation_id='b' WHERE id='valid'"),
  ).toThrow("guest room must belong to this reservation");
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
