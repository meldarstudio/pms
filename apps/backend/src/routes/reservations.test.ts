/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import app from "../index";
import type { presentReservation } from "../present";

type Detail = ReturnType<typeof presentReservation>;
type Preview = {
  billing: Detail;
  validation: { issues: { code: string; roomIndex: number; field: string }[] };
};

let sqlite: DatabaseSync;
let binding: D1Database;
let batchTail: Promise<unknown> = Promise.resolve();

// Run the actual Hono routes and Drizzle SQL against SQLite with D1-style batches.
function statement(sql: string, params: SQLInputValue[] = []) {
  const execute = () => {
    if (sqlite.prepare(sql).columns().length) {
      return { success: true, results: sqlite.prepare(`SELECT * FROM (${sql})`).all(...params) };
    }
    sqlite.prepare(sql).run(...params);
    return { success: true, results: [] };
  };
  return {
    sql,
    execute,
    bind: (...values: SQLInputValue[]) => statement(sql, values),
    raw: async () => {
      // The subquery gives duplicate join columns distinct names on Node 22.
      return sqlite
        .prepare(`SELECT * FROM (${sql})`)
        .all(...params)
        .map((row) => Object.values(row));
    },
    run: async () => execute(),
    all: async () => ({ success: true, results: sqlite.prepare(sql).all(...params) }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../../drizzle/", import.meta.url);
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", dir), "utf8")) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries)
    sqlite.exec(readFileSync(new URL(`${tag}.sql`, dir), "utf8"));
  sqlite.exec(`
    INSERT INTO room_types VALUES ('type', 'King', 2, 10000, '2026-10-10');
    INSERT INTO rooms VALUES ('room-101', '101', 'type'), ('room-102', '102', 'type'), ('room-103', '103', 'type');
  `);
  binding = {
    prepare: (sql: string) => statement(sql),
    batch: (queries: ReturnType<typeof statement>[]) => {
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
    },
  } as unknown as D1Database;
});

afterEach(() => {
  sqlite.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function request(path: string, method = "GET", body?: unknown, database = binding) {
  return app.request(
    path,
    {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    },
    { DB: database, CURRENCY: "PEN" },
  );
}

async function create(count = 1, dates = { checkIn: "2026-10-10", checkOut: "2026-10-13" }) {
  const response = await request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    ...dates,
    guest: { fullName: "Ada Lovelace" },
    rooms: Array.from({ length: count }, () => ({
      roomTypeId: "type",
      adults: 1,
      children: 0,
    })),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<Detail>;
}
import type { WorkflowAction } from "@pms/shared";
async function command(d: Detail, actions: WorkflowAction[], status = 200) {
  const r = await request(`/reservations/${d.id}/commands`, "POST", {
    requestId: crypto.randomUUID(),
    actions,
  });
  const body = await r.json();
  expect(r.status, JSON.stringify(body)).toBe(status);
  return body as Detail;
}
const roomEdit = (d: Detail, i = 0, patch: Record<string, unknown> = {}): WorkflowAction => ({
  type: "edit-room",
  lineId: d.rooms[i].id,
  room: {
    roomTypeId: "type",
    roomId: `room-${101 + i}`,
    adults: 1,
    children: 0,
    ...patch,
  },
});
const pay = (amountCents: number): WorkflowAction => ({
  type: "add-payment",
  payment: { amountCents, method: "cash", paymentDate: "2026-10-10" },
});
const setDiscount = (amountCents: number): WorkflowAction => ({
  type: "set-discount",
  amountCents,
});
const all = (_d: Detail, type: "check-in" | "check-out"): WorkflowAction => ({
  type: "set-status",
  status: type === "check-in" ? "checked_in" : "checked_out",
});
async function arrive(d: Detail) {
  return command(d, [...d.rooms.map((_, i) => roomEdit(d, i)), all(d, "check-in")]);
}

async function bookingAfterCapacityReduction(roomCount = 1) {
  const d = await create(roomCount);
  const saved = await command(d, [roomEdit(d, 0, { adults: 2 })]);
  const response = await request("/room-types/type", "PATCH", { maxOccupancy: 1 });
  expect(response.status).toBe(200);
  return saved;
}

const guest = (reservationRoomId: string | null) => ({
  id: crypto.randomUUID(),
  reservationRoomId,
  fullName: "Ana García",
  email: null,
  phone: null,
  documentType: "DNI",
  documentNumber: "12345678",
});

function isCommandBatch(queries: D1PreparedStatement[]) {
  return queries.some((query) =>
    (query as unknown as ReturnType<typeof statement>).sql.startsWith(
      'insert into "reservation_requests"',
    ),
  );
}

// Hold one planned command before its transaction. Other requests can commit
// through the same database while it waits, without timers or application hooks.
function pauseCommandBatch() {
  const batch = binding.batch.bind(binding);
  let resume = () => {};
  let reached = () => {};
  const blocked = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const spy = vi
    .spyOn(binding, "batch")
    .mockImplementation(async <T>(queries: D1PreparedStatement[]) => {
      if (isCommandBatch(queries)) {
        spy.mockRestore();
        reached();
        await blocked;
      }
      return batch<T>(queries);
    });
  return { ready, resume };
}

describe("concurrent reservation commands", () => {
  it.each(
    (["cancelled", "no_show"] as const).flatMap((from) =>
      (["confirmed", "checked_in", "checked_out"] as const).map((to) => ({ from, to })),
    ),
  )(
    "rejects restoration from $from to $to when capacity changes after preflight",
    async ({ from, to }) => {
      let d = await create();
      // Cover both assigned and unassigned saved rooms.
      d = await command(d, [
        roomEdit(d, 0, { adults: 2, roomId: from === "no_show" ? null : "room-101" }),
      ]);
      d = await command(d, [{ type: "set-status", status: from }]);
      const body = {
        requestId: crypto.randomUUID(),
        actions: [{ type: "set-status", status: to }],
      };
      const preview = await request(`/reservations/${d.id}/preview`, "POST", body);
      expect(preview.status).toBe(200);
      expect(await preview.json()).toMatchObject({
        billing: { status: to, totalCents: 30000 },
        validation: { issues: [] },
      });
      const paused = pauseCommandBatch();
      const pending = request(`/reservations/${d.id}/commands`, "POST", body);
      await paused.ready;
      try {
        const response = await request("/room-types/type", "PATCH", { maxOccupancy: 1 });
        expect(response.status).toBe(200);
      } finally {
        paused.resume();
      }
      const response = await pending;
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "too many guests for this room type" });
      expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);
      expect(
        sqlite.prepare("SELECT id FROM reservation_requests WHERE id = ?").get(body.requestId),
      ).toBeUndefined();
      const invalidPreview = await request(`/reservations/${d.id}/preview`, "POST", body);
      expect(invalidPreview.status).toBe(200);
      expect(await invalidPreview.json()).toMatchObject({
        billing: { totalCents: 30000 },
        validation: {
          issues: [
            { code: "too many guests for this room type", roomIndex: 0, field: "occupancy" },
          ],
        },
      });
    },
  );

  it.each([
    { status: "confirmed", checkIn: "2026-10-10", checkOut: "2026-10-12" },
    { status: "cancelled", checkIn: "2026-10-10", checkOut: "2026-10-14" },
    { status: "no_show", checkIn: "2026-10-11", checkOut: "2026-10-14" },
  ] as const)(
    "rejects changed dates for $status when capacity changes after preflight",
    async ({ status, checkIn, checkOut }) => {
      let d = await create();
      d = await command(d, [roomEdit(d, 0, { adults: 2 }), { type: "set-status", status }]);
      const nights = sqlite.prepare("SELECT * FROM reservation_room_nights ORDER BY id").all();
      const paused = pauseCommandBatch();
      const pending = command(d, [{ type: "dates", checkIn, checkOut }, pay(5000)], 409);
      await paused.ready;
      try {
        expect((await request("/room-types/type", "PATCH", { maxOccupancy: 1 })).status).toBe(200);
      } finally {
        paused.resume();
      }
      expect(await pending).toEqual({ error: "too many guests for this room type" });
      expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);
      expect(sqlite.prepare("SELECT * FROM reservation_room_nights ORDER BY id").all()).toEqual(
        nights,
      );
    },
  );

  it("rolls back every restoration write and allows the same request to succeed and replay later", async () => {
    let d = await create(2);
    d = await command(d, [roomEdit(d), roomEdit(d, 1, { adults: 2 })]);
    d = await command(d, [
      { type: "set-guests", guests: [guest(d.rooms[1].id)] },
      { type: "set-status", status: "cancelled" },
    ]);
    const snapshot = () =>
      [
        "reservations",
        "guests",
        "reservation_rooms",
        "reservation_room_nights",
        "reservation_guests",
        "payments",
        "reservation_requests",
      ].map((table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    const before = snapshot();
    const body = {
      requestId: crypto.randomUUID(),
      actions: [
        { type: "set-status", status: "confirmed" },
        roomEdit(d, 0, { roomId: "room-103" }),
        { type: "contact", contact: { fullName: "Changed contact", email: null, phone: null } },
        { type: "notes", notes: "Restored" },
        setDiscount(1000),
        pay(5000),
      ],
    };
    const paused = pauseCommandBatch();
    const pending = request(`/reservations/${d.id}/commands`, "POST", body);
    await paused.ready;
    try {
      expect((await request("/room-types/type", "PATCH", { maxOccupancy: 1 })).status).toBe(200);
    } finally {
      paused.resume();
    }
    const failed = await pending;
    expect(failed.status).toBe(409);
    expect(await failed.json()).toEqual({ error: "too many guests for this room type" });
    expect(snapshot()).toEqual(before);
    expect((await request("/room-types/type")).status).toBe(200);
    expect(await (await request("/room-types/type")).json()).toMatchObject({ maxOccupancy: 1 });

    expect((await request("/room-types/type", "PATCH", { maxOccupancy: 2 })).status).toBe(200);
    const saved = await request(`/reservations/${d.id}/commands`, "POST", body);
    expect(saved.status).toBe(200);
    const detail = (await saved.json()) as Detail;
    expect(detail).toMatchObject({
      status: "confirmed",
      notes: "Restored",
      savedDiscountCents: 1000,
      paidCents: 5000,
      totalCents: 59000,
      guest: { fullName: "Changed contact" },
    });
    expect(detail.rooms[0].roomId).toBe("room-103");
    expect(detail.stayingGuests).toEqual(d.stayingGuests);
    expect(detail.rooms.map((room) => room.nights)).toEqual(d.rooms.map((room) => room.nights));
    const replayed = await request(`/reservations/${d.id}/commands`, "POST", body);
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual(detail);
    const reused = await request(`/reservations/${d.id}/commands`, "POST", {
      ...body,
      actions: [pay(1)],
    });
    expect(reused.status).toBe(409);
  });

  it("rejects restoration when an assigned room changes type after preflight and keeps proposed issue indices", async () => {
    let d = await create(2);
    d = await command(d, [
      roomEdit(d),
      roomEdit(d, 1),
      { type: "set-status", status: "cancelled" },
    ]);
    const other = await request("/room-types", "POST", {
      name: "Twin",
      maxOccupancy: 2,
      baseRateCents: 20000,
    });
    expect(other.status).toBe(201);
    const { id: roomTypeId } = (await other.json()) as { id: string };
    const body = {
      requestId: crypto.randomUUID(),
      actions: [
        { type: "remove-room", lineId: d.rooms[0].id },
        { type: "set-status", status: "confirmed" },
      ],
    };
    const paused = pauseCommandBatch();
    const pending = request(`/reservations/${d.id}/commands`, "POST", body);
    await paused.ready;
    try {
      expect((await request("/rooms/room-102", "PATCH", { roomTypeId })).status).toBe(200);
    } finally {
      paused.resume();
    }
    const failed = await pending;
    expect(failed.status).toBe(409);
    expect(await failed.json()).toEqual({ error: "room is a different type" });
    const unchanged = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(unchanged.status).toBe("cancelled");
    expect(unchanged.rooms.map((room) => room.id)).toEqual(d.rooms.map((room) => room.id));
    const preview = await request(`/reservations/${d.id}/preview`, "POST", body);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      billing: { totalCents: 30000 },
      validation: { issues: [{ code: "room is a different type", roomIndex: 0, field: "roomId" }] },
    });
  });

  it("allows unchanged-room saves when capacity changes between preflight and commit", async () => {
    let d = await create();
    d = await command(d, [roomEdit(d, 0, { adults: 2 })]);
    const paused = pauseCommandBatch();
    const pending = command(d, [pay(5000), setDiscount(1000), { type: "notes", notes: "Paid" }]);
    await paused.ready;
    try {
      expect((await request("/room-types/type", "PATCH", { maxOccupancy: 1 })).status).toBe(200);
    } finally {
      paused.resume();
    }
    d = await pending;
    expect(d).toMatchObject({
      paidCents: 5000,
      savedDiscountCents: 1000,
      notes: "Paid",
      status: "confirmed",
    });
    expect(d.rooms[0].adults).toBe(2);
    const saved = await command(d, [{ type: "set-status", status: "cancelled" }]);
    expect(saved.creditCents).toBe(5000);
  });

  it("preserves a concurrent discount when an older notes plan commits later", async () => {
    const d = await create();
    const paused = pauseCommandBatch();
    const pending = command(d, [{ type: "notes", notes: "Arriving after 10 pm" }]);
    await paused.ready;
    await command(d, [setDiscount(5000)]);
    paused.resume();
    const saved = await pending;
    expect(saved).toMatchObject({
      notes: "Arriving after 10 pm",
      savedDiscountCents: 5000,
      totalCents: 25000,
    });
  });

  it("keeps extended dates and charged nights together after a concurrent notes save", async () => {
    const d = await create();
    const paused = pauseCommandBatch();
    const pending = command(d, [{ type: "notes", notes: "Late arrival" }]);
    await paused.ready;
    await command(d, [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-10-14" }]);
    paused.resume();
    const saved = await pending;
    expect(saved).toMatchObject({
      checkOut: "2026-10-14",
      nights: 4,
      totalCents: 40000,
      notes: "Late arrival",
    });
    expect(saved.rooms[0].nights.map((night) => night.date)).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
    ]);
  });

  it("preserves newly saved staying guests when a concurrent payment retries", async () => {
    const d = await create();
    const person = guest(d.rooms[0].id);
    const paused = pauseCommandBatch();
    const pending = command(d, [pay(1000)]);
    await paused.ready;
    await command(d, [{ type: "set-guests", guests: [person] }]);
    paused.resume();
    const saved = await pending;
    expect(saved.stayingGuests).toMatchObject([person]);
    expect(saved.paidCents).toBe(1000);
    expect(saved.payments).toHaveLength(1);
  });

  it("keeps both distinct payments when a stale command retries", async () => {
    const d = await create();
    const paused = pauseCommandBatch();
    const pending = command(d, [pay(1000)]);
    await paused.ready;
    await command(d, [pay(2000)]);
    paused.resume();
    const saved = await pending;
    expect(saved.paidCents).toBe(3000);
    expect(saved.payments).toHaveLength(2);
  });

  it("lets the later successful notes edit win after retrying", async () => {
    const d = await create();
    const paused = pauseCommandBatch();
    const pending = command(d, [{ type: "notes", notes: "Arriving at 10 pm" }]);
    await paused.ready;
    await command(d, [{ type: "notes", notes: "Arriving at 8 pm" }]);
    paused.resume();
    expect((await pending).notes).toBe("Arriving at 10 pm");
  });

  it("replays a request another attempt committed without duplicating its payment", async () => {
    const d = await create();
    const body = { requestId: crypto.randomUUID(), actions: [pay(1000)] };
    const paused = pauseCommandBatch();
    const pending = request(`/reservations/${d.id}/commands`, "POST", body);
    await paused.ready;
    expect((await request(`/reservations/${d.id}/commands`, "POST", body)).status).toBe(200);
    paused.resume();
    const response = await pending;
    expect(response.status).toBe(200);
    const saved = (await response.json()) as Detail;
    expect(saved.payments).toHaveLength(1);
    expect(saved.paidCents).toBe(1000);
  });

  it("preserves guest-editor notes when a contact command retries", async () => {
    const d = await create();
    const paused = pauseCommandBatch();
    const pending = command(d, [
      pay(1000),
      {
        type: "contact",
        contact: { fullName: "Updated contact", email: null, phone: null },
      },
    ]);
    await paused.ready;
    expect(
      (await request(`/guests/${d.guestId}`, "PATCH", { notes: "Guest preference" })).status,
    ).toBe(200);
    paused.resume();
    const saved = await pending;
    expect(saved.guest).toMatchObject({ fullName: "Updated contact", notes: "Guest preference" });
    expect(saved.payments).toHaveLength(1);
    expect(saved.paidCents).toBe(1000);
  });

  it("reapplies an intentional contact edit even when it matched the original values", async () => {
    const d = await create();
    const paused = pauseCommandBatch();
    const pending = command(d, [
      {
        type: "contact",
        contact: { fullName: d.guest.fullName, email: null, phone: null },
      },
    ]);
    await paused.ready;
    expect(
      (await request(`/guests/${d.guestId}`, "PATCH", { fullName: "Other edit" })).status,
    ).toBe(200);
    paused.resume();
    expect((await pending).guest.fullName).toBe(d.guest.fullName);
  });

  it("rejects a changed payload when the same request ID commits while an attempt waits", async () => {
    const d = await create();
    const body = { requestId: crypto.randomUUID(), actions: [pay(1000)] };
    const paused = pauseCommandBatch();
    const pending = request(`/reservations/${d.id}/commands`, "POST", body);
    await paused.ready;
    expect(
      (await request(`/reservations/${d.id}/commands`, "POST", { ...body, actions: [pay(2000)] }))
        .status,
    ).toBe(200);
    paused.resume();
    const response = await pending;
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "request ID reused with a different payload" });
    const saved = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(saved.payments).toHaveLength(1);
    expect(saved.paidCents).toBe(2000);
  });

  it("revalidates the original actions when a concurrent save removes their payment", async () => {
    const d = await command(await create(), [pay(1000)]);
    const paused = pauseCommandBatch();
    const body = {
      requestId: crypto.randomUUID(),
      actions: [
        { type: "notes", notes: "Must not save" },
        {
          type: "edit-payment",
          paymentId: d.payments[0].id,
          payment: {
            amountCents: 2000,
            method: "cash",
            paymentDate: "2026-10-10",
          },
        },
      ],
    };
    const pending = request(`/reservations/${d.id}/commands`, "POST", body);
    await paused.ready;
    await command(d, [{ type: "delete-payment", paymentId: d.payments[0].id }]);
    paused.resume();
    const response = await pending;
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "payment not found" });
    const saved = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(saved.payments).toEqual([]);
    expect(saved.notes).toBeNull();
    expect(
      sqlite.prepare("SELECT id FROM reservation_requests WHERE id=?").get(body.requestId),
    ).toBeUndefined();
  });

  it("guards a shared contact when another reservation edits it concurrently", async () => {
    const first = await create();
    const second = await create();
    sqlite.prepare("UPDATE reservations SET guest_id=? WHERE id=?").run(first.guestId, second.id);
    const paused = pauseCommandBatch();
    const pending = command(first, [
      {
        type: "contact",
        contact: { fullName: "Later contact", email: null, phone: null },
      },
    ]);
    await paused.ready;
    await command(second, [
      {
        type: "contact",
        contact: {
          fullName: "Other contact",
          email: null,
          phone: null,
          documentType: "DNI",
          documentNumber: "87654321",
        },
      },
    ]);
    paused.resume();
    const saved = await pending;
    expect(saved.guest).toMatchObject({
      fullName: "Later contact",
      documentType: "DNI",
      documentNumber: "87654321",
    });
    expect(saved.guest).not.toHaveProperty("revision");
    expect(saved).not.toHaveProperty("revision");
  });

  it("bounds retries, rolls back exhausted attempts, and keeps the request ID usable", async () => {
    const d = await create();
    const body = { requestId: crypto.randomUUID(), actions: [pay(1000)] };
    const batch = binding.batch.bind(binding);
    // A second binding represents another Worker, outside the pending request's
    // interception. Each contender is a real command with its own receipt.
    const otherBinding = Object.create(binding) as D1Database;
    otherBinding.batch = batch;
    let contenders = 0;
    const spy = vi
      .spyOn(binding, "batch")
      .mockImplementation(async <T>(queries: D1PreparedStatement[]) => {
        if (isCommandBatch(queries)) {
          contenders++;
          const response = await request(
            `/reservations/${d.id}/commands`,
            "POST",
            {
              requestId: crypto.randomUUID(),
              actions: [{ type: "notes", notes: `Other save ${contenders}` }],
            },
            otherBinding,
          );
          expect(response.status).toBe(200);
        }
        return batch<T>(queries);
      });
    const response = await request(`/reservations/${d.id}/commands`, "POST", body);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "reservation changed while saving; please try again",
    });
    expect(contenders).toBe(3);
    let saved = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(saved).toMatchObject({ notes: "Other save 3", status: "confirmed", paidCents: 0 });
    expect(saved.payments).toEqual([]);
    expect(
      sqlite.prepare("SELECT id FROM reservation_requests WHERE id=?").get(body.requestId),
    ).toBeUndefined();
    spy.mockRestore();
    expect((await request(`/reservations/${d.id}/commands`, "POST", body)).status).toBe(200);
    expect((await request(`/reservations/${d.id}/commands`, "POST", body)).status).toBe(200);
    saved = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(saved.payments).toHaveLength(1);
    expect(saved.paidCents).toBe(1000);
  });
});

describe("reservation workflow", () => {
  it("books unassigned capacity and preserves prices when assigning", async () => {
    let d = await create(2);
    expect(d.totalCents).toBe(60000);
    d = await command(d, [roomEdit(d)]);
    expect(d.totalCents).toBe(60000);
    const availability = (await (
      await request("/availability?checkIn=2026-10-10&checkOut=2026-10-13")
    ).json()) as { roomTypes: { free: number }[] };
    expect(availability.roomTypes[0].free).toBe(1);
    d = await command(d, [roomEdit(d, 0, { roomId: null })]);
    expect(d.rooms[0].roomId).toBeNull();
    d = await command(d, [all(d, "check-in")]);
    expect(d.status).toBe("checked_in");
    expect(d.rooms.every((line) => line.roomId === null)).toBe(true);
  });
  it("rejects discount-shaped payment payloads and negative discount amounts", async () => {
    const d = await create();
    expect(
      (
        await request(`/reservations/${d.id}/commands`, "POST", {
          requestId: crypto.randomUUID(),
          actions: [{ type: "add-payment", payment: { kind: "discount", amountCents: 1000 } }],
        })
      ).status,
    ).toBe(400);
    await command(d, [{ type: "set-discount", amountCents: -1 }], 400);
    await command(d, [{ type: "set-discount", amountCents: 1.5 }], 400);
  });
  it("removes cancelled charges but retains payments as credit and in payment reports", async () => {
    let d = await arrive(await create());
    d = await command(d, [pay(30000), setDiscount(5000), all(d, "check-out")]);
    d = await command(d, [{ type: "set-status", status: "cancelled" }]);
    expect(d).toMatchObject({
      totalCents: 0,
      paidCents: 30000,
      discountCents: 0,
      savedDiscountCents: 5000,
      creditCents: 30000,
      balanceCents: -30000,
    });
    expect(d.payments[0].amountCents).toBe(30000);
    expect(d.rooms[0].nights).toHaveLength(3);
    const report = await (await request("/payments?from=2026-10-10&to=2026-10-10")).json();
    expect(report).toMatchObject({ totalCents: 30000, payments: [{ amountCents: 30000 }] });
  });
  it("reprices type changes and permits an explicit matching assignment", async () => {
    sqlite.exec(
      "INSERT INTO room_types VALUES ('other','Twin',3,20000,'2026-10-10'); INSERT INTO rooms VALUES ('201','201','other')",
    );
    let d = await create();
    d = await command(d, [roomEdit(d)]);
    d = await command(d, [roomEdit(d, 0, { roomTypeId: "other", roomId: "201" })]);
    expect(d.rooms[0].roomId).toBe("201");
    expect(d.totalCents).toBe(60000);
  });
  it("rejects closed and occupied assignments and rolls back all selected actions", async () => {
    let first = await create();
    first = await command(first, [roomEdit(first)]);
    const d = await create();
    await command(d, [pay(10000), roomEdit(d)], 409);
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).paidCents).toBe(0);
    sqlite.exec(
      "INSERT INTO room_closures VALUES ('closed','room-102','2026-10-10','2026-10-13','Maintenance','2026-10-10')",
    );
    await command(d, [roomEdit(d, 0, { roomId: "room-102" })], 409);
  });
  it("edits a mistaken cash payment in place after checkout without reopening the stay", async () => {
    let d = await arrive(await create());
    d = await command(d, [pay(11000), all(d, "check-out")]);
    const id = d.payments[0].id;
    const createdAt = d.payments[0].createdAt;
    vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
    d = await command(d, [
      {
        type: "edit-payment",
        paymentId: id,
        payment: {
          amountCents: 10000,
          method: "cash",
          paymentDate: "2026-10-09",
          reference: "Actual receipt",
        },
      },
    ]);
    expect(d.balanceCents).toBe(20000);
    expect(d.status).toBe("checked_out");
    expect(d.payments).toHaveLength(1);
    expect(d.payments[0]).toMatchObject({
      id,
      amountCents: 10000,
      paymentDate: "2026-10-09",
      reference: "ACTUAL RECEIPT",
      createdAt,
    });
    const report = await (await request("/payments?from=2026-10-09&to=2026-10-09")).json();
    expect(report).toMatchObject({ totalCents: 10000 });
  });
  it("deletes a payment on the wrong booking and permits entering it on another", async () => {
    let d = await command(await create(), [pay(10000)]);
    const other = await create();
    const id = d.payments[0].id;
    await command(other, [{ type: "delete-payment", paymentId: id }], 400);
    await command(
      other,
      [
        {
          type: "edit-payment",
          paymentId: id,
          payment: { amountCents: 10000, method: "cash", paymentDate: "2026-10-10" },
        },
      ],
      400,
    );
    d = await command(d, [{ type: "delete-payment", paymentId: id }]);
    expect(d.paidCents).toBe(0);
    expect(d.payments).toEqual([]);
    expect(sqlite.prepare("SELECT id FROM payments WHERE id=?").get(id)).toBeUndefined();
    expect((await command(other, [pay(10000)])).paidCents).toBe(10000);
  });
  it("deduplicates retries and rejects changed payloads without a version contract", async () => {
    const d = await create(),
      body = { requestId: crypto.randomUUID(), actions: [pay(10000)] };
    expect((await request(`/reservations/${d.id}/commands`, "POST", body)).status).toBe(200);
    expect((await request(`/reservations/${d.id}/commands`, "POST", body)).status).toBe(200);
    expect(
      (await request(`/reservations/${d.id}/commands`, "POST", { ...body, actions: [pay(20000)] }))
        .status,
    ).toBe(409);
    await command(d, [{ type: "notes", notes: "Saved from old screen" }]);
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).paidCents).toBe(
      10000,
    );
  });
  it("keeps payment and stay edits atomic when a later action fails", async () => {
    let d = await command(await create(), [pay(11000)]);
    const id = d.payments[0].id;
    await command(
      d,
      [
        { type: "delete-payment", paymentId: id },
        { type: "dates", checkIn: d.checkIn, checkOut: "2026-10-09" },
      ],
      400,
    );
    d = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(d.paidCents).toBe(11000);
    expect(d.payments[0].id).toBe(id);
  });
  it("previews checkout with debt without writing", async () => {
    const d = await arrive(await create());
    const r = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [all(d, "check-out")],
    });
    expect(await r.json()).toMatchObject({
      billing: { totalCents: 30000, balanceCents: 30000 },
      validation: { issues: [] },
    });
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).status).toBe(
      "checked_in",
    );
  });
  it("deduplicates concurrent creation and rejects payload changes", async () => {
    const input = {
      requestId: crypto.randomUUID(),
      guest: { fullName: "Retry Guest" },
      checkIn: "2026-10-10",
      checkOut: "2026-10-11",
      rooms: [
        {
          roomTypeId: "type",
          adults: 1,
          children: 0,
        },
      ],
    };
    const responses = await Promise.all([
      request("/reservations", "POST", input),
      request("/reservations", "POST", input),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const details = (await Promise.all(responses.map((r) => r.json()))) as Detail[];
    expect(details[0].id).toBe(details[1].id);
    expect(sqlite.prepare("SELECT count(*) AS n FROM reservations").get()?.n).toBe(1);
    expect((await request("/reservations", "POST", { ...input, notes: "changed" })).status).toBe(
      409,
    );
  });
  it("saves the primary contact, reservation notes, and initial discount atomically", async () => {
    const input = {
      requestId: crypto.randomUUID(),
      guest: { fullName: "Ada Lovelace", email: "ada@example.com", phone: "+51 999 888 777" },
      checkIn: "2026-10-10",
      checkOut: "2026-10-13",
      notes: "Late arrival",
      discountCents: 3000,
      rooms: [{ roomTypeId: "type", adults: 2, children: 0 }],
    };
    const response = await request("/reservations", "POST", input);
    expect(response.status).toBe(201);
    const saved = (await response.json()) as Detail;
    expect(saved.guest).toMatchObject(input.guest);
    expect(saved.notes).toBe(input.notes);
    expect(saved.savedDiscountCents).toBe(3000);
    expect(saved.totalCents).toBe(27000);
    expect(saved.balanceCents).toBe(27000);
    const retry = await request("/reservations", "POST", input);
    expect(((await retry.json()) as Detail).id).toBe(saved.id);
    expect((await request("/reservations", "POST", { ...input, discountCents: 0 })).status).toBe(
      409,
    );
    for (const discountCents of [-1, 0.5, 1000000001])
      expect(
        (
          await request("/reservations", "POST", {
            ...input,
            requestId: crypto.randomUUID(),
            discountCents,
          })
        ).status,
      ).toBe(400);
  });
  it("rejects one of two distinct bookings competing for the last room", async () => {
    await create(2);
    const responses = await Promise.all(
      [1, 2].map(async () =>
        request("/reservations", "POST", {
          requestId: crypto.randomUUID(),
          guest: { fullName: "Last Room" },
          checkIn: "2026-10-10",
          checkOut: "2026-10-13",
          rooms: [
            {
              roomTypeId: "type",
              adults: 1,
              children: 0,
            },
          ],
        }),
      ),
    );
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
  });
  it("rolls back extension dates and prices when another booking owns the added night", async () => {
    let d = await create(1, { checkIn: "2026-10-10", checkOut: "2026-10-11" });
    d = await command(d, [roomEdit(d)]);
    let next = await create(1, { checkIn: "2026-10-11", checkOut: "2026-10-13" });
    next = await command(next, [roomEdit(next)]);
    await command(d, [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-10-12" }], 409);
    const fresh = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(fresh.checkOut).toBe("2026-10-11");
    expect(fresh.totalCents).toBe(10000);
  });
  it("does not clear an assignment on a failed same-type move", async () => {
    let d = await arrive(await create());
    let other = await create();
    other = await command(other, [roomEdit(other, 0, { roomId: "room-102" })]);
    await command(d, [roomEdit(d, 0, { roomId: "room-102" })], 409);
    d = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(d.rooms[0].roomId).toBe("room-101");
    expect(d.status).toBe("checked_in");
  });
  it("permits a discount with checkout and never treats it as payment", async () => {
    let d = await arrive(await create(2));
    d = await command(d, [all(d, "check-out"), setDiscount(20000)]);
    expect(d.balanceCents).toBe(40000);
    expect(d.paidCents).toBe(0);
    expect(d.discountCents).toBe(20000);
    expect(d.status).toBe("checked_out");
  });
  it("previews conflicting assignment without changing anything", async () => {
    const a = await create(),
      b = await create();
    await command(a, [roomEdit(a)]);
    const r = await request(`/reservations/${b.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [roomEdit(b)],
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      billing: { totalCents: 30000 },
      validation: {
        issues: [
          { code: "room is already assigned for those dates", roomIndex: 0, field: "roomId" },
        ],
      },
    });
    expect(((await (await request(`/reservations/${b.id}`)).json()) as Detail).rooms).toEqual(
      b.rooms,
    );
  });
  it("quotes a back-to-back extension, identifies its room conflict, and refuses to save it", async () => {
    const first = await create(1, { checkIn: "2026-10-10", checkOut: "2026-10-13" });
    const next = await create(1, { checkIn: "2026-10-13", checkOut: "2026-10-15" });
    await command(first, [roomEdit(first)]);
    await command(next, [roomEdit(next)]);
    const actions: WorkflowAction[] = [
      { type: "dates", checkIn: first.checkIn, checkOut: "2026-10-14" },
    ];
    const response = await request(`/reservations/${first.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      billing: { subtotalCents: 40000, totalCents: 40000, checkOut: "2026-10-14" },
      validation: {
        issues: [
          { code: "room is already assigned for those dates", roomIndex: 0, field: "roomId" },
        ],
      },
    });
    await command(first, actions, 409);
    const saved = (await (await request(`/reservations/${first.id}`)).json()) as Detail;
    expect(saved.checkOut).toBe("2026-10-13");
    expect(saved.totalCents).toBe(30000);
    const corrected = [...actions, roomEdit(saved, 0, { roomId: "room-102" })];
    const valid = await request(`/reservations/${first.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: corrected,
    });
    expect(await valid.json()).toMatchObject({
      billing: { totalCents: 40000 },
      validation: { issues: [] },
    });
    expect((await command(saved, corrected)).totalCents).toBe(40000);
  });
  it("quotes rooms with occupancy or assignment issues and still rejects those writes", async () => {
    const d = await create();
    sqlite.exec(
      "INSERT INTO room_types VALUES ('other', 'Single', 1, 5000, '2026-10-10'); INSERT INTO rooms VALUES ('room-other', '201', 'other')",
    );
    const actions = [roomEdit(d, 0, { adults: 3, roomId: "room-other" })];
    const response = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      billing: { totalCents: 30000 },
      validation: {
        issues: [
          { code: "too many guests for this room type", roomIndex: 0, field: "occupancy" },
          { code: "room is a different type", roomIndex: 0, field: "roomId" },
        ],
      },
    });
    await command(d, actions, 400);
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).rooms).toEqual(
      d.rooms,
    );
  });
  it("allows payments and cancellation with unchanged occupancy after a room capacity reduction", async () => {
    let d = await bookingAfterCapacityReduction();
    const paymentPreview = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [pay(5000)],
    });
    expect(paymentPreview.status).toBe(200);
    expect(await paymentPreview.json()).toMatchObject({
      billing: { totalCents: 30000, paidCents: 5000, balanceCents: 25000 },
      validation: { issues: [] },
    });
    d = await command(d, [pay(5000)]);
    expect(d.paidCents).toBe(5000);
    d = await command(d, [{ type: "notes", notes: "Payment received" }, setDiscount(1000)]);
    expect(d.notes).toBe("Payment received");
    expect(d.savedDiscountCents).toBe(1000);
    const actions: WorkflowAction[] = [
      { type: "set-status", status: "cancelled", reason: "Plans changed" },
    ];
    const cancellationPreview = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(cancellationPreview.status).toBe(200);
    expect(await cancellationPreview.json()).toMatchObject({
      billing: { status: "cancelled", totalCents: 0, paidCents: 5000, creditCents: 5000 },
      validation: { issues: [] },
    });
    d = await command(d, actions);
    expect(d.status).toBe("cancelled");
    expect(d.creditCents).toBe(5000);
    expect(d.rooms[0]).toMatchObject({ adults: 2, roomId: "room-101" });
    const available = await (
      await request("/availability?checkIn=2026-10-10&checkOut=2026-10-13")
    ).json();
    expect(available).toMatchObject({ roomTypes: [{ free: 3 }] });
  });
  it("still validates changed rooms and stay dates against the current occupancy limit", async () => {
    const d = await bookingAfterCapacityReduction();
    const changes: WorkflowAction[][] = [
      [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-10-14" }],
      [roomEdit(d, 0, { adults: 2, roomId: "room-102" })],
      [roomEdit(d, 0, { adults: 2, children: 1 })],
    ];
    for (const actions of changes) {
      const response = await request(`/reservations/${d.id}/preview`, "POST", {
        requestId: crypto.randomUUID(),
        actions,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        validation: {
          issues: [
            { code: "too many guests for this room type", roomIndex: 0, field: "occupancy" },
          ],
        },
      });
      await command(d, actions, 400);
    }
    const unchanged = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(unchanged.rooms).toEqual(d.rooms);
    expect(unchanged.checkOut).toBe(d.checkOut);
    const corrected = await command(d, [roomEdit(d, 0, { adults: 1, roomId: "room-102" })]);
    expect(corrected.rooms[0]).toMatchObject({ adults: 1, roomId: "room-102" });
  });
  it("validates added rooms without revalidating unchanged rooms and preserves issue indices", async () => {
    const d = await bookingAfterCapacityReduction(2);
    const invalid: WorkflowAction[] = [
      { type: "add-room", room: { roomTypeId: "type", adults: 2, children: 0 } },
    ];
    const response = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: invalid,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      billing: { totalCents: 90000 },
      validation: {
        issues: [{ code: "too many guests for this room type", roomIndex: 2, field: "occupancy" }],
      },
    });
    await command(d, invalid, 400);
    const valid: WorkflowAction[] = [
      { type: "add-room", room: { roomTypeId: "type", adults: 1, children: 0 } },
    ];
    const saved = await command(d, valid);
    expect(saved.rooms).toHaveLength(3);
    expect(saved.rooms[0].adults).toBe(2);
    expect(saved.totalCents).toBe(90000);
  });
  it("revalidates occupancy when restoring inventory and allows correction in the same command", async () => {
    let d = await bookingAfterCapacityReduction();
    d = await command(d, [{ type: "set-status", status: "cancelled" }]);
    const restore: WorkflowAction[] = [{ type: "set-status", status: "confirmed" }];
    const response = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: restore,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      validation: {
        issues: [{ code: "too many guests for this room type", roomIndex: 0, field: "occupancy" }],
      },
    });
    await command(d, restore, 400);
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).status).toBe(
      "cancelled",
    );
    d = await command(d, [...restore, roomEdit(d, 0, { adults: 1 })]);
    expect(d.status).toBe("confirmed");
    expect(d.rooms[0].adults).toBe(1);
  });
  it("returns closure issues for every affected proposed room, including an added room after a removal", async () => {
    const d = await create(2);
    sqlite.exec(
      "INSERT INTO room_closures (id, room_id, starts, ends, reason, created_at) VALUES ('closed-1', 'room-101', '2026-10-13', '2026-10-15', NULL, '2026-10-10'), ('closed-2', 'room-102', '2026-10-13', '2026-10-15', NULL, '2026-10-10')",
    );
    const actions: WorkflowAction[] = [
      { type: "dates", checkIn: "2026-10-13", checkOut: "2026-10-15" },
      { type: "remove-room", lineId: d.rooms[0].id },
      roomEdit(d, 1),
      {
        type: "add-room",
        room: { roomTypeId: "type", roomId: "room-101", adults: 1, children: 0 },
      },
    ];
    const response = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(response.status).toBe(200);
    const preview = (await response.json()) as Preview;
    expect(preview.billing.totalCents).toBe(40000);
    expect(preview.validation.issues).toEqual(
      expect.arrayContaining([
        { code: "room is closed for those dates", roomIndex: 0, field: "roomId" },
        { code: "room is closed for those dates", roomIndex: 1, field: "roomId" },
      ]),
    );
    await command(d, actions, 409);
  });
  it("rejects dates that cannot be priced without changing the reservation", async () => {
    const d = await create();
    const response = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [{ type: "dates", checkIn: d.checkIn, checkOut: d.checkIn }],
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "stay must be at least one night" });
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).checkOut).toBe(
      d.checkOut,
    );
  });
  it("saves contact changes and staying guests atomically, separate from the booking contact", async () => {
    let d = await create(2);
    const person = guest(d.rooms[0].id);
    const actions: WorkflowAction[] = [
      { type: "contact", contact: { fullName: "Booker Company", email: null, phone: null } },
      { type: "set-guests", guests: [person, guest(null)] },
    ];
    const preview = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(preview.status).toBe(200);
    expect(
      ((await (await request(`/reservations/${d.id}`)).json()) as Detail).stayingGuests,
    ).toEqual([]);
    d = await command(d, actions);
    expect(d.guest.fullName).toBe("Booker Company");
    expect(d.stayingGuests).toHaveLength(2);
    expect(d.stayingGuests[0]).toMatchObject(person);
    d = await arrive(d);
    d = await command(d, [roomEdit(d, 0, { roomId: "room-103" })]);
    expect(d.stayingGuests[0].reservationRoomId).toBe(d.rooms[0].id);
    expect(d.rooms[0].roomId).toBe("room-103");
  });
  it("rejects foreign-room assignments and leaves contact and guests unchanged on failure", async () => {
    const d = await create(),
      other = await create();
    await command(
      d,
      [
        { type: "contact", contact: { fullName: "Changed Name", email: null, phone: null } },
        { type: "set-guests", guests: [guest(other.rooms[0].id)] },
      ],
      400,
    );
    const fresh = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(fresh.guest.fullName).toBe("Ada Lovelace");
    expect(fresh.stayingGuests).toEqual([]);
    await command(
      d,
      [{ type: "set-guests", guests: [guest(null), guest(null)].map((g) => ({ ...g, id: d.id })) }],
      400,
    );
  });
  it("supports clearing optional guest fields and removing a guest", async () => {
    let d = await create();
    const person = { ...guest(null), email: "ana@example.com", phone: "+51999123456" };
    d = await command(d, [{ type: "set-guests", guests: [person] }]);
    d = await command(d, [
      { type: "set-guests", guests: [{ ...person, email: null, phone: null }] },
    ]);
    expect(d.stayingGuests[0].email).toBeNull();
    d = await command(d, [{ type: "set-guests", guests: [] }]);
    expect(d.stayingGuests).toEqual([]);
  });
  it("requires a valid payment date, accepts an optional reference, and keeps audit creation time separate", async () => {
    let d = await create();
    for (const paymentDate of [undefined, "", "2026-02-30", "2026-10-11"]) {
      const response = await request(`/reservations/${d.id}/commands`, "POST", {
        requestId: crypto.randomUUID(),
        actions: [
          { type: "add-payment", payment: { amountCents: 1000, method: "cash", paymentDate } },
        ],
      });
      expect(response.status).toBe(400);
    }
    d = await command(d, [
      {
        type: "add-payment",
        payment: {
          amountCents: 1000,
          method: "transfer",
          paymentDate: "2026-10-08",
          reference: " op-123 ",
        },
      },
    ]);
    const entry = d.payments[0];
    expect(entry).toMatchObject({
      paymentDate: "2026-10-08",
      reference: "OP-123",
      createdAt: "2026-10-10T15:00:00.000Z",
    });
    expect(d.payments[0].reference).toBe("OP-123");
    const report = (await (await request("/payments?from=2026-10-08&to=2026-10-08")).json()) as {
      payments: { reference: string; paymentDate: string }[];
    };
    expect(report.payments[0].reference).toBe("OP-123");
    expect(report.payments[0].paymentDate).toBe("2026-10-08");
    const creationDayReport = await (
      await request("/payments?from=2026-10-10&to=2026-10-10")
    ).json();
    expect(creationDayReport).toMatchObject({ totalCents: 0, payments: [] });
    d = await command(d, [
      {
        type: "edit-payment",
        paymentId: entry.id,
        payment: {
          amountCents: 1000,
          method: "transfer",
          paymentDate: "2026-10-09",
          reference: "oP-124",
        },
      },
    ]);
    expect(d.payments.find((e) => e.id === entry.id)?.reference).toBe("OP-124");
    expect(d.payments).toHaveLength(1);
  });
  it("returns per-room draft prices without changing the saved reservation", async () => {
    const d = await create(2);
    const response = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-10-15" }],
    });
    expect(response.status).toBe(200);
    const { billing: preview } = (await response.json()) as Preview;
    const room = preview.rooms.find((line) => line.id === d.rooms[0].id)!;
    expect(room.subtotalCents).toBe(room.nights.reduce((sum, night) => sum + night.priceCents, 0));
    expect(room.discountCents).toBe(0);
    expect(room.totalCents).toBe(room.subtotalCents);
    expect(preview.subtotalCents).toBe(
      preview.rooms.reduce((sum, line) => sum + line.subtotalCents, 0),
    );
    const saved = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(saved.rooms).toEqual(d.rooms);
  });
  it("stores single and multipart names without splitting them", async () => {
    const d = await create();
    const fullName = "María José de la Cruz García";
    const updated = await command(d, [
      { type: "contact", contact: { fullName, email: null, phone: null } },
      {
        type: "set-guests",
        guests: [
          {
            id: crypto.randomUUID(),
            fullName: "李",
            reservationRoomId: d.rooms[0].id,
            email: null,
            phone: null,
          },
        ],
      },
    ]);
    expect(updated.guest.fullName).toBe(fullName);
    expect(updated.stayingGuests[0].fullName).toBe("李");
  });
  it("keeps no-shows billable while releasing availability and checks restoration conflicts", async () => {
    let d = await arrive(await create());
    d = await command(d, [pay(10000), { type: "set-status", status: "no_show" }]);
    expect(d).toMatchObject({
      totalCents: 30000,
      paidCents: 10000,
      balanceCents: 20000,
      creditCents: 0,
    });
    expect(d.payments[0].amountCents).toBe(10000);
    const next = await create();
    await command(next, [roomEdit(next)]);
    const actions: WorkflowAction[] = [{ type: "set-status", status: "confirmed" }];
    const preview = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      billing: { totalCents: 30000 },
      validation: {
        issues: [
          { code: "room is already assigned for those dates", field: "roomId", roomIndex: 0 },
        ],
      },
    });
    await command(d, actions, 409);
    expect(await (await request("/payments?from=2026-10-10&to=2026-10-10")).json()).toMatchObject({
      payments: [{ amountCents: 10000 }],
      totalCents: 10000,
    });
  });
  it("restores a cancelled booking through the ordinary label edit", async () => {
    let d = await command(await create(), [pay(10000), setDiscount(1000)]);
    d = await command(d, [{ type: "set-status", status: "cancelled" }]);
    expect(d.balanceCents).toBe(-10000);
    d = await command(d, [{ type: "set-status", status: "confirmed" }]);
    expect(d.cancelledAt).toBeNull();
    expect(d).toMatchObject({ totalCents: 29000, paidCents: 10000, balanceCents: 19000 });
  });
  it("rejects invalid payment edits atomically and deduplicates edits and deletes", async () => {
    let d = await command(await create(), [pay(11000)]);
    const id = d.payments[0].id;
    for (const entry of [
      { amountCents: 0, method: "cash", paymentDate: "2026-10-10" },
      { amountCents: 10000, method: "cash", paymentDate: "2026-10-11" },
      { kind: "discount", amountCents: 10000 },
    ]) {
      const response = await request(`/reservations/${d.id}/commands`, "POST", {
        requestId: crypto.randomUUID(),
        actions: [{ type: "edit-payment", paymentId: id, payment: entry }],
      });
      expect(response.status).toBe(400);
    }
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).paidCents).toBe(
      11000,
    );
    for (const action of [
      {
        type: "edit-payment",
        paymentId: id,
        payment: { amountCents: 10000, method: "card", paymentDate: "2026-10-10" },
      },
      { type: "delete-payment", paymentId: id },
    ]) {
      const body = { requestId: crypto.randomUUID(), actions: [action] };
      expect((await request(`/reservations/${d.id}/commands`, "POST", body)).status).toBe(200);
      expect((await request(`/reservations/${d.id}/commands`, "POST", body)).status).toBe(200);
    }
    d = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(d.payments).toEqual([]);
    expect(d.balanceCents).toBe(30000);
  });
});
describe("reservation dates and lifecycle", () => {
  it("has one status and date range, with no actual timestamps, per-room lifecycle or versions", async () => {
    const d = await create(2);
    expect(d.status).toBe("confirmed");
    expect(d).not.toHaveProperty("version");
    expect(d).not.toHaveProperty("actualArrival");
    expect(d).not.toHaveProperty("actualDeparture");
    for (const line of d.rooms) {
      for (const key of ["status", "checkIn", "checkOut", "assignmentStart", "originalNights"])
        expect(line).not.toHaveProperty(key);
    }
  });
  it("checks in and checks out every room together while retaining debt and saved dates", async () => {
    let d = await arrive(await create(2));
    expect(d.status).toBe("checked_in");
    expect(d.checkIn).toBe("2026-10-10");
    vi.setSystemTime(new Date("2026-10-11T11:00:00Z"));
    d = await command(d, [all(d, "check-out")]);
    expect(d.status).toBe("checked_out");
    expect(d.checkIn).toBe("2026-10-10");
    expect(d.checkOut).toBe("2026-10-13");
    expect(d.balanceCents).toBe(60000);
    expect(d.rooms.every((line) => line.nights.length === 3)).toBe(true);
  });
  it("previews and saves check-in with a mix of assigned and unassigned rooms", async () => {
    let d = await create(2);
    const actions = [roomEdit(d), all(d, "check-in")];
    const response = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      billing: {
        status: "checked_in",
        totalCents: 60000,
        rooms: [{ roomId: "room-101" }, { roomId: null }],
      },
      validation: { issues: [] },
    });
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).status).toBe(
      "confirmed",
    );
    d = await command(d, actions);
    expect(d.status).toBe("checked_in");
    expect(d.rooms.map((line) => line.roomId)).toEqual(["room-101", null]);
    d = await command(d, [roomEdit(d, 0, { roomId: null })]);
    expect(d.status).toBe("checked_in");
    expect(d.rooms.every((line) => line.roomId === null)).toBe(true);
    expect(d.totalCents).toBe(60000);
  });
  it("prices added unassigned rooms after check-in and still rejects overbooking", async () => {
    let d = await arrive(await create(2));
    const actions: WorkflowAction[] = [
      { type: "add-room", room: { roomTypeId: "type", adults: 1, children: 0 } },
    ];
    const response = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(response.status).toBe(200);
    const { billing: preview } = (await response.json()) as Preview;
    expect(preview.status).toBe("checked_in");
    expect(preview.totalCents).toBe(90000);
    expect(preview.rooms[2]).toMatchObject({ roomId: null, totalCents: 30000 });
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).rooms).toHaveLength(
      2,
    );
    d = await command(d, actions);
    expect(d.status).toBe("checked_in");
    expect(d.rooms[2]).toMatchObject({ roomId: null, totalCents: 30000 });
    expect(d.totalCents).toBe(preview.totalCents);
    const availability = await (
      await request("/availability?checkIn=2026-10-10&checkOut=2026-10-13")
    ).json();
    expect(availability).toMatchObject({ roomTypes: [{ free: 0 }] });
    const overflow = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(overflow.status).toBe(200);
    expect(await overflow.json()).toMatchObject({
      billing: { totalCents: 120000 },
      validation: {
        issues: expect.arrayContaining([
          { code: "no availability", field: "roomTypeId", roomIndex: 3 },
        ]),
      },
    });
    await command(d, actions, 409);
  });
  it("allows correcting a reservation status while retaining the shared stay dates", async () => {
    let d = await arrive(await create(2));
    d = await command(d, [all(d, "check-out")]);
    d = await command(d, [{ type: "set-status", status: "confirmed" }]);
    expect(d.status).toBe("confirmed");
    expect(d.checkIn).toBe("2026-10-10");
    expect(d.checkOut).toBe("2026-10-13");
  });
  it("changes dates and nightly charges for all rooms in one save", async () => {
    let d = await create(2);
    const actions: WorkflowAction[] = [
      { type: "dates", checkIn: "2026-10-11", checkOut: "2026-10-15" },
    ];
    const preview = await request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    expect(await preview.json()).toMatchObject({
      billing: {
        checkIn: "2026-10-11",
        checkOut: "2026-10-15",
        subtotalCents: 80000,
      },
      validation: { issues: [] },
    });
    d = await command(d, actions);
    expect(
      d.rooms.every(
        (line) =>
          line.nights.map((night) => night.date).join(",") ===
          "2026-10-11,2026-10-12,2026-10-13,2026-10-14",
      ),
    ).toBe(true);
  });
  it("retains quoted prices on existing nights and prices only added nights at current rates", async () => {
    let d = await create(2);
    sqlite.exec("UPDATE room_types SET base_rate_cents=15000 WHERE id='type'");
    d = await command(d, [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-10-14" }]);
    expect(
      d.rooms.every(
        (line) =>
          line.nights.map((night) => night.priceCents).join(",") === "10000,10000,10000,15000",
      ),
    ).toBe(true);
  });
  it("removes a room, its charges and guest assignment, while retaining a reservation discount", async () => {
    let d = await create(2);
    const removed = d.rooms[0].id;
    d = await command(d, [{ type: "set-guests", guests: [guest(removed)] }, setDiscount(5000)]);
    d = await command(d, [{ type: "remove-room", lineId: removed }]);
    expect(d.rooms).toHaveLength(1);
    expect(d.totalCents).toBe(25000);
    expect(d.stayingGuests[0].reservationRoomId).toBeNull();
    expect(
      sqlite
        .prepare("SELECT id FROM reservation_room_nights WHERE reservation_room_id=?")
        .all(removed),
    ).toEqual([]);
    await command(d, [{ type: "remove-room", lineId: d.rooms[0].id }], 400);
  });
  it("swaps assigned rooms atomically and rejects duplicate final assignments", async () => {
    let d = await arrive(await create(2));
    d = await command(d, [
      roomEdit(d, 0, { roomId: "room-102" }),
      roomEdit(d, 1, { roomId: "room-101" }),
    ]);
    expect(d.rooms.map((line) => line.roomId)).toEqual(["room-102", "room-101"]);
    await command(d, [pay(1000), roomEdit(d, 1, { roomId: "room-102" })], 409);
    const saved = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(saved.paidCents).toBe(0);
    expect(saved.rooms).toEqual(d.rooms);
  });
  it("cancels all rooms together, retains payments, and checks availability when restored", async () => {
    let d = await command(await create(2), [pay(10000)]);
    d = await command(d, [{ type: "set-status", status: "cancelled", reason: "Plans changed" }]);
    expect(d.totalCents).toBe(0);
    expect(d.creditCents).toBe(10000);
    expect(d.cancellationReason).toBe("Plans changed");
    await create(2);
    await command(d, [{ type: "set-status", status: "confirmed" }], 409);
    const saved = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(saved.status).toBe("cancelled");
  });
  it("rejects the old per-room lifecycle, per-room dates and version contract", async () => {
    const d = await create();
    const oldActions = [
      { type: "check-out", lineIds: [d.rooms[0].id] },
      { type: "set-status", lineId: d.rooms[0].id, status: "checked_out" },
      {
        type: "edit-room",
        lineId: d.rooms[0].id,
        room: {
          roomTypeId: "type",
          adults: 1,
          children: 0,
          checkIn: d.checkIn,
          checkOut: d.checkOut,
        },
      },
    ];
    for (const action of oldActions)
      expect(
        (
          await request(`/reservations/${d.id}/commands`, "POST", {
            requestId: crypto.randomUUID(),
            actions: [action],
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await request(`/reservations/${d.id}/commands`, "POST", {
          requestId: crypto.randomUUID(),
          version: 0,
          actions: [pay(1000)],
        })
      ).status,
    ).toBe(400);
  });
  it("enforces the shared 60-night limit", async () => {
    const d = await create(2);
    await command(d, [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-12-10" }], 400);
  });
  it("filters reservation lists by the parent status", async () => {
    const d = await command(await create(2), [{ type: "set-status", status: "no_show" }]);
    const rows = (await (await request("/reservations?status=no_show")).json()) as Detail[];
    expect(rows.map((row) => row.id)).toEqual([d.id]);
    expect(await (await request("/reservations?status=confirmed")).json()).toEqual([]);
  });
});

async function book(
  fullName: string,
  dates: { checkIn: string; checkOut: string } = {
    checkIn: "2026-10-10",
    checkOut: "2026-10-12",
  },
) {
  const response = await request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    ...dates,
    guest: { fullName },
    rooms: [{ roomTypeId: "type", adults: 1, children: 0 }],
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<Detail & { guestName: string }>;
}

async function listed(query = "") {
  const response = await request(`/reservations${query}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<Array<Detail & { guestName: string }>>;
}

describe("reservation list search", () => {
  it("filters by the exact check-in date and still returns overlapping stays for a range", async () => {
    const arrival = await book("Ada Lovelace", { checkIn: "2026-10-10", checkOut: "2026-10-12" });
    const later = await book("Grace Hopper", { checkIn: "2026-10-11", checkOut: "2026-10-13" });
    const exact = await listed("?checkIn=2026-10-10");
    expect(exact.map((row) => row.id)).toEqual([arrival.id]);
    const covering = await listed("?from=2026-10-11&to=2026-10-11");
    expect(covering.map((row) => row.id).sort()).toEqual([arrival.id, later.id].sort());
  });

  it("requires each search token to match the code or the guest name", async () => {
    const ada = await book("Ada Lovelace");
    await book("Grace Hopper", { checkIn: "2026-10-11", checkOut: "2026-10-13" });
    expect((await listed("?q=Ada%20Love")).map((row) => row.id)).toEqual([ada.id]);
    expect(await listed("?q=ada%20hopper")).toEqual([]);
    expect(
      (await listed(`?q=${encodeURIComponent(`${ada.code} Lovelace`)}`)).map((row) => row.id),
    ).toEqual([ada.id]);
    expect(await listed(`?q=${encodeURIComponent("A_a Lovelace")}`)).toEqual([]);
    expect((await listed("?q=Love%25lace")).map((row) => row.id)).toEqual([ada.id]);
  });

  it("orders rows by check-in, guest name, then code", async () => {
    const zoe = await book("Zoe Cruz", { checkIn: "2026-10-13", checkOut: "2026-10-14" });
    const first = await book("Ada Lovelace", { checkIn: "2026-10-12", checkOut: "2026-10-13" });
    const second = await book("Ada Lovelace", { checkIn: "2026-10-12", checkOut: "2026-10-13" });
    const sameDay = [first, second].sort((a, b) =>
      a.code < b.code ? -1 : a.code > b.code ? 1 : 0,
    );
    const rows = await listed();
    expect(rows.map((row) => row.id)).toEqual([...sameDay.map((row) => row.id), zoe.id]);
  });
});
