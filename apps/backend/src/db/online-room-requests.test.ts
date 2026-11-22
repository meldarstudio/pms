/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";

const migrationsDir = new URL("../../drizzle/", import.meta.url);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8")) as {
  entries: { tag: string }[];
};
const migration = (tag: string) => readFileSync(new URL(`${tag}.sql`, migrationsDir), "utf8");
const roomRequests = journal.entries.findIndex(({ tag }) => tag === "0051_online_room_requests");

let db: DatabaseSync;

const nights = '[{"date":"2026-10-20","priceCents":10000,"adjustmentCents":0,"discountCents":0}]';

function insertOneRoomCheckout(id: string) {
  db.prepare(`INSERT INTO public_checkouts (id, token_hash, room_type_id, check_in, check_out, adults,
      children, rate_plan, language, created_at)
    VALUES (?, ?, 'type', '2026-10-20', '2026-10-21', 2, 1, 'flexible', 'es', '2026-10-05')`).run(
    id,
    `hash-${id}`,
  );
  db.prepare(`INSERT INTO quotes (id, room_type_id, check_in, check_out, adults, children, nights,
      terms, created_at, expires_at, checkout_id)
    VALUES (?, 'type', '2026-10-20', '2026-10-21', 2, 1, ?, '{"plan":"flexible"}',
      '2026-10-05T15:00:00Z', '2026-10-05T15:10:00Z', ?)`).run(`quote-${id}`, nights, id);
}

const rooms = (table: "public_checkouts" | "quotes", id: string) =>
  JSON.parse(
    (db.prepare(`SELECT rooms FROM ${table} WHERE id = ?`).get(id) as { rooms: string }).rooms,
  ) as unknown;

const oneRoom = { roomTypeId: "type", adults: 2, children: 1 };

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  expect(roomRequests).toBeGreaterThan(0);
  for (const entry of journal.entries.slice(0, roomRequests)) db.exec(migration(entry.tag));
  db.exec(`INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
    VALUES ('type', 'Standard', 2, 10000, '2026-10-05')`);
});

afterEach(() => db.close());

it("keeps each saved one-room checkout and quote as a stay of that one room", () => {
  insertOneRoomCheckout("before");

  for (const entry of journal.entries.slice(roomRequests)) db.exec(migration(entry.tag));

  expect(rooms("public_checkouts", "before")).toEqual([oneRoom]);
  expect(rooms("quotes", "quote-before")).toEqual([{ ...oneRoom, nights: JSON.parse(nights) }]);
});

it("gives a checkout written by the previous Worker after the migration its one room", () => {
  for (const entry of journal.entries.slice(roomRequests)) db.exec(migration(entry.tag));

  insertOneRoomCheckout("during-release");

  expect(rooms("public_checkouts", "during-release")).toEqual([oneRoom]);
  expect(rooms("quotes", "quote-during-release")).toEqual([
    { ...oneRoom, nights: JSON.parse(nights) },
  ]);
});
