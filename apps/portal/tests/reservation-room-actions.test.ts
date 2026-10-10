import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { roomLineActions } from "../src/lib/reservation-room-actions.ts"

function line(
  status: string | null = "confirmed",
  roomId: string | null = "101"
) {
  return {
    lineId: status ? crypto.randomUUID() : null,
    status,
    roomId,
    removed: false,
  }
}

describe("reservation room actions", () => {
  it("allows unassigning the only confirmed room but prevents removing it", () => {
    const room = line()
    assert.deepEqual(roomLineActions(room, [room]), {
      visible: true,
      canUnassign: true,
      canRemove: false,
    })
  })

  it("stops removal at the last active room, ignoring removed and finished rooms", () => {
    const first = line()
    const second = line()
    assert.equal(roomLineActions(first, [first, second]).canRemove, true)
    second.removed = true
    const rooms = [
      first,
      second,
      line("cancelled"),
      line("checked_out"),
      line("no_show"),
    ]
    assert.equal(roomLineActions(first, rooms).canRemove, false)
  })

  it("allows removing a confirmed extra room when another room is checked in", () => {
    const room = line()
    assert.equal(
      roomLineActions(room, [room, line("checked_in")]).canRemove,
      true
    )
  })

  it("keeps the final saved room until its replacement has been saved", () => {
    const room = line()
    const fresh = line(null)
    assert.equal(roomLineActions(room, [room, fresh]).canRemove, false)
    assert.equal(roomLineActions(fresh, [room, fresh]).canRemove, true)
    assert.equal(roomLineActions(fresh, [fresh]).canRemove, false)
  })

  it("disables unassignment when no room number is selected", () => {
    const room = line("confirmed", null)
    assert.equal(roomLineActions(room, [room, line()]).canUnassign, false)
  })

  it("does not offer actions for checked-in, terminal, or staged removal rows", () => {
    for (const status of [
      "checked_in",
      "checked_out",
      "cancelled",
      "no_show",
    ]) {
      const room = line(status)
      assert.deepEqual(roomLineActions(room, [room, line()]), {
        visible: false,
        canUnassign: false,
        canRemove: false,
      })
    }
    const room = { ...line(), removed: true }
    assert.equal(roomLineActions(room, [room, line()]).visible, false)
  })
})
