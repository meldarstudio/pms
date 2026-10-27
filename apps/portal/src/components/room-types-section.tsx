import { Fragment } from "react";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import type { ConfigurationEditorEvents } from "@/components/configuration-draft";
import { PageError, StaleDataNotice } from "@/components/page-error";
import { RoomTypeEditor } from "@/components/room-type-editor";
import { SettingRow } from "@/components/setting-row";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { Room, RoomType } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useRooms, useRoomTypes } from "@/lib/queries";

/** Opening values for one room-type editor; a missing type creates a new one. */
export type RoomTypeEditorTarget = { type?: RoomType; rooms: Room[] };

export function RoomTypesSection({
  editor,
  onOpen,
  onTypeSaved,
  ...events
}: {
  editor: RoomTypeEditorTarget | null;
  onOpen: (editor: RoomTypeEditorTarget) => void;
  onTypeSaved: (type: RoomType, rooms: Room[]) => void;
} & ConfigurationEditorEvents) {
  const types = useRoomTypes();
  const rooms = useRooms();
  // Snapshot opening values: background reads must not replace an editor draft.
  function openType(type?: RoomType) {
    onOpen({ type, rooms: (rooms.data ?? []).filter((room) => room.roomTypeId === type?.id) });
  }
  function retry() {
    if (types.error) void types.refetch();
    if (rooms.error) void rooms.refetch();
  }
  return (
    <>
      {(types.error || rooms.error) && types.data && rooms.data && (
        <StaleDataNotice
          error={types.error ?? rooms.error}
          onRetry={retry}
          detail="Tus cambios sin guardar se conservan."
        />
      )}
      {editor ? (
        <RoomTypeEditor
          type={editor.type}
          rooms={editor.rooms}
          allRooms={rooms.data ?? []}
          onTypeSaved={onTypeSaved}
          {...events}
        />
      ) : types.isPending || rooms.isPending ? (
        <div aria-label="Cargando habitaciones" aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : !types.data || !rooms.data ? (
        <PageError error={types.error ?? rooms.error} onRetry={retry} />
      ) : (
        <div className="min-w-0 border bg-muted/15">
          {types.data.map((type, index) => (
            <Fragment key={type.id}>
              {index > 0 && <Separator />}
              <SettingRow
                title={type.name}
                description={`${rooms.data.filter((room) => room.roomTypeId === type.id).length} habitaciones · hasta ${type.maxAdults} ${type.maxAdults === 1 ? "adulto" : "adultos"} y ${type.maxChildren} ${type.maxChildren === 1 ? "niño" : "niños"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatMoney(type.baseRateCents)} / noche
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${type.name}`}
                    onClick={() => openType(type)}
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
              </SettingRow>
            </Fragment>
          ))}
          {types.data.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Aún no hay tipos de habitación</EmptyTitle>
                <EmptyDescription>
                  Crea un tipo y agrega sus números cuando quieras.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => openType()}>
                  Crear el primer tipo
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              <Separator />
              <SettingRow title="Agregar tipo" description="Define otra tarifa base y capacidad.">
                <Button variant="ghost" onClick={() => openType()}>
                  <PlusIcon data-icon="inline-start" />
                  Agregar
                </Button>
              </SettingRow>
            </>
          )}
        </div>
      )}
    </>
  );
}
