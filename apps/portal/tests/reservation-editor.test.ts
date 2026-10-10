import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ReservationDetail } from "../src/lib/api.ts"
import { unavailableRoomIds, overlappingRoomIds, contactValue, nextStayAction, roomEdits, sharedStay, stayValue, type RoomDraft } from "../src/lib/reservation-editor.ts"

const line = (id: string, status = "confirmed", checkOut = "2026-10-15") => ({
  id, status, roomId: id, roomTypeId: "double", adults: 2, children: 0,
  checkIn: "2026-10-12", checkOut,
}) as ReservationDetail["rooms"][number]
const draft = (room: ReservationDetail["rooms"][number]): RoomDraft => ({ id: room.id, room: stayValue(room), removed: false, reason: "" })

describe("quick-edit stay actions", () => {
  it("offers a collective next step only when active rooms agree, ignoring completed and cancelled stays", () => {
    assert.equal(nextStayAction([line("101"), line("102"), line("103", "cancelled")]), "check-in")
    assert.equal(nextStayAction([line("101", "checked_in"), line("102", "checked_out")]), "check-out")
    assert.equal(nextStayAction([line("101"), line("102", "checked_in")]), null)
    assert.equal(nextStayAction([line("101", "checked_out")]), null)
  })
  it("never substitutes common dates for different room stays and ignores staged removals", () => {
    const a = draft(line("101")), b = draft(line("102", "confirmed", "2026-10-16"))
    assert.equal(sharedStay([a, b]), null)
    assert.deepEqual(sharedStay([a, { ...b, removed: true }]), { checkIn: "2026-10-12", checkOut: "2026-10-15" })
    assert.equal(sharedStay([]), null)
  })
  it("uses an assignment edit before arrival and an immediate move during occupancy", () => {
    const before = line("101"), occupied = line("102", "checked_in")
    const detail = { rooms: [before, occupied] } as ReservationDetail
    const actions = roomEdits(detail, [
      { ...draft(before), room: { ...stayValue(before), roomId: "103" } },
      { ...draft(occupied), room: { ...stayValue(occupied), roomId: "104" } },
    ])
    assert.deepEqual(actions.map(a => a.type), ["edit-room", "move"])
    assert.deepEqual(actions[1], { type: "move", lineId: "102", roomId: "104" })
  })
  it("saves an extension before validating a move into the extended dates", () => {
    const occupied = line("101", "checked_in")
    const actions = roomEdits({ rooms: [occupied] } as ReservationDetail, [{ ...draft(occupied), room: { ...stayValue(occupied), checkOut: "2026-10-17", roomId: "102" } }])
    assert.deepEqual(actions.map(a => a.type), ["edit-room", "move"])
    assert.equal(actions[0].type === "edit-room" && actions[0].room.roomId, "101")
    assert.equal(actions[0].type === "edit-room" && actions[0].room.checkOut, "2026-10-17")
  })
  it("normalizes cleared optional contact fields to null so they are removed on save", () => {
    assert.deepEqual(contactValue({ fullName: " Ana García ", email: "  ", phone: "", documentType: "", documentNumber: "" }), { fullName: "Ana García", email: null, phone: null, documentType: null, documentNumber: null })
  })
})


describe("draft room assignment", () => {
  it("blocks a physical room for overlapping stays while allowing checkout-day arrivals", () => {
    const room = stayValue(line("101"))
    assert.deepEqual([...overlappingRoomIds(room, [stayValue(line("102"))])], ["102"])
    assert.equal(overlappingRoomIds(room, [{ ...room, roomId: "102", checkIn: room.checkOut, checkOut: "2026-10-18" }]).size, 0)
    assert.equal(overlappingRoomIds(room, [{ ...room, roomId: null }]).size, 0)
  })
})


describe("room availability for edit drafts", () => {
  it("excludes occupied and closed rooms but permits checkout-day arrivals and cancelled stays", () => {
    const room = stayValue(line("101"))
    const reservations = [
      { id: "other", guestName: "Guest", checkIn: room.checkIn, checkOut: room.checkOut, rooms: [line("102"), line("103", "cancelled"), { ...line("104"), checkOut: room.checkIn }, line("105", "no_show")] },
      { id: "editing", guestName: "Guest", checkIn: room.checkIn, checkOut: room.checkOut, rooms: [line("101")] },
    ]
    const closures = [{ id: "closure", roomId: "106", starts: room.checkIn, ends: room.checkOut, reason: "Repair" }]
    assert.deepEqual([...unavailableRoomIds(room, reservations, closures, "editing")], ["102", "106"])
  })
})
