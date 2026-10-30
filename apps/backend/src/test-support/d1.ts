/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL } from "node:url";
import { app } from "../index";
import type { Env } from "../env";
import type { AccountRole } from "../account-sql";
import { authEnv, PORTAL_ORIGIN, seedAccounts, signIn } from "./auth";

export type TestDb = {
  sqlite: DatabaseSync;
  env: Env["Bindings"];
  request(
    path: string,
    method?: string,
    body?: unknown,
    options?: { signedIn?: boolean },
  ): Promise<Response>;
  signIn(role?: AccountRole): Promise<void>;
  beforeCommit(hook: () => unknown, options?: { times?: number }): () => void;
  close(): void;
};

type Statement = ReturnType<typeof statement>;

const migrations = new URL("../../drizzle/", import.meta.url);

const D1_MAX_BOUND_PARAMETERS = 100;

function statement(sqlite: DatabaseSync, sql: string, params: SQLInputValue[] = []) {
  if (params.length > D1_MAX_BOUND_PARAMETERS)
    throw new Error(`too many SQL variables: ${params.length} exceeds D1's limit`);
  const reads = sqlite.prepare(sql).columns().length > 0;
  const execute = () => {
    if (reads) {
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
      return sqlite
        .prepare(/^\s*(select|with)\b/i.test(sql) ? `SELECT * FROM (${sql})` : sql)
        .all(...params)
        .map((row) => Object.values(row));
    },
    run: async () => execute(),
    all: async () => ({ success: true, results: sqlite.prepare(sql).all(...params) }),
  };
}

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

export function seedRoomType(
  sqlite: DatabaseSync,
  type: { id: string; name: string; maxAdults: number; baseRateCents: number },
) {
  sqlite
    .prepare(
      "INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at) VALUES (?, ?, ?, ?, '2026-10-10')",
    )
    .run(type.id, type.name, type.maxAdults, type.baseRateCents);
}

export function seedRooms(sqlite: DatabaseSync, roomTypeId: string, rooms: Record<string, string>) {
  const insert = sqlite.prepare("INSERT INTO rooms (id, number, room_type_id) VALUES (?, ?, ?)");
  for (const [id, number] of Object.entries(rooms)) insert.run(id, number, roomTypeId);
}

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
