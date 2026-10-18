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
import { ChoiceField } from "@/components/workflow-fields";
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

const pageSize = 50;

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
    queryKey: ["reservations", "search", q, search.status, search.checkIn, search.page],
    queryFn: ({ signal }) =>
      searchReservations(
        {
          q: q || undefined,
          status: search.status === "all" ? undefined : search.status,
          checkIn: search.checkIn,
          offset: search.page * pageSize,
          limit: pageSize,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const rows = query.data ?? [];
  const busy = query.isFetching || search.q !== q;
  const missingSetup = useMissingSetup();

  if (missingSetup) return <SetupRequired missing={missingSetup} />;

  function open(id: string) {
    setTarget(null);
    onOpenReservation(id);
  }

  function setStatus(value: string) {
    const status = reservationStatusOptions.find((option) => option.value === value);
    if (!status) return;
    onSearchChange({ status: status.value, page: 0 });
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 overflow-y-auto p-4 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Reservas</h1>
      <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.2fr)_220px] md:items-start">
        <DateField
          id={arrivalId}
          label="Check-in"
          value={parseISO(search.checkIn)}
          onChange={(date) =>
            onSearchChange({
              checkIn: format(date, "yyyy-MM-dd"),
              page: 0,
            })
          }
        />
        <Field>
          <FieldLabel htmlFor={guestId}>Huésped o código</FieldLabel>
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
                  Cambia el check-in, la búsqueda o el estado, o crea una nueva reserva.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : rows.length > 0 ? (
            <Table className={cn(busy && "opacity-60")} aria-busy={busy || undefined}>
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
                      {formatMoney(Math.abs(row.balanceCents), row.currency)}
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
            disabled={rows.length < pageSize || query.isFetching}
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
