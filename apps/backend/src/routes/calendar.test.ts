import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "../test-support/d1";

let db: TestDb;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type", { "room-101": "101", "room-102": "102", "room-103": "103" });
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const request: TestDb["request"] = (...args) => db.request(...args);

type Created = {
  id: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guest: { fullName: string };
  rooms: { id: string; roomTypeId: string; roomId: string | null }[];
};

async function create(guestName: string, dates: { checkIn: string; checkOut: string }, count = 1) {
  const response = await request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    ...dates,
    guest: { fullName: guestName },
    rooms: Array.from({ length: count }, () => ({
      roomTypeId: "type",
      adults: 1,
      children: 0,
    })),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<Created>;
}

async function command(reservation: Created, actions: unknown[]) {
  const response = await request(`/reservations/${reservation.id}/commands`, "POST", {
    requestId: crypto.randomUUID(),
    actions,
  });
  expect(response.status).toBe(200);
}

async function assign(reservation: Created, roomId: string, index = 0) {
  const line = reservation.rooms[index]!;
  const response = await request(`/reservations/${reservation.id}/commands`, "POST", {
    requestId: crypto.randomUUID(),
    actions: [
      {
        type: "edit-room",
        lineId: line.id,
        room: { roomTypeId: line.roomTypeId, roomId, adults: 1, children: 0 },
      },
    ],
  });
  expect(response.status).toBe(200);
}

type CalendarBody = {
  rooms: {
    number: string;
    roomTypeName: string;
    stays?: {
      id: string;
      reservationId: string;
      guestName: string;
      status: string;
      checkIn: string;
      checkOut: string;
    }[];
  }[];
};

describe("calendar read", () => {
  it("includes stays that check out on the first morning or run past the window, without the caller passing the day before", async () => {
    const departing = await create("Ada Lovelace", {
      checkIn: "2026-10-18",
      checkOut: "2026-10-20",
    });
    await assign(departing, "room-101");
    const alreadyGone = await create("Grace Hopper", {
      checkIn: "2026-10-17",
      checkOut: "2026-10-19",
    });
    await assign(alreadyGone, "room-102");
    const spanning = await create("Mary Jackson", {
      checkIn: "2026-10-18",
      checkOut: "2026-10-28",
    });
    await assign(spanning, "room-103");

    const response = await request("/calendar?from=2026-10-20&to=2026-10-26");

    expect(response.status).toBe(200);
    const body = (await response.json()) as CalendarBody;
    expect(body.rooms.find((room) => room.number === "101")?.stays).toEqual([
      {
        id: departing.rooms[0]!.id,
        reservationId: departing.id,
        guestName: "Ada Lovelace",
        status: "confirmed",
        checkIn: "2026-10-18",
        checkOut: "2026-10-20",
      },
    ]);
    expect(body.rooms.find((room) => room.number === "102")?.stays).toEqual([]);
    expect(body.rooms.find((room) => room.number === "103")?.stays).toEqual([
      {
        id: spanning.rooms[0]!.id,
        reservationId: spanning.id,
        guestName: "Mary Jackson",
        status: "confirmed",
        checkIn: "2026-10-18",
        checkOut: "2026-10-28",
      },
    ]);
  });

  it("keeps a checked-out stay on its room and omits a cancelled reservation", async () => {
    const finished = await create("Ada Lovelace", {
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
    });
    await assign(finished, "room-101");
    await command(finished, [{ type: "set-status", status: "checked_in" }]);
    await command(finished, [{ type: "set-status", status: "checked_out" }]);
    const withdrawn = await create("Grace Hopper", {
      checkIn: "2026-10-21",
      checkOut: "2026-10-23",
    });
    await assign(withdrawn, "room-102");
    await command(withdrawn, [
      { type: "set-status", status: "cancelled", reason: "Plans changed" },
    ]);

    const response = await request("/calendar?from=2026-10-20&to=2026-10-26");

    expect(response.status).toBe(200);
    const body = (await response.json()) as CalendarBody;
    expect(body.rooms.find((room) => room.number === "101")?.stays).toEqual([
      {
        id: finished.rooms[0]!.id,
        reservationId: finished.id,
        guestName: "Ada Lovelace",
        status: "checked_out",
        checkIn: "2026-10-20",
        checkOut: "2026-10-22",
      },
    ]);
    expect(body.rooms.find((room) => room.number === "102")?.stays).toEqual([]);
  });

  it("lists confirmed and checked-in reserved rooms with no assignment that still occupy a visible night", async () => {
    seedRooms(db.sqlite, "type", { "room-104": "104", "room-105": "105" });
    const waiting = await create("Ada Lovelace", { checkIn: "2026-10-21", checkOut: "2026-10-23" });
    const inHouse = await create("Grace Hopper", { checkIn: "2026-10-20", checkOut: "2026-10-22" });
    await command(inHouse, [{ type: "set-status", status: "checked_in" }]);
    await create("Mary Jackson", { checkIn: "2026-10-18", checkOut: "2026-10-20" });
    const finished = await create("Katherine Johnson", {
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
    });
    await command(finished, [{ type: "set-status", status: "checked_in" }]);
    await command(finished, [{ type: "set-status", status: "checked_out" }]);
    const withdrawn = await create("Dorothy Vaughan", {
      checkIn: "2026-10-22",
      checkOut: "2026-10-24",
    });
    await command(withdrawn, [{ type: "set-status", status: "cancelled" }]);
    await assign(
      await create("Margaret Hamilton", { checkIn: "2026-10-21", checkOut: "2026-10-23" }),
      "room-101",
    );
    await create("Later Guest", { checkIn: "2026-10-27", checkOut: "2026-10-28" });
    const split = await create("Split Guest", { checkIn: "2026-10-22", checkOut: "2026-10-24" }, 2);
    await assign(split, "room-102", 0);

    const response = await request("/calendar?from=2026-10-20&to=2026-10-26");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      unassigned?: {
        id: string;
        reservationId: string;
        guestName: string;
        status: string;
        checkIn: string;
        checkOut: string;
        roomId: null;
        roomTypeId: string;
        roomIndex: number;
        roomCount: number;
      }[];
    };
    expect(body.unassigned).toEqual([
      {
        id: inHouse.rooms[0]!.id,
        reservationId: inHouse.id,
        guestName: "Grace Hopper",
        status: "checked_in",
        checkIn: "2026-10-20",
        checkOut: "2026-10-22",
        roomId: null,
        roomTypeId: "type",
        roomIndex: 1,
        roomCount: 1,
      },
      {
        id: waiting.rooms[0]!.id,
        reservationId: waiting.id,
        guestName: "Ada Lovelace",
        status: "confirmed",
        checkIn: "2026-10-21",
        checkOut: "2026-10-23",
        roomId: null,
        roomTypeId: "type",
        roomIndex: 1,
        roomCount: 1,
      },
      {
        id: split.rooms[1]!.id,
        reservationId: split.id,
        guestName: "Split Guest",
        status: "confirmed",
        checkIn: "2026-10-22",
        checkOut: "2026-10-24",
        roomId: null,
        roomTypeId: "type",
        roomIndex: 2,
        roomCount: 2,
      },
    ]);
  });
});
