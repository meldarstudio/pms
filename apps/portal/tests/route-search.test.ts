import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  calendarSearch,
  inventorySearch,
  reservationsSearch,
  validDay,
} from "../src/lib/route-search.ts"

describe("route search validation", () => {
  it("accepts real calendar dates and rejects malformed dates", () => {
    assert.equal(validDay("2026-04-30"), "2026-04-30")
    assert.equal(validDay("2026-02-30"), undefined)
    assert.equal(validDay("30-04-2026"), undefined)
  })

  it("applies route-specific span defaults", () => {
    assert.equal(calendarSearch({ span: 99 }).span, 7)
    assert.equal(inventorySearch({ span: "7" }).span, 7)
    assert.equal(inventorySearch({}).span, 14)
  })

  it("normalizes reservation filters and pagination", () => {
    assert.deepEqual(
      reservationsSearch({ q: "ana", status: "checked_in", page: 3 }),
      { q: "ana", status: "checked_in", page: 3 }
    )
    assert.deepEqual(
      reservationsSearch({ q: 1, status: "invalid", page: -1 }),
      { q: "", status: "all", page: 0 }
    )
  })
})
