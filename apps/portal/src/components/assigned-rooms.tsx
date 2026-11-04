import { CircleAlertIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { RoomAssignmentSteps } from "@/components/room-assignment-flow";
import { DirtyRoomBadge } from "@/components/dirty-room-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ReservationDetail } from "@/lib/api";
import type { ReservationStay } from "@/lib/assignment-availability";
import { useHousekeeping } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { occupantsLabel } from "@/lib/reservation-list";
import { useRoomAssignment } from "@/lib/use-room-assignment";

type Line = ReservationDetail["rooms"][number];

const nightsLabel = (count: number) => `${count} ${count === 1 ? "noche" : "noches"}`;

function typeName(line: Line) {
  return line.roomTypeName || "Habitación";
}

function unassignedStays(detail: ReservationDetail): ReservationStay[] {
  if (detail.status !== "confirmed" && detail.status !== "checked_in") return [];
  return detail.rooms.flatMap((line, index) =>
    line.roomId === null
      ? [
          {
            id: line.id,
            reservationId: detail.id,
            guestName: detail.guest.fullName,
            status: detail.status,
            checkIn: detail.checkIn,
            checkOut: detail.checkOut,
            roomId: null,
            roomTypeId: line.roomTypeId,
            roomIndex: index + 1,
            roomCount: detail.rooms.length,
          },
        ]
      : [],
  );
}

export function AssignedRooms({ detail }: { detail: ReservationDetail }) {
  const stays = unassignedStays(detail);
  return stays.length > 0 ? (
    <AssignableRooms detail={detail} stays={stays} />
  ) : (
    <RoomList detail={detail} stays={stays} />
  );
}

function AssignableRooms({
  detail,
  stays,
}: {
  detail: ReservationDetail;
  stays: ReservationStay[];
}) {
  const isMobile = useIsMobile();
  const housekeeping = useHousekeeping();
  const rooms = housekeeping.data?.rooms ?? null;
  const assignment = useRoomAssignment(rooms, stays);
  const typeNames = new Map(detail.rooms.map((line) => [line.roomTypeId, typeName(line)]));
  return (
    <>
      <RoomList detail={detail} stays={stays} onAssign={assignment.selectStay} />
      <Sheet
        open={assignment.target !== null}
        onOpenChange={(open, details) => {
          if (assignment.pending) {
            details.cancel();
            return;
          }
          if (!open) assignment.cancel();
        }}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          showCloseButton={false}
          className={cn(
            "overflow-hidden",
            isMobile && "max-h-[85dvh] pb-[env(safe-area-inset-bottom)]",
          )}
        >
          <SheetHeader className="shrink-0 border-b">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <SheetTitle>Elegir habitación</SheetTitle>
                <SheetDescription>
                  Toca una habitación disponible para asignarla a toda la estancia.
                </SheetDescription>
              </div>
              <SheetClose
                render={<Button variant="ghost" size="icon-sm" disabled={assignment.pending} />}
                aria-label="Cerrar"
              >
                <XIcon />
              </SheetClose>
            </div>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <RoomAssignmentSteps
              stays={stays}
              rooms={rooms}
              typeNames={typeNames}
              loading={housekeeping.isPending}
              listError={housekeeping.error?.message ?? null}
              assignment={assignment}
              onSelectStay={assignment.selectStay}
              onRetry={() => void housekeeping.refetch()}
              onRetryAssignment={() => void housekeeping.refetch()}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function RoomList({
  detail,
  stays,
  onAssign,
}: {
  detail: ReservationDetail;
  stays: ReservationStay[];
  onAssign?: (stay: ReservationStay) => void;
}) {
  const money = (cents: number) => formatMoney(cents, detail.currency);
  const lines = detail.rooms.toSorted((a, b) =>
    a.roomNumber === null || b.roomNumber === null
      ? Number(a.roomNumber === null) - Number(b.roomNumber === null)
      : a.roomNumber.localeCompare(b.roomNumber, "es", { numeric: true }),
  );
  return (
    <ul aria-label="Habitaciones" className="flex flex-col gap-2">
      {lines.map((line) => {
        const stay = stays.find((item) => item.id === line.id);
        return (
          <li
            key={line.id}
            className={cn(
              "flex min-w-0 border",
              stay && "border-warning-foreground/30 bg-warning text-warning-foreground",
            )}
          >
            <div
              className={cn(
                "flex w-20 shrink-0 items-center justify-center border-r border-dashed font-mono text-xl font-semibold sm:w-24 sm:text-2xl",
                stay ? "border-warning-foreground/40" : "bg-muted/40",
              )}
            >
              {line.roomNumber ??
                (stay && onAssign ? (
                  <Button
                    variant="outline"
                    size="xs"
                    className="font-sans"
                    aria-label={`Asignar ${typeName(line)}`}
                    onClick={() => onAssign(stay)}
                  >
                    Asignar
                  </Button>
                ) : (
                  <>
                    <CircleAlertIcon aria-hidden className="size-4 text-muted-foreground" />
                    <span className="sr-only">Sin asignar</span>
                  </>
                ))}
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                  {typeName(line)}
                  {stay && <span className="text-xs font-normal">Sin asignar</span>}
                  {line.housekeepingStatus === "dirty" && <DirtyRoomBadge />}
                </span>
                <span className={cn("text-xs", stay ? "opacity-80" : "text-muted-foreground")}>
                  {occupantsLabel([line])} · {nightsLabel(line.nights.length)}
                </span>
              </div>
              <span className="shrink-0 text-sm font-medium whitespace-nowrap tabular-nums">
                {money(line.subtotalCents)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
