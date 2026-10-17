/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import app from "../index";
import type { Env } from "../env";
import { authEnv, PORTAL_ORIGIN, signIn } from "../test-support/auth";

let sqlite: DatabaseSync;
let bindings: Env["Bindings"];
let cookie: string;
let beforeBatch: (() => Promise<void>) | undefined;

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
  beforeBatch = undefined;
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
      if (beforeBatch) {
        const callback = beforeBatch;
        beforeBatch = undefined;
        await callback();
      }
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
        origin: PORTAL_ORIGIN,
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
  expect(response.headers.get("X-Error-Field")).toBe("rooms[2].number");
  expect(response.headers.get("Access-Control-Expose-Headers")).toContain("X-Error-Field");
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

it.each([
  ["102", "103"],
  ["102", "101"],
])(
  "saves valid final room numbers %j without conflicting with intermediate renames",
  async (first, second) => {
    const created = (await (
      await request("/setup", { ...typeDetails, rooms: [{ number: "101" }, { number: "102" }] })
    ).json()) as Saved;
    const response = await request("/setup", {
      ...typeDetails,
      roomTypeId: created.roomType.id,
      rooms: [
        { id: created.rooms[0].id, number: first },
        { id: created.rooms[1].id, number: second },
      ],
    });
    expect(response.status).toBe(200);
    expect(await (await request(`/rooms/${created.rooms[0].id}`)).json()).toMatchObject({
      number: first,
    });
    expect(await (await request(`/rooms/${created.rooms[1].id}`)).json()).toMatchObject({
      number: second,
    });
  },
);

it("rolls back the whole save if a room changes type between loading and writing", async () => {
  const created = (await (
    await request("/setup", { ...typeDetails, rooms: [{ number: "101" }] })
  ).json()) as Saved;
  const other = (await (
    await request("/setup", { ...typeDetails, name: "Suite", rooms: [] })
  ).json()) as Saved;
  beforeBatch = async () => {
    const moved = await app.request(
      `/rooms/${created.rooms[0].id}`,
      {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ roomTypeId: other.roomType.id }),
      },
      bindings,
    );
    expect(moved.status).toBe(200);
  };
  const response = await request("/setup", {
    ...typeDetails,
    name: "Changed",
    roomTypeId: created.roomType.id,
    rooms: [{ id: created.rooms[0].id, number: "201" }, { number: "202" }],
  });
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "room not found" });
  expect(await (await request(`/room-types/${created.roomType.id}`)).json()).toMatchObject(
    typeDetails,
  );
  expect(await (await request("/rooms")).json()).toEqual([
    { id: created.rooms[0].id, number: "101", roomTypeId: other.roomType.id },
  ]);
});

it("identifies duplicate numbers within a submitted table without creating the type", async () => {
  const response = await request("/setup", {
    ...typeDetails,
    rooms: [{ number: "101" }, { number: " 101 " }],
  });
  expect(response.status).toBe(409);
  expect(response.headers.get("X-Error-Field")).toBe("rooms[1].number");
  expect(await (await request("/room-types")).json()).toEqual([]);
  expect(await (await request("/rooms")).json()).toEqual([]);
});

it.each([
  { numbers: ["102", "301"], field: "rooms[1].number" },
  { numbers: ["102", "103", "301"], field: "rooms[2].number" },
])(
  "identifies $field when a valid renaming chain accompanies an external conflict",
  async ({ numbers, field }) => {
    const created = (await (
      await request("/setup", {
        ...typeDetails,
        rooms: [{ number: "101" }, { number: "102" }],
      })
    ).json()) as Saved;
    await request("/setup", { ...typeDetails, name: "Suite", rooms: [{ number: "301" }] });
    const response = await request("/setup", {
      ...typeDetails,
      roomTypeId: created.roomType.id,
      rooms: numbers.map((number, index) => ({
        ...(created.rooms[index] ? { id: created.rooms[index].id } : {}),
        number,
      })),
    });
    expect(response.status).toBe(409);
    expect(response.headers.get("X-Error-Field")).toBe(field);
    const allRooms = (await (await request("/rooms")).json()) as Saved["rooms"];
    expect(allRooms.map((room) => room.number).sort()).toEqual(["101", "102", "301"]);
  },
);
