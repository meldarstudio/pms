import { Fragment, useDeferredValue, useId, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { PlusIcon, SearchIcon } from "lucide-react"
import { cn } from "cn"
import {
  RoomBookingDialog,
  type BookingTarget,
} from "@/components/room-booking-dialog"
import { DateField } from "@/components/date-field"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ChoiceField, TextField } from "@/components/workflow-fields"
import { searchReservations } from "@/lib/api"
import { formatMoney } from "@/lib/money"
import {
  arrivalBandLabel,
  groupAdjacentByCheckIn,
  occupantsLabel,
  reservationStatusLabel,
  reservationStatusOptions,
  roomsLabel,
  stayDateLabel,
} from "@/lib/reservation-list"
import { utcToday } from "@/lib/reservation-form-schemas"
import type { ReservationsSearch } from "@/lib/route-search"

const pageSize = 50

export function Reservations({
  search,
  onSearchChange,
  onOpenReservation,
}: {
  search: ReservationsSearch
  onSearchChange: (search: Partial<ReservationsSearch>) => void
  onOpenReservation: (id: string) => void
}) {
  const arrivalId = useId()
  const [target, setTarget] = useState<BookingTarget | null>(null)
  const q = useDeferredValue(search.q)
  const today = utcToday()
  const query = useQuery({
    queryKey: [
      "reservations",
      "search",
      q,
      search.status,
      search.checkIn,
      search.page,
    ],
    queryFn: ({ signal }) =>
      searchReservations(
        {
          q: q || undefined,
          status: search.status === "all" ? undefined : search.status,
          checkIn: search.checkIn || undefined,
          offset: search.page * pageSize,
          limit: pageSize,
        },
        signal
      ),
    placeholderData: keepPreviousData,
  })
  const rows = query.data ?? []
  const groups = groupAdjacentByCheckIn(rows)
  const busy = query.isFetching || search.q !== q

  function open(id: string) {
    setTarget(null)
    onOpenReservation(id)
  }

  function setStatus(value: string) {
    const status = reservationStatusOptions.find(
      (option) => option.value === value
    )
    if (!status) return
    onSearchChange({ status: status.value, page: 0 })
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 overflow-y-auto p-4 md:p-8">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Recepción
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Reservas y estancias
        </h1>
        <p className="mt-1 text-muted-foreground">
          Revisa quién llega y abre la reserva.
        </p>
      </div>
      <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.2fr)_220px] md:items-start">
        <div className="flex flex-col gap-2">
          <DateField
            id={arrivalId}
            label="Llegada"
            value={search.checkIn ? parseISO(search.checkIn) : null}
            timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
            onChange={(date) =>
              onSearchChange({
                checkIn: format(date, "yyyy-MM-dd"),
                page: 0,
              })
            }
          />
          <ButtonGroup>
            <Button
              type="button"
              size="sm"
              variant={search.checkIn === today ? "secondary" : "outline"}
              aria-pressed={search.checkIn === today}
              onClick={() => onSearchChange({ checkIn: today, page: 0 })}
            >
              Hoy
            </Button>
            <Button
              type="button"
              size="sm"
              variant={search.checkIn === "" ? "secondary" : "outline"}
              aria-pressed={search.checkIn === ""}
              onClick={() => onSearchChange({ checkIn: "", page: 0 })}
            >
              Todas las fechas
            </Button>
          </ButtonGroup>
        </div>
        <TextField
          label="Huésped o código"
          value={search.q}
          onChange={(value) => onSearchChange({ q: value, page: 0 })}
        />
        <ChoiceField
          label="Estado"
          value={search.status}
          options={reservationStatusOptions}
          onChange={setStatus}
        />
      </FieldGroup>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {query.isPending
            ? "Buscando reservas…"
            : `${rows.length === 1 ? "1 reserva" : `${rows.length} reservas`}${busy ? " · Actualizando…" : ""}`}
        </p>
        <Button onClick={() => setTarget({ mode: "new" })}>
          <PlusIcon data-icon="inline-start" />
          Nueva reserva
        </Button>
      </div>
      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {query.isError ? (
            <div className="flex flex-col items-start gap-3">
              <FieldError>{query.error.message}</FieldError>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : null}
          {!query.isError && rows.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <SearchIcon />
                <EmptyTitle>No se encontraron reservas</EmptyTitle>
                <EmptyDescription>
                  Cambia la llegada, la búsqueda o el estado, o crea una nueva
                  reserva.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : rows.length > 0 ? (
            <Table
              className={cn(busy && "opacity-60")}
              aria-busy={busy || undefined}
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Huésped</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Habitaciones</TableHead>
                  <TableHead>Ocupantes</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group, index) => (
                  <Fragment key={`${group.checkIn}-${index}`}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={9} className="font-medium">
                        {arrivalBandLabel(group.checkIn)}
                      </TableCell>
                    </TableRow>
                    {group.rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        tabIndex={0}
                        aria-label={`Abrir reserva de ${row.guestName}`}
                        onClick={() => open(row.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            open(row.id)
                          }
                        }}
                      >
                        <TableCell>
                          <Badge variant="secondary">
                            {reservationStatusLabel(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.guestName}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.code}
                        </TableCell>
                        <TableCell>{roomsLabel(row.rooms)}</TableCell>
                        <TableCell>{occupantsLabel(row.rooms)}</TableCell>
                        <TableCell className="tabular-nums">
                          {stayDateLabel(row.checkIn)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {stayDateLabel(row.checkOut)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(row.totalCents, row.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="tabular-nums">
                            {formatMoney(
                              Math.abs(row.balanceCents),
                              row.currency
                            )}
                          </div>
                          {row.balanceCents < 0 ? (
                            <div className="text-xs text-muted-foreground">
                              Saldo a favor
                            </div>
                          ) : row.balanceCents === 0 ? (
                            <div className="text-xs text-muted-foreground">
                              Saldado
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </>
      )}
      {search.page > 0 || rows.length > 0 ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={search.page === 0 || query.isFetching}
            onClick={() => onSearchChange({ page: search.page - 1 })}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={rows.length < pageSize || query.isFetching}
            onClick={() => onSearchChange({ page: search.page + 1 })}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
      <RoomBookingDialog
        target={target}
        timeZone="UTC"
        onClose={() => setTarget(null)}
        onViewReservation={open}
      />
    </main>
  )
}
