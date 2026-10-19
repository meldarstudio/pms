import { useDeferredValue, useEffect, useId, useState } from "react";
import { format } from "date-fns";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  BedDoubleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LogInIcon,
  LogOutIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { RoomBookingDialog, type BookingTarget } from "@/components/room-booking-dialog";
import { DateField } from "@/components/date-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { dateOnlyCarrier, propertyToday } from "@/lib/property-calendar";
import { addDateLabelDays } from "@/lib/dates";
import { useMissingSetup, useReservationList } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import {
  occupantsLabel,
  reservationStatusLabel,
  roomsLabel,
  stayDateLabel,
} from "@/lib/reservation-list";
import {
  viewDefaults,
  type ReservationsSearch,
  type ReservationView,
  type ReservationSort,
} from "@/lib/route-search";
import {
  ReservationStatusSelection,
  reservationStatusValues,
} from "@/lib/reservation-status-selection";

const sortOptions: { value: ReservationSort; label: string }[] = [
  { value: "checkIn", label: "Check-in" },
  { value: "checkOut", label: "Check-out" },
  { value: "guestName", label: "Contacto" },
  { value: "balance", label: "Saldo" },
];

const views = [
  { value: "arrivals", label: "Llegadas", icon: LogInIcon },
  { value: "departures", label: "Salidas", icon: LogOutIcon },
  { value: "in-house", label: "En casa", icon: BedDoubleIcon },
  { value: "all", label: "Todas las reservas", icon: SearchIcon },
] as const;

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
  const filtersId = useId();
  const [target, setTarget] = useState<BookingTarget | null>(null);
  const q = useDeferredValue(search.q);
  const selectedStatuses = ReservationStatusSelection.parse(search.statuses);
  const query = useReservationList({
    q: q.trim() || undefined,
    statuses: selectedStatuses.toQuery(),
    checkIn: search.view === "arrivals" ? search.day : undefined,
    checkOut: search.view === "departures" ? search.day : undefined,
    balance: search.balance === "all" ? undefined : search.balance,
    assignment: search.assignment === "all" ? undefined : search.assignment,
    sort: search.sort,
    direction: search.direction,
    offset: search.page * search.size,
    limit: search.size,
  });
  const rows = query.data?.rows ?? [];
  const busy = query.isFetching || search.q !== q;
  const missingSetup = useMissingSetup();
  const total = query.data?.total ?? 0;
  const offset = query.data?.offset ?? 0;
  useEffect(() => {
    if (!query.data || query.isPlaceholderData || query.isFetching || query.isError) return;
    const lastPage = Math.max(0, Math.ceil(query.data.total / search.size) - 1);
    if (search.page > lastPage) onSearchChange({ page: lastPage });
  }, [
    query.data,
    query.isPlaceholderData,
    query.isFetching,
    query.isError,
    search.page,
    search.size,
    onSearchChange,
  ]);

  if (missingSetup) return <SetupRequired missing={missingSetup} />;

  function open(id: string) {
    setTarget(null);
    onOpenReservation(id);
  }

  function refine(next: Partial<ReservationsSearch>) {
    onSearchChange({ ...next, page: 0 });
  }

  const balanceOptions = [
    { value: "all", label: "Cualquier saldo" },
    { value: "outstanding", label: "Saldo pendiente" },
    { value: "settled", label: "Saldada" },
    { value: "credit", label: "Con crédito" },
  ];
  const assignmentOptions = [
    { value: "all", label: "Cualquier asignación" },
    { value: "assigned", label: "Todas asignadas" },
    { value: "unassigned", label: "Con habitaciones sin asignar" },
  ];
  const filterCount =
    Number(search.balance !== "all") +
    Number(search.assignment !== "all") +
    Number(selectedStatuses.toSearch() !== viewDefaults(search.view).statuses);
  const rangeLabel = query.isPending
    ? "Buscando reservas…"
    : query.isError && !query.data
      ? "No se pudieron cargar las reservas"
      : `${rows.length ? `${offset + 1}–${offset + rows.length}` : "0"} de ${total} ${total === 1 ? "reserva" : "reservas"}${busy ? " · Actualizando…" : ""}`;

  function sortHeader(sort: ReservationSort, label: string) {
    const active = search.sort === sort;
    const Icon = active
      ? search.direction === "asc"
        ? ArrowUpIcon
        : ArrowDownIcon
      : ArrowUpDownIcon;
    return (
      <TableHead
        scope="col"
        className={sort === "balance" ? "text-right" : undefined}
        aria-sort={active ? (search.direction === "asc" ? "ascending" : "descending") : undefined}
      >
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Ordenar por ${label}`}
          onClick={() =>
            refine({ sort, direction: active && search.direction === "asc" ? "desc" : "asc" })
          }
        >
          {label}
          <Icon data-icon="inline-end" aria-hidden="true" />
        </Button>
      </TableHead>
    );
  }

  return (
    <main className="flex min-h-0 w-full flex-col gap-4 overflow-y-auto p-4 lg:p-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Reservas</h1>
          <span className="text-xs text-muted-foreground">Registro operativo</span>
        </div>
        <Button onClick={() => setTarget({ mode: "new" })}>
          <PlusIcon data-icon="inline-start" />
          Nueva reserva
        </Button>
      </header>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b pb-2">
        <Tabs
          className="max-w-full min-w-0"
          value={search.view}
          onValueChange={(value) => {
            const view = value as ReservationView;
            onSearchChange({ view, ...viewDefaults(view), page: 0 });
          }}
        >
          <TabsList
            variant="line"
            aria-label="Vista de reservas"
            className="h-9 max-w-full justify-start overflow-x-auto"
          >
            {views.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-2 px-4">
                <Icon aria-hidden="true" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {search.view === "arrivals" || search.view === "departures" ? (
          <div className="flex flex-wrap items-end gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Día anterior"
              onClick={() => refine({ day: addDateLabelDays(search.day, -1) })}
            >
              <ChevronLeftIcon />
            </Button>
            <div className="w-40">
              <DateField
                id={arrivalId}
                label="Día de operación"
                value={dateOnlyCarrier(search.day, "UTC")}
                onChange={(date) =>
                  refine({
                    day: format(date, "yyyy-MM-dd"),
                  })
                }
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Día siguiente"
              onClick={() => refine({ day: addDateLabelDays(search.day, 1) })}
            >
              <ChevronRightIcon />
            </Button>
            <Button variant="ghost" onClick={() => refine({ day: propertyToday() })}>
              Hoy
            </Button>
          </div>
        ) : (
          <p className="py-2 text-xs text-muted-foreground">
            {search.view === "all"
              ? "Todas las fechas"
              : "Según check-in realizado · incluye estancias vencidas"}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full max-w-sm">
          <Field>
            <FieldLabel htmlFor={guestId} className="sr-only">
              Contacto o código
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                id={guestId}
                placeholder="Buscar contacto o código…"
                value={search.q}
                onChange={(event) => refine({ q: event.target.value })}
              />
              {search.q ? (
                <InputGroupAddon align="inline-end">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Borrar búsqueda"
                    onClick={() => refine({ q: "" })}
                  >
                    <XIcon />
                  </Button>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </Field>
        </div>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                aria-label="Filtros"
                aria-describedby={filterCount ? `${filtersId}-count` : undefined}
              />
            }
          >
            <SlidersHorizontalIcon data-icon="inline-start" />
            Filtros
            {filterCount ? (
              <Badge variant="secondary" className="min-w-5 rounded-full px-1.5" aria-hidden="true">
                {filterCount}
              </Badge>
            ) : null}
          </PopoverTrigger>
          {filterCount ? (
            <span id={`${filtersId}-count`} className="sr-only">
              {filterCount}{" "}
              {filterCount === 1 ? "grupo de filtros modificado" : "grupos de filtros modificados"}
            </span>
          ) : null}
          <PopoverContent
            align="start"
            className="max-h-[min(32rem,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] gap-4 overflow-y-auto p-4"
          >
            <PopoverTitle className="sr-only">Filtros de reservas</PopoverTitle>
            <Button
              variant="ghost"
              size="sm"
              className="self-end"
              disabled={filterCount === 0}
              onClick={() =>
                refine({
                  statuses: viewDefaults(search.view).statuses,
                  balance: "all",
                  assignment: "all",
                })
              }
            >
              <RotateCcwIcon data-icon="inline-start" />
              Restablecer
            </Button>
            <FieldGroup className="gap-4">
              {search.view !== "in-house" ? (
                <FieldSet>
                  <FieldLegend>Estados</FieldLegend>
                  <FieldGroup className="gap-3">
                    {reservationStatusValues.map((status) => {
                      const checked = selectedStatuses.values.includes(status);
                      const disabled = checked && selectedStatuses.values.length === 1;
                      return (
                        <Field
                          key={status}
                          orientation="horizontal"
                          data-disabled={disabled || undefined}
                        >
                          <Checkbox
                            id={`${filtersId}-${status}`}
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              refine({
                                statuses: selectedStatuses.withStatus(status, checked).toSearch(),
                              })
                            }
                          />
                          <FieldLabel htmlFor={`${filtersId}-${status}`}>
                            {reservationStatusLabel(status)}
                          </FieldLabel>
                        </Field>
                      );
                    })}
                  </FieldGroup>
                </FieldSet>
              ) : null}
              <ChoiceField
                label="Saldo"
                value={search.balance}
                options={balanceOptions}
                onChange={(value) => refine({ balance: value as ReservationsSearch["balance"] })}
              />
              <ChoiceField
                label="Asignación"
                value={search.assignment}
                options={assignmentOptions}
                onChange={(value) =>
                  refine({ assignment: value as ReservationsSearch["assignment"] })
                }
              />
            </FieldGroup>
          </PopoverContent>
        </Popover>
        <div className="ml-auto">
          <Popover>
            <PopoverTrigger
              render={<Button variant="ghost" size="sm" aria-label="Ordenar reservas" />}
            >
              <ArrowUpDownIcon data-icon="inline-start" />
              {sortOptions.find((option) => option.value === search.sort)!.label} ·{" "}
              {search.direction === "asc" ? "↑" : "↓"}
            </PopoverTrigger>
            <PopoverContent align="end" className="gap-4 p-4">
              <PopoverTitle>Orden de las reservas</PopoverTitle>
              <FieldGroup className="gap-3">
                <ChoiceField
                  label="Ordenar por"
                  value={search.sort}
                  options={sortOptions}
                  onChange={(sort) => refine({ sort: sort as ReservationSort })}
                />
                <ChoiceField
                  label="Dirección"
                  value={search.direction}
                  options={[
                    { value: "asc", label: "Ascendente" },
                    { value: "desc", label: "Descendente" },
                  ]}
                  onChange={(direction) =>
                    refine({ direction: direction as ReservationsSearch["direction"] })
                  }
                />
              </FieldGroup>
            </PopoverContent>
          </Popover>
        </div>
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
                  Cambia la vista, el día o los filtros, o crea una nueva reserva.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : rows.length > 0 ? (
            <div className="border">
              <Table
                className={cn(busy && "opacity-60")}
                aria-label="Reservas"
                aria-busy={busy || undefined}
              >
                <TableHeader>
                  <TableRow>
                    {sortHeader("guestName", "Contacto")}
                    <TableHead scope="col">Estado</TableHead>
                    <TableHead scope="col">Habitaciones</TableHead>
                    <TableHead scope="col">Ocupantes</TableHead>
                    {sortHeader("checkIn", "Check-in")}
                    {sortHeader("checkOut", "Check-out")}
                    <TableHead scope="col" className="text-right">
                      Total
                    </TableHead>
                    {sortHeader("balance", "Saldo")}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
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
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{row.guestName}</span>
                          <span className="text-xs text-muted-foreground">
                            {row.guest.phone || "Sin teléfono"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "cancelled"
                              ? "destructive"
                              : row.status === "confirmed"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {reservationStatusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            row.rooms.some((room) => room.roomNumber === null) &&
                              "text-assignment-foreground",
                          )}
                        >
                          {roomsLabel(row.rooms)}
                        </span>
                      </TableCell>
                      <TableCell>{occupantsLabel(row.rooms)}</TableCell>
                      <TableCell className="tabular-nums">{stayDateLabel(row.checkIn)}</TableCell>
                      <TableCell className="tabular-nums">{stayDateLabel(row.checkOut)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.totalCents, row.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={cn(
                              "font-medium",
                              row.balanceCents < 0 && "text-credit-foreground",
                            )}
                          >
                            {formatMoney(Math.abs(row.balanceCents), row.currency)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {row.balanceCents > 0
                              ? "Saldo pendiente"
                              : row.balanceCents < 0
                                ? "Crédito"
                                : "Saldada"}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </>
      )}
      <nav
        className="flex flex-wrap items-center justify-between gap-3"
        aria-label="Paginación de reservas"
      >
        <p className="text-xs text-muted-foreground" aria-live="polite" aria-atomic="true">
          {rangeLabel}
        </p>
        <div className="flex items-center gap-2">
          <div className="w-24">
            <ChoiceField
              label="Reservas por página"
              hideLabel
              value={String(search.size)}
              options={[
                { value: "25", label: "25 / pág." },
                { value: "50", label: "50 / pág." },
                { value: "100", label: "100 / pág." },
              ]}
              onChange={(size) => refine({ size: Number(size) as ReservationsSearch["size"] })}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Anterior"
            disabled={search.page === 0 || query.isFetching}
            onClick={() => onSearchChange({ page: search.page - 1 })}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Siguiente"
            disabled={!query.data || offset + rows.length >= total || busy || query.isError}
            onClick={() => onSearchChange({ page: search.page + 1 })}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </nav>
      <RoomBookingDialog target={target} onClose={() => setTarget(null)} onViewReservation={open} />
    </main>
  );
}
