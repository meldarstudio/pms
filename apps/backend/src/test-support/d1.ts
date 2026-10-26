/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL } from "node:url";
import app from "../index";
import type { Env } from "../env";
import type { AccountRole } from "../account-sql";
import { authEnv, PORTAL_ORIGIN, seedAccounts, signIn } from "./auth";

export type TestDb = {
  /** The migrated database, for seeding and for rows the API does not expose. */
  sqlite: DatabaseSync;
  /** Worker bindings for every request. Tests may change vars, then call signIn(). */
  env: Env["Bindings"];
  /** Call the real Hono app as the portal, with the current session unless signedIn is false. */
  request(
    path: string,
    method?: string,
    body?: unknown,
    options?: { signedIn?: boolean },
  ): Promise<Response>;
  /** Replace the session, for example after moving the clock or to act as the owner. */
  signIn(role?: AccountRole): Promise<void>;
  /**
   * Run `hook` before each of the next `times` (default 1) write batches, any
   * batch with a statement that returns no rows, enters its transaction: after
   * the request's reads and preflight. Writes made while a hook runs are not
   * intercepted, so the hook can commit a competing request. Returns `stop`.
   */
  beforeCommit(hook: () => unknown, options?: { times?: number }): () => void;
  close(): void;
};

type Statement = ReturnType<typeof statement>;

const migrations = new URL("../../drizzle/", import.meta.url);

// Run the actual Hono routes and Drizzle SQL against SQLite with D1-style batches.
function statement(sqlite: DatabaseSync, sql: string, params: SQLInputValue[] = []) {
  const reads = sqlite.prepare(sql).columns().length > 0;
  const execute = () => {
    if (reads) {
      // D1 batch results use column-name keys; duplicate join columns collapse.
      return { success: true, results: sqlite.prepare(sql).all(...params) };
    }
    sqlite.prepare(sql).run(...params);
    return { success: true, results: [] };
  };
  return {
    reads,
    execute,
    bind: (...values: SQLInputValue[]) => statement(sqlite, sql, values),
    raw: async () => {
      // The subquery gives duplicate join columns distinct names on Node 22.
      // Writes with RETURNING cannot be a subquery and have no joins.
      return sqlite
        .prepare(/^\s*(select|with)\b/i.test(sql) ? `SELECT * FROM (${sql})` : sql)
        .all(...params)
        .map((row) => Object.values(row));
    },
    run: async () => execute(),
    all: async () => ({ success: true, results: sqlite.prepare(sql).all(...params) }),
  };
}

/** A fresh database with every journal migration applied, staff and owner accounts, and a signed-in staff session. */
export async function createTestDb(): Promise<TestDb> {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrations), "utf8")) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries)
    sqlite.exec(readFileSync(new URL(`${tag}.sql`, migrations), "utf8"));

  const hooks: { run: () => unknown; times: number }[] = [];
  let hookRunning = false;
  // D1 runs one batch at a time, each as a transaction.
  let batchTail: Promise<unknown> = Promise.resolve();
  const transaction = (queries: Statement[]) => {
    const result = batchTail.then(() => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const query of queries) results.push(query.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    });
    batchTail = result.catch(() => {});
    return result;
  };
  const DB = {
    prepare: (sql: string) => statement(sqlite, sql),
    batch: async (queries: Statement[]) => {
      const hook = hooks[0];
      if (hook && !hookRunning && queries.some((query) => !query.reads)) {
        if (--hook.times <= 0) hooks.shift();
        hookRunning = true;
        try {
          await hook.run();
        } finally {
          hookRunning = false;
        }
      }
      return transaction(queries);
    },
  } as unknown as D1Database;

  await seedAccounts(sqlite);
  const env = authEnv(DB);
  let cookie = await signIn(env);
  return {
    sqlite,
    env,
    request: async (path, method = "GET", body, { signedIn = true } = {}) =>
      app.request(
        path,
        {
          method,
          headers: {
            origin: PORTAL_ORIGIN,
            ...(signedIn ? { cookie } : {}),
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        env,
      ),
    signIn: async (role) => {
      cookie = await signIn(env, role);
    },
    beforeCommit: (run, { times = 1 } = {}) => {
      const hook = { run, times };
      hooks.push(hook);
      return () => {
        const index = hooks.indexOf(hook);
        if (index >= 0) hooks.splice(index, 1);
      };
    },
    close: () => sqlite.close(),
  };
}

// Seeds below name the legacy and positional columns once, for rows the API
// cannot create directly (fixed IDs, histories, stays longer than the write limit).

export function seedRoomType(
  sqlite: DatabaseSync,
  type: { id: string; name: string; maxAdults: number; baseRateCents: number },
) {
  // max_occupancy is the legacy column behind maxAdults.
  sqlite
    .prepare(
      "INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at) VALUES (?, ?, ?, ?, '2026-10-10')",
    )
    .run(type.id, type.name, type.maxAdults, type.baseRateCents);
}

/** Rooms keyed by ID, with their room numbers. */
export function seedRooms(sqlite: DatabaseSync, roomTypeId: string, rooms: Record<string, string>) {
  const insert = sqlite.prepare("INSERT INTO rooms (id, number, room_type_id) VALUES (?, ?, ?)");
  for (const [id, number] of Object.entries(rooms)) insert.run(id, number, roomTypeId);
}

/**
 * A reservation with its own booking contact and one reserved room. Guest and
 * room-line IDs default to the reservation ID; `nightCents` adds a priced
 * night for each date in [checkIn, checkOut).
 */
export function seedReservation(
  sqlite: DatabaseSync,
  reservation: {
    id: string;
    code: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    createdAt: string;
    guestId?: string;
    lineId?: string;
    status?: string;
    roomTypeId?: string;
    roomId?: string | null;
    nightCents?: number;
  },
) {
  const {
    id,
    guestId = id,
    lineId = id,
    status = "confirmed",
    roomTypeId = "type",
    roomId = null,
  } = reservation;
  sqlite
    .prepare("INSERT INTO guests (id, full_name, created_at) VALUES (?, ?, ?)")
    .run(guestId, reservation.guestName, reservation.createdAt);
  sqlite
    .prepare(
      "INSERT INTO reservations (id, code, status, guest_id, check_in, check_out, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      reservation.code,
      status,
      guestId,
      reservation.checkIn,
      reservation.checkOut,
      reservation.createdAt,
    );
  sqlite
    .prepare(
      "INSERT INTO reservation_rooms (id, reservation_id, room_type_id, room_id, adults, children, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)",
    )
    .run(lineId, id, roomTypeId, roomId, reservation.createdAt);
  if (reservation.nightCents === undefined) return;
  const insertNight = sqlite.prepare(
    "INSERT INTO reservation_room_nights (id, reservation_room_id, date, price_cents) VALUES (?, ?, ?, ?)",
  );
  for (
    let date = new Date(`${reservation.checkIn}T00:00:00Z`);
    date < new Date(`${reservation.checkOut}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const label = date.toISOString().slice(0, 10);
    insertNight.run(`${lineId}-${label}`, lineId, label, reservation.nightCents);
  }
}
