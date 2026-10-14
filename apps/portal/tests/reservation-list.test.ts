import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  occupantsLabel,
  reservationStatusLabel,
  roomsLabel,
} from "../src/lib/reservation-list.ts"

describe("reservation list presentation", () => {
  it("labels rooms by number, or Sin asignar when any room is missing", () => {
    assert.equal(
      roomsLabel([
        { roomNumber: "102", roomTypeName: "Estándar" },
        { roomNumber: "303", roomTypeName: "Suite familiar" },
      ]),
      "102, 303"
    )
    assert.equal(
      roomsLabel([
        { roomNumber: "102", roomTypeName: "Estándar" },
        { roomNumber: null, roomTypeName: "Suite familiar" },
      ]),
      "Sin asignar"
    )
    assert.equal(
      roomsLabel([
        { roomNumber: null, roomTypeName: "Estándar" },
        { roomNumber: null, roomTypeName: null },
      ]),
      "Sin asignar"
    )
    assert.equal(roomsLabel([]), "Sin asignar")
  })

  it("labels occupants and status", () => {
    assert.equal(
      occupantsLabel([
        { adults: 2, children: 0 },
        { adults: 1, children: 1 },
      ]),
      "3 adultos · 1 niño"
    )
    assert.equal(occupantsLabel([{ adults: 1, children: 0 }]), "1 adulto")
    assert.equal(reservationStatusLabel("confirmed"), "Confirmada")
    assert.equal(reservationStatusLabel("checked_in"), "Check-in")
    assert.equal(reservationStatusLabel("checked_out"), "Check-out")
  })
})
