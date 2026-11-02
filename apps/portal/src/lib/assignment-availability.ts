import type { Reservation, ReservationLine, Room, RoomClosure } from "./api";

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

export type AssignmentReservation = Pick<Reservation, "id" | "status" | "checkIn" | "checkOut"> & {
  rooms: Pick<ReservationLine, "id" | "roomId" | "roomTypeId">[];
};

export type AssignmentContext = {
  reservations: AssignmentReservation[];
  closures: RoomClosure[];
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

function holdsRooms(status: string) {
  return status !== "cancelled";
}

function receivesAssignments(status: string) {
  return status === "confirmed" || status === "checked_in";
}

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

export function roomProblem(
  room: Pick<Room, "id" | "roomTypeId">,
  stay: { checkIn: string; checkOut: string; roomTypeId: string },
  context: AssignmentContext,
): RoomProblem | null {
  if (room.roomTypeId !== stay.roomTypeId) return "wrong-type";
  return roomConflict(room.id, stay, context);
}

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
