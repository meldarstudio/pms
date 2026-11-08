import { useState, type ReactNode } from "react";
import { ChevronDownIcon, PrinterIcon, SparklesIcon } from "lucide-react";
import { PageHeaderActions } from "@/components/page-header-actions";
import { SetupRequired } from "@/components/setup-required";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/refresh-button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageError, StaleDataNotice } from "@/components/page-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  PrintSheet,
  longPropertyDate,
  propertyTime,
  useStampedAtPrint,
} from "@/components/print-sheet";
import type { HousekeepingRoom, HousekeepingStatus } from "@/lib/api";
import { propertyToday } from "@/lib/property-calendar";
import { useHousekeeping, useMissingSetup } from "@/lib/queries";
import type { HousekeepingView } from "@/lib/route-search";
import { useMarkRooms, type MarkRooms } from "@/lib/use-mark-rooms";

type SelectionState = {
  view: HousekeepingView;
  ids: ReadonlySet<string>;
  anchor: string | null;
};

const noSelection = (view: HousekeepingView): SelectionState => ({
  view,
  ids: new Set(),
  anchor: null,
});

function useRoomSelection(
  view: HousekeepingView,
  rooms: HousekeepingRoom[] | undefined,
  holding: boolean,
) {
  const [state, setState] = useState(() => noSelection(view));
  let current = state;
  if (state.view !== view) current = noSelection(view);
  else if (rooms && !holding) {
    const visible = new Set(rooms.map((room) => room.id));
    const anchor = state.anchor && visible.has(state.anchor) ? state.anchor : null;
    const ids = new Set([...state.ids].filter((id) => visible.has(id)));
    if (ids.size !== state.ids.size || anchor !== state.anchor) current = { view, ids, anchor };
  }
  if (current !== state) setState(current);

  const order = rooms?.map((room) => room.id) ?? [];
  const selectedCount = order.filter((id) => current.ids.has(id)).length;
  const allSelected = order.length > 0 && selectedCount === order.length;
  return {
    ids: current.ids,
    allSelected,
    someSelected: selectedCount > 0,
    toggle: (roomId: string, range: boolean) => {
      const checked = !current.ids.has(roomId);
      const from = range && current.anchor ? order.indexOf(current.anchor) : -1;
      const to = order.indexOf(roomId);
      const affected =
        from >= 0 ? order.slice(Math.min(from, to), Math.max(from, to) + 1) : [roomId];
      const ids = new Set(current.ids);
      for (const id of affected) {
        if (checked) ids.add(id);
        else ids.delete(id);
      }
      setState({ view, ids, anchor: roomId });
    },
    toggleAll: () => setState({ view, ids: new Set(selectedCount ? [] : order), anchor: null }),
    clear: () => setState(noSelection(view)),
  };
}

type RoomSelection = ReturnType<typeof useRoomSelection>;

function needsCleaning(room: HousekeepingRoom) {
  return room.housekeepingStatus === "dirty" && !room.inHouse && (!room.closed || room.arriving);
}

function cleaningOrder(room: HousekeepingRoom) {
  return (room.arriving ? 0 : 2) + (room.departing ? 1 : 0);
}

function StayBadges({ room }: { room: HousekeepingRoom }) {
  const free = !room.departing && !room.inHouse;
  return (
    <div className="flex flex-wrap items-center gap-1 md:flex-nowrap">
      {room.arriving && (
        <Badge variant="destructive" className="border-destructive/20">
          Llega hoy
        </Badge>
      )}
      {room.departing && (
        <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-200">
          Sale hoy
        </Badge>
      )}
      {room.inHouse && (
        <Badge variant="secondary" className="border-border">
          En casa
        </Badge>
      )}
      {free && <Badge variant="checked_in">Libre</Badge>}
      {room.closed && (
        <Badge variant="secondary" className="border-border">
          Cerrada
        </Badge>
      )}
    </div>
  );
}

function RoomHeading({ room }: { room: HousekeepingRoom }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="text-xl leading-none font-semibold tabular-nums">{room.number}</span>
      <span className="truncate text-sm text-muted-foreground">{room.roomTypeName}</span>
    </div>
  );
}

function usePendingMark(mark: MarkRooms) {
  const [pending, setPending] = useState<HousekeepingStatus | null>(null);
  const run = (room: HousekeepingRoom, status: HousekeepingStatus) => {
    setPending(status);
    void mark([room], status).finally(() => setPending(null));
  };
  return [pending, run] as const;
}

type RowControl = {
  room: HousekeepingRoom;
  pending: HousekeepingStatus | null;
  disabled?: boolean;
  run: (room: HousekeepingRoom, status: HousekeepingStatus) => void;
};

function ListaButton({ room, pending, disabled = false, run }: RowControl) {
  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={`Marcar habitación ${room.number} como limpia`}
      disabled={disabled || !!pending}
      onClick={() => run(room, "clean")}
    >
      Lista
    </Button>
  );
}

const statusDisplay = {
  dirty: {
    label: "Sucia",
    className:
      "aria-pressed:bg-destructive/10 aria-pressed:text-destructive dark:aria-pressed:bg-destructive/20",
  },
  clean: {
    label: "Limpia",
    className: "aria-pressed:bg-booking aria-pressed:text-booking-foreground",
  },
} as const;

function StatusToggle({ room, pending, disabled = false, run }: RowControl) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      className="shrink-0"
      aria-label={`Limpieza de la habitación ${room.number}`}
      value={[room.housekeepingStatus]}
      disabled={disabled || !!pending}
      onValueChange={([status]) => {
        if (status) run(room, status as HousekeepingStatus);
      }}
    >
      {(["dirty", "clean"] as const).map((status) => (
        <ToggleGroupItem
          key={status}
          value={status}
          className={statusDisplay[status].className}
          aria-label={`Marcar habitación ${room.number} como ${statusDisplay[status].label.toLowerCase()}`}
        >
          {statusDisplay[status].label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

type RoomRowProps = { view: HousekeepingView; room: HousekeepingRoom; mark: MarkRooms };

function RoomAction({ view, ...control }: RowControl & { view: HousekeepingView }) {
  return view === "to-clean" ? <ListaButton {...control} /> : <StatusToggle {...control} />;
}

const views = {
  "to-clean": {
    listLabel: "Habitaciones por limpiar",
    actionHeading: <span className="sr-only">Acción</span>,
    bulkStatuses: ["clean"],
  },
  all: {
    listLabel: "Habitaciones",
    actionHeading: "Estado",
    bulkStatuses: ["clean", "dirty"],
  },
} satisfies Record<
  HousekeepingView,
  {
    listLabel: string;
    actionHeading: ReactNode;
    bulkStatuses: HousekeepingStatus[];
  }
>;

const bulkMenuLabel = { clean: "Limpias", dirty: "Sucias" } as const;

function PhoneRow({ view, room, mark }: RoomRowProps) {
  const [pending, run] = usePendingMark(mark);
  return (
    <li className="flex items-center gap-3 border-b p-4 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <RoomHeading room={room} />
        <StayBadges room={room} />
      </div>
      <RoomAction view={view} room={room} pending={pending} run={run} />
    </li>
  );
}

function markedLabel(changedAt: string | null, today: string) {
  if (!changedAt) return "—";
  const instant = new Date(changedAt);
  const date = propertyToday(instant);
  if (date === today) return propertyTime(instant);
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${shortMonths[month! - 1]}`;
}

const shortMonths = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

function DesktopRow({
  view,
  room,
  mark,
  today,
  bulk: { selection, pending: bulkPending },
}: RoomRowProps & { today: string; bulk: BulkMark }) {
  const [pending, run] = usePendingMark(mark);
  const selected = selection.ids.has(room.id);
  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell className="w-10">
        <Checkbox
          aria-label={`Seleccionar habitación ${room.number}`}
          checked={selected}
          disabled={!!bulkPending}
          onClick={(event) => selection.toggle(room.id, event.shiftKey)}
        />
      </TableCell>
      <TableCell className="font-medium tabular-nums lg:w-28">{room.number}</TableCell>
      <TableCell className="text-muted-foreground">{room.roomTypeName}</TableCell>
      <TableCell>
        <StayBadges room={room} />
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums max-lg:hidden">
        {markedLabel(room.housekeepingChangedAt, today)}
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <RoomAction
            view={view}
            room={room}
            pending={pending}
            disabled={!!bulkPending}
            run={run}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

type BulkMark = {
  selection: RoomSelection;
  pending: HousekeepingStatus | null;
  markSelected: (status: HousekeepingStatus) => void;
};

function SelectionActions({
  view,
  bulk: { selection, pending, markSelected },
}: {
  view: HousekeepingView;
  bulk: BulkMark;
}) {
  const count = selection.ids.size;
  const statuses = views[view].bulkStatuses;
  return (
    <div role="group" aria-label="Selección" className="flex items-center gap-2">
      <span className="mr-auto text-xs font-medium tabular-nums" aria-live="polite">
        {count} {count === 1 ? "seleccionada" : "seleccionadas"}
      </span>
      {statuses.length === 1 ? (
        <Button
          size="sm"
          variant="outline"
          disabled={!!pending}
          onClick={() => markSelected(statuses[0]!)}
        >
          {pending && <Spinner data-icon="inline-start" />}
          Marcar limpias
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger disabled={!!pending} render={<Button size="sm" variant="outline" />}>
            {pending && <Spinner data-icon="inline-start" />}
            Marcar como
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {statuses.map((status) => (
              <DropdownMenuItem key={status} onClick={() => markSelected(status)}>
                {bulkMenuLabel[status]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function RoomList({
  view,
  rooms,
  mark,
  today,
  bulk,
}: {
  view: HousekeepingView;
  rooms: HousekeepingRoom[];
  mark: MarkRooms;
  today: string;
  bulk: BulkMark;
}) {
  const phone = useIsMobile();
  const { selection } = bulk;
  if (phone) {
    return (
      <ul aria-label={views[view].listLabel} className="border">
        {rooms.map((room) => (
          <PhoneRow key={room.id} view={view} room={room} mark={mark} />
        ))}
      </ul>
    );
  }
  return (
    <div className="border">
      <Table aria-label={views[view].listLabel}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="w-10">
              <Checkbox
                aria-label="Seleccionar todas"
                checked={selection.allSelected}
                indeterminate={selection.someSelected && !selection.allSelected}
                disabled={!!bulk.pending}
                onCheckedChange={selection.toggleAll}
              />
            </TableHead>
            {selection.ids.size > 0 ? (
              <TableHead colSpan={5}>
                <SelectionActions view={view} bulk={bulk} />
              </TableHead>
            ) : (
              <ColumnHeadings view={view} />
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rooms.map((room) => (
            <DesktopRow
              key={room.id}
              view={view}
              room={room}
              mark={mark}
              today={today}
              bulk={bulk}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ColumnHeadings({ view }: { view: HousekeepingView }) {
  return (
    <>
      <TableHead scope="col">Habitación</TableHead>
      <TableHead scope="col">Tipo</TableHead>
      <TableHead scope="col">Hoy</TableHead>
      <TableHead scope="col" className="max-lg:hidden">
        Marcada
      </TableHead>
      <TableHead scope="col" className="text-right">
        {views[view].actionHeading}
      </TableHead>
    </>
  );
}

function RoomListSkeleton({ view }: { view: HousekeepingView }) {
  const phone = useIsMobile();
  const rows = Array.from({ length: 8 }, (_, index) => index);
  const action =
    view === "to-clean" ? (
      <Skeleton className="h-(--control-h-sm) w-12" />
    ) : (
      <Skeleton className="h-(--control-h-sm) w-26" />
    );
  if (phone) {
    return (
      <ul aria-label="Cargando habitaciones" aria-busy className="border">
        {rows.map((index) => (
          <li key={index} className="flex items-center gap-3 border-b p-4 last:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-5.5 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
            {action}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="border">
      <Table aria-label="Cargando habitaciones" aria-busy>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Skeleton className="size-4 pointer-coarse:size-5" />
            </TableHead>
            <ColumnHeadings view={view} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((index) => (
            <TableRow key={index}>
              <TableCell className="w-10">
                <Skeleton className="size-4 pointer-coarse:size-5" />
              </TableCell>
              <TableCell className="lg:w-28">
                <Skeleton className="h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-18" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-36" />
              </TableCell>
              <TableCell className="max-lg:hidden">
                <Skeleton className="h-4 w-10" />
              </TableCell>
              <TableCell>
                <div className="flex justify-end">{action}</div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ListPrintSheet({
  view,
  rooms,
  today,
}: {
  view: HousekeepingView;
  rooms: HousekeepingRoom[];
  today: string;
}) {
  const printedAt = useStampedAtPrint();
  return (
    <PrintSheet>
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">{views[view].listLabel}</h1>
        <p className="text-sm">
          <span className="inline-block first-letter:uppercase">{longPropertyDate(today)}</span>
          {" · Impreso "}
          {propertyTime(printedAt)}
        </p>
      </header>
      <Table aria-label={views[view].listLabel} className="border">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Habitación</TableHead>
            <TableHead scope="col">Tipo</TableHead>
            <TableHead scope="col">Hoy</TableHead>
            <TableHead scope="col" className="w-12 text-center">
              ✓
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rooms.map((room) => (
            <TableRow key={room.id} className="break-inside-avoid">
              <TableCell className="text-lg font-semibold tabular-nums">{room.number}</TableCell>
              <TableCell>{room.roomTypeName}</TableCell>
              <TableCell>
                <StayBadges room={room} />
              </TableCell>
              <TableCell>
                <div className="mx-auto size-5 border-2 border-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PrintSheet>
  );
}

function AllClean() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SparklesIcon />
        </EmptyMedia>
        <EmptyTitle>Todo limpio</EmptyTitle>
        <EmptyDescription>No quedan habitaciones por limpiar hoy.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function Housekeeping({
  view,
  onViewChange,
}: {
  view: HousekeepingView;
  onViewChange: (view: HousekeepingView) => void;
}) {
  const phone = useIsMobile();
  const query = useHousekeeping();
  const missingSetup = useMissingSetup();
  const mark = useMarkRooms();
  const list = query.data;
  const refreshing = query.isFetching && !!list;

  const toClean = (list?.rooms.filter(needsCleaning) ?? []).sort(
    (a, b) => cleaningOrder(a) - cleaningOrder(b),
  );
  const visible = list && (view === "to-clean" ? toClean : list.rooms);
  const [bulkPending, setBulkPending] = useState<HousekeepingStatus | null>(null);
  const selection = useRoomSelection(view, visible, !!bulkPending);

  const markSelected = (status: HousekeepingStatus) => {
    const rooms = visible?.filter((room) => selection.ids.has(room.id)) ?? [];
    setBulkPending(status);
    void mark(rooms, status)
      .then((saved) => {
        if (saved) selection.clear();
      })
      .finally(() => setBulkPending(null));
  };

  if (list && list.rooms.length === 0) return <SetupRequired missing={missingSetup ?? "rooms"} />;

  return (
    <main className="flex min-h-0 w-full flex-col gap-4 overflow-y-auto p-4 lg:p-6">
      <PageHeaderActions>
        <RefreshButton
          refreshing={refreshing}
          disabled={!list}
          onRefresh={() => void query.refetch()}
        />
      </PageHeaderActions>
      <div className="flex items-center gap-2">
        <Tabs
          className="w-full md:w-auto"
          value={view}
          onValueChange={(value) => onViewChange(value as HousekeepingView)}
        >
          <TabsList aria-label="Vista de limpieza" className="w-full md:w-fit">
            <TabsTrigger value="to-clean">
              Por limpiar
              {list ? (
                <Badge
                  variant={toClean.length ? "default" : "secondary"}
                  className="h-5 min-w-5 border-0 px-1 tabular-nums"
                >
                  {toClean.length}
                </Badge>
              ) : (
                <Skeleton className="size-5" />
              )}
            </TabsTrigger>
            <TabsTrigger value="all">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
        {!phone && (
          <Button
            className="ml-auto"
            variant="outline"
            size="sm"
            disabled={!visible?.length}
            onClick={() => window.print()}
          >
            <PrinterIcon data-icon="inline-start" />
            Imprimir
          </Button>
        )}
      </div>
      {query.isError && list ? (
        <StaleDataNotice error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isError && !list ? (
        <PageError error={query.error} onRetry={() => void query.refetch()} />
      ) : !list ? (
        <RoomListSkeleton view={view} />
      ) : !visible?.length ? (
        <AllClean />
      ) : (
        <>
          <RoomList
            view={view}
            rooms={visible}
            mark={mark}
            today={list.date}
            bulk={{ selection, pending: bulkPending, markSelected }}
          />
          <ListPrintSheet view={view} rooms={visible} today={list.date} />
        </>
      )}
    </main>
  );
}
