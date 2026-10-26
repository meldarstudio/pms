import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Room } from "@/lib/api";
import { useAssignRoom, useReservations, useRoomClosures } from "@/lib/queries";
import {
  assignmentProblemLabels,
  roomProblem,
  targetProblem,
  type ReservationStay,
  type RoomProblem,
} from "@/lib/assignment-availability";
import { toast } from "@/lib/toast";
import { translateError } from "@/lib/errors";

export function useRoomAssignment(rooms: Room[] | null, unassigned: ReservationStay[]) {
  const queryClient = useQueryClient();
  const assign = useAssignRoom();
  const { isPending: pending, reset: resetAssignment } = assign;
  const [target, setTarget] = useState<ReservationStay | null>(null);
  // A save resolves after the calendar refetch, so read the latest list then,
  // skipping lines this group run assigned in case that render has not landed.
  const latestUnassigned = useRef(unassigned);
  const assignedLines = useRef(new Set<string>());
  useEffect(() => {
    latestUnassigned.current = unassigned;
  }, [unassigned]);
  const reservations = useReservations(
    target?.checkIn ?? "",
    target?.checkOut ?? "",
    target !== null,
  );
  const closures = useRoomClosures(target?.checkIn ?? "", target?.checkOut ?? "", target !== null);
  const checking = Boolean(
    target &&
    (rooms === null ||
      reservations.isPending ||
      reservations.isFetching ||
      reservations.isPlaceholderData ||
      closures.isPending ||
      closures.isFetching ||
      closures.isPlaceholderData),
  );
  const queryError = target
    ? (reservations.error?.message ?? closures.error?.message ?? null)
    : null;
  const staleTarget =
    target && !checking && !queryError && reservations.data
      ? targetProblem(target, reservations.data)
      : null;
  const ready = Boolean(target && !checking && !queryError && !staleTarget);
  const roomProblems = new Map<string, RoomProblem | null>();
  if (target && ready) {
    // Only the reserved room being assigned is ignored, so the group's other saved
    // reserved rooms still hold their rooms.
    const context = {
      reservations: reservations.data ?? [],
      closures: closures.data ?? [],
      ignoredReservedRoomIds: new Set([target.id]),
    };
    for (const room of rooms ?? []) roomProblems.set(room.id, roomProblem(room, target, context));
  }
  // Kept while the next room's availability is re-checked, so the reference stays
  // on screen when staff need it.
  const groupAssignments =
    target && !queryError
      ? (reservations.data
          ?.find((reservation) => reservation.id === target.reservationId)
          ?.rooms.flatMap((line, index) =>
            line.id !== target.id && line.roomId !== null
              ? [
                  {
                    roomIndex: index + 1,
                    number: rooms?.find((room) => room.id === line.roomId)?.number ?? "—",
                  },
                ]
              : [],
          ) ?? [])
      : [];
  const eligibleCount = [...roomProblems.values()].filter((problem) => problem === null).length;

  function selectStay(stay: ReservationStay) {
    if (assign.isPending) return;
    assign.reset();
    assignedLines.current.clear();
    setTarget(stay);
  }

  const cancel = useCallback(() => {
    if (pending) return;
    resetAssignment();
    assignedLines.current.clear();
    setTarget(null);
  }, [pending, resetAssignment]);

  useEffect(() => {
    if (!target || pending) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      cancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [target, pending, cancel]);

  async function assignRoom(id: string) {
    const room = rooms?.find((item) => item.id === id);
    if (!target || !room || !ready || assign.isPending || roomProblems.get(room.id) !== null)
      return;
    try {
      await assign.mutateAsync({ target, roomId: room.id });
      toast.add({
        title: "Habitación asignada",
        description: `${target.guestName} tiene asignada la habitación ${room.number}.`,
        type: "success",
        timeout: 5000,
      });
      assignedLines.current.add(target.id);
      // Keep a group together: continue with the reservation's next reserved room.
      const next = latestUnassigned.current.find(
        (stay) =>
          stay.reservationId === target.reservationId && !assignedLines.current.has(stay.id),
      );
      setTarget(next ?? null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudo asignar la habitación.";
      toast.add({
        title: "No se pudo asignar la habitación",
        description:
          message === "room is already assigned for those dates"
            ? "Esta habitación acaba de asignarse a otra reserva. Elige otra habitación."
            : message === "room is closed for those dates"
              ? "Esta habitación está cerrada durante la estancia. Elige otra habitación."
              : message,
        type: "error",
        priority: "high",
        timeout: 7000,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reservations"] }),
        queryClient.invalidateQueries({ queryKey: ["room-closures"] }),
        queryClient.invalidateQueries({ queryKey: ["rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar"] }),
      ]);
    }
  }

  return {
    target,
    checking,
    ready,
    eligibleCount,
    roomProblems,
    groupAssignments,
    pending: assign.isPending,
    error: queryError
      ? translateError(queryError)
      : staleTarget
        ? assignmentProblemLabels[staleTarget]
        : null,
    saveError: assign.error ? translateError(assign.error.message) : null,
    selectStay,
    assignRoom,
    cancel,
  };
}
