import type { Reservation, ReservationLine, Room, RoomClosure } from "./api";

/** A reserved room as the assignment picker captured it when staff selected it. */
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

/** The reservation fields assignment availability reads, from a list row or a detail read. */
export type AssignmentReservation = Pick<Reservation, "id" | "status" | "checkIn" | "checkOut"> & {
  rooms: Pick<ReservationLine, "id" | "roomId" | "roomTypeId">[];
};

export type AssignmentContext = {
  reservations: AssignmentReservation[];
  closures: RoomClosure[];
  /** Reserved rooms whose saved room assignments do not count against the stay. */
  ignoredReservedRoomIds?: ReadonlySet<string>;
};

export type TargetProblem = "not-awaiting" | "already-assigned" | "stay-changed";
export type RoomProblem = "wrong-type" | "occupied" | "closed";
export type AssignmentProblem = TargetProblem | RoomProblem;

export const assignmentProblemLabels: Record<AssignmentProblem, string> = {
  "not-awaiting": "Esta habitación ya no está pendiente de asignación. Selecciona otra reserva.",
  "already-assigned": "Esta habitación ya fue asignada. Selecciona otra reserva.",
  "stay-changed":
    "Esta reserva cambió. Selecciónala de nuevo para consultar la estancia actualizada.",
  "wrong-type": "Tipo de habitación diferente",
  occupied: "Ocupada durante la estancia",
  closed: "Cerrada durante la estancia",
};

/** Every reservation except a cancelled one holds its assigned rooms for its stay nights. */
function holdsRooms(status: string) {
  return status !== "cancelled";
}

/** Only confirmed and checked-in reservations can receive a room assignment. */
function receivesAssignments(status: string) {
  return status === "confirmed" || status === "checked_in";
}

// Stay nights and room closures are both [start, end).
function overlaps(stay: { checkIn: string; checkOut: string }, start: string, end: string) {
  return start < stay.checkOut && end > stay.checkIn;
}

function roomConflict(
  roomId: string,
  stay: { checkIn: string; checkOut: string },
  { reservations, closures, ignoredReservedRoomIds }: AssignmentContext,
): "occupied" | "closed" | null {
  const occupied = reservations.some(
    (reservation) =>
      holdsRooms(reservation.status) &&
      overlaps(stay, reservation.checkIn, reservation.checkOut) &&
      reservation.rooms.some(
        (line) => line.roomId === roomId && !ignoredReservedRoomIds?.has(line.id),
      ),
  );
  if (occupied) return "occupied";
  const closed = closures.some(
    (closure) => closure.roomId === roomId && overlaps(stay, closure.starts, closure.ends),
  );
  return closed ? "closed" : null;
}

/** Whether a physical room can go to a reserved room for its stay dates. */
export function roomProblem(
  room: Pick<Room, "id" | "roomTypeId">,
  stay: { checkIn: string; checkOut: string; roomTypeId: string },
  context: AssignmentContext,
): RoomProblem | null {
  if (room.roomTypeId !== stay.roomTypeId) return "wrong-type";
  return roomConflict(room.id, stay, context);
}

/** Whether the selected reserved room can still receive the assignment staff picked it for. */
export function targetProblem(
  target: ReservationStay,
  reservations: AssignmentReservation[],
): TargetProblem | null {
  const reservation = reservations.find((item) => item.id === target.reservationId);
  const line = reservation?.rooms.find((item) => item.id === target.id);
  if (!reservation || !line || !receivesAssignments(reservation.status)) return "not-awaiting";
  if (line.roomId !== null) return "already-assigned";
  if (
    reservation.checkIn !== target.checkIn ||
    reservation.checkOut !== target.checkOut ||
    line.roomTypeId !== target.roomTypeId
  ) {
    return "stay-changed";
  }
  return null;
}

/**
 * Rooms occupied or closed during the stay. A saved reservation's own room assignments
 * are ignored because its stay draft replaces them; clashes between draft rooms are
 * checked separately.
 */
export function unavailableRoomIds(
  stay: { checkIn: string; checkOut: string },
  reservations: AssignmentReservation[],
  closures: RoomClosure[],
  reservationId?: string,
): Set<string> {
  const context: AssignmentContext = {
    reservations,
    closures,
    ignoredReservedRoomIds: new Set(
      reservations
        .filter((reservation) => reservation.id === reservationId)
        .flatMap((reservation) => reservation.rooms.map((line) => line.id)),
    ),
  };
  const roomIds = new Set([
    ...reservations.flatMap((reservation) =>
      reservation.rooms.flatMap((line) => (line.roomId ? [line.roomId] : [])),
    ),
    ...closures.map((closure) => closure.roomId),
  ]);
  return new Set([...roomIds].filter((roomId) => roomConflict(roomId, stay, context) !== null));
}
