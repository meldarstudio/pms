import { differenceInCalendarDays, parseISO, startOfToday } from "date-fns"
import { CheckIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { ReservationStay } from "@/lib/room-assignment"
import { format } from "@/lib/dates"

export function assignmentStayLabel(stay: ReservationStay) {
  const nights = differenceInCalendarDays(
    parseISO(stay.checkOut),
    parseISO(stay.checkIn)
  )
  return `${format(parseISO(stay.checkIn), "d MMM")} al ${format(parseISO(stay.checkOut), "d MMM yyyy")} · ${nights} ${nights === 1 ? "noche" : "noches"}`
}

type RoomAssignmentPanelProps = {
  stays: ReservationStay[]
  typeNames: Map<string, string>
  loading: boolean
  listError: string | null
  rangeLabel: string
  target: ReservationStay | null
  checking: boolean
  ready: boolean
  eligibleCount: number
  pending: boolean
  error: string | null
  onSelect: (stay: ReservationStay) => void
  onCancel: () => void
  onClose: () => void
  onRetry: () => void
}

export function RoomAssignmentPanel({
  stays,
  typeNames,
  loading,
  listError,
  rangeLabel,
  target,
  checking,
  ready,
  eligibleCount,
  pending,
  error,
  onSelect,
  onCancel,
  onClose,
  onRetry,
}: RoomAssignmentPanelProps) {
  const today = format(startOfToday(), "yyyy-MM-dd")

  return (
    <section
      id="unassigned-panel"
      aria-labelledby="unassigned-heading"
      className="flex h-full min-h-0 flex-col text-xs"
    >
      <div className="flex items-start justify-between gap-2 border-b p-3">
        <div>
          <h2 id="unassigned-heading" className="font-medium">
            Sin asignar · {loading ? "…" : stays.length}
          </h2>
          <p className="mt-1 text-muted-foreground">
            Estancias entre {rangeLabel}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Cerrar reservas sin asignar"
          disabled={pending}
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {listError ? (
          <div role="alert" className="space-y-2">
            <p className="text-destructive">{listError}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Reintentar
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-2" aria-label="Cargando reservas sin asignar">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        ) : stays.length === 0 ? (
          <p className="py-4 text-muted-foreground">
            Todas las habitaciones reservadas en estas fechas están asignadas.
          </p>
        ) : (
          <ul className="space-y-2">
            {stays.map((stay) => {
              const selected = target?.id === stay.id
              return (
                <li key={stay.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={pending}
                    onClick={() => onSelect(stay)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-1 border p-2.5 text-left outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50",
                      selected && "border-booking-foreground/40 bg-booking/40"
                    )}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2">
                      <span
                        className="min-w-0 flex-1 truncate font-medium"
                        title={stay.guestName}
                      >
                        {stay.guestName}
                      </span>
                      {selected ? (
                        <CheckIcon className="size-3.5 shrink-0" />
                      ) : null}
                    </span>
                    <span className="text-muted-foreground">
                      {typeNames.get(stay.roomTypeId) ?? "Habitación"}
                      {stay.roomCount > 1
                        ? ` · Habitación ${stay.roomIndex} de ${stay.roomCount}`
                        : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {assignmentStayLabel(stay)}
                    </span>
                    {stay.checkIn === today ? (
                      <span className="font-medium">Llega hoy</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {target ? (
        <div className="space-y-3 border-t p-3">
          <div className="space-y-1">
            <p className="font-medium">
              Asignar habitación a {target.guestName}
            </p>
            <p className="text-muted-foreground">
              {typeNames.get(target.roomTypeId) ?? "Habitación"}
              {target.roomCount > 1
                ? ` · Habitación ${target.roomIndex} de ${target.roomCount}`
                : ""}
            </p>
            <p className="text-muted-foreground">
              {assignmentStayLabel(target)}
            </p>
          </div>
          <p role="status" className="text-muted-foreground">
            {pending
              ? "Asignando habitación…"
              : checking
                ? "Consultando habitaciones para toda la estancia…"
                : ready && eligibleCount === 0
                  ? "No hay habitaciones de este tipo disponibles para toda la estancia."
                  : ready
                    ? `${eligibleCount} ${eligibleCount === 1 ? "habitación disponible" : "habitaciones disponibles"}. Haz clic en la barra punteada para asignarla.`
                    : "No se pudo confirmar la disponibilidad."}
          </p>
          {error ? (
            <div role="alert" className="space-y-2">
              <p className="text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={onRetry}
              >
                Consultar de nuevo
              </Button>
            </div>
          ) : null}
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            Cancelar asignación
          </Button>
        </div>
      ) : null}
    </section>
  )
}
