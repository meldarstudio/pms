import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import type { InventoryNight } from "../src/lib/api.ts";
import { rateApplyInput, sharedRatePrice } from "../src/lib/inventory-rate-form.ts";
const night = (date: string, priceCents: number): InventoryNight => ({
  date,
  free: 1,
  booked: 0,
  closed: 0,
  priceCents,
  override: false,
});
describe("inventory rate form", () => {
  it("builds the put-rates payload from the selected date span", () => {
    assert.equal(sharedRatePrice([night("2026-10-13", 31000), night("2026-10-14", 32000)]), "");
    assert.equal(
      sharedRatePrice([night("2026-10-13", 31000), night("2026-10-14", 31000)]),
      "310.00",
    );
    assert.deepEqual(
      rateApplyInput(
        {
          roomTypeId: "double",
          dates: ["2026-10-13", "2026-10-14", "2026-10-15"],
        },
        "310.50",
      ),
      {
        id: "double",
        from: "2026-10-13",
        to: "2026-10-15",
        priceCents: 31050,
      },
    );
    assert.equal(rateApplyInput({ roomTypeId: "double", dates: ["2026-10-13"] }, ""), null);
  });
});
