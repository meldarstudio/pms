import { useEffect, useId, useRef } from "react";
import { ArrowLeftIcon, BedDoubleIcon, ChevronRightIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { assignmentStayLabel } from "@/components/room-assignment-panel";
import type { Room } from "@/lib/api";
import type { ReservationStay } from "@/lib/room-assignment";
import type { useRoomAssignment } from "@/lib/use-room-assignment";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

export function RoomAssignmentSheet({
  open,
  onOpenChange,
  stays,
  rooms,
  typeNames,
  loading,
  listError,
  rangeLabel,
  assignment,
  onRetry,
  onRetryAssignment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stays: ReservationStay[];
  rooms: Room[] | null;
  typeNames: Map<string, string>;
  loading: boolean;
  listError: string | null;
  rangeLabel: string;
  assignment: ReturnType<typeof useRoomAssignment>;
  onRetry: () => void;
  onRetryAssignment: () => void;
}) {
  const { today } = usePropertyCalendar();
  const { target, checking, ready, pending, eligibleCount } = assignment;
  const error = assignment.error ?? assignment.saveError;
  const reasonId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  // The list and picker share a dialog: announce each step without leaving focus
  // on the list item that was just removed (or on a room after a successful save).
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, target?.id]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next, details) => {
        if (pending) {
          details.cancel();
          return;
        }
        if (!next) assignment.cancel();
        onOpenChange(next);
      }}
    >
      <SheetTrigger
        render={<Button variant="outline" className="min-h-11" />}
        aria-label={
          loading ? "Mostrar reservas sin asignar" : `Mostrar reservas sin asignar, ${stays.length}`
        }
      >
        <BedDoubleIcon data-icon="inline-start" />
        Sin asignar · {loading ? "…" : stays.length}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[85dvh] overflow-hidden pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="shrink-0 border-b">
          <div className="flex items-center gap-2">
            {target && (
              <Button
                variant="ghost"
                className="size-11"
                aria-label="Volver a reservas sin asignar"
                disabled={pending}
                onClick={assignment.cancel}
              >
                <ArrowLeftIcon />
              </Button>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <SheetTitle ref={heading} tabIndex={-1}>
                {target ? "Elegir habitación" : `Sin asignar · ${loading ? "…" : stays.length}`}
              </SheetTitle>
              <SheetDescription>
                {target
                  ? "Toca una habitación disponible para asignarla a toda la estancia."
                  : `Estancias entre ${rangeLabel}`}
              </SheetDescription>
            </div>
            <SheetClose
              render={<Button variant="ghost" className="size-11" disabled={pending} />}
              aria-label="Cerrar reservas sin asignar"
            >
              <XIcon />
            </SheetClose>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {target ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 border p-3">
                <p className="font-medium">{target.guestName}</p>
                <p>
                  {typeNames.get(target.roomTypeId) ?? "Habitación"}
                  {target.roomCount > 1
                    ? ` · Habitación ${target.roomIndex} de ${target.roomCount}`
                    : ""}
                </p>
                <p className="text-muted-foreground">{assignmentStayLabel(target)}</p>
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
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={pending}
                      onClick={onRetryAssignment}
                    >
                      Consultar de nuevo
                    </Button>
                  )}
                </div>
              )}
              {ready && (
                <ul className="flex flex-col gap-2">
                  {(rooms ?? [])
                    .filter((room) => room.roomTypeId === target.roomTypeId)
                    .map((room) => {
                      const issue = assignment.roomIssues.get(room.id);
                      return (
                        <li key={room.id}>
                          <button
                            type="button"
                            aria-label={`Asignar ${target.guestName} a habitación ${room.number}, ${target.checkIn} al ${target.checkOut}`}
                            aria-describedby={`${reasonId}-${room.id}`}
                            disabled={pending || issue !== null}
                            onClick={() => void assignment.assignRoom(room.id)}
                            className="flex min-h-16 w-full cursor-pointer items-center gap-3 border p-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:text-muted-foreground"
                          >
                            <BedDoubleIcon className="size-5 shrink-0" aria-hidden="true" />
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="font-medium">Habitación {room.number}</span>
                              <span id={`${reasonId}-${room.id}`} className="text-muted-foreground">
                                {issue ?? "Disponible"}
                              </span>
                            </span>
                            {issue === null && (
                              <ChevronRightIcon className="size-4 shrink-0" aria-hidden="true" />
                            )}
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
                      No hay habitaciones de este tipo disponibles para toda la estancia. Vuelve a
                      la lista para seleccionar otra habitación reservada.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          ) : listError ? (
            <div role="alert" className="flex flex-col gap-2">
              <p className="text-destructive">{listError}</p>
              <Button variant="outline" className="min-h-11" onClick={onRetry}>
                Reintentar
              </Button>
            </div>
          ) : loading ? (
            <div className="flex flex-col gap-2" aria-label="Cargando reservas sin asignar">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
          ) : stays.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Todo asignado</EmptyTitle>
                <EmptyDescription>
                  Todas las habitaciones reservadas en estas fechas están asignadas.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {stays.map((stay) => (
                <li key={stay.id}>
                  <button
                    type="button"
                    onClick={() => assignment.selectStay(stay)}
                    className="flex min-h-24 w-full cursor-pointer items-center gap-3 border p-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">{stay.guestName}</span>
                      <span className="text-muted-foreground">
                        {typeNames.get(stay.roomTypeId) ?? "Habitación"}
                        {stay.roomCount > 1
                          ? ` · Habitación ${stay.roomIndex} de ${stay.roomCount}`
                          : ""}
                      </span>
                      <span className="text-muted-foreground">{assignmentStayLabel(stay)}</span>
                      {stay.checkIn === today && <span className="font-medium">Llega hoy</span>}
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
