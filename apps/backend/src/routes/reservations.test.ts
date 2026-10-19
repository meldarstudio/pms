/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import app from "../index";
import type { Env } from "../env";
import type { presentReservation } from "../present";
import { authEnv, signIn } from "../test-support/auth";

type Detail = ReturnType<typeof presentReservation>;
type Preview = {
  billing: Detail;
  validation: { issues: { code: string; roomIndex: number; field: string }[] };
};

let sqlite: DatabaseSync;
let binding: D1Database;
let batchTail: Promise<unknown> = Promise.resolve();
let bindings: Env["Bindings"];
let sessionCookie: string;

// Run the actual Hono routes and Drizzle SQL against SQLite with D1-style batches.
function statement(sql: string, params: SQLInputValue[] = []) {
  const execute = () => {
    if (sqlite.prepare(sql).columns().length) {
      // D1 batch results use column-name keys; duplicate join columns collapse.
      return { success: true, results: sqlite.prepare(sql).all(...params) };
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

beforeEach(async () => {
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
    INSERT INTO room_types (id, name, max_occupancy, base_rate_cents, created_at)
      VALUES ('type', 'King', 2, 10000, '2026-10-10');
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
  bindings = await authEnv({ DB: binding });
  sessionCookie = await signIn(bindings);
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
      headers: {
        cookie: sessionCookie,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { ...bindings, DB: database },
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
async function previewCommand(d: Detail, actions: WorkflowAction[]): Promise<Preview> {
  const response = await request(`/reservations/${d.id}/preview`, "POST", {
    requestId: crypto.randomUUID(),
    actions,
  });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body as Preview;
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

it("uses the property day for payment commands and previews, including edits across midnight", async () => {
  vi.setSystemTime(new Date("2026-11-01T01:00:00Z"));
  const d = await create();
  const payment = { amountCents: 1000, method: "cash" as const, paymentDate: "2026-10-31" };
  const saved = await command(d, [{ type: "add-payment", payment }]);
  expect(saved.payments[0].paymentDate).toBe("2026-10-31");
  const tomorrow = { ...payment, paymentDate: "2026-11-01" };
  for (const action of [
    { type: "add-payment", payment: tomorrow },
    { type: "edit-payment", paymentId: saved.payments[0].id, payment: tomorrow },
  ] as WorkflowAction[]) {
    for (const endpoint of ["commands", "preview"]) {
      const response = await request(`/reservations/${d.id}/${endpoint}`, "POST", {
        requestId: crypto.randomUUID(),
        actions: [action],
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "payment date cannot be in the future" });
    }
  }
  vi.setSystemTime(new Date("2026-11-01T04:59:59.999Z"));
  expect(await command(d, [{ type: "add-payment", payment: tomorrow }], 400)).toEqual({
    error: "payment date cannot be in the future",
  });
  vi.setSystemTime(new Date("2026-11-01T05:00:00Z"));
  const after = await command(d, [{ type: "add-payment", payment: tomorrow }]);
  expect(after.payments.map((p) => p.paymentDate).sort()).toEqual(["2026-10-31", "2026-11-01"]);
});

it.each(["assigned stay", "closure-reduced capacity"])(
  "protects the current property night against room type changes: %s",
  async (scenario) => {
    vi.setSystemTime(new Date("2026-11-01T01:00:00Z"));
    const d = await create(1, { checkIn: "2026-10-31", checkOut: "2026-11-01" });
    const typeResponse = await request("/room-types", "POST", {
      name: "Other",
      maxAdults: 2,
      maxChildren: 2,
      baseRateCents: 20000,
    });
    expect(typeResponse.status).toBe(201);
    const type = (await typeResponse.json()) as { id: string };
    if (scenario === "assigned stay") {
      await command(d, [roomEdit(d)]);
    } else {
      for (const roomId of ["room-102", "room-103"]) {
        const response = await request("/room-closures", "POST", {
          roomId,
          starts: "2026-10-31",
          ends: "2026-11-01",
        });
        expect(response.status).toBe(201);
      }
    }
    const body = { roomTypeId: type.id, number: "renumbered" };
    const blocked = await request("/rooms/room-101", "PATCH", body);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({
      error: scenario === "assigned stay" ? "room has an assigned stay" : "no availability",
    });
    const unchanged = await request("/rooms/room-101");
    expect(await unchanged.json()).toEqual({ id: "room-101", number: "101", roomTypeId: "type" });
    vi.setSystemTime(new Date("2026-11-01T05:00:00Z"));
    expect((await request("/rooms/room-101", "PATCH", body)).status).toBe(200);
    expect((await request(`/reservations/${d.id}`)).status).toBe(200);
  },
);

it.each([
  ["America/Lima", "2027-01-01T01:00:00Z", "2026-12-31", "2027-01-01"],
  ["America/New_York", "2026-03-08T04:59:59Z", "2026-03-07", "2026-03-08"],
  ["America/New_York", "2026-03-09T03:59:59Z", "2026-03-08", "2026-03-09"],
])("validates payments against %s at %s", async (timeZone, instant, today, tomorrow) => {
  bindings.PROPERTY_TIME_ZONE = timeZone;
  vi.setSystemTime(new Date(instant));
  sessionCookie = await signIn(bindings);
  const d = await create();
  const payment = { amountCents: 500, method: "cash" as const, paymentDate: today };
  const saved = await command(d, [{ type: "add-payment", payment }]);
  expect(saved.payments[0].paymentDate).toBe(today);
  expect(
    await command(
      d,
      [{ type: "add-payment", payment: { ...payment, paymentDate: tomorrow } }],
      400,
    ),
  ).toEqual({ error: "payment date cannot be in the future" });
});
const setDiscount = (amountCents: number): WorkflowAction => ({
  type: "set-discount",
  amountCents,
});

describe("saved and applied reservation discounts", () => {
  async function previewAndSave(d: Detail, actions: WorkflowAction[], expected: Partial<Detail>) {
    const preview = await previewCommand(d, actions);
    expect(preview).toMatchObject({ billing: expected, validation: { issues: [] } });
    expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);
    const saved = await command(d, actions);
    expect(saved).toMatchObject(expected);
    expect(await (await request(`/reservations/${d.id}`)).json()).toMatchObject(expected);
    expect(await listed()).toMatchObject([{ id: d.id, ...expected }]);
    expect((await paged()).rows).toMatchObject([{ id: d.id, ...expected }]);
    return saved;
  }

  it.each([
    { rate: 8000, saved: 3000, applied: 3000, total: 5000 },
    { rate: 8000, saved: 8000, applied: 8000, total: 0 },
    { rate: 8000, saved: 10000, applied: 8000, total: 0 },
    { rate: 0, saved: 10000, applied: 0, total: 0 },
  ])("creates a bill with $rate charges and a $saved saved discount", async (example) => {
    const response = await request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-10-10",
      checkOut: "2026-10-11",
      guest: { fullName: "Booking Contact" },
      rooms: [{ roomTypeId: "type", adults: 1, children: 0, nightlyRateCents: example.rate }],
      discountCents: example.saved,
    });
    expect(response.status).toBe(201);
    const created = (await response.json()) as Detail;
    const expected = {
      subtotalCents: example.rate,
      savedDiscountCents: example.saved,
      discountCents: example.applied,
      totalCents: example.total,
      paidCents: 0,
      balanceCents: example.total,
      creditCents: 0,
    };
    expect(created).toMatchObject(expected);
    expect(await (await request(`/reservations/${created.id}`)).json()).toMatchObject(expected);
    expect(await listed()).toMatchObject([{ id: created.id, ...expected }]);
    expect((await paged()).rows).toMatchObject([{ id: created.id, ...expected }]);
  });

  it.each([
    { saved: 10000, applied: 10000, total: 20000, paid: 0, balance: 20000, credit: 0 },
    { saved: 30000, applied: 30000, total: 0, paid: 0, balance: 0, credit: 0 },
    { saved: 50000, applied: 30000, total: 0, paid: 0, balance: 0, credit: 0 },
    { saved: 50000, applied: 30000, total: 0, paid: 3000, balance: -3000, credit: 3000 },
    { saved: 10000, applied: 10000, total: 20000, paid: 25000, balance: -5000, credit: 5000 },
  ])("previews and saves a $saved discount edit with $paid paid", async (example) => {
    let d = await create();
    if (example.paid) d = await command(d, [pay(example.paid)]);
    const saved = await previewAndSave(d, [setDiscount(example.saved)], {
      subtotalCents: 30000,
      savedDiscountCents: example.saved,
      discountCents: example.applied,
      totalCents: example.total,
      paidCents: example.paid,
      balanceCents: example.balance,
      creditCents: example.credit,
    });
    expect(saved.payments).toEqual(d.payments);
  });

  it.each([
    {
      change: "room removal",
      subtotal: 30000,
      grownSubtotal: 60000,
      grownTotal: 10000,
      balance: 7000,
    },
    {
      change: "shorter stay",
      subtotal: 40000,
      grownSubtotal: 80000,
      grownTotal: 30000,
      balance: 27000,
    },
    {
      change: "room type repricing",
      subtotal: 45000,
      grownSubtotal: 60000,
      grownTotal: 10000,
      balance: 7000,
    },
  ])(
    "retains the saved discount through $change and uses it again when charges grow",
    async (example) => {
      let cheaperTypeId = "";
      if (example.change === "room type repricing") {
        const response = await request("/setup", "POST", {
          name: "Smaller",
          maxAdults: 2,
          maxChildren: 2,
          baseRateCents: 5000,
          rooms: [{ number: "201" }],
        });
        expect(response.status).toBe(201);
        cheaperTypeId = ((await response.json()) as { roomType: { id: string } }).roomType.id;
      }
      let d = await command(await create(2), [setDiscount(50000), pay(3000)]);
      const shrink: WorkflowAction =
        example.change === "room removal"
          ? { type: "remove-room", lineId: d.rooms[1].id }
          : example.change === "shorter stay"
            ? { type: "dates", checkIn: d.checkIn, checkOut: "2026-10-12" }
            : roomEdit(d, 1, { roomTypeId: cheaperTypeId, roomId: null });
      d = await previewAndSave(d, [shrink], {
        subtotalCents: example.subtotal,
        savedDiscountCents: 50000,
        discountCents: example.subtotal,
        totalCents: 0,
        paidCents: 3000,
        balanceCents: -3000,
        creditCents: 3000,
      });
      const grow: WorkflowAction =
        example.change === "room removal"
          ? { type: "add-room", room: { roomTypeId: "type", adults: 1, children: 0 } }
          : example.change === "shorter stay"
            ? { type: "dates", checkIn: d.checkIn, checkOut: "2026-10-14" }
            : roomEdit(d, 1, { roomId: null });
      await previewAndSave(d, [grow], {
        subtotalCents: example.grownSubtotal,
        savedDiscountCents: 50000,
        discountCents: 50000,
        totalCents: example.grownTotal,
        paidCents: 3000,
        balanceCents: example.balance,
        creditCents: 0,
      });
    },
  );

  it.each(["before room changes", "after room changes"])(
    "bills the final combined state when the discount is set %s",
    async (order) => {
      const response = await request("/setup", "POST", {
        name: "Smaller",
        maxAdults: 2,
        maxChildren: 2,
        baseRateCents: 4000,
        rooms: [{ number: "201" }],
      });
      expect(response.status).toBe(201);
      const cheaper = (await response.json()) as { roomType: { id: string } };
      const d = await create(2);
      const actions: WorkflowAction[] = [
        { type: "remove-room", lineId: d.rooms[1].id },
        { type: "dates", checkIn: d.checkIn, checkOut: "2026-10-12" },
        roomEdit(d, 0, { roomTypeId: cheaper.roomType.id, roomId: null }),
        pay(3000),
      ];
      if (order === "before room changes") actions.unshift(setDiscount(10000));
      else actions.push(setDiscount(10000));
      const saved = await previewAndSave(d, actions, {
        subtotalCents: 8000,
        savedDiscountCents: 10000,
        discountCents: 8000,
        totalCents: 0,
        paidCents: 3000,
        balanceCents: -3000,
        creditCents: 3000,
      });
      expect(saved.rooms).toHaveLength(1);
      expect(saved.rooms[0].nights).toHaveLength(2);
      expect(saved.payments).toMatchObject([{ amountCents: 3000 }]);
    },
  );
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
  const response = await request("/room-types/type", "PATCH", { maxAdults: 1 });
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

it("reserves a king room for two adults and two children at the room's unchanged price", async () => {
  const response = await request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    checkIn: "2026-10-10",
    checkOut: "2026-10-13",
    guest: { fullName: "Family Guest" },
    rooms: [{ roomTypeId: "type", adults: 2, children: 2 }],
  });
  expect(response.status).toBe(201);
  const saved = (await response.json()) as Detail;
  const detail = (await (await request(`/reservations/${saved.id}`)).json()) as Detail;
  expect(detail.rooms[0]).toMatchObject({ adults: 2, children: 2 });
  expect(detail.totalCents).toBe(30000);
});

it("filters availability by both adult and child limits without changing room prices", async () => {
  const created = await request("/setup", "POST", {
    name: "Double",
    maxAdults: 4,
    maxChildren: 2,
    baseRateCents: 20000,
    rooms: [{ number: "201" }],
  });
  expect(created.status).toBe(201);
  const dates = "checkIn=2026-10-10&checkOut=2026-10-13";
  const adults = (await (await request(`/availability?${dates}&adults=3&children=0`)).json()) as {
    roomTypes: unknown[];
  };
  expect(adults.roomTypes).toEqual([
    expect.objectContaining({ name: "Double", maxAdults: 4, maxChildren: 2, totalCents: 60000 }),
  ]);
  const family = (await (await request(`/availability?${dates}&adults=2&children=2`)).json()) as {
    roomTypes: unknown[];
  };
  expect(family.roomTypes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "King", maxAdults: 2, maxChildren: 2, totalCents: 30000 }),
    ]),
  );
  const tooManyChildren = (await (
    await request(`/availability?${dates}&adults=2&children=3`)
  ).json()) as { roomTypes: unknown[] };
  expect(tooManyChildren.roomTypes).toEqual([]);
});

it.each([
  { adults: 3, children: 0 },
  { adults: 2, children: 3 },
])("rejects a new reservation exceeding an independent limit: %j", async (occupancy) => {
  const response = await request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    checkIn: "2026-10-10",
    checkOut: "2026-10-13",
    guest: { fullName: "Family Guest" },
    rooms: [{ roomTypeId: "type", ...occupancy }],
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "too many guests for this room type" });
  expect(await (await request("/reservations")).json()).toEqual([]);
});

it("reports excess children on the proposed room in preview and refuses to save the edit", async () => {
  const d = await create();
  const action = roomEdit(d, 0, { adults: 2, children: 3 });
  const preview = await previewCommand(d, [action]);
  expect(preview.validation.issues).toEqual([
    { code: "too many guests for this room type", roomIndex: 0, field: "occupancy" },
  ]);
  expect(preview.billing.totalCents).toBe(30000);
  expect(await command(d, [action], 400)).toEqual({ error: "too many guests for this room type" });
  expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);
});

it("allows zero children in a room type but excludes it for a child in availability and reservation edits", async () => {
  const response = await request("/room-types/type", "PATCH", { maxChildren: 0 });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ maxAdults: 2, maxChildren: 0 });
  const d = await create();
  const adults = await command(d, [roomEdit(d, 0, { adults: 2 })]);
  expect(adults.totalCents).toBe(30000);
  expect(await command(adults, [roomEdit(adults, 0, { adults: 2, children: 1 })], 400)).toEqual({
    error: "too many guests for this room type",
  });
  const availability = (await (
    await request("/availability?checkIn=2026-10-10&checkOut=2026-10-13&children=1")
  ).json()) as { roomTypes: unknown[] };
  expect(availability.roomTypes).toEqual([]);
});

it.each(["adults=0", "adults=1.5", "adults=101", "children=-1", "children=1.5", "children=101"])(
  "rejects an invalid availability occupancy filter: %s",
  async (query) => {
    const response = await request(`/availability?checkIn=2026-10-10&${query}`);
    expect(response.status).toBe(400);
  },
);

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
    ([null, "room-101"] as const).flatMap((roomId) =>
      (["confirmed", "checked_in", "checked_out"] as const).flatMap((to) =>
        [{ maxAdults: 1 }, { maxChildren: 1 }].map((limit) => ({ roomId, to, limit })),
      ),
    ),
  )(
    "rejects restoration from cancelled to $to with room $roomId when $limit changes after preflight",
    async ({ roomId, to, limit }) => {
      let d = await create();
      // Cover both assigned and unassigned saved rooms.
      d = await command(d, [roomEdit(d, 0, { adults: 2, children: 2, roomId })]);
      d = await command(d, [{ type: "set-status", status: "cancelled" }]);
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
        const response = await request("/room-types/type", "PATCH", limit);
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
    { status: "cancelled", checkIn: "2026-10-11", checkOut: "2026-10-14" },
  ] as const)(
    "rejects changed dates for $status ($checkIn to $checkOut) when capacity changes after preflight",
    async ({ status, checkIn, checkOut }) => {
      let d = await create();
      d = await command(d, [roomEdit(d, 0, { adults: 2 }), { type: "set-status", status }]);
      const nights = sqlite.prepare("SELECT * FROM reservation_room_nights ORDER BY id").all();
      const paused = pauseCommandBatch();
      const pending = command(d, [{ type: "dates", checkIn, checkOut }, pay(5000)], 409);
      await paused.ready;
      try {
        expect((await request("/room-types/type", "PATCH", { maxAdults: 1 })).status).toBe(200);
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
      expect((await request("/room-types/type", "PATCH", { maxAdults: 1 })).status).toBe(200);
    } finally {
      paused.resume();
    }
    const failed = await pending;
    expect(failed.status).toBe(409);
    expect(await failed.json()).toEqual({ error: "too many guests for this room type" });
    expect(snapshot()).toEqual(before);
    expect((await request("/room-types/type")).status).toBe(200);
    expect(await (await request("/room-types/type")).json()).toMatchObject({ maxAdults: 1 });

    expect((await request("/room-types/type", "PATCH", { maxAdults: 2 })).status).toBe(200);
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
      maxAdults: 2,
      maxChildren: 2,
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

  it.each([{ maxAdults: 1 }, { maxChildren: 1 }])(
    "allows unchanged-room saves when %j changes between preflight and commit",
    async (limit) => {
      let d = await create();
      d = await command(d, [roomEdit(d, 0, { adults: 2, children: 2 })]);
      const paused = pauseCommandBatch();
      const pending = command(d, [pay(5000), setDiscount(1000), { type: "notes", notes: "Paid" }]);
      await paused.ready;
      try {
        expect((await request("/room-types/type", "PATCH", limit)).status).toBe(200);
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
      expect(d.rooms[0].children).toBe(2);
      const saved = await command(d, [{ type: "set-status", status: "cancelled" }]);
      expect(saved.creditCents).toBe(5000);
    },
  );

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
  it("reprices type changes and permits an explicit matching assignment", async () => {
    sqlite.exec(
      "INSERT INTO room_types (id,name,max_occupancy,base_rate_cents,created_at) VALUES ('other','Twin',3,20000,'2026-10-10'); INSERT INTO rooms VALUES ('201','201','other')",
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
  it.each(["yape", "plin"])(
    "records and corrects %s payments with an optional reference",
    async (method) => {
      const d = await create();
      const added = await request(`/reservations/${d.id}/commands`, "POST", {
        requestId: crypto.randomUUID(),
        actions: [
          {
            type: "add-payment",
            payment: { amountCents: 10000, method, paymentDate: "2026-10-10" },
          },
        ],
      });
      expect(added.status).toBe(200);
      const saved = (await added.json()) as Detail;
      expect(saved.payments).toHaveLength(1);
      expect(saved.payments[0]).toMatchObject({ method, amountCents: 10000, reference: null });
      expect(saved.balanceCents).toBe(20000);

      const edited = await request(`/reservations/${d.id}/commands`, "POST", {
        requestId: crypto.randomUUID(),
        actions: [
          {
            type: "edit-payment",
            paymentId: saved.payments[0].id,
            payment: {
              amountCents: 15000,
              method,
              paymentDate: "2026-10-09",
              reference: " op-123 ",
            },
          },
        ],
      });
      expect(edited.status).toBe(200);
      const retrieved = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
      expect(retrieved.payments).toHaveLength(1);
      expect(retrieved.payments[0]).toMatchObject({
        id: saved.payments[0].id,
        method,
        amountCents: 15000,
        paymentDate: "2026-10-09",
        reference: "OP-123",
      });
      expect(retrieved.balanceCents).toBe(15000);
    },
  );
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
    expect((await command(other, [pay(10000)])).paidCents).toBe(10000);
  });
  it("deduplicates retries and rejects changed payloads", async () => {
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
    const r = await previewCommand(b, [roomEdit(b)]);
    expect(r).toMatchObject({
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
    const response = await previewCommand(first, actions);
    expect(response).toMatchObject({
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
    expect(await previewCommand(first, corrected)).toMatchObject({
      billing: { totalCents: 40000 },
      validation: { issues: [] },
    });
    expect((await command(saved, corrected)).totalCents).toBe(40000);
  });
  it("quotes rooms with occupancy or assignment issues and still rejects those writes", async () => {
    const d = await create();
    sqlite.exec(
      "INSERT INTO room_types (id,name,max_occupancy,base_rate_cents,created_at) VALUES ('other', 'Single', 1, 5000, '2026-10-10'); INSERT INTO rooms VALUES ('room-other', '201', 'other')",
    );
    const actions = [roomEdit(d, 0, { adults: 3, roomId: "room-other" })];
    const response = await previewCommand(d, actions);
    expect(response).toMatchObject({
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
    const paymentPreview = await previewCommand(d, [pay(5000)]);
    expect(paymentPreview).toMatchObject({
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
    const cancellationPreview = await previewCommand(d, actions);
    expect(cancellationPreview).toMatchObject({
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
      const response = await previewCommand(d, actions);
      expect(response).toMatchObject({
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
    const response = await previewCommand(d, invalid);
    expect(response).toMatchObject({
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
    const response = await previewCommand(d, restore);
    expect(response).toMatchObject({
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
    const preview = await previewCommand(d, actions);
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
    await previewCommand(d, actions);
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
  it("cancels a completed stay, retains its payment report, and blocks conflicting restoration", async () => {
    let d = await arrive(await create());
    d = await command(d, [pay(30000), setDiscount(50000), all(d, "check-out")]);
    expect(d).toMatchObject({ subtotalCents: 30000, discountCents: 30000, creditCents: 30000 });
    const cancellation: WorkflowAction[] = [
      { type: "set-status", status: "cancelled", reason: "Plans changed" },
    ];
    const expectedCancellation = {
      status: "cancelled",
      cancellationReason: "Plans changed",
      subtotalCents: 0,
      totalCents: 0,
      paidCents: 30000,
      discountCents: 0,
      savedDiscountCents: 50000,
      balanceCents: -30000,
      creditCents: 30000,
    };
    expect((await previewCommand(d, cancellation)).billing).toMatchObject({
      status: "cancelled",
      subtotalCents: 0,
      discountCents: 0,
      savedDiscountCents: 50000,
      totalCents: 0,
      paidCents: 30000,
      balanceCents: -30000,
      creditCents: 30000,
    });
    expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);
    d = await command(d, cancellation);
    expect(d).toMatchObject(expectedCancellation);
    expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);
    expect(await listed()).toMatchObject([{ id: d.id, ...expectedCancellation }]);
    expect((await paged("balance=credit&sort=balance")).rows).toMatchObject([
      { id: d.id, ...expectedCancellation },
    ]);
    expect(d.payments[0].amountCents).toBe(30000);
    expect(d.rooms[0].nights).toHaveLength(3);
    expect(
      await (await request("/availability?checkIn=2026-10-10&checkOut=2026-10-13")).json(),
    ).toMatchObject({ roomTypes: [{ free: 3 }] });
    const next = await create();
    await command(next, [roomEdit(next)]);
    const actions: WorkflowAction[] = [{ type: "set-status", status: "confirmed" }];
    const preview = await previewCommand(d, actions);
    expect(preview).toMatchObject({
      billing: { totalCents: 0, discountCents: 30000, savedDiscountCents: 50000 },
      validation: {
        issues: [
          { code: "room is already assigned for those dates", field: "roomId", roomIndex: 0 },
        ],
      },
    });
    await command(d, actions, 409);
    expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);
    expect(await (await request("/payments?from=2026-10-10&to=2026-10-10")).json()).toMatchObject({
      payments: [{ amountCents: 30000 }],
      totalCents: 30000,
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
  it("rejects unsupported statuses without changing the reservation", async () => {
    const d = await command(await create(), [pay(10000)]);
    for (const endpoint of ["preview", "commands"]) {
      const response = await request(`/reservations/${d.id}/${endpoint}`, "POST", {
        requestId: crypto.randomUUID(),
        actions: [pay(5000), { type: "set-status", status: "unsupported" }],
      });
      expect(response.status).toBe(400);
      expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);
    }
    expect((await request("/reservations?status=unsupported")).status).toBe(400);
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
    const response = await previewCommand(d, actions);
    expect(response).toMatchObject({
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
    const response = await previewCommand(d, actions);
    const { billing: preview } = response;
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
    const overflow = await previewCommand(d, actions);
    expect(overflow).toMatchObject({
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
        rooms: [
          { subtotalCents: 40000, discountCents: 0, totalCents: 40000 },
          { subtotalCents: 40000, discountCents: 0, totalCents: 40000 },
        ],
      },
      validation: { issues: [] },
    });
    expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);
    d = await command(d, actions);
    for (const room of d.rooms) {
      expect(room.nights.map((night) => night.date)).toEqual([
        "2026-10-11",
        "2026-10-12",
        "2026-10-13",
        "2026-10-14",
      ]);
      expect(room.totalCents).toBe(40000);
    }
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
  it("removes a checked-in room and its charges while retaining the stay, payments, and discount", async () => {
    let d = await arrive(await create(2));
    const removed = d.rooms[0].id;
    const retained = d.rooms[1];
    d = await command(d, [
      { type: "set-guests", guests: [guest(removed)] },
      setDiscount(5000),
      pay(35000),
    ]);
    d = await command(d, [{ type: "remove-room", lineId: removed }]);
    expect(d.rooms).toEqual([retained]);
    expect(d).toMatchObject({
      status: "checked_in",
      checkIn: "2026-10-10",
      checkOut: "2026-10-13",
      subtotalCents: 30000,
      totalCents: 25000,
      paidCents: 35000,
      balanceCents: -10000,
      creditCents: 10000,
    });
    expect(d.payments[0].amountCents).toBe(35000);
    expect(d.stayingGuests[0].reservationRoomId).toBeNull();
    expect(
      await (await request("/availability?checkIn=2026-10-10&checkOut=2026-10-13")).json(),
    ).toMatchObject({ roomTypes: [{ free: 2 }] });
    const next = await create();
    await command(next, [roomEdit(next, 0, { roomId: "room-101" })]);
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
  it("enforces the shared 60-night limit", async () => {
    const d = await create(2);
    await command(d, [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-12-10" }], 400);
  });
  it("filters reservation lists by the parent status", async () => {
    const d = await command(await create(2), [{ type: "set-status", status: "cancelled" }]);
    const rows = (await (await request("/reservations?status=cancelled")).json()) as Detail[];
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

type ReservationPage = {
  rows: Array<Detail & { guestName: string }>;
  total: number;
  limit: number;
  offset: number;
};

async function paged(query = "") {
  const response = await request(`/reservations?paginated=true${query ? `&${query}` : ""}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<ReservationPage>;
}

async function billExamples() {
  let complex = await create(2);
  complex = await command(complex, [
    roomEdit(complex),
    { type: "set-discount", amountCents: 5000 },
    pay(10000),
    pay(15000),
  ]);
  let settled: Detail = await book("Bea Settled", {
    checkIn: "2026-10-14",
    checkOut: "2026-10-15",
  });
  settled = await command(settled, [
    roomEdit(settled),
    pay(10000),
    { type: "set-status", status: "checked_out" },
  ]);
  const credit = await command(
    await book("Cy Credit", { checkIn: "2026-10-16", checkOut: "2026-10-17" }),
    [pay(12000)],
  );
  let cancelled: Detail = await book("Dee Cancelled", {
    checkIn: "2026-10-18",
    checkOut: "2026-10-19",
  });
  cancelled = await command(cancelled, [
    roomEdit(cancelled),
    pay(3000),
    pay(2000),
    { type: "set-discount", amountCents: 1000 },
    { type: "set-status", status: "cancelled" },
  ]);
  let owing: Detail = await book("Zoe Owing", { checkIn: "2026-10-20", checkOut: "2026-10-21" });
  owing = await command(owing, [roomEdit(owing), { type: "set-status", status: "checked_out" }]);
  return { complex, settled, credit, cancelled, owing };
}

describe("paginated reservation operations", () => {
  it("preserves contact fields, reservation identity, rooms and totals in D1 batch results", async () => {
    const response = await request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-10-10",
      checkOut: "2026-10-12",
      guest: {
        fullName: "Alejandro Demo",
        email: "alex@example.com",
        phone: "+51 900000006",
        documentType: "DNI",
        documentNumber: "00000006",
      },
      rooms: [{ roomTypeId: "type", adults: 2, children: 1 }],
    });
    expect(response.status).toBe(201);
    const reservation = (await response.json()) as Detail;
    const result = await paged("sort=guestName");
    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      id: reservation.id,
      code: reservation.code,
      guestName: "Alejandro Demo",
      guestId: reservation.guestId,
      guest: {
        id: reservation.guestId,
        fullName: "Alejandro Demo",
        email: "alex@example.com",
        phone: "+51 900000006",
        documentType: "DNI",
        documentNumber: "00000006",
      },
      totalCents: 20000,
      balanceCents: 20000,
      rooms: [{ id: reservation.rooms[0].id, adults: 2, children: 1 }],
    });
  });

  it("searches only booking contact and code, not staying guests, rooms, documents or notes", async () => {
    const reservation = await book("Booking Contact");
    sqlite.prepare("UPDATE reservations SET code = 'FIXEDCODE' WHERE id = ?").run(reservation.id);
    await command(reservation, [
      roomEdit(reservation),
      { type: "notes", notes: "ReservationNoteOnly" },
      {
        type: "set-guests",
        guests: [{ ...guest(reservation.rooms[0].id), fullName: "StayingOnly" }],
      },
    ]);
    expect(
      (
        await request(`/guests/${reservation.guestId}`, "PATCH", {
          documentNumber: "DocumentOnly",
          notes: "ContactNoteOnly",
        })
      ).status,
    ).toBe(200);
    for (const q of [
      "StayingOnly",
      "101",
      "DocumentOnly",
      "ReservationNoteOnly",
      "ContactNoteOnly",
    ]) {
      const result = await paged(`q=${q}`);
      expect(result, q).toMatchObject({ rows: [], total: 0 });
    }
    const result = await paged("q=Booking%20FIXEDCODE");
    expect(result.total).toBe(1);
    expect(result.rows.map((row) => row.id)).toEqual([reservation.id]);
  });

  it("keeps the metadata endpoint behind the real session guard", async () => {
    const response = await app.request("/reservations?paginated=true&sort=balance", {}, bindings);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("counts a hundred matching reservations, handles a full 50-row last page, and finds balances beyond the legacy cap", async () => {
    // Seed a known history; observe only authenticated HTTP reads over the migrated database.
    for (let index = 0; index < 100; index++) {
      const id = `history-${index}`;
      const checkIn = new Date(Date.UTC(2026, 9, index + 1)).toISOString().slice(0, 10);
      const checkOut = new Date(Date.UTC(2026, 9, index + 2)).toISOString().slice(0, 10);
      sqlite
        .prepare("INSERT INTO guests (id, full_name, created_at) VALUES (?, ?, ?)")
        .run(id, index === 99 ? "Latest Target" : "Booking Contact", "2026-10-10");
      sqlite
        .prepare(
          "INSERT INTO reservations (id, code, guest_id, check_in, check_out, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(id, `H${index}`, id, checkIn, checkOut, "2026-10-10");
      sqlite
        .prepare(
          "INSERT INTO reservation_rooms (id, reservation_id, room_type_id, adults, created_at) VALUES (?, ?, 'type', 1, ?)",
        )
        .run(id, id, "2026-10-10");
      sqlite
        .prepare(
          "INSERT INTO reservation_room_nights (id, reservation_room_id, date, price_cents) VALUES (?, ?, ?, ?)",
        )
        .run(id, id, checkIn, index === 99 ? 90000 : 10000);
    }
    const first = await paged();
    expect(first).toMatchObject({ total: 100, limit: 50, offset: 0 });
    expect(first.rows).toHaveLength(50);
    expect(first.rows[0].id).toBe("history-0");
    expect(first.rows[49].id).toBe("history-49");
    const last = await paged("offset=50");
    expect(last).toMatchObject({ total: 100, limit: 50, offset: 50 });
    expect(last.rows).toHaveLength(50);
    expect(last.rows[0].id).toBe("history-50");
    expect(last.rows[49].id).toBe("history-99");
    expect(await paged("offset=100")).toEqual({ rows: [], total: 100, limit: 50, offset: 100 });
    const all = await paged("limit=100");
    expect(all.total).toBe(100);
    expect(all.rows).toHaveLength(100);
    expect(all.rows[99]).toMatchObject({ id: "history-99", balanceCents: 90000 });
    const largest = await paged(
      "balance=outstanding&assignment=unassigned&sort=balance&direction=desc&limit=25",
    );
    expect(largest.total).toBe(100);
    expect(largest.rows).toHaveLength(25);
    expect(largest.rows[0]).toMatchObject({ id: "history-99", balanceCents: 90000 });
    const search = await paged("q=Latest%20Target&sort=balance");
    expect(search.total).toBe(1);
    expect(search.rows.map((row) => row.id)).toEqual(["history-99"]);
    expect(await listed("?limit=1&offset=99")).toMatchObject([
      { id: "history-99", balanceCents: 90000 },
    ]);
  });

  it.each([
    "paginated=1",
    "paginated=TRUE",
    "paginated=",
    "checkOut=10-10-2026",
    "checkOut=2026-02-30",
    "paginated=true&checkIn=2026-02-30",
    "statuses=",
    "statuses=confirmed,unknown",
    "statuses=confirmed,",
    "statuses=confirmed|cancelled",
    "balance=paid",
    "assignment=partial",
    "sort=code",
    "direction=up",
    "limit=0",
    "limit=201",
    "limit=NaN",
    "offset=-1",
    "offset=1.5",
  ])("rejects malformed list input through the authenticated route: %s", async (query) => {
    const response = await request(`/reservations?${query}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  it.each(["asc", "desc"])(
    "sorts signed balances %s across the complete history with stable name/code ties",
    async (direction) => {
      const { complex, settled, credit, cancelled, owing } = await billExamples();
      const adaA = await book("Ada Same", { checkIn: "2026-10-22", checkOut: "2026-10-23" });
      const adaB = await book("Ada Same", { checkIn: "2026-10-24", checkOut: "2026-10-25" });
      sqlite.prepare("UPDATE reservations SET code = ? WHERE id = ?").run("AAA", adaA.id);
      sqlite.prepare("UPDATE reservations SET code = ? WHERE id = ?").run("BBB", adaB.id);
      const pages = await Promise.all(
        [0, 2, 4, 6].map((offset) =>
          paged(`sort=balance&direction=${direction}&limit=2&offset=${offset}`),
        ),
      );
      for (const page of pages) expect(page.total).toBe(7);
      const rows = pages.flatMap((page) => page.rows);
      expect(rows.map((row) => [row.id, row.balanceCents])).toEqual(
        direction === "asc"
          ? [
              [cancelled.id, -5000],
              [credit.id, -2000],
              [settled.id, 0],
              [adaA.id, 10000],
              [adaB.id, 10000],
              [owing.id, 10000],
              [complex.id, 30000],
            ]
          : [
              [complex.id, 30000],
              [adaA.id, 10000],
              [adaB.id, 10000],
              [owing.id, 10000],
              [settled.id, 0],
              [credit.id, -2000],
              [cancelled.id, -5000],
            ],
      );
      const restricted = await paged(
        `balance=outstanding&assignment=unassigned&sort=balance&direction=${direction}&limit=1`,
      );
      expect(restricted.total).toBe(3);
      expect(restricted.rows.map((row) => row.id)).toEqual([
        direction === "asc" ? adaA.id : complex.id,
      ]);
      expect(await paged(`sort=balance&direction=${direction}&limit=2&offset=7`)).toEqual({
        rows: [],
        total: 7,
        limit: 2,
        offset: 7,
      });
      const byName = await paged("balance=outstanding&sort=guestName&direction=desc&limit=2");
      expect(byName.total).toBe(4);
      expect(byName.rows.map((row) => row.id)).toEqual([owing.id, adaA.id]);
    },
  );

  it("classifies every reserved room for assignment and ANDs assignment with all other restrictions before paging", async () => {
    const { complex, settled, credit, cancelled, owing } = await billExamples();
    const assigned = await paged("assignment=assigned");
    expect(assigned.total).toBe(3);
    expect(assigned.rows.map((row) => row.id)).toEqual([settled.id, cancelled.id, owing.id]);
    const unassigned = await paged("assignment=unassigned&limit=1&offset=1");
    expect(unassigned.total).toBe(2);
    expect(unassigned.rows.map((row) => row.id)).toEqual([credit.id]);
    const combined = await paged(
      `assignment=unassigned&balance=outstanding&statuses=confirmed,checked_in&checkIn=2026-10-10&checkOut=2026-10-13&q=${encodeURIComponent(`${complex.code} Ada`)}`,
    );
    expect(combined.total).toBe(1);
    expect(combined.rows.map((row) => row.id)).toEqual([complex.id]);
    expect(combined.rows[0].rooms.map((room) => room.roomNumber)).toEqual(["101", null]);
    expect(
      (await paged("assignment=assigned&balance=credit&statuses=cancelled")).rows.map(
        (row) => row.id,
      ),
    ).toEqual([cancelled.id]);
    expect(await paged("assignment=unassigned&balance=settled")).toEqual({
      rows: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    expect(await paged("assignment=assigned&balance=credit&offset=5")).toEqual({
      rows: [],
      total: 1,
      limit: 50,
      offset: 5,
    });
  });

  it("filters canonical signed balances over all matches without multiplying rooms, nights or payments", async () => {
    const { complex, settled, credit, cancelled, owing } = await billExamples();
    const outstanding = await paged("balance=outstanding&limit=1&offset=1");
    expect(outstanding.total).toBe(2);
    expect(outstanding.rows.map((row) => [row.id, row.balanceCents])).toEqual([[owing.id, 10000]]);
    const positive = await paged("balance=outstanding");
    expect(positive.rows.map((row) => [row.id, row.balanceCents])).toEqual([
      [complex.id, 30000],
      [owing.id, 10000],
    ]);
    const zero = await paged("balance=settled");
    expect(zero.total).toBe(1);
    expect(zero.rows.map((row) => row.id)).toEqual([settled.id]);
    const negative = await paged("balance=credit");
    expect(negative.total).toBe(2);
    expect(negative.rows.map((row) => [row.id, row.balanceCents])).toEqual([
      [credit.id, -2000],
      [cancelled.id, -5000],
    ]);
    expect(positive.rows[0]).toMatchObject({
      subtotalCents: 60000,
      discountCents: 5000,
      paidCents: 25000,
      totalCents: 55000,
    });
    expect(negative.rows[1]).toMatchObject({
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
      paidCents: 5000,
      creditCents: 5000,
    });
    for (const page of [positive, zero, negative]) {
      for (const row of page.rows) {
        const detail = (await (await request(`/reservations/${row.id}`)).json()) as Detail;
        expect(row.balanceCents).toBe(detail.balanceCents);
      }
    }
    expect(
      (await paged("balance=outstanding&statuses=checked_out")).rows.map((row) => row.id),
    ).toEqual([owing.id]);
    expect((await paged("balance=credit&statuses=cancelled")).rows.map((row) => row.id)).toEqual([
      cancelled.id,
    ]);
    expect(await paged("balance=settled&statuses=cancelled")).toEqual({
      rows: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
  });

  it("filters and sorts capped bills by payment-derived balances before pagination", async () => {
    const original = await create(2);
    const capped = await command(original, [
      { type: "set-discount", amountCents: 50000 },
      { type: "remove-room", lineId: original.rooms[1].id },
    ]);
    const detailResponse = await request(`/reservations/${original.id}`);
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as Detail;
    const expected = {
      subtotalCents: 30000,
      savedDiscountCents: 50000,
      discountCents: 30000,
      totalCents: 0,
      paidCents: 0,
      balanceCents: 0,
      creditCents: 0,
    };
    expect(capped).toMatchObject(expected);
    expect(detail).toMatchObject(expected);
    const paid = await command(
      await book("Bea Paid", { checkIn: "2026-10-14", checkOut: "2026-10-15" }),
      [setDiscount(20000), pay(3000)],
    );
    const owing = await book("Cy Owing", { checkIn: "2026-10-16", checkOut: "2026-10-17" });
    for (const [classification, id] of [
      ["settled", original.id],
      ["credit", paid.id],
      ["outstanding", owing.id],
    ]) {
      const page = await paged(`balance=${classification}&sort=balance`);
      expect(page.total).toBe(1);
      expect(page.rows.map((row) => row.id)).toEqual([id]);
      expect((await listed(`?balance=${classification}`)).map((row) => row.id)).toEqual([id]);
    }
    expect((await paged("balance=settled")).rows).toMatchObject([{ id: original.id, ...expected }]);
    const ascending = [
      [paid.id, -3000],
      [original.id, 0],
      [owing.id, 10000],
    ];
    for (const direction of ["asc", "desc"]) {
      const order = direction === "asc" ? ascending : [...ascending].reverse();
      for (const [offset, [id, balanceCents]] of order.entries()) {
        const page = await paged(`sort=balance&direction=${direction}&limit=1&offset=${offset}`);
        expect(page.total).toBe(3);
        expect(page.rows).toMatchObject([{ id, balanceCents }]);
      }
      expect(
        (await listed(`?sort=balance&direction=${direction}`)).map((row) => [
          row.id,
          row.balanceCents,
        ]),
      ).toEqual(order);
    }
  });

  it.each([
    ["checkIn", "asc", ["zoe", "adaA", "adaB", "bea"]],
    ["checkIn", "desc", ["bea", "adaA", "adaB", "zoe"]],
    ["checkOut", "asc", ["adaA", "adaB", "zoe", "bea"]],
    ["checkOut", "desc", ["bea", "adaA", "adaB", "zoe"]],
    ["guestName", "asc", ["adaA", "adaB", "bea", "zoe"]],
    ["guestName", "desc", ["zoe", "bea", "adaA", "adaB"]],
  ])(
    "sorts all matches by %s %s with ascending name/code tie-breakers across pages",
    async (sort, direction, order) => {
      const zoe = await book("Zoe Cruz", { checkIn: "2026-10-01", checkOut: "2026-10-04" });
      const adaA = await book("Ada Lovelace", { checkIn: "2026-10-02", checkOut: "2026-10-04" });
      const adaB = await book("Ada Lovelace", { checkIn: "2026-10-02", checkOut: "2026-10-04" });
      const bea = await book("Bea Jones", { checkIn: "2026-10-04", checkOut: "2026-10-05" });
      // Fixed codes make the specified tie-breaker independent of generated codes.
      sqlite.prepare("UPDATE reservations SET code = ? WHERE id = ?").run("AAA", adaA.id);
      sqlite.prepare("UPDATE reservations SET code = ? WHERE id = ?").run("BBB", adaB.id);
      const ids: Record<string, string> = {
        zoe: zoe.id,
        adaA: adaA.id,
        adaB: adaB.id,
        bea: bea.id,
      };
      const first = await paged(`sort=${sort}&direction=${direction}&limit=2`);
      const last = await paged(`sort=${sort}&direction=${direction}&limit=2&offset=2`);
      expect(first.total).toBe(4);
      expect(last.total).toBe(4);
      expect([...first.rows, ...last.rows].map((row) => row.id)).toEqual(
        (order as string[]).map((key) => ids[key]),
      );
    },
  );

  it("combines exact departures, OR statuses, contact search and legacy filters without hiding overdue checked-in stays", async () => {
    const cancelled = await command(
      await book("Ada Cancelled", { checkIn: "2026-10-09", checkOut: "2026-10-10" }),
      [{ type: "set-status", status: "cancelled" }],
    );
    const arrival = await book("Ada Arrival");
    const departure = await book("Ada Departure", {
      checkIn: "2026-10-08",
      checkOut: "2026-10-10",
    });
    const overdue = await command(
      await book("Ada Overdue", { checkIn: "2026-10-01", checkOut: "2026-10-03" }),
      [{ type: "set-status", status: "checked_in" }],
    );
    const history = await command(
      await book("Ada History", { checkIn: "2026-10-05", checkOut: "2026-10-07" }),
      [{ type: "set-status", status: "checked_out" }],
    );

    const departures = await paged("checkOut=2026-10-10");
    expect(departures.total).toBe(2);
    expect(departures.rows.map((row) => row.id)).toEqual([departure.id, cancelled.id]);
    const activeDeparture = await paged(
      "checkOut=2026-10-10&statuses=confirmed,checked_in&q=Ada%20Departure",
    );
    expect(activeDeparture.total).toBe(1);
    expect(activeDeparture.rows.map((row) => row.id)).toEqual([departure.id]);
    expect(
      (await paged("checkIn=2026-10-10&statuses=confirmed,checked_in")).rows.map((row) => row.id),
    ).toEqual([arrival.id]);
    const inHouse = await paged("statuses=checked_in");
    expect(inHouse.total).toBe(1);
    expect(inHouse.rows.map((row) => row.id)).toEqual([overdue.id]);
    expect((await paged("statuses=checked_in,checked_out")).rows.map((row) => row.id)).toEqual([
      overdue.id,
      history.id,
    ]);
    expect(
      (await paged(`guestId=${history.guestId}&status=checked_out`)).rows.map((row) => row.id),
    ).toEqual([history.id]);
    expect((await listed("?from=2026-10-10&to=2026-10-10")).map((row) => row.id)).toEqual([
      arrival.id,
    ]);
  });

  it("returns exact totals on first, full last, beyond-end and empty pages without changing array callers", async () => {
    const first = await book("Ada Lovelace", { checkIn: "2026-10-01", checkOut: "2026-10-02" });
    const second = await book("Grace Hopper", { checkIn: "2026-10-02", checkOut: "2026-10-03" });
    const third = await book("Katherine Johnson", {
      checkIn: "2026-10-03",
      checkOut: "2026-10-04",
    });
    const fourth = await book("Zoe Cruz", { checkIn: "2026-10-04", checkOut: "2026-10-05" });
    const page = await paged("limit=2");
    expect(page).toMatchObject({ total: 4, limit: 2, offset: 0 });
    expect(page.rows.map((row) => row.id)).toEqual([first.id, second.id]);
    const last = await paged("limit=2&offset=2");
    expect(last).toMatchObject({ total: 4, limit: 2, offset: 2 });
    expect(last.rows.map((row) => row.id)).toEqual([third.id, fourth.id]);
    expect(await paged("limit=2&offset=4")).toEqual({ rows: [], total: 4, limit: 2, offset: 4 });
    expect(await paged("q=missing&offset=100")).toEqual({
      rows: [],
      total: 0,
      limit: 50,
      offset: 100,
    });
    expect((await listed("?paginated=false&limit=2&offset=2")).map((row) => row.id)).toEqual([
      third.id,
      fourth.id,
    ]);
    expect((await listed()).map((row) => row.id)).toEqual([
      first.id,
      second.id,
      third.id,
      fourth.id,
    ]);
  });
});
