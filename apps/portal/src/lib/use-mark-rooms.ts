import { toast } from "sonner";
import type { HousekeepingMarkInput, HousekeepingStatus } from "@/lib/api";
import { useMarkHousekeeping } from "@/lib/queries";
import { toastError } from "@/lib/toast";

export type MarkableRoom = { id: string; number: string; housekeepingStatus: HousekeepingStatus };

export type MarkRooms = (rooms: MarkableRoom[], status: HousekeepingStatus) => Promise<boolean>;

function markedTitle(rooms: MarkableRoom[], status: HousekeepingStatus) {
  const clean = status === "clean";
  if (rooms.length === 1) {
    return `Habitación ${rooms[0]!.number} ${clean ? "lista" : "marcada sucia"}`;
  }
  return `${rooms.length} habitaciones ${clean ? "listas" : "marcadas sucias"}`;
}

export function useMarkRooms(): MarkRooms {
  const mutation = useMarkHousekeeping();
  const save = (marks: HousekeepingMarkInput[]) =>
    mutation.mutateAsync(marks).then(
      () => true,
      (cause: unknown) => {
        toastError("No se pudo guardar la limpieza", cause);
        return false;
      },
    );
  return async (rooms, status) => {
    const previous = rooms.map((room) => ({ roomId: room.id, status: room.housekeepingStatus }));
    if (!(await save(rooms.map((room) => ({ roomId: room.id, status }))))) return false;
    toast(markedTitle(rooms, status), {
      action: { label: "Deshacer", onClick: () => void save(previous) },
    });
    return true;
  };
}
