import type { Reservation, Room, RoomClosure } from "./api";

const openStatuses = new Set(["confirmed", "checked_in"]);
const inactiveStatuses = new Set(["cancelled", "no_show"]);

export type ReservationStay = {
  id: string;
  reservationId: string;
  guestName: string;
  status?: string;
  checkIn: string;
  checkOut: string;
  roomId: string | null;
  roomTypeId: string;
  roomIndex: number;
  roomCount: number;
};

export function reservationStays(reservations: Reservation[], includeCompleted = false) {
  return reservations.flatMap((reservation) =>
    reservation.rooms.flatMap((line, index): ReservationStay[] =>
      openStatuses.has(reservation.status) ||
      (includeCompleted && reservation.status === "checked_out")
        ? [
            {
              id: line.id,
              reservationId: reservation.id,
              guestName: reservation.guestName,
              status: reservation.status,
              checkIn: reservation.checkIn,
              checkOut: reservation.checkOut,
              roomId: line.roomId,
              roomTypeId: line.roomTypeId,
              roomIndex: index + 1,
              roomCount: reservation.rooms.length,
            },
          ]
        : [],
    ),
  );
}

export function unassignedStays(reservations: Reservation[], from: string, to: string) {
  return reservationStays(reservations)
    .filter((stay) => stay.roomId === null && stay.checkIn <= to && stay.checkOut > from)
    .sort(
      (a, b) =>
        a.checkIn.localeCompare(b.checkIn) ||
        a.guestName.localeCompare(b.guestName) ||
        a.roomIndex - b.roomIndex,
    );
}

export function assignmentTargetIssue(target: ReservationStay, reservations: Reservation[]) {
  const reservation = reservations.find((item) => item.id === target.reservationId);
  const line = reservation?.rooms.find((item) => item.id === target.id);
  if (!reservation || !line || !openStatuses.has(reservation.status)) {
    return "This reserved room is no longer awaiting assignment. Select another reservation.";
  }
  if (line.roomId !== null) {
    return "This reserved room has already been assigned. Select another reservation.";
  }
  if (
    reservation.checkIn !== target.checkIn ||
    reservation.checkOut !== target.checkOut ||
    line.roomTypeId !== target.roomTypeId
  ) {
    return "This reservation has changed. Select it again to check the updated stay.";
  }
  return null;
}

export function roomAssignmentIssue(
  room: Room,
  target: ReservationStay,
  reservations: Reservation[],
  closures: RoomClosure[],
) {
  if (room.roomTypeId !== target.roomTypeId) return "Different room type";

  const occupied = reservations.some((reservation) =>
    reservation.rooms.some(
      (line) =>
        reservation.checkIn < target.checkOut &&
        reservation.checkOut > target.checkIn &&
        line.id !== target.id &&
        line.roomId === room.id &&
        !inactiveStatuses.has(reservation.status),
    ),
  );
  if (occupied) return "Occupied during this stay";

  const closed = closures.some(
    (closure) =>
      closure.roomId === room.id &&
      closure.starts < target.checkOut &&
      closure.ends > target.checkIn,
  );
  if (closed) return "Closed during this stay";
  return null;
}
