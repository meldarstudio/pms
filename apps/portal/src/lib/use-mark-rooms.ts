import type { HousekeepingMarkInput, HousekeepingStatus } from "@/lib/api";
import { useMarkHousekeeping } from "@/lib/queries";
import { toast, toastError } from "@/lib/toast";

/** A room as the page shows it before the mark. */
export type MarkableRoom = { id: string; number: string; housekeepingStatus: HousekeepingStatus };

export type MarkRooms = (rooms: MarkableRoom[], status: HousekeepingStatus) => Promise<boolean>;

function markedTitle(rooms: MarkableRoom[], status: HousekeepingStatus) {
  const clean = status === "clean";
  if (rooms.length === 1) {
    return `Habitación ${rooms[0]!.number} ${clean ? "lista" : "marcada sucia"}`;
  }
  return `${rooms.length} habitaciones ${clean ? "listas" : "marcadas sucias"}`;
}

/**
 * Marks rooms in one request, then offers to undo it by setting each room's own previous
 * status again in one request. Resolves whether the mark saved.
 */
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
    const id = toast.add({
      title: markedTitle(rooms, status),
      actionProps: {
        children: "Deshacer",
        onClick: () => {
          toast.close(id);
          void save(previous);
        },
      },
    });
    return true;
  };
}
