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
  expect(await (await request("/rooms")).json()).toMatchObject([
    { id: saved.rooms[0].id, number: "101", roomTypeId: saved.roomType.id },
    { id: saved.rooms[1].id, number: "102", roomTypeId: saved.roomType.id },
  ]);
  expect(await (await request("/housekeeping")).json()).toMatchObject({
    rooms: [{ housekeepingStatus: "clean" }, { housekeepingStatus: "clean" }],
  });
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
