import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Room } from "@/lib/api";
import { useReservations, useRoomClosures } from "@/lib/queries";
import { useRoomAssignmentCommand } from "@/lib/reservation-commands";
import {
  assignmentProblemLabels,
  roomProblem,
  targetProblem,
  type ReservationStay,
  type RoomProblem,
} from "@/lib/assignment-availability";
import { toast } from "@/lib/toast";
import { translateError } from "@/lib/errors";

const conflictCopy = new Map([
  [
    "room is already assigned for those dates",
    "Esta habitación acaba de asignarse a otra reserva. Elige otra habitación.",
  ],
  [
    "room is closed for those dates",
    "Esta habitación está cerrada durante la estancia. Elige otra habitación.",
  ],
]);

export function useRoomAssignment(rooms: Room[] | null, unassigned: ReservationStay[]) {
  const queryClient = useQueryClient();
  const { assign, saving: pending } = useRoomAssignmentCommand();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [target, setTarget] = useState<ReservationStay | null>(null);
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
    const context = {
      reservations: reservations.data ?? [],
      closures: closures.data ?? [],
      ignoredReservedRoomIds: new Set([target.id]),
    };
    for (const room of rooms ?? []) roomProblems.set(room.id, roomProblem(room, target, context));
  }
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
    if (pending) return;
    setSaveError(null);
    assignedLines.current.clear();
    setTarget(stay);
  }

  const cancel = useCallback(() => {
    if (pending) return;
    setSaveError(null);
    assignedLines.current.clear();
    setTarget(null);
  }, [pending]);

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
    if (!target || !room || !ready || pending || roomProblems.get(room.id) !== null) return;
    setSaveError(null);
    const result = await assign(target, room.id);
    if (result.status === "saved") {
      toast.add({
        title: "Habitación asignada",
        description: `${target.guestName} tiene asignada la habitación ${room.number}.`,
        type: "success",
        timeout: 5000,
      });
      assignedLines.current.add(target.id);
      const next = latestUnassigned.current.find(
        (stay) =>
          stay.reservationId === target.reservationId && !assignedLines.current.has(stay.id),
      );
      setTarget(next ?? null);
      return;
    }
    const message =
      result.status === "failed" ? result.message : "No se pudo asignar la habitación.";
    const code = result.status === "failed" ? result.code : undefined;
    setSaveError(message);
    toast.add({
      title: "No se pudo asignar la habitación",
      description: (code && conflictCopy.get(code)) ?? message,
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

  return {
    target,
    checking,
    ready,
    eligibleCount,
    roomProblems,
    groupAssignments,
    pending,
    error: queryError
      ? translateError(queryError)
      : staleTarget
        ? assignmentProblemLabels[staleTarget]
        : null,
    saveError,
    selectStay,
    assignRoom,
    cancel,
  };
}
