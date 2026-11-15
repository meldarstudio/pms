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
import { toast } from "sonner";
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
  const { assign, saving: commandPending } = useRoomAssignmentCommand();
  const [selection, setSelection] = useState<
    | { kind: "idle" }
    | { kind: "selected"; target: ReservationStay; error: string | null }
    | { kind: "assigning"; target: ReservationStay }
  >({ kind: "idle" });
  const target = selection.kind !== "idle" ? selection.target : null;
  const pending = commandPending || selection.kind === "assigning";
  const assigning = useRef(false);
  const saveError = selection.kind === "selected" ? selection.error : null;
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
  const context = target && {
    reservations: reservations.data ?? [],
    closures: closures.data ?? [],
    ignoredReservedRoomIds: new Set([target.id]),
  };
  if (target && context && ready) {
    for (const room of rooms ?? []) roomProblems.set(room.id, roomProblem(room, target, context));
  }
  const cachedCheck =
    checking &&
    reservations.data &&
    closures.data &&
    !reservations.isPlaceholderData &&
    !closures.isPlaceholderData;
  const typeRooms = target
    ? (rooms ?? []).filter((room) => room.roomTypeId === target.roomTypeId)
    : [];
  const expectedCount =
    target && context && cachedCheck
      ? typeRooms.filter((room) => roomProblem(room, target, context) === null).length
      : Math.min(3, rooms ? typeRooms.length : 3);
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
    if (assigning.current || pending) return;
    assignedLines.current.clear();
    setSelection({ kind: "selected", target: stay, error: null });
  }

  const cancel = useCallback(() => {
    if (assigning.current || pending) return;
    assignedLines.current.clear();
    setSelection({ kind: "idle" });
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
    if (
      !target ||
      !room ||
      !ready ||
      assigning.current ||
      pending ||
      roomProblems.get(room.id) !== null
    )
      return;
    assigning.current = true;
    setSelection({ kind: "assigning", target });
    try {
      const result = await assign(target, room.id);
      if (result.status === "saved") {
        toast.success("Habitación asignada", {
          description: `${target.guestName} tiene asignada la habitación ${room.number}.`,
        });
        assignedLines.current.add(target.id);
        const next = latestUnassigned.current.find(
          (stay) =>
            stay.reservationId === target.reservationId && !assignedLines.current.has(stay.id),
        );
        setSelection(next ? { kind: "selected", target: next, error: null } : { kind: "idle" });
        return;
      }
      const message =
        result.status === "failed" ? result.message : "No se pudo asignar la habitación.";
      const code = result.status === "failed" ? result.code : undefined;
      toast.error("No se pudo asignar la habitación", {
        description: (code && conflictCopy.get(code)) ?? message,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reservations"] }),
        queryClient.invalidateQueries({ queryKey: ["room-closures"] }),
        queryClient.invalidateQueries({ queryKey: ["rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar"] }),
        queryClient.invalidateQueries({ queryKey: ["availability"] }),
      ]);
      setSelection({ kind: "selected", target, error: message });
    } finally {
      assigning.current = false;
      setSelection((current) =>
        current.kind === "assigning"
          ? { kind: "selected", target: current.target, error: null }
          : current,
      );
    }
  }

  return {
    target,
    checking,
    ready,
    eligibleCount,
    expectedCount,
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
