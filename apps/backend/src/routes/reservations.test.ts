import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { presentReservation } from "../present";
import {
  createTestDb,
  seedReservation,
  seedRooms,
  seedRoomType,
  type TestDb,
} from "../test-support/d1";

type Detail = ReturnType<typeof presentReservation>;
type Preview = {
  billing: Detail;
  validation: { issues: { code: string; roomIndex: number; field: string }[] };
};

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
async function stay(checkIn: string, checkOut: string, nightlyRateCents: number) {
  const response = await request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    checkIn,
    checkOut,
    guest: { fullName: "Ada Lovelace" },
    rooms: [{ roomTypeId: "type", adults: 1, children: 0, nightlyRateCents }],
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

it("previews the same reservation detail that saving the actions returns", async () => {
  const d = await create(2);
  const actions: WorkflowAction[] = [
    roomEdit(d),
    { type: "contact", contact: { fullName: "Ada King", email: null, phone: null } },
    { type: "notes", notes: "Late arrival" },
    setDiscount(500),
  ];

  const { billing } = await previewCommand(d, actions);

  expect(billing.rooms[0]).toMatchObject({ roomTypeName: "King", roomNumber: "101" });
  expect(billing.guest.fullName).toBe("Ada King");
  expect(billing).toEqual(await command(d, actions));
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
    expect(await unchanged.json()).toMatchObject({ number: "101", roomTypeId: "type" });
    vi.setSystemTime(new Date("2026-11-01T05:00:00Z"));
    expect((await request("/rooms/room-101", "PATCH", body)).status).toBe(200);
    expect((await request(`/reservations/${d.id}`)).status).toBe(200);
  },
);

it("validates payments against the property day after a daylight saving change", async () => {
  const [today, tomorrow] = ["2026-03-08", "2026-03-09"];
  db.env.PROPERTY_TIME_ZONE = "America/New_York";
  vi.setSystemTime(new Date("2026-03-09T03:59:59Z"));
  await db.signIn();
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
    { saved: 50000, applied: 30000, total: 0, paid: 0, balance: 0, credit: 0 },
    { saved: 50000, applied: 30000, total: 0, paid: 3000, balance: -3000, credit: 3000 },
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

  it("bills the final combined state when the discount is set before room changes", async () => {
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
    actions.unshift(setDiscount(10000));
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
  });
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

it("filters availability by both adult and child limits without changing room prices", async () => {
  const created = await request("/setup", "POST", {
    name: "Double",
    maxAdults: 4,
    maxChildren: 2,
    baseRateCents: 20000,
    rooms: [{ number: "201" }],
  });
  expect(created.status).toBe(201);
  const adultsOnly = await request("/setup", "POST", {
    name: "Adults only",
    maxAdults: 2,
    maxChildren: 0,
    baseRateCents: 10000,
    rooms: [{ number: "301" }],
  });
  expect(adultsOnly.status).toBe(201);
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
  expect(family.roomTypes).not.toContainEqual(expect.objectContaining({ name: "Adults only" }));
  const tooManyChildren = (await (
    await request(`/availability?${dates}&adults=2&children=3`)
  ).json()) as { roomTypes: unknown[] };
  expect(tooManyChildren.roomTypes).toEqual([]);
});

it("lists assignable rooms using the same holding statuses and [start, end) overlap as saves", async () => {
  seedRooms(db.sqlite, "type", { "room-104": "104", "room-105": "105" });
  const seed = (
    id: string,
    status: string,
    roomId: string | null,
    checkIn: string,
    checkOut: string,
  ) =>
    seedReservation(db.sqlite, {
      id,
      code: id,
      guestName: id,
      status,
      roomId,
      checkIn,
      checkOut,
      createdAt: "2026-10-01",
    });
  seed("overlapping", "confirmed", "room-101", "2026-10-13", "2026-10-15");
  seed("released", "no_show", "room-102", "2026-10-12", "2026-10-14");
  seed("departed", "checked_out", "room-104", "2026-10-10", "2026-10-13");
  seed("unassigned", "confirmed", null, "2026-10-12", "2026-10-14");
  db.sqlite.exec(
    "INSERT INTO room_closures (id, room_id, starts, ends, created_at) VALUES ('turnover', 'room-103', '2026-10-14', '2026-10-16', '2026-10-01'), ('repairs', 'room-105', '2026-10-11', '2026-10-13', '2026-10-01')",
  );
  const response = await request("/availability?checkIn=2026-10-12&checkOut=2026-10-14");
  expect(response.status).toBe(200);
  const { roomTypes } = (await response.json()) as {
    roomTypes: { free: number; freeRoomIds: string[] }[];
  };
  expect(roomTypes).toEqual([
    expect.objectContaining({ free: 2, freeRoomIds: ["room-102", "room-103"] }),
  ]);
  const assigned = await request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    checkIn: "2026-10-12",
    checkOut: "2026-10-14",
    guest: { fullName: "Ada Lovelace" },
    rooms: ["room-102", "room-103"].map((roomId) => ({
      roomTypeId: "type",
      roomId,
      adults: 1,
      children: 0,
    })),
  });
  expect(assigned.status).toBe(201);
});

it("lists the edited reservation's own rooms as free when it is excluded from availability", async () => {
  const seed = (id: string, status: string, roomId: string) =>
    seedReservation(db.sqlite, {
      id,
      code: id,
      guestName: id,
      status,
      roomId,
      checkIn: "2026-10-12",
      checkOut: "2026-10-14",
      createdAt: "2026-10-01",
    });
  seed("editing", "confirmed", "room-101");
  seed("other", "confirmed", "room-102");
  seed("released", "no_show", "room-103");
  const availability = async (query: string) => {
    const response = await request(`/availability?checkIn=2026-10-12&checkOut=2026-10-14${query}`);
    expect(response.status).toBe(200);
    const { roomTypes } = (await response.json()) as {
      roomTypes: { free: number; freeRoomIds: string[] }[];
    };
    return roomTypes;
  };
  expect(await availability("")).toEqual([
    expect.objectContaining({ free: 1, freeRoomIds: ["room-103"] }),
  ]);
  expect(await availability("&excludeReservationId=editing")).toEqual([
    expect.objectContaining({ free: 2, freeRoomIds: ["room-101", "room-103"] }),
  ]);
  await command({ id: "editing" } as Detail, [
    {
      type: "edit-room",
      lineId: "editing",
      room: { roomTypeId: "type", roomId: "room-103", adults: 1, children: 0 },
    },
  ]);
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
    rooms: [
      { roomTypeId: "type", adults: 1, children: 0 },
      { roomTypeId: "type", ...occupancy },
    ],
  });
  expect(response.status).toBe(400);
  expect(response.headers.get("X-Error-Field")).toBe("rooms[1]");
  expect(await response.json()).toEqual({ error: "too many guests for this room type" });
  expect(await (await request("/reservations")).json()).toEqual([]);
});

it("identifies the rejected room number of a new reservation", async () => {
  const response = await request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    checkIn: "2026-10-10",
    checkOut: "2026-10-13",
    guest: { fullName: "Family Guest" },
    rooms: [
      { roomTypeId: "type", roomId: "room-101", adults: 1, children: 0 },
      { roomTypeId: "type", roomId: "room-gone", adults: 1, children: 0 },
    ],
  });
  expect(response.status).toBe(404);
  expect(response.headers.get("X-Error-Field")).toBe("rooms[1].roomId");
  expect(await response.json()).toEqual({ error: "room not found" });
  expect(await (await request("/reservations")).json()).toEqual([]);
});

describe("accepted rate-plan terms", () => {
  const flexible = {
    plan: "flexible",
    cancellationPolicy: {
      chargeBasis: "first_night",
      freeUntilDaysBeforeCheckIn: 2,
    },
    paymentSchedule: "first_night_deposit",
    priceAdjustmentPercent: 0,
  };

  it("creates a Flexible reservation whose deposit is its first night", async () => {
    const d = await create(1, { checkIn: "2026-10-10", checkOut: "2026-10-12" });
    const expected = {
      ratePlan: flexible,
      totalCents: 20000,
      requiredInitialPaymentCents: 10000,
      remainingScheduledCents: 10000,
    };
    expect(d).toMatchObject(expected);
    expect(await (await request(`/reservations/${d.id}`)).json()).toMatchObject(expected);
  });

  it("sums every room's first night and caps the deposit at a discounted total in every read", async () => {
    seedRoomType(db.sqlite, { id: "suite", name: "Suite", maxAdults: 2, baseRateCents: 15000 });
    seedRooms(db.sqlite, "suite", { "room-201": "201" });
    const response = await request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-10-10",
      checkOut: "2026-10-12",
      guest: { fullName: "Ada Lovelace" },
      rooms: [
        { roomTypeId: "type", adults: 1, children: 0 },
        { roomTypeId: "suite", adults: 1, children: 0 },
      ],
    });
    expect(response.status).toBe(201);
    const d = (await response.json()) as Detail;
    const undiscounted = {
      ratePlan: flexible,
      totalCents: 50000,
      requiredInitialPaymentCents: 25000,
      remainingScheduledCents: 25000,
    };
    expect(d).toMatchObject(undiscounted);
    expect(await listed()).toMatchObject([{ id: d.id, ...undiscounted }]);

    const discount: WorkflowAction[] = [{ type: "set-discount", amountCents: 40000 }];
    const discounted = {
      ratePlan: flexible,
      totalCents: 10000,
      requiredInitialPaymentCents: 10000,
      remainingScheduledCents: 0,
    };
    expect((await previewCommand(d, discount)).billing).toMatchObject(discounted);
    expect(await command(d, discount)).toMatchObject(discounted);
    expect(await (await request(`/reservations/${d.id}`)).json()).toMatchObject(discounted);
    expect(await listed()).toMatchObject([{ id: d.id, ...discounted }]);
    expect((await paged("balance=outstanding")).rows).toMatchObject([{ id: d.id, ...discounted }]);
  });

  it("reads rows written without plan columns as Flexible without changing their saved money", async () => {
    seedReservation(db.sqlite, {
      id: "legacy",
      code: "OLD1",
      guestName: "Legacy Guest",
      checkIn: "2026-10-10",
      checkOut: "2026-10-12",
      createdAt: "2026-09-01",
      nightCents: 12345,
    });
    seedReservation(db.sqlite, {
      id: "legacy-cancelled",
      code: "OLD2",
      guestName: "Cancelled Guest",
      checkIn: "2026-10-10",
      checkOut: "2026-10-12",
      createdAt: "2026-09-01",
      status: "cancelled",
      nightCents: 10000,
    });
    db.sqlite.exec(`
      UPDATE reservations SET discount_cents = 5000 WHERE id = 'legacy';
      INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at)
        VALUES ('legacy-payment', 'legacy', 3000, 'cash', '2026-09-01', '2026-09-01'),
               ('cancelled-payment', 'legacy-cancelled', 4000, 'cash', '2026-09-01', '2026-09-01');
    `);
    const legacy = {
      ratePlan: flexible,
      subtotalCents: 24690,
      discountCents: 5000,
      totalCents: 19690,
      paidCents: 3000,
      balanceCents: 16690,
      requiredInitialPaymentCents: 12345,
      remainingScheduledCents: 7345,
    };
    const cancelled = {
      ratePlan: flexible,
      totalCents: 0,
      balanceCents: -4000,
      requiredInitialPaymentCents: 0,
      remainingScheduledCents: 0,
    };
    expect(await (await request("/reservations/legacy")).json()).toMatchObject(legacy);
    expect(await (await request("/reservations/legacy-cancelled")).json()).toMatchObject(cancelled);
    expect(await listed("?sort=guestName")).toMatchObject([
      { id: "legacy-cancelled", ...cancelled },
      { id: "legacy", ...legacy },
    ]);
  });
});

describe("Creation pricing", () => {
  const twoNights = { checkIn: "2026-10-10", checkOut: "2026-10-12" };
  const rooms = [
    { roomTypeId: "type" },
    { roomTypeId: "suite" },
    { roomTypeId: "type", nightlyRateCents: 8000 },
  ];
  const create = (priced: typeof rooms) =>
    request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      ...twoNights,
      guest: { fullName: "Ada Lovelace" },
      rooms: priced.map((room) => ({ ...room, adults: 1, children: 0 })),
    });
  const preview = (priced: typeof rooms) =>
    request("/reservations/preview", "POST", { ...twoNights, rooms: priced });

  beforeEach(() => {
    seedRoomType(db.sqlite, { id: "suite", name: "Suite", maxAdults: 2, baseRateCents: 25000 });
    seedRooms(db.sqlite, "suite", { "room-201": "201" });
    db.sqlite.exec(
      `INSERT INTO room_type_rates (id, room_type_id, date, price_cents) VALUES
        ('type-rate', 'type', '2026-10-11', 12000),
        ('suite-rate', 'suite', '2026-10-10', 30000)`,
    );
  });

  it("prices each room from its own type's overrides and base rate, or its flat rate", async () => {
    const expected = {
      totalCents: 93000,
      rooms: [
        { roomTypeId: "type", nights: [{ priceCents: 10000 }, { priceCents: 12000 }] },
        { roomTypeId: "suite", nights: [{ priceCents: 30000 }, { priceCents: 25000 }] },
        { roomTypeId: "type", nights: [{ priceCents: 8000 }, { priceCents: 8000 }] },
      ],
    };
    const previewed = await preview(rooms);
    expect(previewed.status).toBe(200);
    expect(((await previewed.json()) as { billing: Detail }).billing).toMatchObject(expected);
    const saved = await create(rooms);
    expect(saved.status).toBe(201);
    expect(await saved.json()).toMatchObject(expected);
  });

  it("rejects an unknown room type among priced rooms without saving", async () => {
    const priced = [...rooms, { roomTypeId: "missing" }];
    for (const response of [await preview(priced), await create(priced)]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "room type not found" });
    }
    expect(await listed()).toEqual([]);
  });
});

describe("Non-refundable reservations", () => {
  const nonRefundable = {
    plan: "non_refundable",
    cancellationPolicy: {
      chargeBasis: "final_total",
      freeUntilDaysBeforeCheckIn: null,
    },
    paymentSchedule: "full_upfront",
    priceAdjustmentPercent: -10,
  };
  const twoNights = { checkIn: "2026-10-10", checkOut: "2026-10-12" };
  const body = (room: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    requestId: crypto.randomUUID(),
    ...twoNights,
    guest: { fullName: "Ada Lovelace" },
    rooms: [{ roomTypeId: "type", adults: 1, children: 0, ...room }],
    ratePlan: "non_refundable",
    ...extra,
  });
  async function previewNew(input: ReturnType<typeof body>) {
    const { requestId: _, guest: __, ...priced } = input;
    const rooms = priced.rooms.map(({ adults: _a, children: _c, ...room }) => room);
    const response = await request("/reservations/preview", "POST", { ...priced, rooms });
    const preview = (await response.json()) as { billing: Detail };
    expect(response.status, JSON.stringify(preview)).toBe(200);
    return preview.billing;
  }
  async function save(input: ReturnType<typeof body>, status = 201) {
    const response = await request("/reservations", "POST", input);
    const saved = (await response.json()) as Detail;
    expect(response.status, JSON.stringify(saved)).toBe(status);
    return saved;
  }

  it.each([
    {
      name: "reduces each night by 10%, rounding half-cent ties up before summing",
      baseRateCents: 10005,
      input: body(),
      nights: [9005, 9005],
      totalCents: 18010,
    },
    {
      name: "requires the discounted total upfront",
      baseRateCents: 10000,
      input: body({}, { discountCents: 3000 }),
      nights: [9000, 9000],
      totalCents: 15000,
    },
    {
      name: "keeps a flat nightly rate as the final price",
      baseRateCents: 10000,
      input: body({ nightlyRateCents: 15000 }),
      nights: [15000, 15000],
      totalCents: 30000,
    },
  ])("$name in the preview and the saved reservation", async (example) => {
    db.sqlite.exec(`UPDATE room_types SET base_rate_cents = ${example.baseRateCents}`);
    const expected = {
      ratePlan: nonRefundable,
      totalCents: example.totalCents,
      requiredInitialPaymentCents: example.totalCents,
      remainingScheduledCents: 0,
      rooms: [
        {
          nights: [
            { date: "2026-10-10", priceCents: example.nights[0] },
            { date: "2026-10-11", priceCents: example.nights[1] },
          ],
        },
      ],
    };
    expect(await previewNew(example.input)).toMatchObject(expected);
    const saved = await save(example.input);
    expect(saved).toMatchObject(expected);
    expect(await (await request(`/reservations/${saved.id}`)).json()).toMatchObject(expected);
  });

  it("previews Flexible when no plan is chosen, without reserving inventory", async () => {
    expect(await previewNew(body({}, { ratePlan: undefined }))).toMatchObject({
      ratePlan: { plan: "flexible" },
      totalCents: 20000,
      requiredInitialPaymentCents: 10000,
      remainingScheduledCents: 10000,
    });
    expect(await listed()).toEqual([]);
  });

  it("still stores free-cancellation hours for Workers from before days", async () => {
    const flexible = await save(body({}, { ratePlan: undefined }));
    const later = { checkIn: "2026-10-12", checkOut: "2026-10-14" };
    const nonRefundableStay = await save(body({}, later));
    const columns = db.sqlite.prepare(
      "SELECT free_cancellation_days, free_cancellation_hours, check_in_time FROM reservations WHERE id = ?",
    );
    expect(columns.get(flexible.id)).toEqual({
      free_cancellation_days: 2,
      free_cancellation_hours: 48,
      check_in_time: "15:00",
    });
    expect(columns.get(nonRefundableStay.id)).toEqual({
      free_cancellation_days: null,
      free_cancellation_hours: null,
      check_in_time: "15:00",
    });
  });

  it("applies the reduction once when a create request is retried", async () => {
    const input = body();
    const first = await save(input);
    const retried = await save(input);
    expect(retried).toMatchObject({ id: first.id, totalCents: 18000 });
    expect(await listed()).toMatchObject([{ id: first.id, totalCents: 18000 }]);
  });

  it("rejects an unknown plan", async () => {
    const response = await request("/reservations", "POST", body({}, { ratePlan: "prepaid" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "unknown rate plan" });
  });

  it("lists the plans staff can offer, Flexible first", async () => {
    const plans = (await (await request("/rate-plans")).json()) as { plan: string }[];
    expect(plans).toMatchObject([{ plan: "flexible" }, nonRefundable]);
  });
});

describe("cancellation charges and waivers", () => {
  const cancel: WorkflowAction = { type: "set-status", status: "cancelled" };

  it("cancels a Flexible stay for free before the deadline and owes back every payment received", async () => {
    let d = await create(1, { checkIn: "2026-10-20", checkOut: "2026-10-22" });
    d = await command(d, [pay(20000)]);
    const expected = {
      status: "cancelled",
      totalCents: 0,
      paidCents: 20000,
      balanceCents: -20000,
      refundDueCents: 20000,
      cancellation: {
        recordedAt: "2026-10-10T15:00:00.000Z",
        freeUntil: "2026-10-18",
        policyChargeCents: 0,
        waivedCents: 0,
        finalChargeCents: 0,
        recordedBy: "hotelmanantial",
        waivers: [],
      },
    };
    expect((await previewCommand(d, [cancel])).billing).toMatchObject(expected);
    const saved = await command(d, [cancel]);
    expect(saved).toMatchObject(expected);
    expect(saved.payments).toHaveLength(1);
    expect(saved.rooms[0].nights).toHaveLength(2);
    expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(saved);
  });

  it("charges a late Flexible cancellation its first night and lets staff waive part of it later with a reason", async () => {
    let d = await stay("2026-10-11", "2026-10-13", 20000);
    d = await command(d, [pay(10000)]);
    const late = await command(d, [cancel]);
    expect(late).toMatchObject({
      totalCents: 20000,
      paidCents: 10000,
      balanceCents: 10000,
      refundDueCents: 0,
      cancellation: {
        freeUntil: "2026-10-09",
        policyChargeCents: 20000,
        waivedCents: 0,
        finalChargeCents: 20000,
      },
    });
    expect(await paged("balance=outstanding")).toMatchObject({ rows: [{ id: d.id }] });

    vi.setSystemTime(new Date("2026-10-12T16:30:00Z"));
    await db.signIn("owner");
    const waiver: WorkflowAction = {
      type: "waive-cancellation-charge",
      amountCents: 10000,
      reason: "Family emergency",
    };
    const waived = await command(late, [waiver]);
    const expected = {
      totalCents: 10000,
      paidCents: 10000,
      balanceCents: 0,
      refundDueCents: 0,
      cancellation: {
        recordedAt: "2026-10-10T15:00:00.000Z",
        recordedBy: "hotelmanantial",
        policyChargeCents: 20000,
        waivedCents: 10000,
        finalChargeCents: 10000,
        waivers: [
          {
            amountCents: 10000,
            reason: "Family emergency",
            recordedAt: "2026-10-12T16:30:00.000Z",
            recordedBy: "duena",
          },
        ],
      },
    };
    expect(waived).toMatchObject(expected);
    expect(waived.payments).toEqual(late.payments);
    expect(await paged("balance=settled")).toMatchObject({ rows: [{ id: d.id, ...expected }] });
  });

  it("waives a whole charge while cancelling and owes back every payment received", async () => {
    let d = await stay("2026-10-11", "2026-10-13", 20000);
    d = await command(d, [pay(20000)]);
    const actions: WorkflowAction[] = [
      cancel,
      { type: "waive-cancellation-charge", amountCents: 20000, reason: "Hospitalised" },
    ];
    const expected = {
      totalCents: 0,
      balanceCents: -20000,
      refundDueCents: 20000,
      cancellation: { policyChargeCents: 20000, waivedCents: 20000, finalChargeCents: 0 },
    };
    expect((await previewCommand(d, actions)).billing).toMatchObject(expected);
    expect(await command(d, actions)).toMatchObject(expected);
    expect(await paged("balance=credit")).toMatchObject({ rows: [{ id: d.id, ...expected }] });
  });

  it("moves a late cancellation from outstanding to credit when a partial waiver drops the charge below payments", async () => {
    let d = await stay("2026-10-11", "2026-10-13", 20000);
    d = await command(d, [pay(15000)]);
    d = await command(d, [cancel]);
    expect(await paged("balance=outstanding")).toMatchObject({
      rows: [{ id: d.id, balanceCents: 5000 }],
    });
    const waived = await command(d, [
      { type: "waive-cancellation-charge", amountCents: 10000, reason: "Goodwill" },
    ]);
    expect(waived).toMatchObject({
      totalCents: 10000,
      paidCents: 15000,
      balanceCents: -5000,
      refundDueCents: 5000,
      cancellation: { policyChargeCents: 20000, waivedCents: 10000, finalChargeCents: 10000 },
    });
    expect((await paged("balance=outstanding")).rows).toEqual([]);
    expect((await paged("balance=credit")).rows).toMatchObject([waived]);
  });

  it("is free through the end of the day 2 days before check-in in the property calendar and charges from the next day", async () => {
    const d = await stay("2026-10-12", "2026-10-14", 20000);
    vi.setSystemTime(new Date("2026-10-11T04:59:59Z"));
    expect((await previewCommand(d, [cancel])).billing.cancellation).toMatchObject({
      freeUntil: "2026-10-10",
      policyChargeCents: 0,
    });
    vi.setSystemTime(new Date("2026-10-11T05:00:00Z"));
    expect((await previewCommand(d, [cancel])).billing.cancellation).toMatchObject({
      policyChargeCents: 20000,
    });
    expect(await command(d, [cancel])).toMatchObject({
      totalCents: 20000,
      cancellation: { recordedAt: "2026-10-11T05:00:00.000Z", policyChargeCents: 20000 },
    });
  });

  it("charges a Non-refundable cancellation its discounted total at any time, with no extra penalty", async () => {
    let d = await stay("2026-11-20", "2026-11-22", 18000);
    db.sqlite
      .prepare(
        `UPDATE reservations SET rate_plan = 'non_refundable', cancellation_charge_basis = 'final_total',
          free_cancellation_days = NULL, payment_schedule = 'full_upfront', price_adjustment_percent = -10
          WHERE id = ?`,
      )
      .run(d.id);
    d = await command(d, [setDiscount(6000), pay(10000)]);
    expect(await command(d, [cancel])).toMatchObject({
      totalCents: 30000,
      balanceCents: 20000,
      refundDueCents: 0,
      cancellation: { freeUntil: null, policyChargeCents: 30000, finalChargeCents: 30000 },
    });
  });

  it("rejects waivers beyond the remaining charge, without a reason, or without an active cancellation", async () => {
    const d = await stay("2026-10-11", "2026-10-13", 20000);
    const waive = (amountCents: number, reason = "Goodwill"): WorkflowAction => ({
      type: "waive-cancellation-charge",
      amountCents,
      reason,
    });
    expect(await command(d, [waive(1000)], 400)).toEqual({
      error: "reservation has no active cancellation",
    });
    const cancelled = await command(d, [cancel, waive(15000)]);
    expect(await command(cancelled, [waive(5001)], 400)).toEqual({
      error: "waiver cannot exceed the cancellation charge",
    });
    expect(await command(cancelled, [waive(5000, "   ")], 400)).toEqual({
      error: expect.any(String),
    });
    expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(cancelled);
    const free = await command(await stay("2026-10-20", "2026-10-22", 20000), [cancel]);
    expect(await command(free, [waive(1)], 400)).toEqual({
      error: "waiver cannot exceed the cancellation charge",
    });
  });

  it("applies a retried cancel and waiver once, and a repeated cancel keeps the recorded charge", async () => {
    let d = await stay("2026-10-11", "2026-10-13", 20000);
    d = await command(d, [pay(5000)]);
    const body = {
      requestId: crypto.randomUUID(),
      actions: [
        cancel,
        { type: "waive-cancellation-charge", amountCents: 5000, reason: "Goodwill" },
      ],
    };
    const paused = pauseNextCommit();
    const first = request(`/reservations/${d.id}/commands`, "POST", body);
    await paused.ready;
    const concurrent = request(`/reservations/${d.id}/commands`, "POST", body);
    paused.resume();
    const responses = await Promise.all([first, concurrent]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const saved = (await responses[0].json()) as Detail;
    expect(await responses[1].json()).toEqual(saved);
    const retried = await request(`/reservations/${d.id}/commands`, "POST", body);
    expect(await retried.json()).toEqual(saved);
    expect(saved).toMatchObject({
      totalCents: 15000,
      paidCents: 5000,
      cancellation: { policyChargeCents: 20000, waivedCents: 5000 },
    });
    expect(saved.cancellations).toHaveLength(1);
    expect(saved.cancellation?.waivers).toHaveLength(1);
    expect(saved.payments).toEqual(d.payments);

    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    expect(await command(saved, [{ ...cancel, reason: "Asked again" }])).toMatchObject({
      totalCents: 15000,
      cancellation: saved.cancellation,
      cancellations: saved.cancellations,
    });
  });

  it("restores the stay bill under the same plan and keeps the charge and waiver as inactive history", async () => {
    let d = await stay("2026-10-11", "2026-10-13", 20000);
    d = await command(d, [roomEdit(d), pay(5000)]);
    const cancelled = await command(d, [
      cancel,
      { type: "waive-cancellation-charge", amountCents: 5000, reason: "Goodwill" },
    ]);

    const other = await stay("2026-10-12", "2026-10-13", 10000);
    await command(other, [roomEdit(other)]);
    const restore: WorkflowAction = { type: "set-status", status: "confirmed" };
    expect((await previewCommand(cancelled, [restore])).validation.issues).toEqual([
      { code: "room is already assigned for those dates", roomIndex: 0, field: "roomId" },
    ]);
    expect(await command(cancelled, [restore], 409)).toEqual({
      error: "room is already assigned for those dates",
    });
    expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(cancelled);

    await command(other, [{ type: "set-status", status: "cancelled" }]);
    vi.setSystemTime(new Date("2026-10-10T18:00:00Z"));
    const restored = await command(cancelled, [restore]);
    expect(restored).toMatchObject({
      status: "confirmed",
      ratePlan: d.ratePlan,
      totalCents: 40000,
      paidCents: 5000,
      balanceCents: 35000,
      refundDueCents: 0,
      cancellation: null,
      cancellations: [
        {
          ...cancelled.cancellation,
          restoredAt: "2026-10-10T18:00:00.000Z",
        },
      ],
    });
    expect(await paged("balance=outstanding")).toMatchObject({
      rows: [{ id: d.id, balanceCents: 35000 }],
    });

    const again = await command(restored, [cancel]);
    expect(again).toMatchObject({
      totalCents: 20000,
      cancellation: { recordedAt: "2026-10-10T18:00:00.000Z", waivedCents: 0 },
    });
    expect(again.cancellations).toHaveLength(2);
  });

  it("charges a cancellation from the stay left by the rest of its command", async () => {
    const d = await stay("2026-10-11", "2026-10-13", 20000);
    const addRoom: WorkflowAction = {
      type: "add-room",
      room: { roomTypeId: "type", adults: 1, children: 0, nightlyRateCents: 15000 },
    };
    expect(await command(d, [cancel, addRoom])).toMatchObject({
      totalCents: 35000,
      cancellation: { policyChargeCents: 35000, finalChargeCents: 35000 },
    });
  });

  it("leaves no cancellation record when one command cancels and restores", async () => {
    const d = await stay("2026-10-11", "2026-10-13", 20000);
    const saved = await command(d, [cancel, { type: "set-status", status: "confirmed" }]);
    expect(saved).toMatchObject({
      status: "confirmed",
      totalCents: 40000,
      cancellation: null,
      cancellations: [],
    });
  });

  it("keeps a zero charge for a reservation cancelled before charges existed and refuses to waive it", async () => {
    seedReservation(db.sqlite, {
      id: "legacy-cancelled",
      code: "OLD2",
      guestName: "Cancelled Guest",
      checkIn: "2026-10-11",
      checkOut: "2026-10-13",
      createdAt: "2026-09-01",
      status: "cancelled",
      nightCents: 10000,
    });
    db.sqlite
      .exec(`INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at)
      VALUES ('legacy-payment', 'legacy-cancelled', 4000, 'cash', '2026-09-01', '2026-09-01')`);
    const legacy = (await (await request("/reservations/legacy-cancelled")).json()) as Detail;
    const expected = {
      totalCents: 0,
      balanceCents: -4000,
      refundDueCents: 4000,
      cancellation: null,
      cancellations: [],
    };
    expect(legacy).toMatchObject(expected);
    expect(await command(legacy, [cancel])).toMatchObject(expected);
    expect(await paged("balance=credit")).toMatchObject({ rows: [{ id: legacy.id, ...expected }] });
    expect(
      await command(
        legacy,
        [{ type: "waive-cancellation-charge", amountCents: 1, reason: "Goodwill" }],
        400,
      ),
    ).toEqual({ error: "reservation has no active cancellation" });
  });
});

describe("no-show outcomes", () => {
  const noShow: WorkflowAction = { type: "set-status", status: "no_show" };
  async function nonRefundable(checkIn: string, checkOut: string, nightlyRateCents: number) {
    const d = await stay(checkIn, checkOut, nightlyRateCents);
    db.sqlite
      .prepare(
        `UPDATE reservations SET rate_plan = 'non_refundable', cancellation_charge_basis = 'final_total',
          free_cancellation_days = NULL, payment_schedule = 'full_upfront', price_adjustment_percent = -10
          WHERE id = ?`,
      )
      .run(d.id);
    return d;
  }

  it("owes an unpaid Non-refundable no-show its whole S/900 total without recording it as received", async () => {
    const d = await nonRefundable("2026-10-10", "2026-10-12", 45000);
    const expected = {
      status: "no_show",
      totalCents: 90000,
      paidCents: 0,
      balanceCents: 90000,
      refundDueCents: 0,
      cancellation: {
        outcome: "no_show",
        recordedAt: "2026-10-10T15:00:00.000Z",
        recordedBy: "hotelmanantial",
        freeUntil: null,
        policyChargeCents: 90000,
        finalChargeCents: 90000,
      },
    };
    expect((await previewCommand(d, [noShow])).billing).toMatchObject(expected);
    const saved = await command(d, [noShow]);
    expect(saved).toMatchObject({ ...expected, payments: [] });
    expect(saved.rooms[0].nights).toHaveLength(2);
    expect((await paged("statuses=no_show&balance=outstanding")).rows).toMatchObject([
      { id: d.id, ...expected },
    ]);
    expect((await paged("statuses=cancelled")).rows).toEqual([]);
  });

  it("retains a fully paid Non-refundable no-show's S/900 with nothing owed either way", async () => {
    let d = await nonRefundable("2026-10-10", "2026-10-12", 45000);
    d = await command(d, [pay(90000)]);
    const saved = await command(d, [noShow]);
    expect(saved).toMatchObject({
      status: "no_show",
      totalCents: 90000,
      paidCents: 90000,
      balanceCents: 0,
      refundDueCents: 0,
      cancellation: { outcome: "no_show", policyChargeCents: 90000, finalChargeCents: 90000 },
    });
    expect(saved.payments).toEqual(d.payments);
    expect((await paged("balance=settled")).rows).toMatchObject([{ id: d.id }]);
  });

  it("charges a Flexible no-show its first night even before the free deadline, reduced by a reasoned waiver", async () => {
    let d = await stay("2026-10-20", "2026-10-23", 20000);
    d = await command(d, [pay(5000)]);
    const marked = await command(d, [noShow]);
    expect(marked).toMatchObject({
      totalCents: 20000,
      paidCents: 5000,
      balanceCents: 15000,
      refundDueCents: 0,
      cancellation: { outcome: "no_show", freeUntil: null, policyChargeCents: 20000 },
    });
    const waived = await command(marked, [
      { type: "waive-cancellation-charge", amountCents: 15000, reason: "Flight cancelled" },
    ]);
    expect(waived).toMatchObject({
      status: "no_show",
      totalCents: 5000,
      paidCents: 5000,
      balanceCents: 0,
      refundDueCents: 0,
      cancellation: {
        policyChargeCents: 20000,
        waivedCents: 15000,
        finalChargeCents: 5000,
        waivers: [{ amountCents: 15000, reason: "Flight cancelled", recordedBy: "hotelmanantial" }],
      },
    });
    expect(waived.payments).toEqual(d.payments);
  });

  it("marks only a guest who has not checked in, and is never converted to or from a cancellation", async () => {
    const d = await stay("2026-10-10", "2026-10-12", 20000);
    const arrived = await command(d, [{ type: "set-status", status: "checked_in" }]);
    const rejected = { error: "only a confirmed reservation can be marked no-show" };
    expect(await command(arrived, [noShow], 400)).toEqual(rejected);
    const departed = await command(arrived, [{ type: "set-status", status: "checked_out" }]);
    expect(await command(departed, [noShow], 400)).toEqual(rejected);

    const cancelled = await command(await stay("2026-10-10", "2026-10-12", 20000), [
      { type: "set-status", status: "cancelled" },
    ]);
    expect(await command(cancelled, [noShow], 400)).toEqual(rejected);

    const missed = await command(await stay("2026-10-10", "2026-10-12", 20000), [noShow]);
    expect(await command(missed, [{ type: "set-status", status: "cancelled" }], 400)).toEqual({
      error: "restore the no-show reservation before cancelling it",
    });
    expect(await (await request(`/reservations/${missed.id}`)).json()).toEqual(missed);
  });

  it("releases inventory so the room can be booked again", async () => {
    const created = await create(3);
    const missed = await command(created, [roomEdit(created), noShow]);
    expect(missed.rooms[0].roomId).toBe("room-101");
    const rebooked = await create();
    expect(await command(rebooked, [roomEdit(rebooked)])).toMatchObject({
      status: "confirmed",
      rooms: [{ roomId: "room-101" }],
    });
  });

  it("refuses to restore a no-show whose room was rebooked, then restores the stay bill and keeps the charge as history", async () => {
    let d = await stay("2026-10-10", "2026-10-12", 20000);
    d = await command(d, [roomEdit(d), pay(5000)]);
    const missed = await command(d, [
      noShow,
      { type: "waive-cancellation-charge", amountCents: 5000, reason: "Goodwill" },
    ]);
    const other = await stay("2026-10-11", "2026-10-12", 10000);
    await command(other, [roomEdit(other)]);

    const restore: WorkflowAction = { type: "set-status", status: "confirmed" };
    expect((await previewCommand(missed, [restore])).validation.issues).toEqual([
      { code: "room is already assigned for those dates", roomIndex: 0, field: "roomId" },
    ]);
    expect(await command(missed, [restore], 409)).toEqual({
      error: "room is already assigned for those dates",
    });
    expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(missed);

    await command(other, [{ type: "set-status", status: "cancelled" }]);
    vi.setSystemTime(new Date("2026-10-10T18:00:00Z"));
    const restored = await command(missed, [restore]);
    expect(restored).toMatchObject({
      status: "confirmed",
      totalCents: 40000,
      paidCents: 5000,
      balanceCents: 35000,
      refundDueCents: 0,
      cancellation: null,
      cancellations: [
        { ...missed.cancellation, outcome: "no_show", restoredAt: "2026-10-10T18:00:00.000Z" },
      ],
    });
    expect(restored.payments).toEqual(d.payments);

    const again = await command(restored, [noShow]);
    expect(again).toMatchObject({
      totalCents: 20000,
      cancellation: { outcome: "no_show", waivedCents: 0 },
    });
    expect(again.cancellations).toHaveLength(2);
  });

  it("applies a retried no-show and waiver once, and a repeated no-show keeps the recorded charge", async () => {
    let d = await stay("2026-10-10", "2026-10-12", 20000);
    d = await command(d, [pay(5000)]);
    const body = {
      requestId: crypto.randomUUID(),
      actions: [
        noShow,
        { type: "waive-cancellation-charge", amountCents: 5000, reason: "Goodwill" },
      ],
    };
    const paused = pauseNextCommit();
    const first = request(`/reservations/${d.id}/commands`, "POST", body);
    await paused.ready;
    const concurrent = request(`/reservations/${d.id}/commands`, "POST", body);
    paused.resume();
    const responses = await Promise.all([first, concurrent]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const saved = (await responses[0].json()) as Detail;
    expect(await responses[1].json()).toEqual(saved);
    expect(await (await request(`/reservations/${d.id}/commands`, "POST", body)).json()).toEqual(
      saved,
    );
    expect(saved).toMatchObject({
      totalCents: 15000,
      paidCents: 5000,
      cancellation: { outcome: "no_show", policyChargeCents: 20000, waivedCents: 5000 },
    });
    expect(saved.cancellations).toHaveLength(1);
    expect(saved.payments).toEqual(d.payments);

    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    expect(await command(saved, [noShow])).toMatchObject({
      totalCents: 15000,
      cancellation: saved.cancellation,
      cancellations: saved.cancellations,
    });
  });
});

describe("refunds", () => {
  const cancel: WorkflowAction = { type: "set-status", status: "cancelled" };
  const requestRefund = (
    d: Detail,
    amountCents: number,
    payment = d.payments[0],
  ): WorkflowAction => ({
    type: "request-refund",
    paymentId: payment.id,
    amountCents,
    method: "transfer",
    reason: "Cancelled stay",
  });
  const complete = (refundId: string, refundDate = "2026-10-10", reference = "op-778") =>
    ({ type: "complete-refund", refundId, refundDate, reference }) satisfies WorkflowAction;
  const fail = (refundId: string): WorkflowAction => ({
    type: "fail-refund",
    refundId,
    reason: "Wrong account",
  });
  async function lateCancellation(paidCents: number) {
    const d = await stay("2026-10-11", "2026-10-13", 20000);
    return command(d, [pay(paidCents), cancel]);
  }

  it("keeps S/100 due while a refund is requested or failed and retains S/200 once it completes", async () => {
    const cancelled = await lateCancellation(30000);
    expect(cancelled).toMatchObject({ totalCents: 20000, paidCents: 30000, refundDueCents: 10000 });

    const requested = await command(cancelled, [requestRefund(cancelled, 10000)]);
    const pending = {
      totalCents: 20000,
      paidCents: 30000,
      refundedCents: 0,
      pendingRefundCents: 10000,
      balanceCents: -10000,
      refundDueCents: 10000,
    };
    expect(requested).toMatchObject(pending);
    expect(requested.refunds).toMatchObject([
      {
        paymentId: cancelled.payments[0].id,
        amountCents: 10000,
        method: "transfer",
        reason: "Cancelled stay",
        status: "requested",
        requestedAt: "2026-10-10T15:00:00.000Z",
        requestedBy: "hotelmanantial",
        resolvedAt: null,
      },
    ]);
    expect(await paged("refund=requested")).toMatchObject({ rows: [{ id: cancelled.id }] });

    const failed = await command(requested, [fail(requested.refunds[0].id)]);
    expect(failed).toMatchObject({ ...pending, pendingRefundCents: 0 });
    expect(failed.refunds).toMatchObject([{ status: "failed", failureReason: "Wrong account" }]);
    expect((await paged("refund=requested")).rows).toEqual([]);
    expect(await paged("refund=due")).toMatchObject({ rows: [{ id: cancelled.id }] });

    const retried = await command(failed, [requestRefund(failed, 10000)]);
    vi.setSystemTime(new Date("2026-10-10T18:00:00Z"));
    await db.signIn("owner");
    const retry = retried.refunds.find((refund) => refund.status === "requested")!;
    const completed = await command(retried, [complete(retry.id)]);
    expect(completed).toMatchObject({
      totalCents: 20000,
      paidCents: 30000,
      refundedCents: 10000,
      pendingRefundCents: 0,
      balanceCents: 0,
      refundDueCents: 0,
    });
    expect(completed.refunds.find((refund) => refund.id === retry.id)).toMatchObject({
      status: "completed",
      resolvedAt: "2026-10-10T18:00:00.000Z",
      resolvedBy: "duena",
      refundDate: "2026-10-10",
      completionReference: "OP-778",
    });
    expect(completed.payments).toEqual(cancelled.payments);
    expect((await paged("refund=due")).rows).toEqual([]);
    expect(await paged("balance=settled")).toMatchObject({ rows: [{ id: cancelled.id }] });
    expect(await (await request(`/reservations/${cancelled.id}`)).json()).toEqual(completed);
  });

  it("returns all S/200 of an eligible Flexible cancellation in one request and completion", async () => {
    let d = await stay("2026-10-20", "2026-10-22", 10000);
    d = await command(d, [pay(20000), cancel]);
    expect(d).toMatchObject({ totalCents: 0, refundDueCents: 20000 });
    const actions = [requestRefund(d, 20000)];
    expect((await previewCommand(d, actions)).billing).toMatchObject({
      pendingRefundCents: 20000,
      refundDueCents: 20000,
      refunds: [{ amountCents: 20000, status: "requested" }],
    });
    d = await command(d, actions);
    expect(await command(d, [complete(d.refunds[0].id)])).toMatchObject({
      paidCents: 20000,
      refundedCents: 20000,
      balanceCents: 0,
      refundDueCents: 0,
    });
  });

  it("owes back S/100 when a S/500 stay paid in full is amended to S/400", async () => {
    let d = await stay("2026-10-20", "2026-10-25", 10000);
    d = await command(d, [pay(50000)]);
    const shortened = await command(d, [
      { type: "dates", checkIn: "2026-10-20", checkOut: "2026-10-24" },
    ]);
    expect(shortened).toMatchObject({
      status: "confirmed",
      totalCents: 40000,
      paidCents: 50000,
      refundDueCents: 10000,
    });
    expect(await paged("refund=due")).toMatchObject({ rows: [{ id: d.id }] });
    const requested = await command(shortened, [requestRefund(shortened, 10000)]);
    expect(requested).toMatchObject({ pendingRefundCents: 10000, refundDueCents: 10000 });
    const extend: WorkflowAction = { type: "dates", checkIn: "2026-10-20", checkOut: "2026-10-25" };
    expect(await command(requested, [extend], 400)).toEqual({
      error: "change leaves requested refunds above the refund due",
    });
    expect(await command(requested, [complete(requested.refunds[0].id)])).toMatchObject({
      totalCents: 40000,
      refundedCents: 10000,
      pendingRefundCents: 0,
      balanceCents: 0,
    });
  });

  it("rejects a second request beyond the remaining refund due or what its payment has left", async () => {
    const cancelled = await lateCancellation(30000);
    const first = await command(cancelled, [requestRefund(cancelled, 6000)]);
    expect(await command(first, [requestRefund(first, 4001)], 400)).toEqual({
      error: "refund exceeds the refund due",
    });
    const second = await command(first, [requestRefund(first, 4000)]);
    expect(second.pendingRefundCents).toBe(10000);

    let free = await stay("2026-10-20", "2026-10-22", 10000);
    free = await command(free, [pay(10000), pay(10000), cancel]);
    expect(free.refundDueCents).toBe(20000);
    const [payment] = free.payments;
    const partly = await command(free, [requestRefund(free, 6000, payment)]);
    const done = await command(partly, [complete(partly.refunds[0].id)]);
    expect(await command(done, [requestRefund(done, 4001, payment)], 400)).toEqual({
      error: "refund exceeds the payment's remaining amount",
    });
    expect(await command(done, [requestRefund(done, 4000, payment)])).toMatchObject({
      refundedCents: 6000,
      pendingRefundCents: 4000,
      refundDueCents: 14000,
    });
  });

  it("lets only one of two concurrent requests for the whole refund due succeed", async () => {
    const cancelled = await lateCancellation(30000);
    const body = () => ({
      requestId: crypto.randomUUID(),
      actions: [requestRefund(cancelled, 10000)],
    });
    const paused = pauseNextCommit();
    const first = request(`/reservations/${cancelled.id}/commands`, "POST", body());
    await paused.ready;
    const concurrent = await request(`/reservations/${cancelled.id}/commands`, "POST", body());
    expect(concurrent.status).toBe(200);
    paused.resume();
    const stale = await first;
    expect(stale.status).toBe(400);
    expect(await stale.json()).toEqual({ error: "refund exceeds the refund due" });
    const saved = (await (await request(`/reservations/${cancelled.id}`)).json()) as Detail;
    expect(saved.refunds).toHaveLength(1);
    expect(saved.pendingRefundCents).toBe(10000);
  });

  it("locks a payment once it has a refund and keeps a mistaken request as failed history", async () => {
    const cancelled = await lateCancellation(30000);
    const [payment] = cancelled.payments;
    const requested = await command(cancelled, [requestRefund(cancelled, 5000)]);
    const [refund] = requested.refunds;
    const failed = await command(requested, [fail(refund.id)]);
    for (const action of [
      { type: "delete-payment", paymentId: payment.id },
      {
        type: "edit-payment",
        paymentId: payment.id,
        payment: { amountCents: 40000, method: "cash", paymentDate: "2026-10-10" },
      },
    ] as WorkflowAction[])
      expect(await command(failed, [action], 400)).toEqual({
        error: "payment with refunds cannot be changed",
      });
    for (const action of [fail(refund.id), complete(refund.id)])
      expect(await command(failed, [action], 400)).toEqual({
        error: "refund is already resolved",
      });
    expect(await command(failed, [fail("missing")], 400)).toEqual({ error: "refund not found" });
    const next = await command(failed, [requestRefund(failed, 5000)]);
    const pending = next.refunds.find((r) => r.status === "requested")!;
    expect(await command(next, [complete(pending.id, "2026-10-11")], 400)).toEqual({
      error: "refund date cannot be in the future",
    });
    expect(await (await request(`/reservations/${cancelled.id}`)).json()).toEqual(next);
    expect(next.payments).toEqual(cancelled.payments);
  });

  it("refuses to change a payment after a refund request for it in the same command", async () => {
    const cancelled = await lateCancellation(30000);
    const [payment] = cancelled.payments;
    for (const change of [
      {
        type: "edit-payment",
        paymentId: payment.id,
        payment: { amountCents: 40000, method: "card", paymentDate: "2026-10-10" },
      },
      { type: "delete-payment", paymentId: payment.id },
    ] as WorkflowAction[])
      expect(await command(cancelled, [requestRefund(cancelled, 10000), change], 400)).toEqual({
        error: "payment with refunds cannot be changed",
      });
    expect(await (await request(`/reservations/${cancelled.id}`)).json()).toEqual(cancelled);
  });

  it("refuses to restore a cancellation or no-show with any refund activity", async () => {
    const cancelled = await lateCancellation(30000);
    const requested = await command(cancelled, [requestRefund(cancelled, 5000)]);
    const failed = await command(requested, [fail(requested.refunds[0].id)]);
    const restore: WorkflowAction = { type: "set-status", status: "confirmed" };
    for (const endpoint of ["preview", "commands"]) {
      const response = await request(`/reservations/${failed.id}/${endpoint}`, "POST", {
        requestId: crypto.randomUUID(),
        actions: [restore],
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "reservation with refunds cannot be restored",
      });
    }
    let noShow = await stay("2026-10-10", "2026-10-12", 10000);
    noShow = await command(noShow, [pay(20000), { type: "set-status", status: "no_show" }]);
    const owed = await command(noShow, [requestRefund(noShow, 10000)]);
    expect(await command(owed, [restore], 400)).toEqual({
      error: "reservation with refunds cannot be restored",
    });
    expect(await (await request(`/reservations/${noShow.id}`)).json()).toEqual(owed);
    const untouched = await lateCancellation(30000);
    expect(await command(untouched, [restore, requestRefund(untouched, 5000)], 400)).toEqual({
      error: "reservation with refunds cannot be restored",
    });
  });

  it("keeps the payment report's received total and lists only completed refunds by refund date", async () => {
    const cancelled = await lateCancellation(30000);
    let d = await command(cancelled, [requestRefund(cancelled, 6000)]);
    const [first] = d.refunds;
    d = await command(d, [complete(first.id), requestRefund(d, 4000)]);
    vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
    const pending = d.refunds.find((refund) => refund.status === "requested")!;
    await command(d, [complete(pending.id, "2026-10-11", "op-9")]);
    const report = async (date: string) =>
      (await request(`/payments?from=${date}&to=${date}`)).json();
    expect(await report("2026-10-10")).toEqual({
      from: "2026-10-10",
      to: "2026-10-10",
      currency: "PEN",
      totalCents: 30000,
      payments: [expect.objectContaining({ amountCents: 30000, code: d.code })],
      refundedCents: 6000,
      refunds: [
        {
          id: first.id,
          paymentId: d.payments[0].id,
          reservationId: d.id,
          code: d.code,
          guestName: "Ada Lovelace",
          amountCents: 6000,
          method: "transfer",
          reference: "OP-778",
          refundDate: "2026-10-10",
          reason: "Cancelled stay",
        },
      ],
      couponIssuedCents: 0,
      couponRedeemedCents: 0,
      couponReturnedCents: 0,
      couponMovements: [],
    });
    expect(await report("2026-10-11")).toMatchObject({
      totalCents: 0,
      payments: [],
      refundedCents: 4000,
      refunds: [{ amountCents: 4000, reference: "OP-9", refundDate: "2026-10-11" }],
    });
  });

  it("applies a retried request once, including a copy sent while the first waits", async () => {
    const cancelled = await lateCancellation(30000);
    const body = { requestId: crypto.randomUUID(), actions: [requestRefund(cancelled, 10000)] };
    const paused = pauseNextCommit();
    const first = request(`/reservations/${cancelled.id}/commands`, "POST", body);
    await paused.ready;
    const concurrent = request(`/reservations/${cancelled.id}/commands`, "POST", body);
    paused.resume();
    const responses = await Promise.all([first, concurrent]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const saved = (await responses[0].json()) as Detail;
    expect(await responses[1].json()).toEqual(saved);
    const retried = await request(`/reservations/${cancelled.id}/commands`, "POST", body);
    expect(await retried.json()).toEqual(saved);
    expect(saved.refunds).toHaveLength(1);
    expect(saved.pendingRefundCents).toBe(10000);
  });

  describe("money already handed back", () => {
    const handedBack = (d: Detail, amountCents: number, refundDate = "2026-10-09") =>
      ({
        type: "request-refund",
        paymentId: d.payments[0].id,
        amountCents,
        method: "cash",
        reason: "Cancelled stay",
        completed: { refundDate },
      }) satisfies WorkflowAction;

    it("records S/60 returned in cash as one completed refund with no reference, leaving S/40 due", async () => {
      const cancelled = await lateCancellation(30000);
      const returned = await command(cancelled, [handedBack(cancelled, 6000)]);
      expect(returned).toMatchObject({
        paidCents: 30000,
        refundedCents: 6000,
        pendingRefundCents: 0,
        refundDueCents: 4000,
      });
      expect(returned.refunds).toMatchObject([
        {
          amountCents: 6000,
          method: "cash",
          reference: null,
          status: "completed",
          requestedAt: "2026-10-10T15:00:00.000Z",
          requestedBy: "hotelmanantial",
          resolvedAt: "2026-10-10T15:00:00.000Z",
          resolvedBy: "hotelmanantial",
          refundDate: "2026-10-09",
          completionReference: null,
        },
      ]);
      expect(await (await request(`/reservations/${cancelled.id}`)).json()).toEqual(returned);
    });

    it("keeps the completion's reference when staff give one", async () => {
      const cancelled = await lateCancellation(30000);
      const action = handedBack(cancelled, 6000, "2026-10-10");
      const returned = await command(cancelled, [
        { ...action, method: "transfer", completed: { ...action.completed, reference: "op-12" } },
      ]);
      expect(returned.refunds).toMatchObject([
        { status: "completed", refundDate: "2026-10-10", completionReference: "OP-12" },
      ]);
    });

    it("rejects money handed back on a future date or beyond the refund due, recording nothing", async () => {
      const cancelled = await lateCancellation(30000);
      expect(await command(cancelled, [handedBack(cancelled, 6000, "2026-10-11")], 400)).toEqual({
        error: "refund date cannot be in the future",
      });
      expect(await command(cancelled, [handedBack(cancelled, 10001)], 400)).toEqual({
        error: "refund exceeds the refund due",
      });
      expect(await (await request(`/reservations/${cancelled.id}`)).json()).toEqual(cancelled);
    });

    it("replays a retried request without recording the money twice", async () => {
      const cancelled = await lateCancellation(30000);
      const body = { requestId: crypto.randomUUID(), actions: [handedBack(cancelled, 6000)] };
      const first = await request(`/reservations/${cancelled.id}/commands`, "POST", body);
      expect(first.status).toBe(200);
      const saved = (await first.json()) as Detail;
      vi.setSystemTime(new Date("2026-10-10T16:00:00Z"));
      const retried = await request(`/reservations/${cancelled.id}/commands`, "POST", body);
      expect(retried.status).toBe(200);
      expect(await retried.json()).toEqual(saved);
      const reread = (await (await request(`/reservations/${cancelled.id}`)).json()) as Detail;
      expect(reread.refunds).toHaveLength(1);
      expect(reread).toMatchObject({ refundedCents: 6000, refundDueCents: 4000 });
    });

    it("completes a requested refund without a reference", async () => {
      const cancelled = await lateCancellation(30000);
      const requested = await command(cancelled, [requestRefund(cancelled, 10000)]);
      const completed = await command(requested, [
        { type: "complete-refund", refundId: requested.refunds[0].id, refundDate: "2026-10-10" },
      ]);
      expect(completed).toMatchObject({ refundedCents: 10000, refundDueCents: 0 });
      expect(completed.refunds).toMatchObject([
        { status: "completed", refundDate: "2026-10-10", completionReference: null },
      ]);
    });

    it("refuses to mark a Culqi refund as already handed back", async () => {
      const cancelled = await lateCancellation(30000);
      const response = await request(`/reservations/${cancelled.id}/commands`, "POST", {
        requestId: crypto.randomUUID(),
        actions: [
          {
            type: "request-culqi-refund",
            paymentId: cancelled.payments[0].id,
            amountCents: 6000,
            reason: "Cancelled stay",
            completed: { refundDate: "2026-10-10" },
          },
        ],
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Unrecognized key: "completed"' });
      expect(await (await request(`/reservations/${cancelled.id}`)).json()).toEqual(cancelled);
    });
  });
});

function pauseNextCommit() {
  let resume = () => {};
  let reached = () => {};
  const blocked = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  db.beforeCommit(() => {
    reached();
    return blocked;
  });
  return { ready, resume };
}

describe("concurrent reservation commands", () => {
  it.each([
    { room: "an unassigned room", roomId: null, to: "confirmed", limit: { maxAdults: 1 } },
    { room: "an assigned room", roomId: "room-101", to: "checked_in", limit: { maxChildren: 1 } },
    { room: "an assigned room", roomId: "room-101", to: "checked_out", limit: { maxAdults: 1 } },
  ] as const)(
    "rejects restoring $room to $to when its limit shrinks after preflight",
    async ({ roomId, to, limit }) => {
      let d = await create();
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
      const paused = pauseNextCommit();
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
        db.sqlite.prepare("SELECT id FROM reservation_requests WHERE id = ?").get(body.requestId),
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
    { status: "cancelled", checkIn: "2026-10-11", checkOut: "2026-10-14" },
  ] as const)(
    "rejects changed dates for $status ($checkIn to $checkOut) when capacity changes after preflight",
    async ({ status, checkIn, checkOut }) => {
      let d = await create();
      d = await command(d, [roomEdit(d, 0, { adults: 2 }), { type: "set-status", status }]);
      const nights = db.sqlite.prepare("SELECT * FROM reservation_room_nights ORDER BY id").all();
      const paused = pauseNextCommit();
      const pending = command(d, [{ type: "dates", checkIn, checkOut }, pay(5000)], 409);
      await paused.ready;
      try {
        expect((await request("/room-types/type", "PATCH", { maxAdults: 1 })).status).toBe(200);
      } finally {
        paused.resume();
      }
      expect(await pending).toEqual({ error: "too many guests for this room type" });
      expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);
      expect(db.sqlite.prepare("SELECT * FROM reservation_room_nights ORDER BY id").all()).toEqual(
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
      ].map((table) => db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
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
    const paused = pauseNextCommit();
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
    const paused = pauseNextCommit();
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

  it("allows unchanged-room saves when the type's limit shrinks between preflight and commit", async () => {
    let d = await create();
    d = await command(d, [roomEdit(d, 0, { adults: 2, children: 2 })]);
    const paused = pauseNextCommit();
    const pending = command(d, [pay(5000), setDiscount(1000), { type: "notes", notes: "Paid" }]);
    await paused.ready;
    try {
      expect((await request("/room-types/type", "PATCH", { maxAdults: 1 })).status).toBe(200);
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
    expect(saved).toMatchObject({ totalCents: 10000, balanceCents: 5000, refundDueCents: 0 });
  });

  it("preserves a concurrent discount when an older notes plan commits later", async () => {
    const d = await create();
    const paused = pauseNextCommit();
    const pending = command(d, [{ type: "notes", notes: "Arriving after 10 pm" }]);
    await paused.ready;
    await command(d, [setDiscount(5000), { type: "notes", notes: "Arriving at 8 pm" }]);
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
    const paused = pauseNextCommit();
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
    const paused = pauseNextCommit();
    const pending = command(d, [pay(1000)]);
    await paused.ready;
    await command(d, [{ type: "set-guests", guests: [person] }]);
    paused.resume();
    const saved = await pending;
    const { reservationRoomId: _room, ...expected } = person;
    expect(saved.stayingGuests).toMatchObject([expected]);
    expect(saved.paidCents).toBe(1000);
    expect(saved.payments).toHaveLength(1);
  });

  it("keeps both distinct payments when a stale command retries", async () => {
    const d = await create();
    const paused = pauseNextCommit();
    const pending = command(d, [pay(1000)]);
    await paused.ready;
    await command(d, [pay(2000)]);
    paused.resume();
    const saved = await pending;
    expect(saved.paidCents).toBe(3000);
    expect(saved.payments).toHaveLength(2);
  });

  it("replays a request another attempt committed without duplicating its payment", async () => {
    const d = await create();
    const body = { requestId: crypto.randomUUID(), actions: [pay(1000)] };
    const paused = pauseNextCommit();
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

  it("reapplies an intentional contact edit even when it matched the original values", async () => {
    const d = await create();
    const paused = pauseNextCommit();
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
    const paused = pauseNextCommit();
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
    const paused = pauseNextCommit();
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
      db.sqlite.prepare("SELECT id FROM reservation_requests WHERE id=?").get(body.requestId),
    ).toBeUndefined();
  });

  it("guards a shared contact when another reservation edits it concurrently", async () => {
    const first = await create();
    const second = await create();
    db.sqlite
      .prepare("UPDATE reservations SET guest_id=? WHERE id=?")
      .run(first.guestId, second.id);
    const paused = pauseNextCommit();
    const pending = command(first, [
      {
        type: "contact",
        contact: { fullName: "Later contact", email: null, phone: null },
      },
    ]);
    await paused.ready;
    expect(
      (await request(`/guests/${first.guestId}`, "PATCH", { notes: "Guest preference" })).status,
    ).toBe(200);
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
      notes: "Guest preference",
    });
  });

  it("bounds retries, rolls back exhausted attempts, and keeps the request ID usable", async () => {
    const d = await create();
    const body = { requestId: crypto.randomUUID(), actions: [pay(1000)] };
    let contenders = 0;
    const stop = db.beforeCommit(
      async () => {
        contenders++;
        const response = await request(`/reservations/${d.id}/commands`, "POST", {
          requestId: crypto.randomUUID(),
          actions: [{ type: "notes", notes: `Other save ${contenders}` }],
        });
        expect(response.status).toBe(200);
      },
      { times: Infinity },
    );
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
      db.sqlite.prepare("SELECT id FROM reservation_requests WHERE id=?").get(body.requestId),
    ).toBeUndefined();
    stop();
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
  it("reprices type changes and permits an explicit matching assignment", async () => {
    seedRoomType(db.sqlite, { id: "other", name: "Twin", maxAdults: 3, baseRateCents: 20000 });
    seedRooms(db.sqlite, "other", { "201": "201" });
    let d = await create();
    d = await command(d, [roomEdit(d)]);
    d = await command(d, [roomEdit(d, 0, { roomTypeId: "other", roomId: "201" })]);
    expect(d.rooms[0].roomId).toBe("201");
    expect(d.totalCents).toBe(60000);
  });
  it("rejects closed and occupied assignments, keeping the current room and all selected actions unsaved", async () => {
    let first = await create();
    first = await command(first, [roomEdit(first)]);
    let d = await create();
    d = await command(d, [roomEdit(d, 0, { roomId: "room-103" }), all(d, "check-in")]);
    await command(d, [pay(10000), roomEdit(d)], 409);
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).paidCents).toBe(0);
    db.sqlite.exec(
      "INSERT INTO room_closures VALUES ('closed','room-102','2026-10-10','2026-10-13','Maintenance','2026-10-10')",
    );
    await command(d, [roomEdit(d, 0, { roomId: "room-102" })], 409);
    expect(await (await request(`/reservations/${d.id}`)).json()).toMatchObject({
      status: "checked_in",
      rooms: [{ roomId: "room-103" }],
    });
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
    expect((await command(other, [pay(10000)])).paidCents).toBe(10000);
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
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM reservations").get()?.n).toBe(1);
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
    expect(saved.guest).toMatchObject({ ...input.guest, phone: "+51999888777" });
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
    seedRoomType(db.sqlite, { id: "other", name: "Single", maxAdults: 1, baseRateCents: 5000 });
    seedRooms(db.sqlite, "other", { "room-other": "201" });
    const actions = [roomEdit(d, 0, { adults: 2, children: 3, roomId: "room-other" })];
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
      billing: { status: "cancelled", totalCents: 10000, paidCents: 5000, balanceCents: 5000 },
      validation: { issues: [] },
    });
    d = await command(d, actions);
    expect(d.status).toBe("cancelled");
    expect(d.balanceCents).toBe(5000);
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
    db.sqlite.exec(
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
  it.each([
    ["an assigned booking", "2026-10-21", "2026-10-23", "room is already assigned for those dates"],
    ["an assigned booking", "2026-10-22", "2026-10-24", null],
    ["an assigned booking", "2026-10-18", "2026-10-20", null],
    ["a cancelled booking", "2026-10-21", "2026-10-23", null],
    ["a room closure", "2026-10-21", "2026-10-23", "room is closed for those dates"],
    ["a room closure", "2026-10-22", "2026-10-24", null],
    ["a room closure", "2026-10-18", "2026-10-20", null],
    ["a full room type", "2026-10-21", "2026-10-23", "no availability"],
    ["a full room type", "2026-10-22", "2026-10-24", null],
    ["a full room type", "2026-10-18", "2026-10-20", null],
  ])(
    "previews moving away from the saved stay against %s on 20–22 Oct: %s to %s → %s",
    async (blocker, checkIn, checkOut, issue) => {
      let d = await create();
      const blocked = { checkIn: "2026-10-20", checkOut: "2026-10-22" };
      if (blocker === "a full room type") await create(3, blocked);
      else d = await command(d, [roomEdit(d)]);
      if (blocker === "a room closure")
        db.sqlite.exec(
          "INSERT INTO room_closures (id, room_id, starts, ends, reason, created_at) VALUES ('closed', 'room-101', '2026-10-20', '2026-10-22', NULL, '2026-10-10')",
        );
      if (blocker.endsWith("booking")) {
        const other = await create(1, blocked);
        await command(other, [
          roomEdit(other),
          ...(blocker === "a cancelled booking"
            ? [{ type: "set-status", status: "cancelled" } as WorkflowAction]
            : []),
        ]);
      }
      const move: WorkflowAction[] = [{ type: "dates", checkIn, checkOut }];
      const preview = await previewCommand(d, move);
      expect(preview.validation.issues.map((found) => found.code)).toEqual(issue ? [issue] : []);
      const saved = await command(d, move, issue ? 409 : 200);
      if (!issue) expect(saved).toMatchObject({ checkIn, checkOut });
    },
  );
  it("keeps staying guests through saves that do not change them, without rewriting their rows", async () => {
    let d = await create();
    const kept = guest(null);
    d = await command(d, [{ type: "set-guests", guests: [guest(null), kept] }]);
    const staying = d.stayingGuests;
    expect(staying).toHaveLength(2);
    db.sqlite.exec(`
      CREATE TABLE guest_writes (op TEXT NOT NULL);
      CREATE TRIGGER log_guest_insert AFTER INSERT ON reservation_guests
      BEGIN INSERT INTO guest_writes VALUES ('insert'); END;
      CREATE TRIGGER log_guest_update AFTER UPDATE ON reservation_guests
      BEGIN INSERT INTO guest_writes VALUES ('update'); END;
      CREATE TRIGGER log_guest_delete AFTER DELETE ON reservation_guests
      BEGIN INSERT INTO guest_writes VALUES ('delete'); END;
    `);
    const writes = () => db.sqlite.prepare("SELECT op FROM guest_writes").all();
    for (const actions of [
      [{ type: "notes", notes: "Late arrival" }],
      [pay(1000)],
      [roomEdit(d)],
      [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-10-14" }],
      [{ type: "contact", contact: { fullName: "Ada King", email: null, phone: null } }],
    ] as WorkflowAction[][]) {
      d = await command(d, actions);
      expect(d.stayingGuests).toEqual(staying);
    }
    expect(writes()).toEqual([]);
    d = await command(d, [{ type: "set-guests", guests: [kept] }]);
    expect(d.stayingGuests).toEqual([staying[1]]);
    expect(writes().length).toBeGreaterThan(0);
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
  it.each([undefined, null, "another-room"])(
    "saves guests while ignoring legacy submitted room %s",
    async (reservationRoomId) => {
      const d = await create(2);
      const first = guest(null),
        second = guest(null),
        added = guest("foreign-room");
      await command(d, [{ type: "set-guests", guests: [first, second] }]);
      const actions: WorkflowAction[] = [
        {
          type: "set-guests",
          guests: [second, first, added].map((person) => ({ ...person, reservationRoomId })),
        },
      ];
      const before = await (await request(`/reservations/${d.id}`)).json();
      const proposed = await previewCommand(d, actions);
      expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(before);
      const saved = await command(d, actions);
      for (const detail of [
        proposed.billing,
        saved,
        (await (await request(`/reservations/${d.id}`)).json()) as Detail,
      ]) {
        expect(detail.stayingGuests.map((person) => person.id)).toEqual([
          second.id,
          first.id,
          added.id,
        ]);
        for (const person of detail.stayingGuests)
          expect(person).not.toHaveProperty("reservationRoomId");
      }
    },
  );
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
    const { reservationRoomId: _room, ...expected } = person;
    expect(d.stayingGuests[0]).toMatchObject(expected);
    d = await arrive(d);
    d = await command(d, [roomEdit(d, 0, { roomId: "room-103" })]);
    expect(d.stayingGuests[0]).toMatchObject(expected);
    expect(d.rooms[0].roomId).toBe("room-103");
    d = await command(d, [{ type: "set-guests", guests: [] }]);
    expect(d.stayingGuests).toEqual([]);
  });
  it("rejects foreign guests and leaves contact and guests unchanged on failure", async () => {
    const d = await create(),
      other = await create();
    const person = guest(null);
    await command(other, [{ type: "set-guests", guests: [person] }]);
    await command(
      d,
      [
        { type: "contact", contact: { fullName: "Changed Name", email: null, phone: null } },
        { type: "set-guests", guests: [person] },
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
  it("rejects invalid payment and discount edits atomically and deduplicates edits and deletes", async () => {
    let d = await command(await create(), [pay(11000)]);
    const id = d.payments[0].id;
    await command(d, [setDiscount(-1)], 400);
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
describe("contact phones", () => {
  const book = (phone: string) =>
    request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      guest: { fullName: "Ada Lovelace", phone },
      checkIn: "2026-10-10",
      checkOut: "2026-10-11",
      rooms: [{ roomTypeId: "type", adults: 1, children: 0 }],
    });

  it.each([
    ["a local Peruvian mobile", "987 654 321", "+51987654321"],
    ["a Lima landline with its area code", "(01) 234-5678", "+5112345678"],
    ["a formatted international mobile", "+1 (415) 555-2671", "+14155552671"],
  ])("stores %s in international form", async (_case, phone, stored) => {
    const response = await book(phone);
    expect(response.status).toBe(201);
    expect(((await response.json()) as Detail).guest.phone).toBe(stored);
  });

  it.each([
    ["a landline without its area code", "234 5678", "phone number is too short"],
    ["too many digits", "9876543210", "phone number is too long"],
    ["letters", "99911122a", "invalid phone number"],
    ["an extension", "999 111 222 ext. 5", "phone extensions are not supported"],
  ])("rejects %s without creating the booking", async (_case, phone, error) => {
    const response = await book(phone);
    expect(response.status).toBe(400);
    expect(response.headers.get("X-Error-Field")).toBe("phone");
    expect(await response.json()).toEqual({ error });
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM reservations").get()?.n).toBe(0);
  });

  it("keeps an unchanged legacy contact phone, validates a changed one, and allows clearing", async () => {
    let d = await create();
    db.sqlite.prepare("UPDATE guests SET phone = '99-11 old' WHERE id = ?").run(d.guestId);
    const contact = (phone: string | null): WorkflowAction => ({
      type: "contact",
      contact: { fullName: "Renamed Contact", email: null, phone },
    });
    d = await command(d, [contact("99-11 old"), pay(1000)]);
    expect(d.guest).toMatchObject({ fullName: "Renamed Contact", phone: "99-11 old" });
    expect(d.paidCents).toBe(1000);

    const rejected = await request(`/reservations/${d.id}/commands`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [contact("99-12 old"), pay(1000)],
    });
    expect(rejected.status).toBe(400);
    expect(rejected.headers.get("X-Error-Field")).toBe("phone");
    d = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(d.guest.phone).toBe("99-11 old");
    expect(d.paidCents).toBe(1000);

    d = await command(d, [contact("987 654 321")]);
    expect(d.guest.phone).toBe("+51987654321");
    d = await command(d, [contact(null)]);
    expect(d.guest.phone).toBeNull();
  });

  it("applies the same rules to staying guests, who may share the booking contact's number", async () => {
    let d = await create();
    d = await command(d, [
      { type: "contact", contact: { fullName: "Ada", email: null, phone: "987654321" } },
    ]);
    const person = { ...guest(null), phone: "987 654 321" };
    d = await command(d, [{ type: "set-guests", guests: [person] }]);
    expect(d.stayingGuests[0].phone).toBe("+51987654321");
    expect(d.guest.phone).toBe("+51987654321");

    db.sqlite
      .prepare("UPDATE reservation_guests SET phone = 'ask at desk' WHERE id = ?")
      .run(person.id);
    d = await command(d, [
      { type: "set-guests", guests: [{ ...person, fullName: "Ana Ruiz", phone: "ask at desk" }] },
    ]);
    expect(d.stayingGuests[0]).toMatchObject({ fullName: "Ana Ruiz", phone: "ask at desk" });
    await command(d, [{ type: "set-guests", guests: [{ ...person, phone: "234 5678" }] }], 400);
    await command(
      d,
      [{ type: "set-guests", guests: [{ ...guest(null), phone: "ask at desk" }] }],
      400,
    );
    d = await command(d, [{ type: "set-guests", guests: [{ ...person, phone: null }] }]);
    expect(d.stayingGuests[0].phone).toBeNull();
    expect(d.guest.phone).toBe("+51987654321");
  });

  it("validates guest record writes but keeps an unchanged legacy phone", async () => {
    const created = await request("/guests", "POST", {
      fullName: "Ana",
      phone: "+44 20 7946 0958",
    });
    expect(created.status).toBe(201);
    const saved = (await created.json()) as { id: string; phone: string };
    expect(saved.phone).toBe("+442079460958");
    expect((await request("/guests", "POST", { fullName: "Bea", phone: "12" })).status).toBe(400);

    db.sqlite.prepare("UPDATE guests SET phone = '99-11 old' WHERE id = ?").run(saved.id);
    const renamed = await request(`/guests/${saved.id}`, "PATCH", {
      fullName: "Ana Ruiz",
      phone: "99-11 old",
    });
    expect(((await renamed.json()) as { phone: string }).phone).toBe("99-11 old");
    const changed = await request(`/guests/${saved.id}`, "PATCH", { phone: "99-12 old" });
    expect(changed.status).toBe(400);
    expect(changed.headers.get("X-Error-Field")).toBe("phone");
  });
});
describe("reservation dates and lifecycle", () => {
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
    d = await command(d, [{ type: "set-status", status: "confirmed" }]);
    expect(d).toMatchObject({ status: "confirmed", checkIn: "2026-10-10", checkOut: "2026-10-13" });
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
    expect(await previewCommand(d, [all(d, "check-out")])).toMatchObject({
      billing: { status: "checked_out", totalCents: 60000, balanceCents: 60000 },
      validation: { issues: [] },
    });
    expect(((await (await request(`/reservations/${d.id}`)).json()) as Detail).status).toBe(
      "checked_in",
    );
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
    db.sqlite.exec("UPDATE room_types SET base_rate_cents=15000 WHERE id='type'");
    d = await command(d, [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-10-14" }]);
    expect(
      d.rooms.every(
        (line) =>
          line.nights.map((night) => night.priceCents).join(",") === "10000,10000,10000,15000",
      ),
    ).toBe(true);
  });
  it("keeps a retained night's adjustment and discount through edits and clears them when the type changes", async () => {
    seedRoomType(db.sqlite, { id: "other", name: "Twin", maxAdults: 3, baseRateCents: 20000 });
    seedRooms(db.sqlite, "other", { "201": "201" });
    let d = await create();
    const lineId = d.rooms[0].id;
    db.sqlite.exec(`
      UPDATE reservation_room_nights SET price_cents = 9000, adjustment_cents = -1000
        WHERE reservation_room_id = '${lineId}' AND date = '2026-10-10';
      UPDATE reservation_room_nights SET price_cents = 8000, discount_cents = 2000
        WHERE reservation_room_id = '${lineId}' AND date = '2026-10-11';
    `);
    const nights = () =>
      db.sqlite
        .prepare(
          "SELECT date, price_cents, adjustment_cents, discount_cents FROM reservation_room_nights WHERE reservation_room_id = ? ORDER BY date",
        )
        .all(lineId)
        .map((row) => Object.values(row));
    d = await command(d, [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-10-14" }]);
    d = await command(d, [roomEdit(d)]);
    expect(nights()).toEqual([
      ["2026-10-10", 9000, -1000, 0],
      ["2026-10-11", 8000, 0, 2000],
      ["2026-10-12", 10000, 0, 0],
      ["2026-10-13", 10000, 0, 0],
    ]);
    expect(d.totalCents).toBe(37000);
    d = await command(d, [roomEdit(d, 0, { roomTypeId: "other", roomId: null })]);
    expect(nights()).toEqual([
      ["2026-10-10", 20000, 0, 0],
      ["2026-10-11", 20000, 0, 0],
      ["2026-10-12", 20000, 0, 0],
      ["2026-10-13", 20000, 0, 0],
    ]);
  });
  it("prices added and repriced nights under the reservation's accepted adjustment", async () => {
    seedRoomType(db.sqlite, { id: "other", name: "Twin", maxAdults: 3, baseRateCents: 20000 });
    seedRooms(db.sqlite, "other", { "201": "201" });
    const response = await request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-10-10",
      checkOut: "2026-10-11",
      guest: { fullName: "Ada Lovelace" },
      rooms: [{ roomTypeId: "type", adults: 1, children: 0 }],
      ratePlan: "non_refundable",
    });
    let d = (await response.json()) as Detail;
    const lineId = d.rooms[0].id;
    db.sqlite.exec(`UPDATE room_types SET base_rate_cents = 12000 WHERE id = 'type'`);
    const nights = () =>
      db.sqlite
        .prepare(
          "SELECT date, price_cents, adjustment_cents FROM reservation_room_nights WHERE reservation_room_id = ? ORDER BY date",
        )
        .all(lineId)
        .map((row) => Object.values(row));
    const extend: WorkflowAction[] = [
      { type: "dates", checkIn: d.checkIn, checkOut: "2026-10-12" },
    ];
    const { billing } = await previewCommand(d, extend);
    expect(billing.totalCents).toBe(19800);
    d = await command(d, extend);
    const charges = ({
      subtotalCents,
      discountCents,
      totalCents,
      nights,
    }: Detail["rooms"][number]) => ({ subtotalCents, discountCents, totalCents, nights });
    expect(billing.rooms.map(charges)).toEqual(d.rooms.map(charges));
    expect(billing.rooms[0].nights).toEqual([
      { date: "2026-10-10", priceCents: 9000 },
      { date: "2026-10-11", priceCents: 10800 },
    ]);
    expect(nights()).toEqual([
      ["2026-10-10", 9000, -1000],
      ["2026-10-11", 10800, -1200],
    ]);
    expect(d).toMatchObject({ totalCents: 19800, ratePlan: { plan: "non_refundable" } });
    d = await command(d, [roomEdit(d, 0, { roomTypeId: "other", roomId: null })]);
    expect(nights()).toEqual([
      ["2026-10-10", 18000, -2000],
      ["2026-10-11", 18000, -2000],
    ]);
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
    expect(d.stayingGuests).toHaveLength(1);
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
    let d = await command(await create(2), [pay(10000), setDiscount(1000)]);
    const cancel: WorkflowAction = {
      type: "set-status",
      status: "cancelled",
      reason: "Plans changed",
    };
    d = await command(d, [cancel]);
    expect(d).toMatchObject({ totalCents: 20000, paidCents: 10000, balanceCents: 10000 });
    expect(d.cancellationReason).toBe("Plans changed");
    const restored = await command(d, [{ type: "set-status", status: "confirmed" }]);
    expect(restored.cancelledAt).toBeNull();
    expect(restored).toMatchObject({ totalCents: 59000, paidCents: 10000, balanceCents: 49000 });
    d = await command(restored, [cancel]);
    await create(2);
    await command(d, [{ type: "set-status", status: "confirmed" }], 409);
    const saved = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(saved.status).toBe("cancelled");
  });
  it("enforces the shared 60-night limit", async () => {
    const d = await create(2);
    expect(
      await command(d, [{ type: "dates", checkIn: d.checkIn, checkOut: "2026-12-10" }], 400),
    ).toEqual({ error: "stay cannot be longer than 60 nights" });
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
        phone: "+51900000006",
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
    db.sqlite
      .prepare("UPDATE reservations SET code = 'FIXEDCODE' WHERE id = ?")
      .run(reservation.id);
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

  it("counts a hundred matching reservations, handles a full 50-row last page, and finds balances beyond the legacy cap", async () => {
    for (let index = 0; index < 100; index++) {
      const id = `history-${index}`;
      const checkIn = new Date(Date.UTC(2026, 9, index + 1)).toISOString().slice(0, 10);
      const checkOut = new Date(Date.UTC(2026, 9, index + 2)).toISOString().slice(0, 10);
      seedReservation(db.sqlite, {
        id,
        code: `H${index}`,
        guestName: index === 99 ? "Latest Target" : "Booking Contact",
        checkIn,
        checkOut,
        createdAt: "2026-10-10",
        nightCents: index === 99 ? 90000 : 10000,
      });
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
    expect(await listed("?paginated=false&limit=1&offset=99")).toMatchObject([
      { id: "history-99", balanceCents: 90000 },
    ]);
    expect(await paged("q=missing&offset=100")).toEqual({
      rows: [],
      total: 0,
      limit: 50,
      offset: 100,
    });
  });

  it.each([
    "paginated=1",
    "checkOut=2026-02-30",
    "statuses=confirmed,unknown",
    "sort=code",
    "limit=201",
  ])("rejects malformed list input through the authenticated route: %s", async (query) => {
    const response = await request(`/reservations?${query}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  it("sorts signed balances descending across the complete history with ascending name/code ties", async () => {
    const direction = "desc";
    const { complex, settled, credit, cancelled, owing } = await billExamples();
    const adaA = await book("Ada Same", { checkIn: "2026-10-22", checkOut: "2026-10-23" });
    const adaB = await book("Ada Same", { checkIn: "2026-10-24", checkOut: "2026-10-25" });
    db.sqlite.prepare("UPDATE reservations SET code = ? WHERE id = ?").run("AAA", adaA.id);
    db.sqlite.prepare("UPDATE reservations SET code = ? WHERE id = ?").run("BBB", adaB.id);
    const pages = await Promise.all(
      [0, 2, 4, 6].map((offset) =>
        paged(`sort=balance&direction=${direction}&limit=2&offset=${offset}`),
      ),
    );
    for (const page of pages) expect(page.total).toBe(7);
    const rows = pages.flatMap((page) => page.rows);
    expect(rows.map((row) => [row.id, row.balanceCents])).toEqual([
      [complex.id, 30000],
      [adaA.id, 10000],
      [adaB.id, 10000],
      [owing.id, 10000],
      [settled.id, 0],
      [credit.id, -2000],
      [cancelled.id, -5000],
    ]);
    const restricted = await paged(
      `balance=outstanding&assignment=unassigned&sort=balance&direction=${direction}&limit=1`,
    );
    expect(restricted.total).toBe(3);
    expect(restricted.rows.map((row) => row.id)).toEqual([complex.id]);
    expect(await paged(`sort=balance&direction=${direction}&limit=2&offset=7`)).toEqual({
      rows: [],
      total: 7,
      limit: 2,
      offset: 7,
    });
    const byName = await paged("balance=outstanding&sort=guestName&direction=desc&limit=2");
    expect(byName.total).toBe(4);
    expect(byName.rows.map((row) => row.id)).toEqual([owing.id, adaA.id]);
  });

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
    ["the default check-in order", "", ["zoe", "adaA", "adaB", "bea"]],
    ["checkout descending", "sort=checkOut&direction=desc", ["bea", "adaA", "adaB", "zoe"]],
    ["guest name descending", "sort=guestName&direction=desc", ["zoe", "bea", "adaA", "adaB"]],
  ])(
    "sorts all matches by %s with ascending name/code tie-breakers across pages",
    async (_order, sort, order) => {
      const zoe = await book("Zoe Cruz", { checkIn: "2026-10-01", checkOut: "2026-10-04" });
      const adaA = await book("Ada Lovelace", { checkIn: "2026-10-02", checkOut: "2026-10-04" });
      const adaB = await book("Ada Lovelace", { checkIn: "2026-10-02", checkOut: "2026-10-04" });
      const bea = await book("Bea Jones", { checkIn: "2026-10-04", checkOut: "2026-10-05" });
      db.sqlite.prepare("UPDATE reservations SET code = ? WHERE id = ?").run("AAA", adaA.id);
      db.sqlite.prepare("UPDATE reservations SET code = ? WHERE id = ?").run("BBB", adaB.id);
      const ids: Record<string, string> = {
        zoe: zoe.id,
        adaA: adaA.id,
        adaB: adaB.id,
        bea: bea.id,
      };
      const prefix = sort ? `${sort}&` : "";
      const first = await paged(`${prefix}limit=2`);
      const last = await paged(`${prefix}limit=2&offset=2`);
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
    expect((await listed("?status=cancelled")).map((row) => row.id)).toEqual([cancelled.id]);
  });
});

describe("Unresolved bill list filter", () => {
  async function unresolvedExamples() {
    const examples = await billExamples();
    const credit = await command(examples.credit, [
      {
        type: "request-refund",
        paymentId: examples.credit.payments[0].id,
        amountCents: 2000,
        method: "transfer",
        reason: "Overpaid",
      },
    ]);
    const checkedIn = await command(
      await book("Ike CheckedIn", { checkIn: "2026-10-10", checkOut: "2026-10-11" }),
      [{ type: "set-status", status: "checked_in" }],
    );
    const noShow = await command(
      await book("Nia NoShow", { checkIn: "2026-10-09", checkOut: "2026-10-10" }),
      [{ type: "set-status", status: "no_show" }],
    );
    const charged = await command(
      await book("Cal Charged", { checkIn: "2026-10-11", checkOut: "2026-10-12" }),
      [{ type: "set-status", status: "cancelled" }],
    );
    seedReservation(db.sqlite, {
      id: "lost",
      code: "LOST",
      guestName: "Lu Lost",
      checkIn: "2026-10-26",
      checkOut: "2026-10-27",
      createdAt: "2026-10-10",
      status: "unfulfilled",
    });
    db.sqlite
      .exec(`INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at)
      VALUES ('lost-payment', 'lost', 10000, 'card', '2026-10-10', '2026-10-10')`);
    return { ...examples, credit, checkedIn, noShow, charged };
  }

  it("lists refund due on any status and money owed only once the stay is over", async () => {
    const { complex, settled, credit, cancelled, owing, checkedIn, noShow, charged } =
      await unresolvedExamples();
    expect(credit).toMatchObject({
      status: "confirmed",
      balanceCents: -2000,
      pendingRefundCents: 2000,
    });
    expect(checkedIn).toMatchObject({ status: "checked_in", balanceCents: 10000 });
    expect(noShow).toMatchObject({ status: "no_show", balanceCents: 10000 });
    expect(charged).toMatchObject({ status: "cancelled", balanceCents: 10000 });
    const page = await paged("balance=unresolved");
    expect(page.total).toBe(6);
    expect(page.rows.map((row) => [row.id, row.status, row.balanceCents])).toEqual([
      [noShow.id, "no_show", 10000],
      [charged.id, "cancelled", 10000],
      [credit.id, "confirmed", -2000],
      [cancelled.id, "cancelled", -5000],
      [owing.id, "checked_out", 10000],
      ["lost", "unfulfilled", -10000],
    ]);
    const listed = new Set(page.rows.map((row) => row.id));
    for (const excluded of [complex, checkedIn, settled]) expect(listed).not.toContain(excluded.id);
  });

  it("pages unresolved bills with an exact total and ANDs them with other filters", async () => {
    const { credit, cancelled, owing, noShow, charged } = await unresolvedExamples();
    expect(await paged("balance=unresolved&limit=4&offset=4")).toMatchObject({
      rows: [{ id: owing.id }, { id: "lost" }],
      total: 6,
      limit: 4,
      offset: 4,
    });
    const statuses = await paged("balance=unresolved&statuses=cancelled");
    expect(statuses.total).toBe(2);
    expect(statuses.rows.map((row) => row.id)).toEqual([charged.id, cancelled.id]);
    expect(await paged("limit=1&balance=unresolved")).toMatchObject({ total: 6 });
    const ascending = ["lost", cancelled.id, credit.id, charged.id, noShow.id, owing.id];
    const descending = [charged.id, noShow.id, owing.id, credit.id, cancelled.id, "lost"];
    for (const [direction, order] of [
      ["asc", ascending],
      ["desc", descending],
    ] as const) {
      const pages = await Promise.all(
        [0, 4].map((offset) =>
          paged(`balance=unresolved&sort=balance&direction=${direction}&limit=4&offset=${offset}`),
        ),
      );
      for (const page of pages) expect(page.total).toBe(6);
      expect(pages.flatMap((page) => page.rows.map((row) => row.id))).toEqual(order);
    }
  });
});
