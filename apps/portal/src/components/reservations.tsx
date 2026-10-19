import { useDeferredValue, useId, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { PlusIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import { RoomBookingDialog, type BookingTarget } from "@/components/room-booking-dialog";
import { stayColors } from "@/components/room-calendar";
import { DateField } from "@/components/date-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SetupRequired } from "@/components/setup-required";
import { searchReservations } from "@/lib/api";
import { useMissingSetup } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import {
  occupantsLabel,
  reservationStatusLabel,
  reservationStatusOptions,
  roomsLabel,
  stayDateLabel,
} from "@/lib/reservation-list";
import type { ReservationsSearch } from "@/lib/route-search";

export function Reservations({
  search,
  onSearchChange,
  onOpenReservation,
}: {
  search: ReservationsSearch;
  onSearchChange: (search: Partial<ReservationsSearch>) => void;
  onOpenReservation: (id: string) => void;
}) {
  const arrivalId = useId();
  const guestId = useId();
  const [target, setTarget] = useState<BookingTarget | null>(null);
  const q = useDeferredValue(search.q);
  const query = useQuery({
    queryKey: ["reservations", "search", search, q],
    queryFn: ({ signal }) =>
      searchReservations(
        {
          q: q || undefined,
          status: search.status,
          checkIn: search.view === "arrivals" ? search.checkIn : undefined,
          checkOut: search.view === "departures" ? search.checkIn : undefined,
          balance: search.balance === "all" ? undefined : search.balance,
          assignment: search.assignment === "all" ? undefined : search.assignment,
          sort: search.sort,
          direction: search.direction,
          offset: search.page * search.pageSize,
          limit: search.pageSize,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];
  const busy = query.isFetching || search.q !== q;
  const missingSetup = useMissingSetup();

  if (missingSetup) return <SetupRequired missing={missingSetup} />;

  function open(id: string) {
    setTarget(null);
    onOpenReservation(id);
  }

  const total = query.data?.total ?? 0;
  const visibleFrom = total ? search.page * search.pageSize + 1 : 0;
  const visibleTo = Math.min((search.page + 1) * search.pageSize, total);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 overflow-y-auto p-4 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Reservas</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Vistas de reservas">
        {(["all", "arrivals", "departures", "inHouse"] as const).map((view) => (
          <Button
            key={view}
            variant={search.view === view ? "default" : "outline"}
            onClick={() =>
              onSearchChange({
                view,
                status: [],
                sort: view === "all" ? "checkIn" : view === "inHouse" ? "checkOut" : "guestName",
                direction: view === "all" ? "desc" : "asc",
                page: 0,
              })
            }
          >
            {view === "all"
              ? "Todas"
              : view === "arrivals"
                ? "Llegadas"
                : view === "departures"
                  ? "Salidas"
                  : "En casa"}
          </Button>
        ))}
      </nav>
      <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.2fr)_220px] md:items-start">
        {search.view === "arrivals" || search.view === "departures" ? (
          <DateField
            id={arrivalId}
            label={search.view === "arrivals" ? "Check-in" : "Check-out"}
            value={parseISO(search.checkIn)}
            onChange={(date) =>
              onSearchChange({
                checkIn: format(date, "yyyy-MM-dd"),
                page: 0,
              })
            }
          />
        ) : null}
        <Field>
          <FieldLabel htmlFor={guestId}>Contacto o código</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id={guestId}
              value={search.q}
              onChange={(event) => onSearchChange({ q: event.target.value, page: 0 })}
            />
          </InputGroup>
        </Field>
        {search.view !== "inHouse" ? (
          <Field>
            <FieldLabel htmlFor="reservation-status">Estado</FieldLabel>
            <select
              id="reservation-status"
              multiple
              value={search.status}
              className="h-10 rounded-md border bg-background px-3"
              onChange={(event) =>
                onSearchChange({
                  status: Array.from(
                    event.currentTarget.selectedOptions,
                    (option) => option.value as (typeof reservationStatusOptions)[number]["value"],
                  ).filter((value) => value !== "all"),
                  page: 0,
                })
              }
            >
              {reservationStatusOptions
                .filter((option) => option.value !== "all")
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
      </FieldGroup>
      <details>
        <summary className="w-fit cursor-pointer text-sm font-medium">Filtros</summary>
        <FieldGroup className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="balance-filter">Saldo</FieldLabel>
            <select
              id="balance-filter"
              value={search.balance}
              className="h-10 rounded-md border bg-background px-3"
              onChange={(event) =>
                onSearchChange({
                  balance: event.target.value as ReservationsSearch["balance"],
                  page: 0,
                })
              }
            >
              <option value="all">Todos</option>
              <option value="outstanding">Saldo pendiente</option>
              <option value="settled">Saldado</option>
              <option value="credit">Crédito</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="assignment-filter">Asignación</FieldLabel>
            <select
              id="assignment-filter"
              value={search.assignment}
              className="h-10 rounded-md border bg-background px-3"
              onChange={(event) =>
                onSearchChange({
                  assignment: event.target.value as ReservationsSearch["assignment"],
                  page: 0,
                })
              }
            >
              <option value="all">Todas</option>
              <option value="assigned">Asignadas</option>
              <option value="unassigned">Con habitaciones sin asignar</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="reservation-sort">Ordenar por</FieldLabel>
            <select
              id="reservation-sort"
              value={search.sort}
              className="h-10 rounded-md border bg-background px-3"
              onChange={(event) =>
                onSearchChange({ sort: event.target.value as ReservationsSearch["sort"], page: 0 })
              }
            >
              <option value="checkIn">Check-in</option>
              <option value="checkOut">Check-out</option>
              <option value="guestName">Contacto</option>
              <option value="balance">Saldo</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="reservation-direction">Dirección</FieldLabel>
            <select
              id="reservation-direction"
              value={search.direction}
              className="h-10 rounded-md border bg-background px-3"
              onChange={(event) =>
                onSearchChange({
                  direction: event.target.value as ReservationsSearch["direction"],
                  page: 0,
                })
              }
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="reservation-page-size">Filas por página</FieldLabel>
            <select
              id="reservation-page-size"
              value={search.pageSize}
              className="h-10 rounded-md border bg-background px-3"
              onChange={(event) =>
                onSearchChange({
                  pageSize: Number(event.target.value) as ReservationsSearch["pageSize"],
                  page: 0,
                })
              }
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </Field>
          <Button
            variant="outline"
            className="self-end"
            onClick={() =>
              onSearchChange({ q: "", status: [], balance: "all", assignment: "all", page: 0 })
            }
          >
            Borrar filtros
          </Button>
        </FieldGroup>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {query.isPending
            ? "Buscando reservas…"
            : `${visibleFrom}–${visibleTo} de ${total} reservas${busy ? " · Actualizando…" : ""}`}
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
                  Cambia el check-in, la búsqueda o el estado, o crea una nueva reserva.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : rows.length > 0 ? (
            <Table className={cn(busy && "opacity-60")} aria-busy={busy || undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Habitaciones</TableHead>
                  <TableHead>Ocupantes</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    aria-label={`Abrir reserva de ${row.guestName}`}
                    onClick={() => open(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        open(row.id);
                      }
                    }}
                  >
                    <TableCell>
                      <Badge
                        variant={row.status === "cancelled" ? "destructive" : "secondary"}
                        className={cn(
                          "w-[6.625rem] justify-center",
                          row.status === "cancelled"
                            ? "border-destructive/20"
                            : stayColors[row.status],
                        )}
                      >
                        {reservationStatusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{row.guestName}</TableCell>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell>{roomsLabel(row.rooms)}</TableCell>
                    <TableCell>{occupantsLabel(row.rooms)}</TableCell>
                    <TableCell className="tabular-nums">{stayDateLabel(row.checkIn)}</TableCell>
                    <TableCell className="tabular-nums">{stayDateLabel(row.checkOut)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.totalCents, row.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.balanceCents > 0
                        ? `Pendiente ${formatMoney(row.balanceCents, row.currency)}`
                        : row.balanceCents < 0
                          ? `Crédito ${formatMoney(-row.balanceCents, row.currency)}`
                          : "Saldado"}
                    </TableCell>
                  </TableRow>
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
            disabled={visibleTo >= total || query.isFetching}
            onClick={() => onSearchChange({ page: search.page + 1 })}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
      <RoomBookingDialog target={target} onClose={() => setTarget(null)} onViewReservation={open} />
    </main>
  );
}
