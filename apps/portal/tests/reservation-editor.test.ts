import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Reservation, ReservationDetail } from "../src/lib/api.ts"
import {
  billingPreviewActions,
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
describe("reservation edit drafts", () => {
  it("does not copy lifecycle or dates into room edits", () => {
    const room = stayValue(line("101"))
    assert.deepEqual(Object.keys(room).sort(), [
      "adults",
      "children",
      "roomId",
      "roomTypeId",
    ])
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
    assert.equal(changeCheckIn(dates, "2026-10-15").checkOut, "2026-10-16")
    assert.equal(changeCheckIn(dates, "2026-10-10").checkOut, dates.checkOut)
    assert.equal(minimumCheckOut("2026-12-31"), "2027-01-01")
    assert.equal(minimumCheckOut("2028-02-28"), "2028-02-29")
  })
  it("previews dates and status but excludes notes, contact and guests", () => {
    assert.deepEqual(
      billingPreviewActions([
        { type: "dates", ...dates },
        { type: "notes", notes: "Note" },
        { type: "set-guests", guests: [] },
        { type: "set-status", status: "checked_out" },
      ]).map((a) => a.type),
      ["dates", "set-status"]
    )
  })
})
