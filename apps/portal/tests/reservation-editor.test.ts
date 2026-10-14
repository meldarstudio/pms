import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  Reservation,
  ReservationDetail,
  WorkflowAction,
} from "../src/lib/api.ts"
import {
  validationPreviewActions,
  hasBillingChanges,
  changeCheckIn,
  minimumCheckOut,
  unavailableRoomIds,
  overlappingRoomIds,
  contactValue,
  roomEdits,
  stayValue,
  type RoomDraft,
} from "../src/lib/reservation-editor.ts"
const line = (id: string) =>
  ({
    id,
    roomId: id,
    roomTypeId: "double",
    adults: 2,
    children: 0,
  }) as ReservationDetail["rooms"][number]
const draft = (room: ReservationDetail["rooms"][number]): RoomDraft => ({
  id: room.id,
  room: stayValue(room),
  removed: false,
})
const dates = { checkIn: "2026-10-12", checkOut: "2026-10-15" }

describe("billing changes versus validation", () => {
  const saved = {
    ...dates,
    status: "confirmed",
    savedDiscountCents: 0,
    rooms: [line("101")],
  } as ReservationDetail

  it("validates occupancy and assignment edits without marking billing provisional", () => {
    for (const patch of [
      { adults: 3 },
      { children: 1 },
      { roomId: "102" },
      { roomId: null },
    ]) {
      const action: WorkflowAction = {
        type: "edit-room",
        lineId: "101",
        room: { ...stayValue(saved.rooms[0]), ...patch },
      }
      assert.deepEqual(validationPreviewActions([action]), [action])
      assert.equal(hasBillingChanges(saved, [action]), false)
    }
  })

  it("marks dates, room types, added rooms and removed rooms as billing changes", () => {
    const actions: WorkflowAction[] = [
      { type: "dates", ...dates, checkOut: "2026-10-16" },
      { type: "dates", ...dates, checkIn: "2026-10-11" },
      {
        type: "edit-room",
        lineId: "101",
        room: {
          ...stayValue(saved.rooms[0]),
          roomTypeId: "single",
          roomId: null,
        },
      },
      { type: "add-room", room: stayValue(line("102")) },
      { type: "remove-room", lineId: "101" },
      { type: "set-discount", amountCents: 1000 },
    ]
    for (const action of actions) {
      assert.equal(hasBillingChanges(saved, [action]), true, action.type)
      assert.deepEqual(validationPreviewActions([action]), [action])
    }
  })

  it("validates ordinary status edits and marks cancellation or restoration as billing changes", () => {
    for (const status of [
      "confirmed",
      "checked_in",
      "checked_out",
      "no_show",
    ] as const) {
      const action: WorkflowAction = { type: "set-status", status }
      assert.equal(hasBillingChanges(saved, [action]), false)
      assert.deepEqual(validationPreviewActions([action]), [action])
      assert.equal(
        hasBillingChanges({ ...saved, status: "cancelled" }, [action]),
        true
      )
    }
    assert.equal(
      hasBillingChanges(saved, [{ type: "set-status", status: "cancelled" }]),
      true
    )
    assert.equal(
      hasBillingChanges({ ...saved, status: "cancelled" }, [
        { type: "set-status", status: "cancelled" },
      ]),
      false
    )
  })

  it("clears the billing badge when the last pricing edit is reverted, even with other unsaved edits", () => {
    const operational: WorkflowAction = {
      type: "edit-room",
      lineId: "101",
      room: { ...stayValue(saved.rooms[0]), roomId: "102", children: 1 },
    }
    const notes: WorkflowAction = { type: "notes", notes: "Late arrival" }
    const price: WorkflowAction = {
      type: "dates",
      ...dates,
      checkOut: "2026-10-16",
    }
    assert.equal(hasBillingChanges(saved, [price, operational, notes]), true)
    assert.deepEqual(validationPreviewActions([price, operational, notes]), [
      price,
      operational,
    ])
    assert.equal(hasBillingChanges(saved, [operational, notes]), false)
    assert.deepEqual(validationPreviewActions([operational, notes]), [
      operational,
    ])
    assert.equal(hasBillingChanges(saved, [{ type: "dates", ...dates }]), false)
    assert.equal(
      hasBillingChanges(saved, [{ type: "set-discount", amountCents: 0 }]),
      false
    )
    assert.equal(hasBillingChanges(saved, []), false)
  })

  it("compares against the saved room type after a save or discard", () => {
    const drafts = [draft(saved.rooms[0])]
    drafts[0].room.roomTypeId = "single"
    const changes = roomEdits(saved, drafts)
    assert.equal(hasBillingChanges(saved, changes), true)
    const updated = {
      ...saved,
      rooms: [{ ...saved.rooms[0], roomTypeId: "single" }],
    }
    assert.equal(hasBillingChanges(updated, roomEdits(updated, drafts)), false)
    assert.equal(
      hasBillingChanges(saved, roomEdits(saved, [draft(saved.rooms[0])])),
      false
    )
  })
})
describe("reservation edit drafts", () => {
  it("copies occupancy and assignment without the line id", () => {
    assert.deepEqual(
      stayValue({
        id: "line-9",
        roomId: "101",
        roomTypeId: "double",
        adults: 2,
        children: 1,
      } as ReservationDetail["rooms"][number]),
      { roomTypeId: "double", roomId: "101", adults: 2, children: 1 }
    )
  })
  it("removes a saved room and adds a new room through the same reservation command", () => {
    const saved = line("101")
    const added = draft(line("102"))
    assert.deepEqual(
      roomEdits({ rooms: [saved] } as ReservationDetail, [
        { ...draft(saved), removed: true },
        added,
      ]),
      [
        { type: "remove-room", lineId: "101" },
        { type: "add-room", room: added.room },
      ]
    )
  })
  it("edits a changed room and ignores an equal draft or an unsaved removal", () => {
    const saved = line("101")
    const changed = { ...stayValue(saved), adults: 3 }
    assert.deepEqual(
      roomEdits({ rooms: [saved] } as ReservationDetail, [
        { id: saved.id, room: changed, removed: false },
        { id: "new", room: stayValue(line("102")), removed: true },
      ]),
      [{ type: "edit-room", lineId: "101", room: changed }]
    )
    assert.deepEqual(
      roomEdits({ rooms: [saved] } as ReservationDetail, [draft(saved)]),
      []
    )
  })
  it("blocks duplicate physical assignments within a reservation", () => {
    assert.deepEqual(
      [
        ...overlappingRoomIds([
          stayValue(line("102")),
          { ...stayValue(line("103")), roomId: null },
        ]),
      ],
      ["102"]
    )
  })
  it("uses parent status and dates for external availability and allows checkout-day arrivals", () => {
    const res = (
      id: string,
      status = "confirmed",
      checkOut = dates.checkOut
    ): Reservation => ({
      id,
      status,
      guestName: "Guest",
      ...dates,
      checkOut,
      rooms: [line(id)],
    })
    const closures = [
      {
        id: "closure",
        roomId: "106",
        starts: dates.checkIn,
        ends: dates.checkOut,
        reason: "Repair",
      },
    ]
    assert.deepEqual(
      [
        ...unavailableRoomIds(
          dates,
          [
            res("101"),
            res("102"),
            res("103", "cancelled"),
            res("104", "confirmed", dates.checkIn),
            res("105", "no_show"),
          ],
          closures,
          "101"
        ),
      ],
      ["102", "106"]
    )
    assert.deepEqual(
      [
        ...unavailableRoomIds(
          dates,
          [res("201", "checked_in"), res("202", "checked_out")],
          [],
          "101"
        ),
      ],
      ["201", "202"]
    )
  })
  it("normalizes cleared contact fields to null", () => {
    assert.deepEqual(
      contactValue({
        fullName: " Ana ",
        email: " ",
        phone: "",
        documentType: "",
        documentNumber: "",
      }),
      {
        fullName: "Ana",
        email: null,
        phone: null,
        documentType: null,
        documentNumber: null,
      }
    )
  })
})
describe("shared stay dates", () => {
  it("advances checkout when an arrival would leave less than a night", () => {
    assert.deepEqual(changeCheckIn(dates, "2026-10-15"), {
      checkIn: "2026-10-15",
      checkOut: "2026-10-16",
    })
    assert.deepEqual(changeCheckIn(dates, "2026-10-10"), {
      checkIn: "2026-10-10",
      checkOut: dates.checkOut,
    })
    assert.equal(minimumCheckOut("2026-12-31"), "2027-01-01")
    assert.equal(minimumCheckOut("2028-02-28"), "2028-02-29")
  })
  it("previews dates and status but excludes notes, contact and guests", () => {
    assert.deepEqual(
      validationPreviewActions([
        { type: "dates", ...dates },
        { type: "notes", notes: "Note" },
        {
          type: "contact",
          contact: {
            fullName: "Ana",
            email: null,
            phone: null,
            documentType: null,
            documentNumber: null,
          },
        },
        { type: "set-guests", guests: [] },
        { type: "set-status", status: "checked_out" },
      ]),
      [
        { type: "dates", ...dates },
        { type: "set-status", status: "checked_out" },
      ]
    )
  })
})
