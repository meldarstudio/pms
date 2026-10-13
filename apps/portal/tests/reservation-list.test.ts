import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  arrivalBandLabel,
  groupAdjacentByCheckIn,
  occupantsLabel,
  reservationStatusLabel,
  roomsLabel,
} from "../src/lib/reservation-list.ts"

describe("reservation list presentation", () => {
  it("groups only adjacent rows that share a check-in", () => {
    const groups = groupAdjacentByCheckIn([
      { id: "a", checkIn: "2026-10-10" },
      { id: "b", checkIn: "2026-10-10" },
      { id: "c", checkIn: "2026-10-11" },
      { id: "d", checkIn: "2026-10-10" },
    ])
    assert.deepEqual(
      groups.map((group) => group.rows.map((row) => row.id)),
      [["a", "b"], ["c"], ["d"]]
    )
  })

  it("labels arrival bands in Spanish and rooms by number", () => {
    assert.match(arrivalBandLabel("2026-10-13"), /13 de octubre de 2026/)
    assert.equal(arrivalBandLabel("2026-10-13")[0], "M")
    assert.equal(
      roomsLabel([
        { roomNumber: "101", roomTypeName: "Doble" },
        { roomNumber: null, roomTypeName: "Suite" },
        { roomNumber: null, roomTypeName: null },
      ]),
      "101, Suite, Sin asignar"
    )
    assert.equal(roomsLabel([]), "—")
    assert.equal(
      occupantsLabel([
        { adults: 2, children: 0 },
        { adults: 1, children: 1 },
      ]),
      "3 adultos · 1 niño"
    )
    assert.equal(occupantsLabel([{ adults: 1, children: 0 }]), "1 adulto")
    assert.equal(reservationStatusLabel("confirmed"), "Confirmada")
  })
})
