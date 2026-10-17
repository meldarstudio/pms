import { describe, expect, it } from "vite-plus/test";
import { inventoryGrid, peakOccupied, type GridRoomType } from "./inventory-grid";

const deluxe: GridRoomType = {
  id: "deluxe",
  name: "Deluxe",
  maxAdults: 3,
  maxChildren: 2,
  baseRateCents: 15000,
};

const dates = ["2026-12-24", "2026-12-25", "2026-12-26"];

describe("inventoryGrid", () => {
  it("counts a stay on check-in and leaves the checkout morning free", () => {
    const [type] = inventoryGrid(
      dates,
      [deluxe],
      new Map([["deluxe", 2]]),
      [
        {
          roomTypeId: "deluxe",
          status: "confirmed",
          checkIn: "2026-12-24",
          checkOut: "2026-12-26",
        },
      ],
      [],
      [],
    );
    expect(type?.nights.map((night) => night.booked)).toEqual([1, 1, 0]);
    expect(type?.nights.map((night) => night.free)).toEqual([1, 1, 2]);
  });

  it("ignores cancelled rooms but counts the final checked-out dates", () => {
    const [type] = inventoryGrid(
      ["2026-12-24"],
      [deluxe],
      new Map([["deluxe", 2]]),
      [
        {
          roomTypeId: "deluxe",
          status: "cancelled",
          checkIn: "2026-12-24",
          checkOut: "2026-12-25",
        },
        {
          roomTypeId: "deluxe",
          status: "checked_out",
          checkIn: "2026-12-24",
          checkOut: "2026-12-25",
        },
      ],
      [],
      [],
    );
    expect(type?.nights[0]).toMatchObject({ booked: 1, free: 1 });
  });

  it("uses the busiest night when stays do not overlap", () => {
    const peak = peakOccupied(
      ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"],
      [
        {
          roomTypeId: "deluxe",
          status: "confirmed",
          checkIn: "2026-10-01",
          checkOut: "2026-10-03",
        },
        {
          roomTypeId: "deluxe",
          status: "confirmed",
          checkIn: "2026-10-05",
          checkOut: "2026-10-07",
        },
        {
          roomTypeId: "deluxe",
          status: "checked_out",
          checkIn: "2026-10-01",
          checkOut: "2026-10-07",
        },
      ],
      [],
    );
    expect(peak.get("deluxe")).toBe(2);
  });

  it("counts distinct closed rooms and floors free at zero", () => {
    const [type] = inventoryGrid(
      ["2026-12-24"],
      [deluxe],
      new Map([["deluxe", 2]]),
      [
        {
          roomTypeId: "deluxe",
          status: "confirmed",
          checkIn: "2026-12-24",
          checkOut: "2026-12-25",
        },
      ],
      [
        { roomId: "101", roomTypeId: "deluxe", starts: "2026-12-24", ends: "2026-12-25" },
        { roomId: "101", roomTypeId: "deluxe", starts: "2026-12-23", ends: "2026-12-26" },
        { roomId: "102", roomTypeId: "deluxe", starts: "2026-12-24", ends: "2026-12-25" },
      ],
      [],
    );
    expect(type?.nights[0]).toMatchObject({ booked: 1, closed: 2, free: 0 });
  });

  it("uses an override when one exists and the base rate otherwise", () => {
    const [type] = inventoryGrid(
      dates,
      [deluxe],
      new Map([["deluxe", 1]]),
      [],
      [],
      [{ roomTypeId: "deluxe", date: "2026-12-25", priceCents: 20000 }],
    );
    expect(type?.nights).toEqual([
      { date: "2026-12-24", booked: 0, closed: 0, free: 1, priceCents: 15000, override: false },
      { date: "2026-12-25", booked: 0, closed: 0, free: 1, priceCents: 20000, override: true },
      { date: "2026-12-26", booked: 0, closed: 0, free: 1, priceCents: 15000, override: false },
    ]);
  });
});
