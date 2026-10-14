import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { InventoryNight } from "../src/lib/api.ts"
import {
  inventoryRateSchema,
  overrideClearDates,
  rateApplyInput,
  rateFormError,
  ratePriceUnchanged,
  sharedRatePrice,
} from "../src/lib/inventory-rate-form.ts"

const night = (
  date: string,
  priceCents: number,
  override = false
): InventoryNight => ({
  date,
  free: 1,
  booked: 0,
  closed: 0,
  priceCents,
  override,
})

describe("inventory rate form", () => {
  it("shows one shared price or leaves the field empty when nights differ", () => {
    assert.equal(sharedRatePrice([night("2026-10-13", 31000)]), "310.00")
    assert.equal(
      sharedRatePrice([night("2026-10-13", 31000), night("2026-10-14", 31000)]),
      "310.00"
    )
    assert.equal(
      sharedRatePrice([night("2026-10-13", 31000), night("2026-10-14", 32000)]),
      ""
    )
  })

  it("requires a parseable major-unit price", () => {
    assert.equal(inventoryRateSchema.safeParse({ price: "" }).success, false)
    assert.equal(inventoryRateSchema.safeParse({ price: "abc" }).success, false)
    assert.equal(
      inventoryRateSchema.safeParse({ price: "310.00" }).success,
      true
    )
    assert.equal(inventoryRateSchema.safeParse({ price: "0" }).success, true)
  })

  it("detects an unchanged price across the selected nights", () => {
    const nights = [night("2026-10-13", 31000), night("2026-10-14", 31000)]
    assert.equal(ratePriceUnchanged(nights, "310.00"), true)
    assert.equal(ratePriceUnchanged(nights, "320.00"), false)
    assert.equal(ratePriceUnchanged(nights, ""), false)
    assert.equal(ratePriceUnchanged([], "310.00"), false)
  })

  it("builds the put-rates payload from the selected date span", () => {
    assert.deepEqual(
      rateApplyInput(
        {
          roomTypeId: "double",
          dates: ["2026-10-13", "2026-10-14", "2026-10-15"],
        },
        "310.50"
      ),
      {
        id: "double",
        from: "2026-10-13",
        to: "2026-10-15",
        priceCents: 31050,
      }
    )
    assert.equal(
      rateApplyInput({ roomTypeId: "double", dates: ["2026-10-13"] }, ""),
      null
    )
  })

  it("lists override dates for clear and maps known API errors", () => {
    assert.deepEqual(
      overrideClearDates([
        night("2026-10-13", 31000, true),
        night("2026-10-14", 30000, false),
        night("2026-10-15", 32000, true),
      ]),
      ["2026-10-13", "2026-10-15"]
    )
    assert.equal(
      rateFormError(new Error("room type not found")),
      "Este tipo de habitación ya no existe."
    )
    assert.equal(rateFormError(new Error("offline")), "offline")
    assert.equal(rateFormError("boom"), "No se pudo guardar el precio.")
  })
})
