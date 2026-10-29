import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ReservationDetail, WorkflowAction } from "@/lib/api";

const list = new Intl.ListFormat("es", { type: "conjunction" });

type Status = Extract<WorkflowAction, { type: "set-status" }>["status"];

export function useDirtyRoomCheckIn() {
  const [dirtyRooms, setDirtyRooms] = useState<string[] | null>(null);
  const settle = useRef<((proceed: boolean) => void) | null>(null);

  async function confirm(detail: ReservationDetail, status: Status) {
    if (status !== "checked_in" || detail.status === "checked_in") return true;
    const dirty = detail.rooms
      .filter((room) => room.roomNumber && room.housekeepingStatus === "dirty")
      .map((room) => room.roomNumber!);
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
