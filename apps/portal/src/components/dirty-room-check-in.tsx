import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getHousekeeping, type ReservationDetail } from "@/lib/api";
import { housekeepingQueryKey } from "@/lib/queries";

const list = new Intl.ListFormat("es", { type: "conjunction" });

/**
 * Asks before checking a guest into a room marked dirty. Staff may continue; the
 * warning never blocks check-in. Returns the confirmation step and its dialog.
 */
export function useDirtyRoomCheckIn() {
  const client = useQueryClient();
  const [dirtyRooms, setDirtyRooms] = useState<string[] | null>(null);
  const settle = useRef<((proceed: boolean) => void) | null>(null);

  async function dirtyRoomNumbers(detail: ReservationDetail) {
    const assigned = detail.rooms.filter((room) => room.roomId && room.roomNumber);
    if (assigned.length === 0) return [];
    // The reservation may have been open while a housekeeper marked its room on
    // another device, so read the current status and fall back to the loaded one.
    const board = await client
      .fetchQuery({
        queryKey: housekeepingQueryKey,
        queryFn: ({ signal }) => getHousekeeping(signal),
        staleTime: 0,
      })
      .catch(() => null);
    const current = new Map(board?.rooms.map((room) => [room.id, room.housekeepingStatus]));
    return assigned
      .filter((room) => (current.get(room.roomId!) ?? room.housekeepingStatus) === "dirty")
      .map((room) => room.roomNumber!);
  }

  async function confirm(detail: ReservationDetail, status: string) {
    if (detail.status !== "confirmed" || status !== "checked_in") return true;
    const dirty = await dirtyRoomNumbers(detail);
    if (dirty.length === 0) return true;
    settle.current?.(false);
    return new Promise<boolean>((resolve) => {
      settle.current = resolve;
      setDirtyRooms(dirty);
    });
  }

  function close(proceed: boolean) {
    settle.current?.(proceed);
    settle.current = null;
    setDirtyRooms(null);
  }

  const dialog = (
    <AlertDialog
      open={dirtyRooms !== null}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {dirtyRooms?.length === 1
              ? `La habitación ${dirtyRooms[0]} está sucia`
              : `Las habitaciones ${list.format(dirtyRooms ?? [])} están sucias`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {dirtyRooms?.length === 1
              ? "Limpieza aún no la marcó como limpia."
              : "Limpieza aún no las marcó como limpias."}{" "}
            Puedes hacer el check-in de todos modos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Volver
          </Button>
          <Button onClick={() => close(true)}>Hacer check-in</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog] as const;
}
