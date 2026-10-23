import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import {
  capacityMessage,
  detailsSchema,
  detailsSummaryRooms,
  discountSchema,
  paymentSchema,
  paymentDefaults,
  paymentPayload,
  schemaErrors,
  workflowDrafts,
  type DetailsValues,
} from "../src/lib/reservation-form-schemas.ts";
import { roomEdits } from "../src/lib/reservation-editor.ts";
import type { ReservationDetail } from "../src/lib/api.ts";
import { configurePropertyCalendar } from "../src/lib/property-calendar.ts";

configurePropertyCalendar("America/Lima");

const types = [
  { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, baseRateCents: 15000 },
  { id: "family", name: "Familiar", maxAdults: 4, maxChildren: 3, baseRateCents: 25000 },
];
const details = (): DetailsValues => ({
  checkIn: "2026-01-01",
  checkOut: "2026-01-02",
  notes: "",
  rooms: [
    {
      id: "line-1",
      removed: false,
      room: { roomTypeId: "double", roomId: null, adults: "1", children: "0" },
    },
  ],
});

describe("reservation form schemas", () => {
  it("allows quoting operationally invalid drafts but still rejects unpriceable inputs", () => {
    const pricing = detailsSchema(types, { validateOperations: false });
    const values = details();
    values.rooms[0].room.adults = "3";
    values.rooms[0].room.roomId = "101";
    values.rooms.push({ ...values.rooms[0], id: "new-room" });
    assert.equal(detailsSchema(types).safeParse(values).success, false);
    assert.equal(pricing.safeParse(values).success, true);
    assert.equal(pricing.safeParse({ ...values, checkOut: values.checkIn }).success, false);
    values.rooms[0].room = { ...values.rooms[0].room, adults: "" };
    assert.equal(pricing.safeParse(values).success, false);
  });
  it("places capacity errors on the affected room and revalidates a type change", () => {
    const values = details();
    values.rooms.push({
      id: "line-2",
      removed: false,
      room: { roomTypeId: "double", roomId: null, adults: "2", children: "3" },
    });
    assert.deepEqual(schemaErrors(detailsSchema(types).safeParse(values)), {
      "rooms[1].room": capacityMessage,
    });
    values.rooms[1].room.roomTypeId = "family";
    assert.equal(detailsSchema(types).safeParse(values).success, true);
  });
  it("ignores removed room validation but still emits its workflow removal", () => {
    const values = details();
    values.rooms.push({
      id: "line-2",
      removed: true,
      room: { roomTypeId: "", roomId: null, adults: "", children: "" },
    });
    assert.equal(detailsSchema(types).safeParse(values).success, true);
    const saved = {
      rooms: [{ id: "line-1", ...workflowDrafts(values)[0].room }, { id: "line-2" }],
    } as ReservationDetail;
    assert.deepEqual(roomEdits(saved, workflowDrafts(values)), [
      { type: "remove-room", lineId: "line-2" },
    ]);
    values.rooms[0].removed = true;
    assert.equal(
      schemaErrors(detailsSchema(types).safeParse(values)).rooms,
      "La reserva debe tener entre 1 y 60 habitaciones.",
    );
  });
  it("rejects blank, fractional and out-of-range counts instead of coercing them", () => {
    for (const invalid of ["", " ", "1.5", "-1", "101", "NaN"]) {
      const values = details();
      values.rooms[0].room.children = invalid;
      assert.equal(
        schemaErrors(detailsSchema(types).safeParse(values))["rooms[0].room.children"],
        "Ingresa entre 0 y 100 niños.",
        invalid,
      );
    }
    const accepted = details();
    accepted.rooms[0].room.children = "0";
    assert.equal(detailsSchema(types).safeParse(accepted).success, true);
  });
  it("validates real dates and the 1–60 night stay boundary", () => {
    const values = details();
    for (const checkOut of ["2026-01-01", "2025-12-31", "2026-02-30", "2026-03-03"])
      assert.equal(
        detailsSchema(types).safeParse({ ...values, checkOut }).success,
        false,
        checkOut,
      );
    assert.equal(
      detailsSchema(types).safeParse({ ...values, checkOut: "2026-03-02" }).success,
      true,
    );
  });
  it("allows unassigned rooms and rejects duplicate assignments", () => {
    const values = details();
    assert.equal(detailsSchema(types).safeParse(values).success, true);
    values.rooms[0].room.roomId = "room-1";
    assert.equal(detailsSchema(types).safeParse(values).success, true);
    values.rooms.push({ ...structuredClone(values.rooms[0]), id: "line-2" });
    assert.equal(
      schemaErrors(detailsSchema(types).safeParse(values))["rooms[1].room.roomId"],
      "Esta habitación ya está seleccionada en la reserva.",
    );
  });
  it("enforces payment precision, limits and actual UTC dates", () => {
    const values = {
      ...paymentDefaults(),
      amount: " 10.25 ",
      date: "2020-01-01",
      reference: " abc ",
      reason: " nota ",
    };
    assert.deepEqual(paymentPayload(values), {
      amountCents: 1025,
      method: "cash",
      paymentDate: "2020-01-01",
      reference: "ABC",
      notes: "nota",
    });
    for (const amount of ["", "0", "-1", "1.001", "10000000.01"])
      assert.equal(paymentSchema.safeParse({ ...values, amount }).success, false, amount);
    assert.equal(paymentSchema.safeParse({ ...values, date: "2020-02-30" }).success, false);
    assert.equal(paymentSchema.safeParse({ ...values, date: "9999-01-01" }).success, false);
    assert.equal(discountSchema.safeParse({ amount: "" }).success, true);
    assert.equal(discountSchema.safeParse({ amount: "-1" }).success, false);
  });
});

describe("draft room summaries", () => {
  const priced = (id = "line-1", totalCents = 15000) =>
    ({
      id,
      roomTypeId: "double",
      roomTypeName: "Doble",
      adults: 1,
      children: 0,
      subtotalCents: totalCents,
      discountCents: 0,
      totalCents,
    }) as ReservationDetail["rooms"][number];

  type Summary = ReturnType<typeof detailsSummaryRooms>[number];
  it.each<
    [string, (room: DetailsValues["rooms"][number]["room"]) => void, boolean, Partial<Summary>]
  >([
    [
      "an occupancy edit keeps saved charges while validation is pending",
      (room) => Object.assign(room, { adults: "2", children: "1", roomId: "102" }),
      true,
      {
        adults: 2,
        children: 1,
        charges: { subtotalCents: 15000, discountCents: 0, totalCents: 15000 },
      },
    ],
    [
      "an unpriced type change stays visible",
      (room) => (room.roomTypeId = "family"),
      false,
      { roomTypeId: "family", adults: 1, charges: null },
    ],
    [
      "a blank child count is not shown as zero",
      (room) => (room.children = " "),
      true,
      { children: null },
    ],
    [
      "a fractional child count is not shown",
      (room) => (room.children = "1.5"),
      true,
      { children: null },
    ],
    [
      "zero adults is not shown as a valid count",
      (room) => (room.adults = "0"),
      true,
      { adults: null, children: 0 },
    ],
  ])("summarizes a draft where %s", (_name, edit, pricesLoaded, expected) => {
    const values = details();
    edit(values.rooms[0].room);
    const summary = detailsSummaryRooms(values, pricesLoaded ? [priced()] : undefined)[0];
    for (const [key, value] of Object.entries(expected))
      assert.deepEqual(summary[key as keyof Summary], value, key);
  });

  it("matches retained and added room prices after removing a saved room", () => {
    const values = details();
    values.rooms[0].removed = true;
    values.rooms.push(
      { ...details().rooms[0], id: "line-2" },
      { ...details().rooms[0], id: "draft-new" },
    );
    const summary = detailsSummaryRooms(values, [
      priced("line-2", 22000),
      priced("server-new", 31000),
    ]);
    assert.deepEqual(
      summary.map((room) => [room.key, room.charges?.totalCents]),
      [
        ["line-2", 22000],
        ["draft-new", 31000],
      ],
    );
  });
});
