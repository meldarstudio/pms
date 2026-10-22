import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import type { Room } from "@/lib/api";
import { useAssignRoom, useReservations, useRoomClosures } from "@/lib/queries";
import {
  assignmentTargetIssue,
  roomAssignmentIssue,
  type ReservationStay,
} from "@/lib/room-assignment";
import { toast } from "@/lib/toast";
import { translateError } from "@/lib/errors";

export function useRoomAssignment(rooms: Room[] | null) {
  const queryClient = useQueryClient();
  const assign = useAssignRoom();
  const { isPending: pending, reset: resetAssignment } = assign;
  const [target, setTarget] = useState<ReservationStay | null>(null);
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
  const targetIssue =
    target && !checking && !queryError && reservations.data
      ? assignmentTargetIssue(target, reservations.data)
      : null;
  const ready = Boolean(target && !checking && !queryError && !targetIssue);
  const roomIssues = new Map<string, string | null>();
  if (target && ready) {
    for (const room of rooms ?? []) {
      roomIssues.set(
        room.id,
        translateNullableIssue(
          roomAssignmentIssue(room, target, reservations.data ?? [], closures.data ?? []),
        ),
      );
    }
  }
  const eligibleCount = [...roomIssues.values()].filter((issue) => issue === null).length;

  function selectStay(stay: ReservationStay) {
    if (assign.isPending) return;
    assign.reset();
    setTarget(stay);
  }

  const cancel = useCallback(() => {
    if (pending) return;
    resetAssignment();
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
    if (!target || !room || !ready || assign.isPending || roomIssues.get(room.id) !== null) return;
    try {
      await assign.mutateAsync({
        reservationId: target.reservationId,
        lineId: target.id,
        roomId: room.id,
      });
      toast.add({
        title: "Habitación asignada",
        description: `${target.guestName} tiene asignada la habitación ${room.number}.`,
        type: "success",
        timeout: 5000,
      });
      setTarget(null);
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
    roomIssues,
    pending: assign.isPending,
    error: translateNullableIssue(queryError ?? targetIssue),
    saveError: translateNullableIssue(assign.error?.message ?? null),
    selectStay,
    assignRoom,
    cancel,
  };
}

function translateNullableIssue(issue: string | null) {
  return issue === null ? null : translateError(issue);
}
