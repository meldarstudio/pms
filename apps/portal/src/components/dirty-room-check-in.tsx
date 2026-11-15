import { useConfirmation } from "@/lib/use-confirmation";
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
  const { value: dirtyRooms, request, close } = useConfirmation<string[]>();

  async function confirm(detail: ReservationDetail, status: Status) {
    if (status !== "checked_in" || detail.status === "checked_in") return true;
    const dirty = detail.rooms
      .filter((room) => room.roomNumber && room.housekeepingStatus === "dirty")
      .map((room) => room.roomNumber!);
    if (dirty.length === 0) return true;
    return request(dirty);
  }

  const dialog = (
    <AlertDialog
      open={dirtyRooms !== null}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <AlertDialogContent className="flex max-h-[90dvh] flex-col overflow-hidden">
        <AlertDialogHeader className="min-h-0 overflow-y-auto">
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
        <AlertDialogFooter className="shrink-0">
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
