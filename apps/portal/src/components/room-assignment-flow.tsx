import { differenceInCalendarDays, parseISO } from "date-fns";
import { BedDoubleIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DirtyRoomBadge } from "@/components/dirty-room-badge";
import type { HousekeepingStatus, Room } from "@/lib/api";
import { format } from "@/lib/dates";
import type { ReservationStay } from "@/lib/room-assignment";
import type { useRoomAssignment } from "@/lib/use-room-assignment";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

function assignmentStayLabel(stay: ReservationStay) {
  const nights = differenceInCalendarDays(parseISO(stay.checkOut), parseISO(stay.checkIn));
  return `${format(parseISO(stay.checkIn), "d MMM")} al ${format(parseISO(stay.checkOut), "d MMM yyyy")} · ${nights} ${nights === 1 ? "noche" : "noches"}`;
}

export function assignmentTitle(target: ReservationStay | null, loading: boolean, count: number) {
  return target ? "Elegir habitación" : `Sin asignar · ${loading ? "…" : count}`;
}

export function groupRoomLabel(stay: ReservationStay) {
  return `Habitación ${stay.roomIndex} de ${stay.roomCount}`;
}

function reservedRoomLabel(stay: ReservationStay, typeNames: Map<string, string>) {
  const typeName = typeNames.get(stay.roomTypeId) ?? "Habitación";
  return stay.roomCount > 1 ? `${typeName} · ${groupRoomLabel(stay)}` : typeName;
}

export type RoomAssignmentStepsProps = {
  stays: ReservationStay[];
  rooms: (Room & { housekeepingStatus: HousekeepingStatus })[] | null;
  typeNames: Map<string, string>;
  loading: boolean;
  listError: string | null;
  assignment: ReturnType<typeof useRoomAssignment>;
  onSelectStay: (stay: ReservationStay) => void;
  onRetry: () => void;
  onRetryAssignment: () => void;
  onHighlightRoom?: (roomId: string | null) => void;
};

/** The unassigned list and room picker shared by the desktop panel and the mobile sheet. */
export function RoomAssignmentSteps({
  stays,
  rooms,
  typeNames,
  loading,
  listError,
  assignment,
  onSelectStay,
  onRetry,
  onRetryAssignment,
  onHighlightRoom,
}: RoomAssignmentStepsProps) {
  const { today } = usePropertyCalendar();
  const { target, checking, ready, pending, eligibleCount, groupAssignments } = assignment;
  const error = assignment.error ?? assignment.saveError;
  // Staff read floors and neighbours from the room number, so keep numeric order.
  const availableRooms = ready
    ? (rooms ?? [])
        .filter(
          (room) =>
            room.roomTypeId === target?.roomTypeId && assignment.roomIssues.get(room.id) === null,
        )
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    : [];
  // The status is what staff marked now; it only matters for a stay that has begun.
  const showDirty = !!target && target.checkIn <= today;

  if (target) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5 border p-2.5">
          <p className="font-medium">{target.guestName}</p>
          <p>{reservedRoomLabel(target, typeNames)}</p>
          <p className="text-muted-foreground">{assignmentStayLabel(target)}</p>
          {groupAssignments.length > 0 && (
            <ul aria-label="Habitaciones ya asignadas" className="mt-1 text-muted-foreground">
              {groupAssignments.map((item) => (
                <li key={item.roomIndex}>
                  Habitación {item.roomIndex} → {item.number}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p role="status" className="text-muted-foreground">
          {pending
            ? "Asignando habitación…"
            : checking
              ? "Consultando habitaciones para toda la estancia…"
              : ready
                ? `${eligibleCount} ${eligibleCount === 1 ? "habitación disponible" : "habitaciones disponibles"} para toda la estancia.`
                : "No se pudo confirmar la disponibilidad."}
        </p>
        {error && (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-destructive">{error}</p>
            {assignment.error && (
              <Button variant="outline" disabled={pending} onClick={onRetryAssignment}>
                Consultar de nuevo
              </Button>
            )}
          </div>
        )}
        {availableRooms.length > 0 && (
          <ul className="flex flex-col border" onMouseLeave={() => onHighlightRoom?.(null)}>
            {availableRooms.map((room, index) => {
              const showDirtyRoom = showDirty && room.housekeepingStatus === "dirty";
              return (
                <li key={room.id}>
                  {index > 0 && <Separator />}
                  <button
                    type="button"
                    aria-label={`Asignar ${target.guestName} a habitación ${room.number}, ${target.checkIn} al ${target.checkOut}${showDirtyRoom ? ", sucia" : ""}`}
                    disabled={pending}
                    onClick={() => void assignment.assignRoom(room.id)}
                    onMouseEnter={() => onHighlightRoom?.(room.id)}
                    onFocus={() => onHighlightRoom?.(room.id)}
                    onBlur={() => onHighlightRoom?.(null)}
                    className="flex w-full cursor-pointer items-center gap-2 p-2.5 text-left outline-none enabled:hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-default disabled:text-muted-foreground"
                  >
                    <BedDoubleIcon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">Habitación {room.number}</span>
                        {showDirtyRoom ? <DirtyRoomBadge /> : null}
                      </span>
                      <span className="text-muted-foreground">Disponible</span>
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {ready && eligibleCount === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Sin habitaciones disponibles</EmptyTitle>
              <EmptyDescription>
                No hay habitaciones de este tipo disponibles para toda la estancia. Vuelve a la
                lista para seleccionar otra habitación reservada.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    );
  }

  if (listError) {
    return (
      <div role="alert" className="flex flex-col gap-2">
        <p className="text-destructive">{listError}</p>
        <Button variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex flex-col gap-2"
        aria-label="Cargando habitaciones reservadas sin asignar"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (stays.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Todo asignado</EmptyTitle>
          <EmptyDescription>
            Todas las habitaciones reservadas en estas fechas están asignadas.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col border">
      {stays.map((stay, index) => (
        <li key={stay.id}>
          {index > 0 && <Separator />}
          <button
            type="button"
            disabled={pending}
            onClick={() => onSelectStay(stay)}
            className="flex w-full cursor-pointer items-center gap-2 p-2.5 text-left outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{stay.guestName}</span>
              <span className="text-muted-foreground">{reservedRoomLabel(stay, typeNames)}</span>
              <span className="text-muted-foreground">{assignmentStayLabel(stay)}</span>
              {stay.checkIn === today && <span className="font-medium">Llega hoy</span>}
            </span>
            <ChevronRightIcon className="size-4 shrink-0" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
