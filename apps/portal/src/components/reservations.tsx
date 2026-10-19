import { useDeferredValue, useEffect, useId, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { PlusIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import { RoomBookingDialog, type BookingTarget } from "@/components/room-booking-dialog";
import { stayColors } from "@/components/room-calendar";
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
import { propertyToday } from "@/lib/property-calendar";
import { useMissingSetup, useReservationList } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import {
  occupantsLabel,
  reservationStatusLabel,
  reservationStatusOptions,
  roomsLabel,
  stayDateLabel,
} from "@/lib/reservation-list";
import { viewDefaults, type ReservationsSearch, type ReservationView } from "@/lib/route-search";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [target, setTarget] = useState<BookingTarget | null>(null);
  const q = useDeferredValue(search.q);
  const query = useReservationList({
    q: q || undefined,
    statuses: search.statuses === "all" ? undefined : search.statuses,
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

  const selectedStatuses = search.statuses === "all" ? [] : search.statuses.split(",");
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
  const chips: { label: string; remove: () => void }[] = [
    ...(search.q ? [{ label: `Búsqueda: ${search.q}`, remove: () => refine({ q: "" }) }] : []),
    ...(search.view !== "in-house"
      ? selectedStatuses.map((status) => ({
          label: reservationStatusLabel(status),
          remove: () =>
            refine({
              statuses: selectedStatuses.filter((value) => value !== status).join(",") || "all",
            }),
        }))
      : []),
    ...(search.statuses === "all" && search.view !== "all"
      ? [
          {
            label: "Todos los estados",
            remove: () => refine({ statuses: viewDefaults(search.view).statuses }),
          },
        ]
      : []),
    ...(search.balance !== "all"
      ? [
          {
            label: balanceOptions.find((option) => option.value === search.balance)!.label,
            remove: () => refine({ balance: "all" }),
          },
        ]
      : []),
    ...(search.assignment !== "all"
      ? [
          {
            label: assignmentOptions.find((option) => option.value === search.assignment)!.label,
            remove: () => refine({ assignment: "all" }),
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 overflow-y-auto p-4 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Reservas</h1>
      <Tabs
        value={search.view}
        onValueChange={(value) => {
          const view = value as ReservationView;
          onSearchChange({ view, ...viewDefaults(view), page: 0 });
        }}
      >
        <TabsList aria-label="Vista de reservas">
          <TabsTrigger value="all">Todas las reservas</TabsTrigger>
          <TabsTrigger value="arrivals">Llegadas</TabsTrigger>
          <TabsTrigger value="departures">Salidas</TabsTrigger>
          <TabsTrigger value="in-house">En casa</TabsTrigger>
        </TabsList>
      </Tabs>
      <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.2fr)_220px] md:items-start">
        {search.view === "arrivals" || search.view === "departures" ? (
          <div className="flex flex-col gap-2">
            <DateField
              id={arrivalId}
              label="Día de operación"
              value={parseISO(search.day)}
              onChange={(date) =>
                onSearchChange({
                  day: format(date, "yyyy-MM-dd"),
                  page: 0,
                })
              }
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  onSearchChange({
                    day: format(addDays(parseISO(search.day), -1), "yyyy-MM-dd"),
                    page: 0,
                  })
                }
              >
                Día anterior
              </Button>
              <Button
                variant="outline"
                onClick={() => onSearchChange({ day: propertyToday(), page: 0 })}
              >
                Hoy
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  onSearchChange({
                    day: format(addDays(parseISO(search.day), 1), "yyyy-MM-dd"),
                    page: 0,
                  })
                }
              >
                Día siguiente
              </Button>
            </div>
          </div>
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
        <Button
          variant="outline"
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          Filtros
        </Button>
      </FieldGroup>
      {filtersOpen ? (
        <section id={filtersId} aria-label="Filtros de reservas">
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            {search.view !== "in-house" ? (
              <FieldSet>
                <FieldLegend>Estados</FieldLegend>
                <FieldGroup>
                  <Field orientation="horizontal">
                    <Checkbox
                      id={`${filtersId}-all`}
                      checked={search.statuses === "all"}
                      onCheckedChange={() => refine({ statuses: "all" })}
                    />
                    <FieldLabel htmlFor={`${filtersId}-all`}>Todos los estados</FieldLabel>
                  </Field>
                  {reservationStatusOptions
                    .filter((option) => option.value !== "all")
                    .map((option) => (
                      <Field key={option.value} orientation="horizontal">
                        <Checkbox
                          id={`${filtersId}-${option.value}`}
                          checked={selectedStatuses.includes(option.value)}
                          onCheckedChange={(checked) =>
                            refine({
                              statuses:
                                (checked
                                  ? [...selectedStatuses, option.value]
                                  : selectedStatuses.filter((value) => value !== option.value)
                                ).join(",") || "all",
                            })
                          }
                        />
                        <FieldLabel htmlFor={`${filtersId}-${option.value}`}>
                          {option.label}
                        </FieldLabel>
                      </Field>
                    ))}
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
        </section>
      ) : null}
      <div className="flex flex-wrap items-center gap-2" aria-label="Filtros activos">
        {chips.map((chip) => (
          <Badge key={chip.label} variant="secondary">
            {chip.label}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Quitar filtro: ${chip.label}`}
              onClick={chip.remove}
            >
              ×
            </Button>
          </Badge>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            refine({
              q: "",
              balance: "all",
              assignment: "all",
              statuses: viewDefaults(search.view).statuses,
            })
          }
        >
          Limpiar filtros
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {query.isPending
            ? "Buscando reservas…"
            : query.isError && !query.data
              ? "No se pudieron cargar las reservas"
              : `${rows.length ? `${offset + 1}–${offset + rows.length}` : "0"} de ${total} ${total === 1 ? "reserva" : "reservas"}${busy ? " · Actualizando…" : ""}`}
        </p>
        <Button onClick={() => setTarget({ mode: "new" })}>
          <PlusIcon data-icon="inline-start" />
          Nueva reserva
        </Button>
      </div>
      <FieldGroup className="grid gap-4 md:grid-cols-3">
        <ChoiceField
          label="Ordenar por"
          value={search.sort}
          options={[
            { value: "checkIn", label: "Check-in" },
            { value: "checkOut", label: "Check-out" },
            { value: "guestName", label: "Contacto" },
            { value: "balance", label: "Saldo" },
          ]}
          onChange={(sort) => refine({ sort: sort as ReservationsSearch["sort"] })}
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
        <ChoiceField
          label="Reservas por página"
          value={String(search.size)}
          options={[
            { value: "25", label: "25" },
            { value: "50", label: "50" },
            { value: "100", label: "100" },
          ]}
          onChange={(size) => refine({ size: Number(size) as ReservationsSearch["size"] })}
        />
      </FieldGroup>
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
                        ? "Pendiente"
                        : row.balanceCents < 0
                          ? "Crédito"
                          : "Saldada"}
                      {" · "}
                      {formatMoney(Math.abs(row.balanceCents), row.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </>
      )}
      <nav className="flex justify-end gap-2" aria-label="Paginación de reservas">
        <Button
          variant="outline"
          disabled={search.page === 0 || query.isFetching}
          onClick={() => onSearchChange({ page: search.page - 1 })}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          disabled={!query.data || offset + rows.length >= total || busy || query.isError}
          onClick={() => onSearchChange({ page: search.page + 1 })}
        >
          Siguiente
        </Button>
      </nav>
      <RoomBookingDialog target={target} onClose={() => setTarget(null)} onViewReservation={open} />
    </main>
  );
}
