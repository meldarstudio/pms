import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { presentReservation } from "../present";
import {
  atBaseRate,
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
async function stay(checkIn: string, checkOut: string, nightCents: number) {
  const response = await atBaseRate(db.sqlite, "type", nightCents, () =>
    request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn,
      checkOut,
      guest: { fullName: "Ada Lovelace" },
      rooms: [{ roomTypeId: "type", adults: 1, children: 0 }],
    }),
  );
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

const guest = () => ({
  id: crypto.randomUUID(),
  fullName: "Ana García",
  email: null,
  phone: null,
  documentType: "DNI",
  documentNumber: "12345678",
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
  const rooms = [{ roomTypeId: "type" }, { roomTypeId: "suite" }];
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

  it("prices each room from its own type's overrides and base rate", async () => {
    const expected = {
      totalCents: 77000,
      rooms: [
        { roomTypeId: "type", nights: [{ priceCents: 10000 }, { priceCents: 12000 }] },
        { roomTypeId: "suite", nights: [{ priceCents: 30000 }, { priceCents: 25000 }] },
      ],
    };
    const previewed = await preview(rooms);
    expect(previewed.status).toBe(200);
    expect(((await previewed.json()) as { billing: Detail }).billing).toMatchObject(expected);
    const saved = await create(rooms);
    expect(saved.status).toBe(201);
    expect(await saved.json()).toMatchObject(expected);
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

  it("applies the reduction once when a create request is retried", async () => {
    const input = body();
    const first = await save(input);
    const retried = await save(input);
    expect(retried).toMatchObject({ id: first.id, totalCents: 18000 });
    expect(await listed()).toMatchObject([{ id: first.id, totalCents: 18000 }]);
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
});

describe("no-show outcomes", () => {
  const noShow: WorkflowAction = { type: "set-status", status: "no_show" };
  async function nonRefundable(checkIn: string, checkOut: string, nightCents: number) {
    const d = await stay(checkIn, checkOut, nightCents);
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
    expect(
      await command(
        failed,
        [{ type: "void-payment", paymentId: payment.id, reason: "Wrong amount" }],
        400,
      ),
    ).toEqual({ error: "payment with refunds cannot be changed" });
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
  });
});

describe("voided payments", () => {
  const voidPayment = (paymentId: string, reason = "Recorded twice"): WorkflowAction => ({
    type: "void-payment",
    paymentId,
    reason,
  });

  it("drops a S/300 payment voided as a duplicate out of the bill, list balance, and payment report", async () => {
    let d = await command(await create(), [pay(30000), pay(30000)]);
    expect(d.balanceCents).toBe(-30000);
    const [duplicate, kept] = d.payments;
    d = await command(d, [voidPayment(duplicate.id)]);

    expect(d).toMatchObject({ paidCents: 30000, balanceCents: 0 });
    const fresh = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
    expect(fresh).toEqual(d);
    expect(fresh.payments).toEqual([
      expect.objectContaining({
        id: duplicate.id,
        amountCents: 30000,
        recordedBy: "hotelmanantial",
        voidedAt: "2026-10-10T15:00:00.000Z",
        voidedBy: "hotelmanantial",
        voidReason: "Recorded twice",
      }),
      expect.objectContaining({
        id: kept.id,
        recordedBy: "hotelmanantial",
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
      }),
    ]);
    expect(await paged("balance=settled")).toMatchObject({ rows: [{ id: d.id }] });
    expect(await paged("balance=credit")).toMatchObject({ rows: [] });
    expect(await (await request("/payments?from=2026-10-10&to=2026-10-10")).json()).toMatchObject({
      totalCents: 30000,
      payments: [
        { id: duplicate.id, voidedBy: "hotelmanantial", voidReason: "Recorded twice" },
        { id: kept.id, voidedAt: null },
      ],
    });
  });

  it("corrects S/300 cash to S/200 card in one command that a replay or a failure never half-saves", async () => {
    const d = await command(await create(), [pay(30000)]);
    const [mistake] = d.payments;
    const correction = (paymentDate: string): WorkflowAction[] => [
      voidPayment(mistake.id, "Paid by card, not cash"),
      { type: "add-payment", payment: { amountCents: 20000, method: "card", paymentDate } },
    ];

    expect(await command(d, correction("2026-10-11"), 400)).toEqual({
      error: "payment date cannot be in the future",
    });
    expect(await (await request(`/reservations/${d.id}`)).json()).toEqual(d);

    const body = { requestId: crypto.randomUUID(), actions: correction("2026-10-10") };
    const first = await request(`/reservations/${d.id}/commands`, "POST", body);
    const replay = await request(`/reservations/${d.id}/commands`, "POST", body);
    expect([first.status, replay.status]).toEqual([200, 200]);
    const saved = (await first.json()) as Detail;
    expect(await replay.json()).toEqual(saved);
    expect(saved).toMatchObject({ paidCents: 20000, balanceCents: 10000 });
    expect(saved.payments).toMatchObject([
      { id: mistake.id, amountCents: 30000, method: "cash", voidReason: "Paid by card, not cash" },
      { amountCents: 20000, method: "card", voidedAt: null },
    ]);
  });

  const refund = (paymentId: string): WorkflowAction => ({
    type: "request-refund",
    paymentId,
    amountCents: 20000,
    method: "transfer",
    reason: "Cancelled stay",
  });
  const issueCoupon: WorkflowAction = {
    type: "issue-coupon",
    amountCents: 5000,
    guestAccepted: true,
  };
  it.each([
    {
      name: "a refund requested after the void",
      earlier: [],
      actions: (id: string) => [voidPayment(id), refund(id)],
      error: "voided payment cannot be refunded",
    },
    {
      name: "a void after the refund request",
      earlier: [],
      actions: (id: string) => [refund(id), voidPayment(id)],
      error: "payment with refunds cannot be changed",
    },
    {
      name: "a void after issuing a coupon",
      earlier: [issueCoupon],
      actions: (id: string) => [voidPayment(id)],
      error: "payment cannot be changed after issuing a coupon",
    },
  ])(
    "rejects $name, keeping the S/200 owed back unchanged",
    async ({ earlier, actions, error }) => {
      let d = await stay("2026-10-20", "2026-10-22", 10000);
      d = await command(d, [pay(20000), { type: "set-status", status: "cancelled" }, ...earlier]);
      const [payment] = d.payments;

      expect(await command(d, actions(payment.id), 400)).toEqual({ error });
      const saved = (await (await request(`/reservations/${d.id}`)).json()) as Detail;
      expect(saved).toEqual(d);
      expect(saved).toMatchObject({ paidCents: 20000, refunds: [] });
    },
  );

  it("re-plans a refund request that waited while the same payment was voided, and refuses it", async () => {
    let d = await stay("2026-10-20", "2026-10-22", 10000);
    d = await command(d, [pay(20000), { type: "set-status", status: "cancelled" }]);
    const [payment] = d.payments;
    const paused = pauseNextCommit();
    const pending = request(`/reservations/${d.id}/commands`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [refund(payment.id)],
    });
    await paused.ready;
    await command(d, [voidPayment(payment.id)]);
    paused.resume();

    const refused = await pending;
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "voided payment cannot be refunded" });
    expect(await (await request(`/reservations/${d.id}`)).json()).toMatchObject({
      paidCents: 0,
      refunds: [],
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
  it("rolls back every restoration write and allows the same request to succeed and replay later", async () => {
    let d = await create(2);
    d = await command(d, [roomEdit(d), roomEdit(d, 1, { adults: 2 })]);
    d = await command(d, [
      { type: "set-guests", guests: [guest()] },
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

  it("refuses a room change whose expected room was replaced while it waited", async () => {
    let d = await create();
    d = await command(d, [roomEdit(d)]);
    const paused = pauseNextCommit();
    const pending = request(`/reservations/${d.id}/commands`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [{ ...roomEdit(d, 0, { roomId: "room-102" }), expectedRoomId: "room-101" }],
    });
    await paused.ready;
    await command(d, [roomEdit(d, 0, { roomId: "room-103" })]);
    paused.resume();

    const refused = await pending;
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "room assignment changed" });
    expect(
      ((await (await request(`/reservations/${d.id}`)).json()) as Detail).rooms[0].roomId,
    ).toBe("room-103");
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
});
