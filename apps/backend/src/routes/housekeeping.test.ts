import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createTestDb,
  seedReservation,
  seedRooms,
  seedRoomType,
  type TestDb,
} from "../test-support/d1";

let db: TestDb;

beforeEach(async () => {
  vi.useFakeTimers();
  // 10:00 in Lima: the property date is 2026-10-10.
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type", {
    "room-101": "101",
    "room-102": "102",
    "room-103": "103",
    "room-104": "104",
    "room-110": "110",
  });
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const request: TestDb["request"] = (...args) => db.request(...args);

type HousekeepingList = {
  date: string;
  rooms: {
    id: string;
    number: string;
    roomTypeName: string;
    housekeepingStatus: string;
    housekeepingChangedAt: string | null;
    closed: boolean;
    inHouse: boolean;
    departing: boolean;
    arriving: boolean;
  }[];
};

async function housekeepingList() {
  const response = await request("/housekeeping");
  expect(response.status).toBe(200);
  return (await response.json()) as HousekeepingList;
}

function markAll(marks: unknown) {
  return request("/housekeeping", "PUT", { marks });
}

async function mark(roomId: string, status: string) {
  return markAll([{ roomId, status }]);
}

type MarkedRooms = {
  rooms: { id: string; housekeepingStatus: string; housekeepingChangedAt: string | null }[];
};

function stay(
  id: string,
  roomId: string | null,
  status: string,
  checkIn: string,
  checkOut: string,
) {
  seedReservation(db.sqlite, {
    id,
    code: id.toUpperCase(),
    guestName: id,
    checkIn,
    checkOut,
    status,
    roomId,
    createdAt: "2026-10-01T00:00:00Z",
  });
}

function closure(id: string, roomId: string, starts: string, ends: string) {
  db.sqlite
    .prepare(
      "INSERT INTO room_closures (id, room_id, starts, ends, created_at) VALUES (?, ?, ?, ?, '2026-10-01')",
    )
    .run(id, roomId, starts, ends);
}

describe("housekeeping list", () => {
  it("derives today's stays for each room from reservations on the property date", async () => {
    stay("in-house", "room-101", "checked_in", "2026-10-08", "2026-10-12");
    stay("leaving", "room-102", "checked_in", "2026-10-07", "2026-10-10");
    stay("turnover", "room-102", "confirmed", "2026-10-10", "2026-10-12");
    stay("left", "room-103", "checked_out", "2026-10-08", "2026-10-10");
    stay("unassigned-arrival", null, "confirmed", "2026-10-10", "2026-10-11");
    stay("cancelled", "room-104", "cancelled", "2026-10-09", "2026-10-11");
    stay("not-arrived", "room-110", "confirmed", "2026-10-09", "2026-10-11");
    stay("no-show", "room-104", "confirmed", "2026-10-08", "2026-10-10");

    const { date, rooms } = await housekeepingList();

    expect(date).toBe("2026-10-10");
    expect(
      rooms.map(({ number, inHouse, departing, arriving }) => ({
        number,
        inHouse,
        departing,
        arriving,
      })),
    ).toEqual([
      { number: "101", inHouse: true, departing: false, arriving: false },
      { number: "102", inHouse: false, departing: true, arriving: true },
      // A stay already checked out is no longer departing.
      { number: "103", inHouse: false, departing: false, arriving: false },
      // A stay that ends today without being checked in has no guest to depart.
      { number: "104", inHouse: false, departing: false, arriving: false },
      // A confirmed stay that has begun but is not checked in is neither in-house nor arriving.
      { number: "110", inHouse: false, departing: false, arriving: false },
    ]);
  });

  it("uses the property date when it differs from the UTC date", async () => {
    // 22:00 on 10 October in Lima, already 11 October in UTC.
    vi.setSystemTime(new Date("2026-10-11T03:00:00Z"));
    stay("arriving-tonight", "room-101", "confirmed", "2026-10-10", "2026-10-12");
    stay("arriving-tomorrow", "room-102", "confirmed", "2026-10-11", "2026-10-12");

    const { date, rooms } = await housekeepingList();

    expect(date).toBe("2026-10-10");
    expect(rooms.filter((room) => room.arriving).map((room) => room.number)).toEqual(["101"]);
  });

  it("flags only rooms closed for the property date's night", async () => {
    closure("tonight", "room-101", "2026-10-09", "2026-10-11");
    closure("ended-this-morning", "room-102", "2026-10-08", "2026-10-10");
    closure("starts-today", "room-103", "2026-10-10", "2026-10-11");

    const closed = Object.fromEntries(
      (await housekeepingList()).rooms.map((r) => [r.number, r.closed]),
    );

    expect(closed).toEqual({ "101": true, "102": false, "103": true, "104": false, "110": false });
  });

  it("lists rooms by room number whatever their status or stays", async () => {
    stay("arrival-110", "room-110", "confirmed", "2026-10-10", "2026-10-11");
    for (const roomId of ["room-110", "room-103"])
      expect((await mark(roomId, "dirty")).status).toBe(200);

    expect(
      (await housekeepingList()).rooms.map((r) => `${r.number}:${r.housekeepingStatus}`),
    ).toEqual(["101:clean", "102:clean", "103:dirty", "104:clean", "110:dirty"]);
  });
});

describe("marking housekeeping status", () => {
  it("starts rooms clean and records when staff set a status, repeating a status without flipping it", async () => {
    const created = await request("/rooms", "POST", { number: "201", roomTypeId: "type" });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const room = async () =>
      (await (await request(`/rooms/${id}`)).json()) as {
        housekeepingStatus: string;
        housekeepingChangedAt: string | null;
      };
    expect(await room()).toMatchObject({
      housekeepingStatus: "clean",
      housekeepingChangedAt: null,
    });

    expect(await (await mark(id, "dirty")).json()).toMatchObject({
      rooms: [
        { id, housekeepingStatus: "dirty", housekeepingChangedAt: "2026-10-10T15:00:00.000Z" },
      ],
    });
    vi.setSystemTime(new Date("2026-10-10T15:05:00Z"));
    expect((await mark(id, "dirty")).status).toBe(200);
    expect(await room()).toEqual(
      expect.objectContaining({
        housekeepingStatus: "dirty",
        housekeepingChangedAt: "2026-10-10T15:05:00.000Z",
      }),
    );
    expect((await mark(id, "clean")).status).toBe(200);
    expect((await room()).housekeepingStatus).toBe("clean");
  });

  it("marks several rooms with their own statuses in one request", async () => {
    expect((await mark("room-103", "dirty")).status).toBe(200);
    vi.setSystemTime(new Date("2026-10-10T15:30:00Z"));

    const response = await markAll([
      { roomId: "room-102", status: "dirty" },
      { roomId: "room-101", status: "clean" },
      { roomId: "room-103", status: "dirty" },
    ]);

    expect(response.status).toBe(200);
    const { rooms } = (await response.json()) as MarkedRooms;
    // A repeat of the current status still records the mark.
    expect(
      rooms.map((r) => `${r.id}:${r.housekeepingStatus}:${r.housekeepingChangedAt}`).sort(),
    ).toEqual([
      "room-101:clean:2026-10-10T15:30:00.000Z",
      "room-102:dirty:2026-10-10T15:30:00.000Z",
      "room-103:dirty:2026-10-10T15:30:00.000Z",
    ]);
    expect(
      (await housekeepingList()).rooms.map(
        (r) => `${r.number}:${r.housekeepingStatus}:${r.housekeepingChangedAt}`,
      ),
    ).toEqual([
      "101:clean:2026-10-10T15:30:00.000Z",
      "102:dirty:2026-10-10T15:30:00.000Z",
      "103:dirty:2026-10-10T15:30:00.000Z",
      "104:clean:null",
      "110:clean:null",
    ]);
  });

  it.each([
    ["an empty list", [], 400, undefined],
    [
      "the same room twice",
      [
        { roomId: "room-101", status: "dirty" },
        { roomId: "room-101", status: "clean" },
      ],
      400,
      "duplicate room in housekeeping marks",
    ],
    [
      "an unknown room",
      [
        { roomId: "room-101", status: "dirty" },
        { roomId: "no-such-room", status: "dirty" },
      ],
      404,
      "room not found",
    ],
    ["an unknown status", [{ roomId: "room-101", status: "inspected" }], 400, undefined],
    [
      "more than 500 marks",
      Array.from({ length: 501 }, (_, index) => ({
        roomId: index === 0 ? "room-101" : `room-${1000 + index}`,
        status: "dirty",
      })),
      400,
      undefined,
    ],
  ])("rejects %s and saves nothing", async (_case, marks, status, error) => {
    const response = await markAll(marks);

    expect(response.status).toBe(status);
    if (error) expect(await response.json()).toEqual({ error });
    expect(
      (await housekeepingList()).rooms.map((r) => `${r.number}:${r.housekeepingStatus}`),
    ).toEqual(["101:clean", "102:clean", "103:clean", "104:clean", "110:clean"]);
  });

  it("accepts 500 marks", async () => {
    const roomIds = Object.fromEntries(
      Array.from({ length: 495 }, (_, index) => [`extra-${index}`, `${300 + index}`]),
    );
    seedRooms(db.sqlite, "type", roomIds);
    const marks = [
      "room-101",
      "room-102",
      "room-103",
      "room-104",
      "room-110",
      ...Object.keys(roomIds),
    ].map((roomId) => ({ roomId, status: "dirty" }));

    const response = await markAll(marks);

    expect(response.status).toBe(200);
    const { rooms } = (await response.json()) as MarkedRooms;
    expect(rooms).toHaveLength(500);
    expect(
      (await housekeepingList()).rooms.every((room) => room.housekeepingStatus === "dirty"),
    ).toBe(true);
  });
});

describe("housekeeping status elsewhere", () => {
  async function reservation() {
    const response = await request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-10-10",
      checkOut: "2026-10-12",
      guest: { fullName: "Ada" },
      rooms: [
        { roomTypeId: "type", roomId: "room-101", adults: 1, children: 0 },
        { roomTypeId: "type", adults: 1, children: 0 },
      ],
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string };
  }

  async function command(id: string, actions: unknown[]) {
    const response = await request(`/reservations/${id}/commands`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(response.status).toBe(200);
    return (await response.json()) as {
      rooms: { roomNumber: string | null; housekeepingStatus: string | null }[];
    };
  }

  it("shows each assigned room's status on the reservation and the calendar", async () => {
    const { id } = await reservation();
    await mark("room-101", "dirty");

    const detail = (await (await request(`/reservations/${id}`)).json()) as {
      rooms: { roomNumber: string | null; housekeepingStatus: string | null }[];
    };
    expect(detail.rooms.map((r) => [r.roomNumber, r.housekeepingStatus])).toEqual([
      ["101", "dirty"],
      [null, null],
    ]);

    const calendar = (await (await request("/calendar?from=2026-10-10&to=2026-10-16")).json()) as {
      rooms: { number: string; housekeepingStatus: string }[];
    };
    expect(calendar.rooms.map((r) => `${r.number}:${r.housekeepingStatus}`)).toEqual([
      "101:dirty",
      "102:clean",
      "103:clean",
      "104:clean",
      "110:clean",
    ]);
  });

  it("leaves the status as staff marked it through check-in, checkout, corrections, and cancellation", async () => {
    const { id } = await reservation();
    const status = async () =>
      (await housekeepingList()).rooms.find((r) => r.number === "101")!.housekeepingStatus;

    await command(id, [{ type: "set-status", status: "checked_in" }]);
    expect(await status()).toBe("clean");
    await command(id, [{ type: "set-status", status: "checked_out" }]);
    expect(await status()).toBe("clean");

    await mark("room-101", "dirty");
    await command(id, [{ type: "set-status", status: "checked_in" }]);
    expect(await status()).toBe("dirty");
    await command(id, [{ type: "set-status", status: "cancelled" }]);
    expect(await status()).toBe("dirty");
  });

  it("leaves the status as staff marked it through room removal and closures", async () => {
    const { id } = await reservation();
    await mark("room-101", "dirty");
    await mark("room-102", "dirty");
    const statuses = async () =>
      (await housekeepingList()).rooms.map((r) => `${r.number}:${r.housekeepingStatus}`).sort();
    const before = await statuses();

    const detail = (await (await request(`/reservations/${id}`)).json()) as {
      rooms: { id: string }[];
    };
    await command(id, [{ type: "remove-room", lineId: detail.rooms[0].id }]);
    const created = await request("/room-closures", "POST", {
      roomId: "room-102",
      starts: "2026-10-10",
      ends: "2026-10-12",
    });
    expect(created.status).toBe(201);
    const closure = (await created.json()) as { id: string };
    expect((await request(`/room-closures/${closure.id}`, "DELETE")).status).toBeLessThan(300);

    expect(await statuses()).toEqual(before);
  });
});
