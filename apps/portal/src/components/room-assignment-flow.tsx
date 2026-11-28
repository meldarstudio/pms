import { differenceInCalendarDays, parseISO } from "date-fns";
import { ChevronRightIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DirtyRoomBadge } from "@/components/dirty-room-badge";
import type { HousekeepingRoom, Room } from "@/lib/api";
import { format } from "@/lib/dates";
import type { ReservationStay } from "@/lib/assignment-availability";
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
  rooms: (Room & Pick<HousekeepingRoom, "roomTypeName" | "housekeepingStatus">)[] | null;
  typeNames: Map<string, string>;
  loading: boolean;
  listError: string | null;
  assignment: ReturnType<typeof useRoomAssignment>;
  onSelectStay: (stay: ReservationStay) => void;
  onRetry: () => void;
  onRetryAssignment: () => void;
  onHighlightRoom?: (roomId: string | null) => void;
};

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
  const optionId = useId();
  const { today } = usePropertyCalendar();
  const { target, checking, ready, pending, eligibleCount, groupAssignments } = assignment;
  const switching = target != null && target.roomId !== null;
  const availabilityError = assignment.error ?? (rooms === null ? listError : null);
  const error = availabilityError ?? assignment.saveError;
  const availableRooms = ready
    ? (rooms ?? [])
        .filter(
          (room) =>
            room.roomTypeId === target?.roomTypeId && assignment.roomProblems.get(room.id) === null,
        )
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    : [];
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
            ? switching
              ? "Cambiando habitación…"
              : "Asignando habitación…"
            : checking && !availabilityError
              ? "Consultando habitaciones para toda la estancia…"
              : ready
                ? `${eligibleCount} ${eligibleCount === 1 ? "habitación disponible" : "habitaciones disponibles"} para toda la estancia.`
                : "No se pudo confirmar la disponibilidad."}
        </p>
        {error && (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-destructive">{error}</p>
            {availabilityError && (
              <Button variant="outline" disabled={pending} onClick={onRetryAssignment}>
                Consultar de nuevo
              </Button>
            )}
          </div>
        )}
        {checking && !availabilityError && assignment.expectedCount > 0 && (
          <AvailableRoomsSkeleton count={assignment.expectedCount} />
        )}
        {availableRooms.length > 0 && (
          <ul className="flex flex-col border" onMouseLeave={() => onHighlightRoom?.(null)}>
            {availableRooms.map((room, index) => {
              const showDirtyRoom = showDirty && room.housekeepingStatus === "dirty";
              const typeDescriptionId = `${optionId}-${index}`;
              return (
                <li key={room.id}>
                  {index > 0 && <Separator />}
                  <button
                    type="button"
                    aria-label={`${switching ? "Cambiar" : "Asignar"} ${target.guestName} a habitación ${room.number}, ${target.checkIn} al ${target.checkOut}${showDirtyRoom ? ", sucia" : ""}`}
                    aria-describedby={typeDescriptionId}
                    disabled={pending}
                    onClick={() => void assignment.assignRoom(room.id)}
                    onMouseEnter={() => onHighlightRoom?.(room.id)}
                    onFocus={() => onHighlightRoom?.(room.id)}
                    onBlur={() => onHighlightRoom?.(null)}
                    className="flex min-h-11 w-full cursor-pointer items-center gap-2 p-2.5 text-left outline-none enabled:hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-default disabled:text-muted-foreground"
                  >
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
                      <span className="font-medium wrap-anywhere">Habitación {room.number}</span>
                      <span
                        id={typeDescriptionId}
                        className="min-w-0 wrap-anywhere text-muted-foreground"
                      >
                        {room.roomTypeName}
                      </span>
                      {showDirtyRoom ? <DirtyRoomBadge /> : null}
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
                {switching
                  ? "No hay otras habitaciones de este tipo disponibles para toda la estancia."
                  : "No hay habitaciones de este tipo disponibles para toda la estancia. Vuelve a la lista para seleccionar otra habitación reservada."}
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

  if (loading) return <UnassignedStaysSkeleton />;

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

function TextBar({ className }: { className: string }) {
  return <Skeleton className={`inline-block h-lh align-top ${className}`} />;
}

function AvailableRoomsSkeleton({ count }: { count: number }) {
  return (
    <ul
      aria-busy="true"
      aria-label="Cargando habitaciones disponibles"
      className="flex flex-col border"
    >
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          {index > 0 && <Separator />}
          <div className="flex min-h-11 items-center gap-2 p-2.5">
            <span className="flex min-w-0 flex-1 items-center">
              <TextBar className="w-22" />
            </span>
            <ChevronRightIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function UnassignedStaysSkeleton() {
  return (
    <ul
      aria-busy="true"
      aria-label="Cargando habitaciones reservadas sin asignar"
      className="flex flex-col border"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <li key={index}>
          {index > 0 && <Separator />}
          <div className="flex items-center gap-2 p-2.5">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">
                <TextBar className="w-32" />
              </span>
              <span>
                <TextBar className="w-20" />
              </span>
              <span>
                <TextBar className="w-40" />
              </span>
            </span>
            <ChevronRightIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
