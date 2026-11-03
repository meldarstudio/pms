import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";

import type { Reservation, Room, RoomClosure } from "../src/lib/api";
import {
  assignmentProblemLabels,
  roomProblem,
  targetProblem,
  type AssignmentContext,
  type ReservationStay,
} from "../src/lib/assignment-availability.ts";

const room: Room = { id: "room-205", number: "205", roomTypeId: "deluxe" };

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "reservation-1",
    guestName: "Alex Demo",
    status: "confirmed",
    checkIn: "2026-10-05",
    checkOut: "2026-10-06",
    rooms: [{ id: "line-1", roomTypeId: "deluxe", roomId: null }],
    ...overrides,
  };
}

const target: ReservationStay = {
  id: "line-1",
  reservationId: "reservation-1",
  guestName: "Alex Demo",
  status: "confirmed",
  checkIn: "2026-10-05",
  checkOut: "2026-10-06",
  roomId: null,
  roomTypeId: "deluxe",
  roomIndex: 1,
  roomCount: 1,
};

function occupied(checkIn: string, checkOut: string, status = "confirmed") {
  return reservation({
    id: "other-reservation",
    checkIn,
    checkOut,
    status,
    rooms: [{ id: "other-line", roomTypeId: "deluxe", roomId: room.id }],
  });
}

function closure(starts: string, ends: string): RoomClosure {
  return { id: "closure-1", roomId: room.id, starts, ends, reason: "Repairs" };
}

function context(overrides: Partial<AssignmentContext> = {}): AssignmentContext {
  return {
    reservations: [],
    closures: [],
    ignoredReservedRoomIds: new Set([target.id]),
    ...overrides,
  };
}

describe("room check", () => {
  it("allows a stay between a checkout on its arrival morning and an arrival on its checkout", () => {
    assert.equal(
      roomProblem(
        room,
        target,
        context({
          reservations: [
            occupied("2026-10-03", "2026-10-05"),
            occupied("2026-10-06", "2026-10-09"),
          ],
        }),
      ),
      null,
    );
  });

  it.each([
    ["the first night", "2026-10-03", "2026-10-06"],
    ["the last night", "2026-10-14", "2026-10-16"],
  ])("marks a room occupied on %s of a long stay", (_, checkIn, checkOut) => {
    const longStay = { ...target, checkOut: "2026-10-15" };
    assert.equal(
      roomProblem(room, longStay, context({ reservations: [occupied(checkIn, checkOut)] })),
      "occupied",
    );
  });

  it.each([
    ["confirmed", "occupied"],
    ["checked_in", "occupied"],
    ["checked_out", "occupied"],
    ["cancelled", null],
    ["no_show", null],
    ["unfulfilled", null],
  ] as const)("treats a %s reservation's room as %s", (status, problem) => {
    assert.equal(
      roomProblem(
        room,
        target,
        context({ reservations: [occupied("2026-10-05", "2026-10-06", status)] }),
      ),
      problem,
    );
  });

  it("marks a room closed on any stay night but not by closures ending at arrival or starting at checkout", () => {
    assert.equal(
      roomProblem(
        room,
        target,
        context({
          closures: [closure("2026-10-04", "2026-10-05"), closure("2026-10-06", "2026-10-07")],
        }),
      ),
      null,
    );
    assert.equal(
      roomProblem(
        room,
        { ...target, checkOut: "2026-10-15" },
        context({ closures: [closure("2026-10-13", "2026-10-14")] }),
      ),
      "closed",
    );
  });

  it("requires the reserved room type", () => {
    assert.equal(roomProblem({ ...room, roomTypeId: "suite" }, target, context()), "wrong-type");
  });

  it("ignores only the reserved room being assigned, so a group's other rooms stay taken", () => {
    const group = reservation({
      rooms: [
        { id: "line-1", roomTypeId: "deluxe", roomId: room.id },
        { id: "line-2", roomTypeId: "deluxe", roomId: null },
      ],
    });
    const secondRoom: ReservationStay = { ...target, id: "line-2", roomIndex: 2, roomCount: 2 };
    assert.equal(roomProblem(room, target, context({ reservations: [group] })), null);
    assert.equal(
      roomProblem(
        room,
        secondRoom,
        context({ reservations: [group], ignoredReservedRoomIds: new Set([secondRoom.id]) }),
      ),
      "occupied",
    );
  });
});

describe("target check", () => {
  it.each(["confirmed", "checked_in"])("lets a %s reserved room receive a room", (status) => {
    assert.equal(targetProblem(target, [reservation({ status })]), null);
  });

  it.each(["checked_out", "cancelled"])("stops a %s reserved room receiving a room", (status) => {
    assert.equal(targetProblem(target, [reservation({ status })]), "not-awaiting");
  });

  it("stops a reserved room whose reservation or line is gone", () => {
    assert.equal(targetProblem(target, []), "not-awaiting");
    assert.equal(
      targetProblem(target, [
        reservation({ rooms: [{ id: "other", roomTypeId: "deluxe", roomId: null }] }),
      ]),
      "not-awaiting",
    );
  });

  it("reports a reserved room someone else assigned meanwhile", () => {
    assert.equal(
      targetProblem(target, [
        reservation({ rooms: [{ id: target.id, roomTypeId: "deluxe", roomId: room.id }] }),
      ]),
      "already-assigned",
    );
  });

  it.each([
    ["checkout", reservation({ checkOut: "2026-10-08" })],
    ["arrival", reservation({ checkIn: "2026-10-04" })],
    ["room type", reservation({ rooms: [{ id: target.id, roomTypeId: "suite", roomId: null }] })],
  ])("reports a changed %s since staff selected the reserved room", (_, current) => {
    assert.equal(targetProblem(target, [current]), "stay-changed");
  });
});

it.each([
  ["not-awaiting", "Esta habitación ya no está pendiente de asignación. Selecciona otra reserva."],
  ["already-assigned", "Esta habitación ya fue asignada. Selecciona otra reserva."],
  [
    "stay-changed",
    "Esta reserva cambió. Selecciónala de nuevo para consultar la estancia actualizada.",
  ],
  ["wrong-type", "Tipo de habitación diferente"],
  ["occupied", "Ocupada durante la estancia"],
  ["closed", "Cerrada durante la estancia"],
] as const)("labels %s in Spanish", (code, label) => {
  assert.equal(assignmentProblemLabels[code], label);
});
