import { useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { toast } from "sonner";
import { GuestCount } from "@/components/guest-count";
import { Button } from "@/components/ui/button";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { ReservationDetail } from "@/lib/api";
import { translateError } from "@/lib/errors";
import { useRoomTypes } from "@/lib/queries";
import { unsavedMessage, type useReservationCommands } from "@/lib/reservation-commands";
import { submitForm } from "@/lib/reservation-form";
import { capacityMessage } from "@/lib/reservation-form-schemas";

type Room = ReservationDetail["rooms"][number];
type Counts = Pick<Room, "adults" | "children">;

export function RoomOccupancyForm({
  room,
  commands,
  Footer,
  children: prices,
  onSwitchRoom,
  onEditEnd,
}: {
  room: Room;
  commands: ReturnType<typeof useReservationCommands>;
  Footer: ComponentType<ComponentProps<"div">>;
  children: ReactNode;
  onSwitchRoom: () => void;
  onEditEnd: () => void;
}) {
  const [draft, setDraft] = useState<{ room: Room; counts: Partial<Counts> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { adults = room.adults, children = room.children } = draft?.counts ?? {};
  const types = useRoomTypes();
  const type = types.data?.find((item) => item.id === room.roomTypeId);
  const maxAdults = Math.min(100, type?.maxAdults ?? 100);
  const maxChildren = Math.min(100, type?.maxChildren ?? 100);
  const moved = Boolean(
    draft && (room.roomId !== draft.room.roomId || room.roomTypeId !== draft.room.roomTypeId),
  );
  const overCapacity = adults > maxAdults || children > maxChildren;
  const message = moved
    ? translateError("room assignment changed")
    : draft && overCapacity
      ? capacityMessage
      : error;
  const { send, saving } = commands;

  function changeCount(key: keyof Counts, value: number) {
    setError(null);
    setDraft((current) => {
      const counts = { ...current?.counts, [key]: value === room[key] ? undefined : value };
      return counts.adults === undefined && counts.children === undefined
        ? null
        : { room: current?.room ?? room, counts };
    });
  }

  function reset() {
    setDraft(null);
    setError(null);
    onEditEnd();
  }

  async function save() {
    if (saving || moved || !draft || overCapacity) return;
    setError(null);
    const original = draft.room;
    const result = await send([
      {
        type: "edit-room",
        lineId: original.id,
        expectedRoomId: original.roomId,
        room: {
          roomId: original.roomId,
          roomTypeId: original.roomTypeId,
          ...draft.counts,
        },
      },
    ]);
    if (result.status !== "saved") {
      setError(unsavedMessage(result));
      return;
    }
    toast.success("Ocupación actualizada");
    reset();
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => void submitForm(event, save)}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-4 px-4 py-4">
          <section className="flex flex-col gap-2.5">
            <h3 className="text-sm font-medium">Ocupación</h3>
            <FieldGroup className="grid grid-cols-2 gap-3">
              <GuestCount
                label="Adultos"
                value={adults}
                min={1}
                max={maxAdults}
                disabled={saving || moved}
                onChange={(value) => changeCount("adults", value)}
              />
              <GuestCount
                label="Niños"
                value={children}
                min={0}
                max={maxChildren}
                disabled={saving || moved}
                onChange={(value) => changeCount("children", value)}
              />
            </FieldGroup>
          </section>
          <Separator />
          {prices}
        </div>
      </div>
      <Footer className="shrink-0 flex-row flex-wrap border-t px-4 py-3 [&>button]:flex-1">
        {message && (
          <FieldError className="w-full" role="alert">
            {message}
          </FieldError>
        )}
        {draft ? (
          <>
            <Button type="button" variant="ghost" disabled={saving} onClick={reset}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || moved || overCapacity}>
              {saving && <Spinner data-icon="inline-start" />}
              Guardar
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" disabled={saving} onClick={onSwitchRoom}>
            Cambiar asignación
          </Button>
        )}
      </Footer>
    </form>
  );
}
