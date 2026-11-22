/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";

const migrationsDir = new URL("../../drizzle/", import.meta.url);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8")) as {
  entries: { tag: string }[];
};
const roomRequests = journal.entries.findIndex(({ tag }) => tag === "0051_online_room_requests");

let db: DatabaseSync;

const applyMigrations = (entries: { tag: string }[]) => {
  for (const { tag } of entries)
    db.exec(`BEGIN;\n${readFileSync(new URL(`${tag}.sql`, migrationsDir), "utf8")}\n;COMMIT;`);
};

const nights = '[{"date":"2026-10-20","priceCents":10000,"adjustmentCents":0,"discountCents":0}]';

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  expect(roomRequests).toBeGreaterThan(0);
  applyMigrations(journal.entries.slice(0, roomRequests));
  db.exec(`INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
    VALUES ('type', 'Standard', 2, 10000, '2026-10-05')`);
});

afterEach(() => db.close());

it("keeps each saved one-room checkout and its quote as a stay of that one room", () => {
  db.prepare(`INSERT INTO public_checkouts (id, token_hash, room_type_id, check_in, check_out, adults,
      children, rate_plan, language, created_at)
    VALUES ('before', 'hash', 'type', '2026-10-20', '2026-10-21', 2, 1, 'flexible', 'es',
      '2026-10-05')`).run();
  db.prepare(`INSERT INTO quotes (id, room_type_id, check_in, check_out, adults, children, nights,
      terms, created_at, expires_at, checkout_id)
    VALUES ('quote', 'type', '2026-10-20', '2026-10-21', 2, 1, ?, '{"plan":"flexible"}',
      '2026-10-05T15:00:00Z', '2026-10-05T15:10:00Z', 'before')`).run(nights);

  applyMigrations(journal.entries.slice(roomRequests));

  const oneRoom = { roomTypeId: "type", adults: 2, children: 1 };
  const saved = db
    .prepare(
      `SELECT public_checkouts.rooms AS checkoutRooms, quotes.rooms AS quoteRooms
      FROM quotes JOIN public_checkouts ON public_checkouts.id = quotes.checkout_id`,
    )
    .all() as { checkoutRooms: string; quoteRooms: string }[];
  expect(saved.map((row) => [JSON.parse(row.checkoutRooms), JSON.parse(row.quoteRooms)])).toEqual([
    [[oneRoom], [{ ...oneRoom, nights: JSON.parse(nights) }]],
  ]);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
