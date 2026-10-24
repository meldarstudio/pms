import { useState } from "react";
import {
  DoorClosedIcon,
  DoorOpenIcon,
  LuggageIcon,
  RefreshCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HousekeepingRoom, HousekeepingStatus } from "@/lib/api";
import { propertyToday } from "@/lib/property-calendar";
import { useHousekeeping, useMissingSetup, useSetHousekeepingStatus } from "@/lib/queries";
import type { HousekeepingView } from "@/lib/route-search";
import { toast, toastError } from "@/lib/toast";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

const statusDisplay = {
  dirty: {
    label: "Sucia",
    badge: "destructive",
    next: "clean",
    action: "Marcar limpia",
    button: "default",
    Icon: SparklesIcon,
  },
  clean: {
    label: "Limpia",
    badge: "checked_in",
    next: "dirty",
    action: "Marcar sucia",
    button: "outline",
    Icon: TriangleAlertIcon,
  },
} as const;

type MarkRoom = (room: HousekeepingRoom, status: HousekeepingStatus) => Promise<void>;

/** Marks a room, then offers to undo it by setting the previous status again. */
function useMarkRoom(): MarkRoom {
  const mutation = useSetHousekeepingStatus();
  const save = (room: HousekeepingRoom, status: HousekeepingStatus) =>
    mutation.mutateAsync({ roomId: room.id, status }).then(
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

function stayLabels(room: HousekeepingRoom) {
  const labels: string[] = [];
  if (room.departing) labels.push("Sale hoy");
  if (room.inHouse) labels.push("En casa");
  if (room.arriving) labels.push("Llega hoy");
  return labels.length ? labels : ["Libre"];
}

function changedLabel(changedAt: string | null, today: string, timeZone: string) {
  if (!changedAt) return null;
  const instant = new Date(changedAt);
  const sameDay = propertyToday(instant) === today;
  const formatted = new Intl.DateTimeFormat(
    "es-PE",
    sameDay ? { timeStyle: "short", timeZone } : { day: "numeric", month: "short", timeZone },
  ).format(instant);
  return `Marcada ${sameDay ? "a las" : "el"} ${formatted}`;
}

/** Keeps a row's button disabled while its own mark saves. */
function usePendingMark(mark: MarkRoom) {
  const [pending, setPending] = useState(false);
  const run = (room: HousekeepingRoom, status: HousekeepingStatus) => {
    setPending(true);
    void mark(room, status).finally(() => setPending(false));
  };
  return [pending, run] as const;
}

function ToCleanCard({ room, mark }: { room: HousekeepingRoom; mark: MarkRoom }) {
  const [pending, run] = usePendingMark(mark);
  return (
    <li className="flex items-center gap-3 border-b p-4 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-3xl leading-none font-semibold tabular-nums">{room.number}</span>
        <div className="flex flex-wrap items-center gap-2">
          {room.arriving && (
            <Badge variant="destructive" className="h-6 text-sm">
              <LuggageIcon data-icon="inline-start" />
              Llega hoy
            </Badge>
          )}
          {room.departing ? (
            <Badge className="h-6 border-amber-500/30 bg-amber-500/15 text-sm text-amber-800 dark:text-amber-200">
              <DoorClosedIcon data-icon="inline-start" />
              Sale hoy
            </Badge>
          ) : (
            <Badge variant="checked_in" className="h-6 text-sm">
              <DoorOpenIcon data-icon="inline-start" />
              Libre
            </Badge>
          )}
        </div>
      </div>
      <Button
        size="lg"
        variant="outline"
        className="min-h-12 shrink-0 px-5 text-base"
        aria-label={`Marcar habitación ${room.number} como limpia`}
        disabled={pending}
        onClick={() => run(room, "clean")}
      >
        {pending && <Spinner data-icon="inline-start" />}
        Lista
      </Button>
    </li>
  );
}

function HousekeepingRow({ room, mark }: { room: HousekeepingRoom; mark: MarkRoom }) {
  const { today, timeZone } = usePropertyCalendar();
  const [pending, run] = usePendingMark(mark);
  const display = statusDisplay[room.housekeepingStatus];
  const changed = changedLabel(room.housekeepingChangedAt, today, timeZone);
  return (
    <li className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-base font-semibold tabular-nums">{room.number}</span>
          <span className="truncate text-xs text-muted-foreground">{room.roomTypeName}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={display.badge}>{display.label}</Badge>
          {stayLabels(room).map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
          {room.closed && <Badge variant="secondary">Cerrada</Badge>}
        </div>
        {changed && <span className="text-xs text-muted-foreground">{changed}</span>}
      </div>
      <Button
        className="min-h-11 shrink-0"
        variant={display.button}
        aria-label={`Marcar habitación ${room.number} como ${statusDisplay[display.next].label.toLowerCase()}`}
        disabled={pending}
        onClick={() => run(room, display.next)}
      >
        {pending ? <Spinner data-icon="inline-start" /> : <display.Icon data-icon="inline-start" />}
        {display.action}
      </Button>
    </li>
  );
}

function ToCleanList({ rooms, mark }: { rooms: HousekeepingRoom[]; mark: MarkRoom }) {
  if (rooms.length === 0) {
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
  return (
    <ul aria-label="Habitaciones por limpiar" className="max-w-2xl border">
      {rooms.map((room) => (
        <ToCleanCard key={room.id} room={room} mark={mark} />
      ))}
    </ul>
  );
}

function AllRoomsList({ rooms, mark }: { rooms: HousekeepingRoom[]; mark: MarkRoom }) {
  const dirty = rooms.filter((room) => room.housekeepingStatus === "dirty");
  const urgent = dirty.filter((room) => room.arriving).length;
  return (
    <>
      <p role="status" className="text-sm text-muted-foreground">
        {dirty.length === 0
          ? "Todas las habitaciones están limpias."
          : `${dirty.length} ${dirty.length === 1 ? "habitación sucia" : "habitaciones sucias"}${
              urgent ? `, ${urgent} con llegada hoy` : ""
            }.`}
      </p>
      <ul aria-label="Habitaciones" className="max-w-2xl border">
        {rooms.map((room) => (
          <HousekeepingRow key={room.id} room={room} mark={mark} />
        ))}
      </ul>
    </>
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
      ) : view === "to-clean" ? (
        <ToCleanList rooms={toClean} mark={mark} />
      ) : (
        <AllRoomsList rooms={list.rooms} mark={mark} />
      )}
    </main>
  );
}
