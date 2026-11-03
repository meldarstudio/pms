import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { format } from "date-fns";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  BedDoubleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  LogInIcon,
  LogOutIcon,
  SearchIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { RoomBookingDialog, type BookingTarget } from "@/components/room-booking-dialog";
import { PageHeaderActions } from "@/components/page-header-actions";
import { NewReservationButton } from "@/components/new-reservation-button";
import { RefreshButton } from "@/components/refresh-button";
import { primaryActionClearance } from "@/components/page-primary-action";
import { DateField } from "@/components/date-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ReservationListFilters } from "@/components/reservation-list-filters";
import { useIsMobile } from "@/hooks/use-mobile";
import { ReservationStatusBadge } from "@/components/reservation-status-badge";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PageError, StaleDataNotice } from "@/components/page-error";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { occupantsLabel, roomsLabel, roomsSummary, stayDateLabel } from "@/lib/reservation-list";
import {
  viewDefaults,
  type ReservationsSearch,
  type ReservationView,
  type ReservationSort,
} from "@/lib/route-search";
import { ReservationStatusSelection } from "@/lib/reservation-status-selection";
import { phoneDisplay } from "@/lib/phone";

const sortOptions: { value: ReservationSort; label: string }[] = [
  { value: "checkIn", label: "Check-in" },
  { value: "checkOut", label: "Check-out" },
  { value: "guestName", label: "Contacto principal" },
  { value: "balance", label: "Saldo" },
];

const views = [
  { value: "arrivals", label: "Llegadas", icon: LogInIcon },
  { value: "departures", label: "Salidas", icon: LogOutIcon },
  { value: "in-house", label: "En casa", icon: BedDoubleIcon },
  { value: "all", label: "Todas las reservas", icon: SearchIcon },
] as const;

function ReservationRooms({
  rooms,
  tooltip = false,
}: {
  rooms: readonly { roomNumber: string | null }[];
  tooltip?: boolean;
}) {
  const { numbers, listed, unlisted, unassignedLabel } = roomsSummary(rooms);
  if (!unlisted) return roomsLabel(rooms);
  const unlistedLabel = `+${unlisted}`;
  return (
    <>
      <span aria-hidden="true">
        {listed.join(", ")}{" "}
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger render={<span className="underline decoration-dotted" />}>
              {unlistedLabel}
            </TooltipTrigger>
            <TooltipContent>{numbers.join(", ")}</TooltipContent>
          </Tooltip>
        ) : (
          unlistedLabel
        )}
        {unassignedLabel ? ` · ${unassignedLabel}` : null}
      </span>
      <span className="sr-only">{roomsLabel(rooms)}</span>
    </>
  );
}

function ReservationBalance({
  balanceCents,
  currency,
  inline = false,
}: {
  balanceCents: number;
  currency: string;
  inline?: boolean;
}) {
  const { label, Icon, amountColor, labelColor } =
    balanceCents > 0
      ? {
          label: "Saldo pendiente",
          Icon: CircleAlertIcon,
          amountColor: "text-destructive",
          labelColor: "text-destructive",
        }
      : balanceCents < 0
        ? {
            label: "Por devolver",
            Icon: WalletIcon,
            amountColor: "text-credit-foreground",
            labelColor: "text-credit-foreground",
          }
        : {
            label: "Saldada",
            Icon: CircleCheckIcon,
            amountColor: undefined,
            labelColor: "text-booking-foreground",
          };

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5",
        inline && "w-full flex-row-reverse items-center justify-between gap-3",
      )}
    >
      <span className={cn("font-medium", amountColor)}>
        {formatMoney(Math.abs(balanceCents), currency)}
      </span>
      <span
        className={cn(
          "inline-flex items-center justify-end gap-1",
          inline ? "text-xs" : "text-[10px]",
          labelColor,
        )}
      >
        <Icon aria-hidden="true" className="size-3 shrink-0" />
        {label}
      </span>
    </div>
  );
}

function ReservationCardsSkeleton() {
  return (
    <ul aria-label="Cargando reservas" aria-busy className="flex flex-col gap-3">
      {Array.from({ length: 3 }, (_, index) => (
        <li key={index}>
          <Card>
            <CardHeader className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-5 w-32" />
              <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((column) => (
                  <div key={column} className="flex flex-col gap-px">
                    <Skeleton className="h-5 w-14" />
                    <Skeleton className="h-4.5 w-20" />
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Skeleton className="h-5 w-full" />
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ReservationRowsSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 8 }, (_, index) => (
        <TableRow key={index}>
          <TableCell>
            <div className="flex flex-col gap-0.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-10" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-4 w-12" />
          </TableCell>
          <TableCell>
            <div className="flex flex-col items-end gap-0.5">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-3 w-24" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

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
  const [draftQ, setDraftQ] = useState(search.q);
  const [appliedQ, setAppliedQ] = useState(search.q);
  if (appliedQ !== search.q) {
    setAppliedQ(search.q);
    setDraftQ(search.q);
  }
  const cardsId = useId();
  const mobile = useIsMobile();
  const mainRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const scrollToPage = useRef<number | null>(null);
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
  const [refreshing, setRefreshing] = useState(false);
  function refresh() {
    setRefreshing(true);
    void query.refetch().finally(() => setRefreshing(false));
  }
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

  useEffect(() => {
    if (
      scrollToPage.current !== search.page ||
      query.isFetching ||
      query.isPlaceholderData ||
      !query.data
    )
      return;
    scrollToPage.current = null;
    const main = mainRef.current;
    const results = resultsRef.current;
    if (main && results) {
      results.querySelector<HTMLElement>('[role="button"]')?.focus({ preventScroll: true });
      main.scrollTo({
        top:
          main.scrollTop + results.getBoundingClientRect().top - main.getBoundingClientRect().top,
      });
    }
  }, [search.page, query.isFetching, query.isPlaceholderData, query.data]);

  if (missingSetup) return <SetupRequired missing={missingSetup} />;

  const isDayView = search.view === "arrivals" || search.view === "departures";
  const goToToday = () => refine({ day: propertyToday() });
  const refreshButton = (
    <RefreshButton
      refreshing={refreshing}
      disabled={!query.data || query.isFetching}
      size={mobile ? "icon-sm" : "icon"}
      onRefresh={refresh}
    />
  );
  const headerRefresh = mobile ? refreshButton : null;
  const toolbarRefresh = mobile ? null : refreshButton;
  const pickerToday = mobile ? goToToday : undefined;
  const standaloneToday = mobile ? null : (
    <Button variant="ghost" onClick={goToToday}>
      Hoy
    </Button>
  );

  function open(id: string) {
    setTarget(null);
    onOpenReservation(id);
  }

  function changePage(page: number) {
    if (mobile) scrollToPage.current = page;
    onSearchChange({ page });
  }

  function refine(next: Partial<ReservationsSearch>) {
    scrollToPage.current = null;
    onSearchChange({ ...next, page: 0 });
  }

  const tableHeader = (
    <TableHeader>
      <TableRow>
        {sortHeader("guestName", "Contacto principal")}
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
  );

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
        className={cn(sort === "balance" && "text-right")}
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
    <main
      ref={mainRef}
      className={cn(
        "flex min-h-0 w-full flex-col gap-4 overflow-y-auto p-4 lg:p-6",
        primaryActionClearance,
      )}
    >
      <PageHeaderActions>
        {headerRefresh}
        <NewReservationButton scrollRef={mainRef} onClick={() => setTarget({ mode: "new" })} />
      </PageHeaderActions>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <Tabs
          className="w-full max-w-full min-w-0 md:w-auto"
          value={search.view}
          onValueChange={(value) => {
            scrollToPage.current = null;
            const view = value as ReservationView;
            onSearchChange({ view, ...viewDefaults(view), page: 0 });
          }}
        >
          <TabsList
            aria-label="Vista de reservas"
            className="grid w-full max-w-full auto-rows-7 grid-cols-2 justify-start gap-1 group-data-horizontal/tabs:h-auto md:inline-flex md:w-fit md:gap-0 md:group-data-horizontal/tabs:h-8 md:overflow-x-auto"
          >
            {views.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-w-0 whitespace-normal md:min-w-auto md:whitespace-nowrap"
              >
                <Icon aria-hidden="true" className="hidden md:block" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {isDayView || toolbarRefresh ? (
          <div className="flex w-full flex-wrap items-end gap-1 md:w-auto">
            {isDayView ? (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Día anterior"
                  onClick={() => refine({ day: addDateLabelDays(search.day, -1) })}
                >
                  <ChevronLeftIcon data-icon="inline-start" />
                </Button>
                <div className="min-w-0 flex-1 md:w-40 md:flex-none">
                  <DateField
                    id={arrivalId}
                    label="Día de operación"
                    hideLabel
                    value={dateOnlyCarrier(search.day, "UTC")}
                    onChange={(date) =>
                      refine({
                        day: format(date, "yyyy-MM-dd"),
                      })
                    }
                    onToday={pickerToday}
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Día siguiente"
                  onClick={() => refine({ day: addDateLabelDays(search.day, 1) })}
                >
                  <ChevronRightIcon data-icon="inline-end" />
                </Button>
                {standaloneToday}
              </>
            ) : null}
            {toolbarRefresh}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="w-full md:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (mobile) (document.activeElement as HTMLElement | null)?.blur();
            refine({ q: draftQ });
          }}
        >
          <Field>
            <FieldLabel htmlFor={guestId} className="sr-only">
              Contacto principal o código
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                id={guestId}
                placeholder="Buscar contacto principal o código…"
                enterKeyHint="search"
                value={draftQ}
                onChange={(event) => setDraftQ(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                {draftQ || search.q ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Borrar búsqueda"
                    onClick={() => {
                      setDraftQ("");
                      if (search.q) refine({ q: "" });
                    }}
                  >
                    <XIcon data-icon="inline-end" />
                  </Button>
                ) : null}
                <InputGroupButton type="submit" variant="secondary">
                  Buscar
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </form>
        <ReservationListFilters search={search} onChange={refine} />
        <div className="ml-auto min-w-0">
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-w-full whitespace-normal md:whitespace-nowrap"
                  aria-label="Ordenar reservas"
                />
              }
            >
              <ArrowUpDownIcon data-icon="inline-start" />
              <span className="md:hidden">Ordenar · </span>
              {sortOptions.find((option) => option.value === search.sort)!.label} ·{" "}
              {search.direction === "asc" ? "↑" : "↓"}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="max-h-[min(32rem,var(--available-height))] max-w-[calc(100vw-2rem)] gap-4 overflow-y-auto p-4"
            >
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
      <div ref={resultsRef} className="flex shrink-0 flex-col gap-4">
        {query.isPending ? (
          mobile ? (
            <ReservationCardsSkeleton />
          ) : (
            <div className="border">
              <Table aria-label="Cargando reservas" aria-busy>
                {tableHeader}
                <ReservationRowsSkeleton />
              </Table>
            </div>
          )
        ) : (
          <>
            {query.isError ? (
              query.data ? (
                <StaleDataNotice error={query.error} onRetry={() => void query.refetch()} />
              ) : (
                <PageError error={query.error} onRetry={() => void query.refetch()} />
              )
            ) : null}
            {query.data && rows.length === 0 ? (
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
              mobile ? (
                <ul
                  className={cn("flex flex-col gap-3", busy && "opacity-60")}
                  aria-label="Reservas"
                  aria-busy={busy || undefined}
                >
                  {rows.map((row) => (
                    <li key={row.id}>
                      <Card
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                        aria-label={`Abrir reserva de ${row.guestName}`}
                        aria-describedby={`${cardsId}-${row.id}-status ${cardsId}-${row.id}-stay ${cardsId}-${row.id}-balance`}
                        onClick={() => open(row.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            open(row.id);
                          }
                        }}
                      >
                        <CardHeader className="flex flex-wrap items-start justify-between gap-2">
                          <CardTitle className="min-w-0 flex-1 basis-32">
                            <span className="[overflow-wrap:anywhere]">{row.guestName}</span>
                          </CardTitle>
                          <span id={`${cardsId}-${row.id}-status`}>
                            <ReservationStatusBadge status={row.status} />
                          </span>
                        </CardHeader>
                        <CardContent
                          id={`${cardsId}-${row.id}-stay`}
                          className="flex flex-col gap-3"
                        >
                          <p
                            className={cn(
                              "[overflow-wrap:anywhere]",
                              row.rooms.some((room) => room.roomNumber === null) &&
                                "text-assignment-foreground",
                            )}
                          >
                            Habitaciones: <ReservationRooms rooms={row.rooms} />
                          </p>
                          <dl className="grid grid-cols-2 gap-3">
                            <div>
                              <dt className="text-muted-foreground">Entrada</dt>
                              <dd className="tabular-nums">{stayDateLabel(row.checkIn)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Salida</dt>
                              <dd className="tabular-nums">{stayDateLabel(row.checkOut)}</dd>
                            </div>
                          </dl>
                        </CardContent>
                        <CardFooter id={`${cardsId}-${row.id}-balance`}>
                          <ReservationBalance
                            balanceCents={row.balanceCents}
                            currency={row.currency}
                            inline
                          />
                        </CardFooter>
                      </Card>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="border">
                  <Table
                    className={cn(busy && "opacity-60")}
                    aria-label="Reservas"
                    aria-busy={busy || undefined}
                  >
                    {tableHeader}
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
                                {row.guest.phone
                                  ? phoneDisplay(row.guest.phone).text
                                  : "Sin teléfono"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <ReservationStatusBadge status={row.status} />
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                row.rooms.some((room) => room.roomNumber === null) &&
                                  "text-assignment-foreground",
                              )}
                            >
                              <ReservationRooms rooms={row.rooms} tooltip />
                            </span>
                          </TableCell>
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
                          <TableCell className="text-right tabular-nums">
                            <ReservationBalance
                              balanceCents={row.balanceCents}
                              currency={row.currency}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : null}
          </>
        )}
      </div>
      <nav
        className="flex flex-wrap items-center justify-between gap-3"
        aria-label="Paginación de reservas"
      >
        <p className="text-xs text-muted-foreground" aria-live="polite" aria-atomic="true">
          {rangeLabel}
        </p>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
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
              onChange={(size) => {
                refine({ size: Number(size) as ReservationsSearch["size"] });
                if (mobile) scrollToPage.current = 0;
              }}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="w-auto flex-1 px-2.5 md:w-8 md:flex-none md:px-0"
            aria-label="Anterior"
            disabled={search.page === 0 || query.isFetching}
            onClick={() => changePage(search.page - 1)}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            <span className="md:hidden">Anterior</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="w-auto flex-1 px-2.5 md:w-8 md:flex-none md:px-0"
            aria-label="Siguiente"
            disabled={!query.data || offset + rows.length >= total || busy || query.isError}
            onClick={() => changePage(search.page + 1)}
          >
            <span className="md:hidden">Siguiente</span>
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </nav>
      <RoomBookingDialog target={target} onClose={() => setTarget(null)} onViewReservation={open} />
    </main>
  );
}
