import { useState, type ComponentProps } from "react";
import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import { cn } from "cn";
import { PageHeaderActions } from "@/components/page-header-actions";
import { SetupRequired } from "@/components/setup-required";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FieldError } from "@/components/ui/field";
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
import type { HousekeepingRoom, HousekeepingStatus } from "@/lib/api";
import { propertyTimeZone, propertyToday } from "@/lib/property-calendar";
import { useHousekeeping, useMissingSetup, useSetHousekeepingStatus } from "@/lib/queries";
import type { HousekeepingView } from "@/lib/route-search";
import { toast, toastError } from "@/lib/toast";

type MarkRoom = (room: HousekeepingRoom, status: HousekeepingStatus) => Promise<void>;

/** Marks a room, then offers to undo it by setting the previous status again. */
function useMarkRoom(): MarkRoom {
  const mutation = useSetHousekeepingStatus();
  const save = (room: HousekeepingRoom, status: HousekeepingStatus) =>
    mutation.mutateAsync([{ roomId: room.id, status }]).then(
      () => true,
      (cause: unknown) => {
        toastError("No se pudo guardar la limpieza", cause);
        return false;
      },
    );
  return async (room, status) => {
    const previous = room.housekeepingStatus;
    if (!(await save(room, status))) return;
    const id = toast.add({
      title: `Habitación ${room.number} ${status === "clean" ? "lista" : "marcada sucia"}`,
      actionProps: {
        children: "Deshacer",
        onClick: () => {
          toast.close(id);
          void save(room, previous);
        },
      },
    });
  };
}

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
    <div className="flex flex-wrap items-center gap-1">
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
function usePendingMark(mark: MarkRoom) {
  const [pending, setPending] = useState<HousekeepingStatus | null>(null);
  const run = (room: HousekeepingRoom, status: HousekeepingStatus) => {
    setPending(status);
    void mark(room, status).finally(() => setPending(null));
  };
  return [pending, run] as const;
}

/** One room's control, disabled while its own mark saves. */
type RowControl = {
  room: HousekeepingRoom;
  pending: HousekeepingStatus | null;
  run: (room: HousekeepingRoom, status: HousekeepingStatus) => void;
};

/** Por limpiar's one action: mark the room clean. */
function ListaButton({
  room,
  pending,
  run,
  size,
  className,
}: RowControl & Pick<ComponentProps<typeof Button>, "size" | "className">) {
  return (
    <Button
      size={size}
      variant="outline"
      className={className}
      aria-label={`Marcar habitación ${room.number} como limpia`}
      disabled={!!pending}
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
function StatusToggle({
  room,
  pending,
  run,
  itemClassName,
}: RowControl & { itemClassName: string }) {
  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      className="shrink-0"
      aria-label={`Limpieza de la habitación ${room.number}`}
      value={[room.housekeepingStatus]}
      disabled={!!pending}
      onValueChange={([status]) => {
        // Tapping the pressed side unpresses it; that sets nothing.
        if (status) run(room, status as HousekeepingStatus);
      }}
    >
      {(["dirty", "clean"] as const).map((status) => (
        <ToggleGroupItem
          key={status}
          value={status}
          className={cn(itemClassName, statusDisplay[status].className)}
          aria-label={`Marcar habitación ${room.number} como ${statusDisplay[status].label.toLowerCase()}`}
        >
          {pending === status && <Spinner data-icon="inline-start" />}
          {statusDisplay[status].label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

type RoomRowProps = { view: HousekeepingView; room: HousekeepingRoom; mark: MarkRoom };

/** The tab's action for a room: Lista on Por limpiar, Sucia | Limpia on Todas. */
function RoomAction({
  view,
  phone,
  ...control
}: RowControl & { view: HousekeepingView; phone: boolean }) {
  return view === "to-clean" ? (
    <ListaButton
      {...control}
      size={phone ? "lg" : "sm"}
      className={cn(phone && "min-h-12 shrink-0 px-5 text-base")}
    />
  ) : (
    <StatusToggle
      {...control}
      itemClassName={phone ? "min-h-11 px-3 text-sm" : "h-8 px-3 text-sm"}
    />
  );
}

function PhoneRow({ view, room, mark }: RoomRowProps) {
  const [pending, run] = usePendingMark(mark);
  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b last:border-b-0",
        view === "to-clean" ? "p-4" : "px-4 py-3",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <RoomHeading room={room} />
        <StayBadges room={room} />
      </div>
      <RoomAction view={view} phone room={room} pending={pending} run={run} />
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
  const timeZone = propertyTimeZone();
  if (propertyToday(instant) === today) {
    return new Intl.DateTimeFormat("es-PE", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);
  }
  return new Intl.DateTimeFormat("es-PE", { timeZone, day: "numeric", month: "short" })
    .format(instant)
    .replace(".", "");
}

function DesktopRow({ view, room, mark, today }: RoomRowProps & { today: string }) {
  const [pending, run] = usePendingMark(mark);
  return (
    <TableRow>
      <TableCell className="w-28 text-base font-semibold tabular-nums">{room.number}</TableCell>
      <TableCell className="text-muted-foreground">{room.roomTypeName}</TableCell>
      <TableCell>
        <StayBadges room={room} />
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {markedLabel(room.housekeepingChangedAt, today)}
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <RoomAction view={view} phone={false} room={room} pending={pending} run={run} />
        </div>
      </TableCell>
    </TableRow>
  );
}

const listLabel = { "to-clean": "Habitaciones por limpiar", all: "Habitaciones" } as const;

/** A tab's rooms: phone cards, or the front desk's table with when each was last marked. */
function RoomList({
  view,
  rooms,
  mark,
  today,
}: {
  view: HousekeepingView;
  rooms: HousekeepingRoom[];
  mark: MarkRoom;
  today: string;
}) {
  const phone = useIsMobile();
  if (phone) {
    return (
      <ul aria-label={listLabel[view]} className="max-w-2xl border">
        {rooms.map((room) => (
          <PhoneRow key={room.id} view={view} room={room} mark={mark} />
        ))}
      </ul>
    );
  }
  return (
    <div className="max-w-5xl border">
      <Table aria-label={listLabel[view]} className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Habitación</TableHead>
            <TableHead scope="col">Tipo</TableHead>
            <TableHead scope="col">Hoy</TableHead>
            <TableHead scope="col">Marcada</TableHead>
            <TableHead scope="col" className="text-right">
              {view === "to-clean" ? <span className="sr-only">Acción</span> : "Estado"}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rooms.map((room) => (
            <DesktopRow key={room.id} view={view} room={room} mark={mark} today={today} />
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
  const mark = useMarkRoom();
  const list = query.data;
  const refreshing = query.isFetching && !!list;

  if (list && list.rooms.length === 0) return <SetupRequired missing={missingSetup ?? "rooms"} />;

  const toClean = (list?.rooms.filter(needsCleaning) ?? []).sort(
    (a, b) => cleaningOrder(a) - cleaningOrder(b),
  );

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
        className="w-full max-w-2xl"
        value={view}
        onValueChange={(value) => onViewChange(value as HousekeepingView)}
      >
        <TabsList aria-label="Vista de limpieza" className="h-11 w-full">
          <TabsTrigger value="to-clean" className="gap-2 text-sm">
            Por limpiar
            {list && (
              <Badge variant={toClean.length ? "default" : "secondary"}>{toClean.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="text-sm">
            Todas
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {query.isError && !list ? (
        <div className="flex flex-col items-start gap-2">
          <FieldError>{query.error.message}</FieldError>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : !list ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Cargando habitaciones…
        </p>
      ) : view === "to-clean" && toClean.length === 0 ? (
        <AllClean />
      ) : (
        <RoomList
          view={view}
          rooms={view === "to-clean" ? toClean : list.rooms}
          mark={mark}
          today={list.date}
        />
      )}
    </main>
  );
}
