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
  it("counts a stay on check-in, leaves the checkout morning free and prices overrides", () => {
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
      [{ roomTypeId: "deluxe", date: "2026-12-25", priceCents: 20000 }],
    );
    expect(type?.nights).toEqual([
      {
        date: "2026-12-24",
        booked: 1,
        closed: 0,
        free: 1,
        priceCents: 15000,
        override: false,
        planPrices: { flexible: 15000, non_refundable: 13500 },
      },
      {
        date: "2026-12-25",
        booked: 1,
        closed: 0,
        free: 1,
        priceCents: 20000,
        override: true,
        planPrices: { flexible: 20000, non_refundable: 18000 },
      },
      {
        date: "2026-12-26",
        booked: 0,
        closed: 0,
        free: 2,
        priceCents: 15000,
        override: false,
        planPrices: { flexible: 15000, non_refundable: 13500 },
      },
    ]);
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
});
