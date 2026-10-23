import { RefreshCwIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import { PageHeaderActions } from "@/components/page-header-actions";
import { SetupRequired } from "@/components/setup-required";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { HousekeepingRoom } from "@/lib/api";
import { propertyToday } from "@/lib/property-calendar";
import { useHousekeeping, useMissingSetup, useSetHousekeepingStatus } from "@/lib/queries";
import { toastError } from "@/lib/toast";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

function occupancyLabels(room: HousekeepingRoom) {
  const labels: string[] = [];
  if (room.departure === "expected") labels.push("Sale hoy");
  if (room.departure === "checked_out") labels.push("Salió hoy");
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

function HousekeepingRow({ room }: { room: HousekeepingRoom }) {
  const { today, timeZone } = usePropertyCalendar();
  const mutation = useSetHousekeepingStatus();
  const dirty = room.housekeepingStatus === "dirty";
  const next = dirty ? "clean" : "dirty";
  const changed = changedLabel(room.housekeepingChangedAt, today, timeZone);
  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b px-4 py-3 last:border-b-0",
        dirty && room.arriving && "bg-destructive/5",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-base font-semibold tabular-nums">{room.number}</span>
          <span className="truncate text-xs text-muted-foreground">{room.roomTypeName}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={dirty ? "destructive" : "checked_in"}>{dirty ? "Sucia" : "Limpia"}</Badge>
          {occupancyLabels(room).map((label) => (
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
        variant={dirty ? "default" : "outline"}
        aria-label={`Marcar habitación ${room.number} como ${dirty ? "limpia" : "sucia"}`}
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate(
            { roomId: room.id, status: next },
            { onError: (cause) => toastError("No se pudo guardar la limpieza", cause) },
          )
        }
      >
        {mutation.isPending ? (
          <Spinner data-icon="inline-start" />
        ) : dirty ? (
          <SparklesIcon data-icon="inline-start" />
        ) : (
          <TriangleAlertIcon data-icon="inline-start" />
        )}
        {dirty ? "Marcar limpia" : "Marcar sucia"}
      </Button>
    </li>
  );
}

export function Housekeeping() {
  const query = useHousekeeping();
  const missingSetup = useMissingSetup();
  const board = query.data;
  const refreshing = query.isFetching && !!board;

  if (board && board.rooms.length === 0) return <SetupRequired missing={missingSetup ?? "rooms"} />;

  const dirty = board?.rooms.filter((room) => room.housekeepingStatus === "dirty") ?? [];
  const urgent = dirty.filter((room) => room.arriving).length;

  return (
    <main className="flex min-h-0 w-full flex-col gap-4 overflow-y-auto p-4 lg:p-6">
      <PageHeaderActions>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={refreshing ? "Actualizando…" : "Actualizar"}
          aria-busy={refreshing || undefined}
          disabled={!board || refreshing}
          onClick={() => void query.refetch()}
        >
          <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
        </Button>
      </PageHeaderActions>
      {query.isError && !board ? (
        <div className="flex flex-col items-start gap-2">
          <FieldError>{query.error.message}</FieldError>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : !board ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Cargando habitaciones…
        </p>
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {dirty.length === 0
              ? "Todas las habitaciones están limpias."
              : `${dirty.length} ${dirty.length === 1 ? "habitación sucia" : "habitaciones sucias"}${
                  urgent ? `, ${urgent} con llegada hoy` : ""
                }.`}
          </p>
          <ul aria-label="Habitaciones" className="max-w-2xl border">
            {board.rooms.map((room) => (
              <HousekeepingRow key={room.id} room={room} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
