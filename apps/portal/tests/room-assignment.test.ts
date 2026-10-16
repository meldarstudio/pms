import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";

import type { Reservation, Room, RoomClosure } from "../src/lib/api";
import {
  assignmentTargetIssue,
  reservationStays,
  roomAssignmentIssue,
  unassignedStays,
} from "../src/lib/room-assignment.ts";

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

const target = reservationStays([reservation()])[0];

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

describe("room assignment", () => {
  it("allows a one-night stay between same-day checkout and arrival", () => {
    assert.equal(
      roomAssignmentIssue(
        room,
        target,
        [reservation(), occupied("2026-10-03", "2026-10-05"), occupied("2026-10-06", "2026-10-09")],
        [],
      ),
      null,
    );
  });

  it("rejects an occupied night regardless of the half-day bar endpoints", () => {
    assert.equal(
      roomAssignmentIssue(room, target, [occupied("2026-10-05", "2026-10-06")], []),
      "Occupied during this stay",
    );
  });

  it("checks conflicts beyond a visible seven-day calendar", () => {
    const longStay = { ...target, checkOut: "2026-10-15" };
    assert.equal(
      roomAssignmentIssue(room, longStay, [occupied("2026-10-13", "2026-10-16")], []),
      "Occupied during this stay",
    );
    assert.equal(
      roomAssignmentIssue(room, longStay, [], [closure("2026-10-13", "2026-10-14")]),
      "Closed during this stay",
    );
  });

  it("does not let cancelled or no-show bookings block a room", () => {
    assert.equal(
      roomAssignmentIssue(
        room,
        target,
        [
          occupied("2026-10-05", "2026-10-06", "cancelled"),
          occupied("2026-10-05", "2026-10-06", "no_show"),
        ],
        [],
      ),
      null,
    );
  });

  it("checks the saved dates of a checked-out stay", () => {
    assert.equal(
      roomAssignmentIssue(room, target, [occupied("2026-10-05", "2026-10-06", "checked_out")], []),
      "Occupied during this stay",
    );
  });

  it("allows closures ending at arrival or starting at checkout", () => {
    assert.equal(
      roomAssignmentIssue(
        room,
        target,
        [],
        [closure("2026-10-04", "2026-10-05"), closure("2026-10-06", "2026-10-07")],
      ),
      null,
    );
    assert.equal(
      roomAssignmentIssue(room, target, [], [closure("2026-10-05", "2026-10-06")]),
      "Closed during this stay",
    );
  });

  it("requires the reserved room type", () => {
    assert.equal(
      roomAssignmentIssue({ ...room, roomTypeId: "suite" }, target, [], []),
      "Different room type",
    );
  });

  it("keeps multi-room lines independent when one is assigned", () => {
    const multi = reservation({
      rooms: [
        {
          id: "line-1",
          roomTypeId: "deluxe",
          roomId: room.id,
        },
        {
          id: "line-2",
          roomTypeId: "deluxe",
          roomId: null,
        },
      ],
    });
    const stays = unassignedStays([multi], "2026-10-05", "2026-10-11");
    assert.equal(stays.length, 1);
    assert.equal(stays[0].reservationId, multi.id);
    assert.equal(stays[0].roomIndex, 2);
    assert.equal(stays[0].roomCount, 2);
    assert.equal(roomAssignmentIssue(room, stays[0], [multi], []), "Occupied during this stay");
  });

  it("lists only open unassigned rooms overlapping the visible nights", () => {
    const stays = unassignedStays(
      [
        reservation({
          id: "later",
          guestName: "Sam Demo",
          checkIn: "2026-10-06",
          checkOut: "2026-10-08",
        }),
        reservation(),
        reservation({
          id: "departed",
          checkIn: "2026-10-03",
          checkOut: "2026-10-05",
        }),
        reservation({
          id: "future",
          checkIn: "2026-10-12",
          checkOut: "2026-10-13",
        }),
        occupied("2026-10-05", "2026-10-06"),
        reservation({
          id: "cancelled",
          status: "cancelled",
          rooms: [
            {
              id: "cancelled-line",
              roomTypeId: "deluxe",
              roomId: null,
            },
          ],
        }),
      ],
      "2026-10-05",
      "2026-10-11",
    );
    assert.deepEqual(
      stays.map((stay) => stay.reservationId),
      ["reservation-1", "later"],
    );
  });

  it("detects a reservation assigned or changed while it was selected", () => {
    assert.equal(assignmentTargetIssue(target, [reservation()]), null);
    assert.match(
      assignmentTargetIssue(target, [occupied(target.checkIn, target.checkOut)])!,
      /no longer awaiting/,
    );
    const assigned = reservation({
      rooms: [
        {
          id: target.id,
          roomTypeId: "deluxe",
          roomId: room.id,
        },
      ],
    });
    assert.match(assignmentTargetIssue(target, [assigned])!, /already been assigned/);
    assert.match(
      assignmentTargetIssue(target, [reservation({ checkOut: "2026-10-08" })])!,
      /has changed/,
    );
    assert.match(
      assignmentTargetIssue(target, [
        reservation({
          rooms: [
            {
              id: target.id,
              roomTypeId: "suite",
              roomId: null,
            },
          ],
        }),
      ])!,
      /has changed/,
    );
  });
});

describe("checked-in stays", () => {
  it("keeps a checked-in stay on the calendar and treats it as occupying the room", () => {
    const staying = reservation({ status: "checked_in" });
    const [stay] = reservationStays([staying]);
    assert.equal(stay.status, "checked_in");
    assert.equal(stay.roomId, null);
    assert.equal(
      roomAssignmentIssue(room, target, [occupied("2026-10-05", "2026-10-06", "checked_in")], []),
      "Occupied during this stay",
    );
  });

  it("does not treat a stay as occupying its own assigned room", () => {
    const self = reservation({
      rooms: [{ id: target.id, roomTypeId: "deluxe", roomId: room.id }],
    });
    assert.equal(roomAssignmentIssue(room, target, [self], []), null);
  });
});

describe("completed calendar stays", () => {
  it("uses final saved dates for completed calendar bars without adding them to assignment lists", () => {
    const completed = reservation({
      status: "checked_out",
      rooms: [
        {
          id: "completed",
          roomId: room.id,
          roomTypeId: room.roomTypeId,
        },
      ],
    });
    assert.equal(reservationStays([completed]).length, 0);
    const [stay] = reservationStays([completed], true);
    assert.equal(stay.status, "checked_out");
    assert.equal(stay.checkOut, "2026-10-06");
  });
});
