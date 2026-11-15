import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import {
  detailsSchema,
  discountSchema,
  paymentSchema,
  paymentDefaults,
  paymentPayload,
  schemaErrors,
  type DetailsValues,
} from "../src/lib/reservation-form-schemas.ts";
import { configurePropertyCalendar } from "../src/lib/property-calendar.ts";

configurePropertyCalendar("America/Lima");

const types = [
  { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, baseRateCents: 15000 },
  { id: "family", name: "Familiar", maxAdults: 4, maxChildren: 3, baseRateCents: 25000 },
];
const details = (): DetailsValues => ({
  checkIn: "2026-01-01",
  checkOut: "2026-01-02",
  rooms: [
    {
      id: "line-1",
      removed: false,
      room: { roomTypeId: "double", roomId: null, adults: "1", children: "0" },
    },
  ],
});

describe("reservation form schemas", () => {
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
