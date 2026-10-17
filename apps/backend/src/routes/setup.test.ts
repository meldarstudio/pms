/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import app from "../index";
import type { Env } from "../env";
import { authEnv, signIn } from "../test-support/auth";

let sqlite: DatabaseSync;
let bindings: Env["Bindings"];
let cookie: string;

function statement(sql: string, params: SQLInputValue[] = []) {
  const execute = () => {
    const prepared = sqlite.prepare(sql);
    return {
      success: true,
      results: prepared.columns().length ? prepared.all(...params) : (prepared.run(...params), []),
    };
  };
  return {
    bind: (...values: SQLInputValue[]) => statement(sql, values),
    raw: async () => {
      return sqlite
        .prepare(sql)
        .all(...params)
        .map((row) => Object.values(row));
    },
    run: async () => execute(),
    all: async () => execute(),
    execute,
  };
}

beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../../drizzle/", import.meta.url);
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", dir), "utf8")) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries)
    sqlite.exec(readFileSync(new URL(`${tag}.sql`, dir), "utf8"));
  const DB = {
    prepare: (sql: string) => statement(sql),
    batch: async (queries: ReturnType<typeof statement>[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = queries.map((query) => query.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  bindings = await authEnv({ DB });
  cookie = await signIn(bindings);
});

afterEach(() => sqlite.close());

function request(path: string, body?: unknown, authenticated = true) {
  return app.request(
    path,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(authenticated ? { cookie } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    bindings,
  );
}

const typeDetails = { name: "Doble", maxOccupancy: 2, baseRateCents: 15000 };
type Saved = {
  roomType: typeof typeDetails & { id: string };
  rooms: { id: string; number: string; roomTypeId: string }[];
};

it("creates a room type and its room table in one save", async () => {
  const response = await request("/setup", {
    ...typeDetails,
    rooms: [{ number: "101" }, { number: "102" }],
  });
  expect(response.status).toBe(201);
  const saved = (await response.json()) as Saved;
  expect(saved.roomType).toMatchObject(typeDetails);
  expect(await (await request("/rooms")).json()).toEqual([
    { id: saved.rooms[0].id, number: "101", roomTypeId: saved.roomType.id },
    { id: saved.rooms[1].id, number: "102", roomTypeId: saved.roomType.id },
  ]);
  expect(await (await request("/room-types")).json()).toEqual([
    expect.objectContaining({ ...typeDetails, id: saved.roomType.id }),
  ]);
});

it("saves type details, renames existing rooms, and adds rooms without deleting omitted rooms", async () => {
  const created = (await (
    await request("/setup", {
      ...typeDetails,
      rooms: [{ number: "101" }, { number: "102" }],
    })
  ).json()) as Saved;
  const response = await request("/setup", {
    ...typeDetails,
    roomTypeId: created.roomType.id,
    name: "Doble superior",
    baseRateCents: 17550,
    maxOccupancy: 3,
    rooms: [{ id: created.rooms[0].id, number: "201" }, { number: "203" }],
  });
  expect(response.status).toBe(200);
  expect(await (await request(`/room-types/${created.roomType.id}`)).json()).toMatchObject({
    name: "Doble superior",
    baseRateCents: 17550,
    maxOccupancy: 3,
  });
  const allRooms = (await (await request("/rooms")).json()) as Saved["rooms"];
  expect(allRooms.map((room) => room.number).sort()).toEqual(["102", "201", "203"]);
  expect(allRooms.find((room) => room.id === created.rooms[0].id)?.number).toBe("201");
});

it("rolls back type edits, room renames, and earlier inserts when a later room conflicts", async () => {
  const created = (await (
    await request("/setup", {
      ...typeDetails,
      rooms: [{ number: "101" }],
    })
  ).json()) as Saved;
  await request("/setup", { ...typeDetails, name: "Suite", rooms: [{ number: "301" }] });
  const response = await request("/setup", {
    ...typeDetails,
    roomTypeId: created.roomType.id,
    name: "Changed",
    baseRateCents: 999,
    rooms: [{ id: created.rooms[0].id, number: "201" }, { number: "202" }, { number: "301" }],
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "room number already exists" });
  expect(await (await request(`/room-types/${created.roomType.id}`)).json()).toMatchObject(
    typeDetails,
  );
  const allRooms = (await (await request("/rooms")).json()) as Saved["rooms"];
  expect(allRooms.map((room) => room.number).sort()).toEqual(["101", "301"]);
});

it("does not leave an empty type behind when its room creation fails", async () => {
  await request("/setup", { ...typeDetails, rooms: [{ number: "101" }] });
  expect(
    (
      await request("/setup", {
        ...typeDetails,
        name: "Suite",
        rooms: [{ number: "201" }, { number: "101" }],
      })
    ).status,
  ).toBe(409);
  const types = (await (await request("/room-types")).json()) as Saved["roomType"][];
  expect(types.map((type) => type.name)).toEqual(["Doble"]);
});

it("rejects a repeated existing room instead of silently accepting two edits of the same room", async () => {
  const created = (await (
    await request("/setup", {
      ...typeDetails,
      rooms: [{ number: "101" }],
    })
  ).json()) as Saved;
  expect(
    (
      await request("/setup", {
        ...typeDetails,
        roomTypeId: created.roomType.id,
        rooms: [
          { id: created.rooms[0].id, number: "201" },
          { id: created.rooms[0].id, number: "202" },
        ],
      })
    ).status,
  ).toBe(400);
});

it("allows an empty type and rejects unauthenticated writes", async () => {
  expect((await request("/setup", { ...typeDetails, rooms: [] }, false)).status).toBe(401);
  expect((await request("/setup", { ...typeDetails, rooms: [] })).status).toBe(201);
  expect(await (await request("/rooms")).json()).toEqual([]);
});

it.each([
  { name: "", maxOccupancy: 2, baseRateCents: 100 },
  { name: "Doble", maxOccupancy: 0, baseRateCents: 100 },
  { name: "Doble", maxOccupancy: 1.5, baseRateCents: 100 },
  { name: "Doble", maxOccupancy: 2, baseRateCents: -1 },
  { name: "Doble", maxOccupancy: 2, baseRateCents: 1.5 },
])("rejects invalid type details without writing: %j", async (details) => {
  expect((await request("/setup", { ...details, rooms: [{ number: "101" }] })).status).toBe(400);
  expect(await (await request("/room-types")).json()).toEqual([]);
  expect(await (await request("/rooms")).json()).toEqual([]);
});

it("rejects editing rooms owned by another type and nonexistent type IDs", async () => {
  const created = (await (
    await request("/setup", {
      ...typeDetails,
      rooms: [{ number: "101" }],
    })
  ).json()) as Saved;
  const other = (await (
    await request("/setup", {
      ...typeDetails,
      name: "Suite",
      rooms: [],
    })
  ).json()) as Saved;
  expect(
    (
      await request("/setup", {
        ...typeDetails,
        name: "Changed",
        roomTypeId: other.roomType.id,
        rooms: [{ id: created.rooms[0].id, number: "201" }],
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request("/setup", {
        ...typeDetails,
        roomTypeId: "missing",
        rooms: [],
      })
    ).status,
  ).toBe(404);
  expect(await (await request(`/rooms/${created.rooms[0].id}`)).json()).toMatchObject({
    number: "101",
    roomTypeId: created.roomType.id,
  });
});
