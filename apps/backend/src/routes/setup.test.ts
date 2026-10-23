import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { createTestDb, type TestDb } from "../test-support/d1";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(() => db.close());

function request(path: string, body?: unknown) {
  return db.request(path, body === undefined ? "GET" : "POST", body);
}

const typeDetails = { name: "Doble", maxAdults: 2, maxChildren: 2, baseRateCents: 15000 };
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
    maxAdults: 3,
    maxChildren: 0,
    rooms: [{ id: created.rooms[0].id, number: "201" }, { number: "203" }],
  });
  expect(response.status).toBe(200);
  expect(await (await request(`/room-types/${created.roomType.id}`)).json()).toMatchObject({
    name: "Doble superior",
    baseRateCents: 17550,
    maxAdults: 3,
    maxChildren: 0,
  });
  const allRooms = (await (await request("/rooms")).json()) as Saved["rooms"];
  expect(allRooms.map((room) => room.number).sort()).toEqual(["102", "201", "203"]);
  expect(allRooms.find((room) => room.id === created.rooms[0].id)?.number).toBe("201");
});

it("rolls back type edits, room renames, earlier inserts and a new type when a later room conflicts", async () => {
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

  const newType = await request("/setup", {
    ...typeDetails,
    name: "Triple",
    rooms: [{ number: "401" }, { number: "101" }],
  });
  expect(newType.status).toBe(409);
  const types = (await (await request("/room-types")).json()) as Saved["roomType"][];
  expect(types.map((type) => type.name).sort()).toEqual(["Doble", "Suite"]);
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

it("allows an empty type", async () => {
  expect((await request("/setup", { ...typeDetails, rooms: [] })).status).toBe(201);
  expect(await (await request("/rooms")).json()).toEqual([]);
});

it.each([
  ["a type that holds no adults", { maxAdults: 0 }],
  ["a fractional base rate", { baseRateCents: 1.5 }],
])("rejects %s without writing", async (_name, details) => {
  expect(
    (await request("/setup", { ...typeDetails, ...details, rooms: [{ number: "101" }] })).status,
  ).toBe(400);
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
  db.beforeCommit(async () => {
    const moved = await db.request(`/rooms/${created.rooms[0].id}`, "PATCH", {
      roomTypeId: other.roomType.id,
    });
    expect(moved.status).toBe(200);
  });
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

it("identifies the conflicting room when a valid renaming chain accompanies an external conflict", async () => {
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
    rooms: [
      { id: created.rooms[0].id, number: "102" },
      { id: created.rooms[1].id, number: "301" },
    ],
  });
  expect(response.status).toBe(409);
  expect(response.headers.get("X-Error-Field")).toBe("rooms[1].number");
  const allRooms = (await (await request("/rooms")).json()) as Saved["rooms"];
  expect(allRooms.map((room) => room.number).sort()).toEqual(["101", "102", "301"]);
});
