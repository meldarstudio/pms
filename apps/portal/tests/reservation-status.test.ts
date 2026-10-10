import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  commonStatus,
  planBulkStatus,
  statusSummary,
  type StatusRoom,
} from "../src/lib/reservation-status.ts"

const room = (
  status: StatusRoom["status"],
  roomId: string | null = "r"
): StatusRoom => ({ status, roomId })

describe("bulk reservation status", () => {
  it("summarizes common and mixed statuses", () => {
    assert.equal(
      commonStatus([room("confirmed"), room("confirmed")]),
      "confirmed"
    )
    assert.equal(commonStatus([room("confirmed"), room("checked_in")]), "mixed")
    assert.equal(
      statusSummary([room("checked_in"), room("checked_in")]),
      "Check-in"
    )
    assert.equal(
      statusSummary([
        room("checked_in"),
        room("checked_out"),
        room("checked_in"),
      ]),
      "2 Check-in · 1 Check-out"
    )
  })

  it("checks in every confirmed room once all of them have a room", () => {
    assert.deepEqual(
      planBulkStatus([room("confirmed"), room("confirmed")], "checked_in"),
      { ok: true, action: "check-in", affected: 2 }
    )
    const blocked = planBulkStatus(
      [room("confirmed"), room("confirmed", null)],
      "checked_in"
    )
    assert.equal(blocked.ok, false)
  })

  it("leaves finished rooms out of check-in and counts only confirmed ones", () => {
    assert.deepEqual(
      planBulkStatus(
        [room("confirmed"), room("cancelled", null)],
        "checked_in"
      ),
      { ok: true, action: "check-in", affected: 1 }
    )
  })

  it("undoes check-in only for checked-in rooms", () => {
    assert.deepEqual(
      planBulkStatus([room("checked_in"), room("checked_out")], "confirmed"),
      { ok: true, action: "undo-check-in", affected: 1 }
    )
    assert.equal(planBulkStatus([room("confirmed")], "confirmed").ok, false)
    assert.equal(planBulkStatus([room("checked_out")], "confirmed").ok, false)
  })

  it("requires every open room to be checked in before check-out", () => {
    assert.deepEqual(
      planBulkStatus([room("checked_in"), room("checked_in")], "checked_out"),
      { ok: true, action: "check-out", affected: 2 }
    )
    assert.equal(
      planBulkStatus([room("checked_in"), room("confirmed")], "checked_out").ok,
      false
    )
    assert.equal(planBulkStatus([room("confirmed")], "checked_out").ok, false)
  })

  it("cancels confirmed rooms only", () => {
    assert.deepEqual(
      planBulkStatus([room("confirmed"), room("checked_in")], "cancelled"),
      { ok: true, action: "cancel", affected: 1 }
    )
    assert.equal(planBulkStatus([room("checked_in")], "cancelled").ok, false)
    assert.equal(planBulkStatus([room("cancelled")], "cancelled").ok, false)
  })

  it("does not offer no-show as a bulk action", () => {
    assert.equal(planBulkStatus([room("confirmed")], "no_show").ok, false)
  })
})
