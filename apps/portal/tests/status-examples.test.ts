import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  bulkTransition,
  commonStatus,
  createStatusExample,
  exampleScenarios,
  recordExamplePayment,
  removeExampleRoom,
  roomRemovalReason,
  roomTransitionReason,
  saveStatusExample,
  statusSummary,
} from "../src/lib/status-examples.ts"

const today = "2026-10-09"

describe("interactive status examples", () => {
  it("provides every scenario with consistent charges and saved status summaries", () => {
    for (const scenario of exampleScenarios) {
      const reservation = createStatusExample(scenario.value, today)
      assert.equal(
        reservation.balanceCents,
        reservation.totalCents - reservation.paidCents
      )
      assert.ok(statusSummary(reservation.rooms))
    }
    assert.equal(
      commonStatus(createStatusExample("mixed", today).rooms),
      "mixed"
    )
    assert.equal(
      statusSummary(createStatusExample("mixed", today).rooms),
      "1 Confirmada · 1 Check-in"
    )
  })

  it("blocks a general check-in until every confirmed room has an assignment", () => {
    const reservation = createStatusExample("unassigned", today)
    assert.ok(bulkTransition(reservation, "checked_in", today).reason)
    const draft = structuredClone(reservation)
    draft.rooms[1].roomId = "example-room-102"
    draft.rooms[1].roomNumber = "102"
    assert.equal(bulkTransition(draft, "checked_in", today).reason, null)
    draft.rooms.forEach((room) => {
      room.status = "checked_in"
    })
    const saved = saveStatusExample(reservation, draft, today)
    assert.ok(saved.rooms.every((room) => room.status === "checked_in"))
    assert.equal(reservation.rooms[1].roomId, null)
  })

  it("saves a partial arrival without changing the other room or the original example", () => {
    const reservation = createStatusExample("multiple", today)
    const draft = structuredClone(reservation)
    draft.rooms[0].status = "checked_in"
    const saved = saveStatusExample(reservation, draft, today)
    assert.deepEqual(
      saved.rooms.map((room) => room.status),
      ["checked_in", "confirmed"]
    )
    assert.ok(reservation.rooms.every((room) => room.status === "confirmed"))
    assert.equal(saved.totalCents, reservation.totalCents)
  })

  it("identifies the scope of general actions for mixed bookings", () => {
    const reservation = createStatusExample("mixed", today)
    for (const status of ["checked_in", "cancelled", "no_show"] as const) {
      const action = bulkTransition(reservation, status, today)
      assert.deepEqual(action.roomIds, [reservation.rooms[1].id])
      assert.equal(action.reason, null)
    }
    assert.ok(bulkTransition(reservation, "checked_out", today).reason)
    assert.equal(
      roomTransitionReason(
        reservation.rooms[0],
        "checked_out",
        reservation.checkIn,
        today
      ),
      null
    )
  })

  it("releases cancelled and no-show rooms but excludes only cancellations from the bill", () => {
    const reservation = createStatusExample("multiple", today)
    for (const status of ["cancelled", "no_show"] as const) {
      const draft = structuredClone(reservation)
      draft.rooms[0].status = status
      const saved = saveStatusExample(reservation, draft, today)
      assert.equal(saved.totalCents, status === "cancelled" ? 45000 : 90000)
      assert.equal(saved.paidCents, reservation.paidCents)
    }
  })

  it("removes future nights at checkout and preserves the other room's stay", () => {
    const reservation = createStatusExample("mixed", today)
    const draft = structuredClone(reservation)
    draft.rooms[0].status = "checked_out"
    const saved = saveStatusExample(reservation, draft, today)
    assert.equal(saved.rooms[0].nights.length, 1)
    assert.equal(saved.rooms[1].nights.length, 3)
    assert.equal(saved.totalCents, 60000)
    assert.equal(saved.checkOut, reservation.checkOut)
    assert.equal(reservation.rooms[0].nights.length, 3)
  })

  it("rejects skipping check-in, checking out before arrival, and reopening terminal statuses", () => {
    const reservation = createStatusExample("single", today)
    const draft = structuredClone(reservation)
    draft.rooms[0].status = "checked_out"
    assert.throws(
      () => saveStatusExample(reservation, draft, today),
      /check-in/
    )
    const arrived = { ...reservation.rooms[0], status: "checked_in" as const }
    assert.ok(roomTransitionReason(arrived, "checked_out", "2026-10-10", today))
    for (const status of ["checked_out", "cancelled", "no_show"] as const) {
      const terminal = createStatusExample(status, today)
      assert.equal(
        roomTransitionReason(
          terminal.rooms[0],
          status,
          terminal.checkIn,
          today
        ),
        null
      )
      assert.ok(
        roomTransitionReason(
          terminal.rooms[0],
          "confirmed",
          terminal.checkIn,
          today
        )
      )
    }
  })

  it("records a payment locally without mutating the saved example", () => {
    const reservation = createStatusExample("single", today)
    const paid = recordExamplePayment(
      reservation,
      { amountCents: 5000, method: "cash", paidAt: today },
      "example-payment-2"
    )
    assert.equal(paid.payments.length, 2)
    assert.equal(paid.paidCents, 20000)
    assert.equal(paid.balanceCents, 25000)
    assert.equal(reservation.payments.length, 1)
    assert.equal(paid.payments[1].paidAt, `${today}T12:00:00`)
  })

  it("removes an accidental confirmed room while preserving payments and the other room", () => {
    const reservation = createStatusExample("multiple", today)
    const draft = structuredClone(reservation)
    draft.rooms[0].status = "checked_in"
    const reduced = removeExampleRoom(reservation, draft, draft.rooms[1].id)
    assert.equal(reduced.totalCents, 45000)
    assert.equal(reduced.balanceCents, 30000)
    assert.deepEqual(reduced.payments, reservation.payments)
    assert.equal(reduced.rooms[0].status, "checked_in")
    const saved = saveStatusExample(reservation, reduced, today)
    assert.equal(saved.rooms.length, 1)
    assert.equal(saved.rooms[0].id, reservation.rooms[0].id)
    assert.equal(reservation.rooms.length, 2)
    assert.equal(reservation.totalCents, 90000)
  })

  it("prevents removing the final room or a room with a saved stay or final status", () => {
    const single = createStatusExample("single", today)
    assert.throws(
      () => removeExampleRoom(single, single, single.rooms[0].id),
      /al menos una/
    )
    assert.throws(
      () => saveStatusExample(single, { ...single, rooms: [] }, today),
      /al menos una/
    )
    const mixed = createStatusExample("mixed", today)
    assert.ok(roomRemovalReason(mixed, mixed, mixed.rooms[0].id))
    assert.equal(roomRemovalReason(mixed, mixed, mixed.rooms[1].id), null)
    assert.throws(
      () =>
        saveStatusExample(
          mixed,
          { ...mixed, rooms: mixed.rooms.slice(1) },
          today
        ),
      /confirmada/
    )
    for (const status of ["checked_out", "cancelled", "no_show"] as const) {
      const reservation = createStatusExample("multiple", today)
      reservation.rooms[0].status = status
      assert.throws(
        () =>
          removeExampleRoom(reservation, reservation, reservation.rooms[0].id),
        /confirmada/
      )
    }
  })

  it("preserves an overpayment as credit after a room is removed", () => {
    const reservation = recordExamplePayment(
      createStatusExample("multiple", today),
      { amountCents: 60000, method: "cash", paidAt: today },
      "extra-deposit"
    )
    const reduced = removeExampleRoom(
      reservation,
      reservation,
      reservation.rooms[0].id
    )
    assert.equal(reduced.rooms[0].id, reservation.rooms[1].id)
    assert.equal(reduced.paidCents, 75000)
    assert.equal(reduced.totalCents, 45000)
    assert.equal(reduced.balanceCents, -30000)
    assert.equal(bulkTransition(reduced, "checked_in", today).reason, null)
  })
})
