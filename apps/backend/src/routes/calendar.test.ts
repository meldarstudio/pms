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
  it("shows every room in numeric room-number order, including a room with no stay, labeled with its room type", async () => {
    seedRooms(db.sqlite, "type", { "room-2": "2", "room-10": "10" });

    const response = await request("/calendar?from=2026-10-20&to=2026-10-26");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      rooms: { number: string; roomTypeName: string }[];
    };
    expect(
      body.rooms.map((room) => ({ number: room.number, roomTypeName: room.roomTypeName })),
    ).toEqual([
      { number: "2", roomTypeName: "King" },
      { number: "10", roomTypeName: "King" },
      { number: "101", roomTypeName: "King" },
      { number: "102", roomTypeName: "King" },
      { number: "103", roomTypeName: "King" },
    ]);
  });

  it("keeps a stay that runs past the window on its assigned room, with the contact, status, identities, and real dates", async () => {
    const created = await create("Ada Lovelace", { checkIn: "2026-10-18", checkOut: "2026-10-28" });
    await assign(created, "room-101");

    const response = await request("/calendar?from=2026-10-20&to=2026-10-26");

    expect(response.status).toBe(200);
    const body = (await response.json()) as CalendarBody;
    const occupied = body.rooms.find((room) => room.number === "101");
    const empty = body.rooms.find((room) => room.number === "102");
    expect(occupied?.stays).toEqual([
      {
        id: created.rooms[0]!.id,
        reservationId: created.id,
        guestName: "Ada Lovelace",
        status: "confirmed",
        checkIn: "2026-10-18",
        checkOut: "2026-10-28",
      },
    ]);
    expect(empty?.stays).toEqual([]);
  });

  it("includes a stay that checks out on the first morning without the caller passing the day before", async () => {
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
  });

  it("shows a room closure that ends on the first morning, with its identity, dates, and reason", async () => {
    const ending = await request("/room-closures", "POST", {
      roomId: "room-101",
      starts: "2026-10-18",
      ends: "2026-10-20",
      reason: "Maintenance",
    });
    expect(ending.status).toBe(201);
    const closed = (await ending.json()) as { id: string };
    const alreadyOpen = await request("/room-closures", "POST", {
      roomId: "room-102",
      starts: "2026-10-17",
      ends: "2026-10-19",
      reason: "Already open",
    });
    expect(alreadyOpen.status).toBe(201);
    const spanning = await request("/room-closures", "POST", {
      roomId: "room-103",
      starts: "2026-10-01",
      ends: "2026-11-01",
      reason: "Renovation",
    });
    expect(spanning.status).toBe(201);
    const longClosure = (await spanning.json()) as { id: string };

    const response = await request("/calendar?from=2026-10-20&to=2026-10-26");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      rooms: {
        number: string;
        closures?: {
          id: string;
          roomId: string;
          starts: string;
          ends: string;
          reason: string | null;
        }[];
      }[];
    };
    expect(body.rooms.find((room) => room.number === "101")?.closures).toEqual([
      {
        id: closed.id,
        roomId: "room-101",
        starts: "2026-10-18",
        ends: "2026-10-20",
        reason: "Maintenance",
      },
    ]);
    expect(body.rooms.find((room) => room.number === "102")?.closures).toEqual([]);
    expect(body.rooms.find((room) => room.number === "103")?.closures).toEqual([
      {
        id: longClosure.id,
        roomId: "room-103",
        starts: "2026-10-01",
        ends: "2026-11-01",
        reason: "Renovation",
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

  it("rejects a range wider than a 14-day span plus seven days on each side", async () => {
    const widest = await request("/calendar?from=2026-10-01&to=2026-10-28");
    expect(widest.status).toBe(200);

    const response = await request("/calendar?from=2026-10-01&to=2026-10-29");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "calendar range is too wide" });
    expect(widest.headers.get("content-type")).toContain("application/json");
  });

  it("fails an incomplete window instead of returning a short grid", async () => {
    const complete = await request("/calendar?from=2026-10-20&to=2026-10-20");
    expect(complete.status).toBe(200);
    const day = (await complete.json()) as {
      from: string;
      to: string;
      rooms: { number: string }[];
    };
    expect(day).toMatchObject({ from: "2026-10-20", to: "2026-10-20" });
    expect(day.rooms.map((room) => room.number)).toEqual(["101", "102", "103"]);

    const response = await request("/calendar?from=2026-10-26&to=2026-10-20");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "calendar window is incomplete" });
  });

  it("returns missing property setup for an empty property, not a not-found", async () => {
    const ready = await request("/calendar?from=2026-10-20&to=2026-10-26");
    expect(ready.status).toBe(200);
    expect((await ready.json()) as { missingSetup: unknown }).toMatchObject({ missingSetup: null });

    db.sqlite.exec("DELETE FROM rooms");
    const noRooms = await request("/calendar?from=2026-10-20&to=2026-10-26");
    expect(noRooms.status).toBe(200);
    expect(await noRooms.json()).toMatchObject({
      missingSetup: "rooms",
      rooms: [],
      unassigned: [],
    });

    db.sqlite.exec("DELETE FROM room_types");
    const noTypes = await request("/calendar?from=2026-10-20&to=2026-10-26");
    expect(noTypes.status).toBe(200);
    expect(await noTypes.json()).toMatchObject({
      missingSetup: "types",
      rooms: [],
      unassigned: [],
    });
  });

  it("omits the reservation bill, payments, nightly prices, and cents", async () => {
    const created = await create("Ada Lovelace", { checkIn: "2026-10-20", checkOut: "2026-10-22" });
    await assign(created, "room-101");
    await command(created, [
      {
        type: "add-payment",
        payment: { amountCents: 1000, method: "cash", paymentDate: "2026-10-10" },
      },
    ]);

    const response = await request("/calendar?from=2026-10-20&to=2026-10-26");

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["from", "missingSetup", "rooms", "to", "unassigned"]);
    expect(JSON.stringify(body)).not.toMatch(
      /cents|payments|price|currency|balance|subtotal|discount/i,
    );
  });

  it("returns a stay longer than 60 nights without re-checking the write limit", async () => {
    seedReservation(db.sqlite, {
      id: "res-long",
      guestId: "guest-long",
      lineId: "line-long",
      code: "LONG0001",
      guestName: "Long Stay",
      checkIn: "2026-08-22",
      checkOut: "2026-10-22",
      roomId: "room-101",
      createdAt: "2026-08-01",
    });

    const response = await request("/calendar?from=2026-10-20&to=2026-10-26");

    expect(response.status).toBe(200);
    const body = (await response.json()) as CalendarBody;
    expect(body.rooms.find((room) => room.number === "101")?.stays).toEqual([
      {
        id: "line-long",
        reservationId: "res-long",
        guestName: "Long Stay",
        status: "confirmed",
        checkIn: "2026-08-22",
        checkOut: "2026-10-22",
      },
    ]);
  });

  it("returns every overlapping stay in the window, with no page and no silent stop", async () => {
    for (let index = 1; index <= 51; index++) {
      const id = String(index).padStart(2, "0");
      seedRooms(db.sqlite, "type", { [`room-extra-${id}`]: String(200 + index) });
      seedReservation(db.sqlite, {
        id: `res-${id}`,
        guestId: `guest-${id}`,
        lineId: `line-${id}`,
        code: `CODE${id}`,
        guestName: `Guest ${id}`,
        checkIn: "2026-10-20",
        checkOut: "2026-10-22",
        roomId: `room-extra-${id}`,
        createdAt: "2026-10-01",
      });
    }

    const response = await request("/calendar?from=2026-10-20&to=2026-10-26");

    expect(response.status).toBe(200);
    const body = (await response.json()) as CalendarBody & Record<string, unknown>;
    const stays = body.rooms.flatMap((room) => room.stays ?? []);
    expect(body.rooms).toHaveLength(54);
    expect(stays).toHaveLength(51);
    expect(new Set(stays.map((stay) => stay.id)).size).toBe(51);
    expect(body).not.toHaveProperty("rows");
    expect(body).not.toHaveProperty("limit");
    expect(body).not.toHaveProperty("offset");
    expect(body).not.toHaveProperty("total");
  });
});
