import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ReservationDetail } from "../src/lib/api.ts"
import {
  stageFinancialChange,
  billingPreviewActions,
  changeCheckIn,
  minimumCheckOut,
  unavailableRoomIds,
  overlappingRoomIds,
  contactValue,
  nextStayAction,
  roomEdits,
  sharedStay,
  stayValue,
  type RoomDraft,
} from "../src/lib/reservation-editor.ts"

const line = (id: string, status = "confirmed", checkOut = "2026-10-15") =>
  ({
    id,
    status,
    roomId: id,
    roomTypeId: "double",
    adults: 2,
    children: 0,
    checkIn: "2026-10-12",
    checkOut,
  }) as ReservationDetail["rooms"][number]
const draft = (room: ReservationDetail["rooms"][number]): RoomDraft => ({
  id: room.id,
  room: stayValue(room),
  removed: false,
  reason: "",
})

describe("quick-edit stay actions", () => {
  it("offers a collective next step only when active rooms agree, ignoring completed and cancelled stays", () => {
    assert.equal(
      nextStayAction([line("101"), line("102"), line("103", "cancelled")]),
      "check-in"
    )
    assert.equal(
      nextStayAction([line("101", "checked_in"), line("102", "checked_out")]),
      "check-out"
    )
    assert.equal(nextStayAction([line("101"), line("102", "checked_in")]), null)
    assert.equal(nextStayAction([line("101", "checked_out")]), null)
  })
  it("never substitutes common dates for different room stays and ignores staged removals", () => {
    const a = draft(line("101")),
      b = draft(line("102", "confirmed", "2026-10-16"))
    assert.equal(sharedStay([a, b]), null)
    assert.deepEqual(sharedStay([a, { ...b, removed: true }]), {
      checkIn: "2026-10-12",
      checkOut: "2026-10-15",
    })
    assert.equal(sharedStay([]), null)
  })
  it("uses the same room edit before arrival and during occupancy", () => {
    const before = line("101"),
      occupied = line("102", "checked_in")
    const detail = { rooms: [before, occupied] } as ReservationDetail
    const actions = roomEdits(detail, [
      { ...draft(before), room: { ...stayValue(before), roomId: "103" } },
      { ...draft(occupied), room: { ...stayValue(occupied), roomId: "104" } },
    ])
    assert.deepEqual(
      actions.map((a) => a.type),
      ["edit-room", "edit-room"]
    )
    assert.equal(
      actions[1].type === "edit-room" && actions[1].room.roomId,
      "104"
    )
  })
  it("combines date and assignment changes in one ordinary edit", () => {
    const occupied = line("101", "checked_in")
    const actions = roomEdits({ rooms: [occupied] } as ReservationDetail, [
      {
        ...draft(occupied),
        room: { ...stayValue(occupied), checkOut: "2026-10-17", roomId: "102" },
      },
    ])
    assert.deepEqual(
      actions.map((a) => a.type),
      ["edit-room"]
    )
    assert.equal(
      actions[0].type === "edit-room" && actions[0].room.roomId,
      "102"
    )
    assert.equal(
      actions[0].type === "edit-room" && actions[0].room.checkOut,
      "2026-10-17"
    )
  })
  it("normalizes cleared optional contact fields to null so they are removed on save", () => {
    assert.deepEqual(
      contactValue({
        fullName: " Ana García ",
        email: "  ",
        phone: "",
        documentType: "",
        documentNumber: "",
      }),
      {
        fullName: "Ana García",
        email: null,
        phone: null,
        documentType: null,
        documentNumber: null,
      }
    )
  })
})

describe("draft room assignment", () => {
  it("blocks a physical room for overlapping stays while allowing checkout-day arrivals", () => {
    const room = stayValue(line("101"))
    assert.deepEqual(
      [...overlappingRoomIds(room, [stayValue(line("102"))])],
      ["102"]
    )
    assert.equal(
      overlappingRoomIds(room, [
        {
          ...room,
          roomId: "102",
          checkIn: room.checkOut,
          checkOut: "2026-10-18",
        },
      ]).size,
      0
    )
    assert.equal(overlappingRoomIds(room, [{ ...room, roomId: null }]).size, 0)
  })
})

describe("room availability for edit drafts", () => {
  it("excludes occupied and closed rooms but permits checkout-day arrivals and cancelled stays", () => {
    const room = stayValue(line("101"))
    const reservations = [
      {
        id: "other",
        guestName: "Guest",
        checkIn: room.checkIn,
        checkOut: room.checkOut,
        rooms: [
          line("102"),
          line("103", "cancelled"),
          { ...line("104"), checkOut: room.checkIn },
          line("105", "no_show"),
        ],
      },
      {
        id: "editing",
        guestName: "Guest",
        checkIn: room.checkIn,
        checkOut: room.checkOut,
        rooms: [line("101")],
      },
    ]
    const closures = [
      {
        id: "closure",
        roomId: "106",
        starts: room.checkIn,
        ends: room.checkOut,
        reason: "Repair",
      },
    ]
    assert.deepEqual(
      [...unavailableRoomIds(room, reservations, closures, "editing")],
      ["102", "106"]
    )
  })
})

describe("payment and discount drafts", () => {
  const entry = (id: string, kind = "payment") =>
    ({ id, kind }) as ReservationDetail["financialEntries"][number]
  const payment = (
    amountCents: number
  ): Extract<
    import("../src/lib/api.ts").WorkflowAction,
    { type: "financial" }
  > => ({
    type: "financial",
    entry: {
      kind: "payment",
      amountCents,
      method: "cash",
      paymentDate: "2026-10-10",
    },
  })
  it("edits and deletes a saved payment through one command while replacing earlier draft edits", () => {
    const saved = [entry("saved")]
    const first = {
      type: "edit-financial" as const,
      entryId: "saved",
      entry: payment(11000).entry,
    }
    const next = { ...first, entry: payment(10000).entry }
    assert.deepEqual(stageFinancialChange(saved, saved, [first], next), [next])
    const remove = { type: "delete-financial" as const, entryId: "saved" }
    assert.deepEqual(stageFinancialChange(saved, saved, [next], remove), [
      remove,
    ])
  })
  it("edits an unsaved payment by updating its addition instead of using its preview ID", () => {
    const saved = [entry("saved")]
    const projected = [...saved, entry("temporary")]
    const other = { type: "notes" as const, notes: "Guest note" }
    assert.deepEqual(
      stageFinancialChange(saved, projected, [other, payment(11000)], {
        type: "edit-financial",
        entryId: "temporary",
        entry: payment(10000).entry,
      }),
      [other, payment(10000)]
    )
  })
  it("removes only the selected unsaved addition, including when payments and discounts are interleaved", () => {
    const discount = {
      type: "financial" as const,
      entry: { kind: "discount" as const, amountCents: 1000 },
    }
    const pending = [payment(10000), discount, payment(20000)]
    assert.deepEqual(
      stageFinancialChange(
        [],
        [entry("first"), entry("discount", "discount"), entry("last")],
        pending,
        {
          type: "delete-financial",
          entryId: "discount",
        }
      ),
      [payment(10000), payment(20000)]
    )
  })
  it("allows ordinary date, assignment, and guest edits on a completed room", () => {
    const completed = line("101", "checked_out")
    const room = {
      ...stayValue(completed),
      checkOut: "2026-10-14",
      roomId: "102",
      adults: 1,
    }
    assert.deepEqual(
      roomEdits({ rooms: [completed] } as ReservationDetail, [
        { ...draft(completed), room },
      ]),
      [{ type: "edit-room", lineId: "101", room }]
    )
  })
})

describe("checkout date minimum", () => {
  it("uses the next UTC calendar date across month, year, leap-day and DST boundaries", () => {
    for (const [checkIn, checkout] of [
      ["2026-10-10", "2026-10-11"],
      ["2026-12-31", "2027-01-01"],
      ["2028-02-28", "2028-02-29"],
      ["2026-02-28", "2026-03-01"],
      ["2026-03-08", "2026-03-09"],
    ])
      assert.equal(minimumCheckOut(checkIn), checkout)
  })
  it("moves checkout forward only when the new arrival would leave less than one night", () => {
    const room = stayValue(line("101"))
    assert.equal(changeCheckIn(room, "2026-10-15").checkOut, "2026-10-16")
    assert.equal(changeCheckIn(room, "2026-10-20").checkOut, "2026-10-21")
    assert.equal(changeCheckIn(room, "2026-10-10").checkOut, room.checkOut)
    assert.equal(changeCheckIn(room, "2026-10-14").checkOut, room.checkOut)
    assert.equal(room.checkIn, "2026-10-12")
    assert.equal(room.checkOut, "2026-10-15")
  })
})

describe("billing preview dependencies", () => {
  it("does not preview note-only changes or guest/contact edits", () => {
    assert.deepEqual(
      billingPreviewActions([
        { type: "notes", notes: "Guest prefers a quiet room" },
        {
          type: "contact",
          contact: { fullName: "Ana Pérez", email: null, phone: null },
        },
        { type: "set-guests", guests: [] },
      ]),
      []
    )
  })
  it("keeps the stay preview unchanged when notes are typed alongside a date change", () => {
    const dateChange = roomEdits(
      { rooms: [line("101")] } as ReservationDetail,
      [
        {
          ...draft(line("101")),
          room: { ...stayValue(line("101")), checkOut: "2026-10-14" },
        },
      ]
    )
    const before = JSON.stringify(billingPreviewActions(dateChange))
    const after = JSON.stringify(
      billingPreviewActions([
        ...dateChange,
        { type: "notes", notes: "New note" },
      ])
    )
    assert.equal(after, before)
    assert.deepEqual(
      billingPreviewActions([
        ...dateChange,
        { type: "set-status", lineId: "101", status: "cancelled" },
      ]).map((action) => action.type),
      ["edit-room", "set-status"]
    )
  })
})
