import { useState, type ReactNode } from "react";
import { ChevronDownIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { cn } from "cn";
import { PageHeaderActions } from "@/components/page-header-actions";
import { SetupRequired } from "@/components/setup-required";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { HousekeepingMarkInput, HousekeepingRoom, HousekeepingStatus } from "@/lib/api";
import { propertyTimeZone, propertyToday } from "@/lib/property-calendar";
import { useHousekeeping, useMissingSetup, useMarkHousekeeping } from "@/lib/queries";
import type { HousekeepingView } from "@/lib/route-search";
import { toast, toastError } from "@/lib/toast";

type MarkRooms = (rooms: HousekeepingRoom[], status: HousekeepingStatus) => Promise<boolean>;

function markedTitle(rooms: HousekeepingRoom[], status: HousekeepingStatus) {
  const clean = status === "clean";
  if (rooms.length === 1) {
    return `Habitación ${rooms[0]!.number} ${clean ? "lista" : "marcada sucia"}`;
  }
  return `${rooms.length} habitaciones ${clean ? "listas" : "marcadas sucias"}`;
}

/**
 * Marks rooms in one request, then offers to undo it by setting each room's own previous
 * status again in one request. Resolves whether the mark saved.
 */
function useMarkRooms(): MarkRooms {
  const mutation = useMarkHousekeeping();
  const save = (marks: HousekeepingMarkInput[]) =>
    mutation.mutateAsync(marks).then(
      () => true,
      (cause: unknown) => {
        toastError("No se pudo guardar la limpieza", cause);
        return false;
      },
    );
  return async (rooms, status) => {
    const previous = rooms.map((room) => ({ roomId: room.id, status: room.housekeepingStatus }));
    if (!(await save(rooms.map((room) => ({ roomId: room.id, status }))))) return false;
    const id = toast.add({
      title: markedTitle(rooms, status),
      actionProps: {
        children: "Deshacer",
        onClick: () => {
          toast.close(id);
          void save(previous);
        },
      },
    });
    return true;
  };
}

type SelectionState = {
  view: HousekeepingView;
  ids: ReadonlySet<string>;
  /** Where a shift-click range starts: the room clicked last. */
  anchor: string | null;
};

const noSelection = (view: HousekeepingView): SelectionState => ({
  view,
  ids: new Set(),
  anchor: null,
});

/**
 * The desktop table's selected rooms, among `rooms` in the order on screen. Switching tabs
 * clears it, and each re-read keeps only rooms still visible in the tab, except while
 * `holding` (a bulk mark saving), so a failed mark leaves the selection for a retry.
 */
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
    /** Toggles a room; with `range`, every room on screen from the room clicked last to it. */
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
    /** Clears the selection, or selects every visible room when none are selected. */
    toggleAll: () => setState({ view, ids: new Set(selectedCount ? [] : order), anchor: null }),
    clear: () => setState(noSelection(view)),
  };
}

type RoomSelection = ReturnType<typeof useRoomSelection>;

/**
 * The housekeeper's work for today: dirty rooms that will be free for a guest tonight.
 * A room whose guest stays tonight is in use, and a room closed tonight waits, unless a
 * guest arrives today.
 */
function needsCleaning(room: HousekeepingRoom) {
  return room.housekeepingStatus === "dirty" && !room.inHouse && (!room.closed || room.arriving);
}

/** Arrivals first, then rooms someone can go into now, then rooms whose guest leaves today. */
function cleaningOrder(room: HousekeepingRoom) {
  return (room.arriving ? 0 : 2) + (room.departing ? 1 : 0);
}

/** Today's stays and a closure tonight, the same in both tabs. Libre: no guest is in the room now. */
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

/** Keeps a row's control disabled while its own mark saves, remembering the status it sets. */
function usePendingMark(mark: MarkRooms) {
  const [pending, setPending] = useState<HousekeepingStatus | null>(null);
  const run = (room: HousekeepingRoom, status: HousekeepingStatus) => {
    setPending(status);
    void mark([room], status).finally(() => setPending(null));
  };
  return [pending, run] as const;
}

/** One room's control, disabled while its own mark or a bulk mark saves. */
type RowControl = {
  room: HousekeepingRoom;
  pending: HousekeepingStatus | null;
  disabled?: boolean;
  run: (room: HousekeepingRoom, status: HousekeepingStatus) => void;
};

/** Por limpiar's one action: mark the room clean. */
function ListaButton({ room, pending, disabled = false, run }: RowControl) {
  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={`Marcar habitación ${room.number} como limpia`}
      disabled={disabled || !!pending}
      onClick={() => run(room, "clean")}
    >
      {pending && <Spinner data-icon="inline-start" />}
      Lista
    </Button>
  );
}

/** Each side of the Sucia | Limpia toggle: its label and its tint when pressed. */
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

/** Todas' Sucia | Limpia control, pressed on the current status. */
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
        // Tapping the pressed side unpresses it; that sets nothing.
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
          {pending === status && <Spinner data-icon="inline-start" />}
          {statusDisplay[status].label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

type RoomRowProps = { view: HousekeepingView; room: HousekeepingRoom; mark: MarkRooms };

/** The tab's action for a room: Lista on Por limpiar, Sucia | Limpia on Todas. */
function RoomAction({ view, ...control }: RowControl & { view: HousekeepingView }) {
  return view === "to-clean" ? <ListaButton {...control} /> : <StatusToggle {...control} />;
}

/** What differs between the tabs' lists, besides each row's action. */
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

/** Marcar como's choices on Todas. */
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

/**
 * When the status was last marked, in the property time zone: the time if on the
 * property date `today`, otherwise a short date.
 */
function markedLabel(changedAt: string | null, today: string) {
  if (!changedAt) return "—";
  const instant = new Date(changedAt);
  const date = propertyToday(instant);
  if (date === today) {
    return new Intl.DateTimeFormat("es-PE", {
      timeZone: propertyTimeZone(),
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);
  }
  // Our own month names: ICU versions shorten September as "sep", "sept", or "set".
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
          // Click rather than change, to read shift for a range.
          onClick={(event) => selection.toggle(room.id, event.shiftKey)}
        />
      </TableCell>
      <TableCell className="w-28 font-medium tabular-nums">{room.number}</TableCell>
      <TableCell className="text-muted-foreground">{room.roomTypeName}</TableCell>
      <TableCell>
        <StayBadges room={room} />
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
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

/**
 * The desktop table's selection and the bulk mark of it: the status it sets while
 * saving, else null.
 */
type BulkMark = {
  selection: RoomSelection;
  pending: HousekeepingStatus | null;
  markSelected: (status: HousekeepingStatus) => void;
};

/**
 * The desktop table's actions for the selected rooms, in place of the column headings while
 * any are selected.
 */
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
          <DropdownMenuContent align="end" className="min-w-32">
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

/**
 * A tab's rooms: phone cards, or the front desk's table with when each was last marked and
 * a selection to mark several rooms at once.
 */
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
      <ul aria-label={views[view].listLabel} className="max-w-2xl border">
        {rooms.map((room) => (
          <PhoneRow key={room.id} view={view} room={room} mark={mark} />
        ))}
      </ul>
    );
  }
  return (
    <div className="max-w-5xl border">
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
              <>
                <TableHead scope="col">Habitación</TableHead>
                <TableHead scope="col">Tipo</TableHead>
                <TableHead scope="col">Hoy</TableHead>
                <TableHead scope="col">Marcada</TableHead>
                <TableHead scope="col" className="text-right">
                  {views[view].actionHeading}
                </TableHead>
              </>
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

function AllClean() {
  return (
    <Empty className="max-w-2xl border">
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
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={refreshing ? "Actualizando…" : "Actualizar"}
          aria-busy={refreshing || undefined}
          disabled={!list || refreshing}
          onClick={() => void query.refetch()}
        >
          <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
        </Button>
      </PageHeaderActions>
      <Tabs
        className="w-full max-w-2xl md:w-auto"
        value={view}
        onValueChange={(value) => onViewChange(value as HousekeepingView)}
      >
        <TabsList aria-label="Vista de limpieza" className="w-full md:w-fit">
          <TabsTrigger value="to-clean">
            Por limpiar
            {list && (
              <Badge
                variant={toClean.length ? "default" : "secondary"}
                className="h-5 min-w-5 border-0 px-1 tabular-nums"
              >
                {toClean.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
      </Tabs>
      {query.isError && list ? (
        <StaleDataNotice error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isError && !list ? (
        <PageError error={query.error} onRetry={() => void query.refetch()} />
      ) : !list ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Cargando habitaciones…
        </p>
      ) : !visible?.length ? (
        // Todas always lists a room; an empty property shows setup instead.
        <AllClean />
      ) : (
        <RoomList
          view={view}
          rooms={visible}
          mark={mark}
          today={list.date}
          bulk={{ selection, pending: bulkPending, markSelected }}
        />
      )}
    </main>
  );
}
