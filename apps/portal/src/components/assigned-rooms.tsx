import { Fragment } from "react";
import { CircleAlertIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { RoomAssignmentSteps } from "@/components/room-assignment-flow";
import { DirtyRoomBadge } from "@/components/dirty-room-badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
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
import { occupantsLabel } from "@/lib/reservation-list";
import { useRoomAssignment } from "@/lib/use-room-assignment";

type Line = ReservationDetail["rooms"][number];

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
  const lines = detail.rooms.toSorted((a, b) =>
    a.roomNumber === null || b.roomNumber === null
      ? Number(a.roomNumber === null) - Number(b.roomNumber === null)
      : a.roomNumber.localeCompare(b.roomNumber, "es", { numeric: true }),
  );
  return (
    <section
      aria-label="Habitaciones asignadas"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Habitaciones asignadas</h3>
        <p className="text-xs text-muted-foreground">
          {lines.length} {lines.length === 1 ? "habitación" : "habitaciones"}
          {stays.length > 0 && (
            <span className="font-medium text-warning-foreground">
              {" "}
              · {stays.length} sin asignar
            </span>
          )}
        </p>
      </div>
      <ItemGroup className="min-h-0 gap-0 overflow-y-auto border">
        {lines.map((line, index) => {
          const stay = stays.find((item) => item.id === line.id);
          return (
            <Fragment key={line.id}>
              {index > 0 && <ItemSeparator className="my-0" />}
              <Item
                role="listitem"
                className={cn("flex-nowrap", stay && "bg-warning text-warning-foreground")}
              >
                <ItemMedia
                  className={cn(
                    "h-7 min-w-10 border px-1.5 font-mono text-sm font-semibold",
                    line.roomNumber
                      ? "bg-muted"
                      : stay
                        ? "border-dashed border-warning-foreground/60"
                        : "border-dashed text-muted-foreground",
                  )}
                >
                  {line.roomNumber ?? <CircleAlertIcon className="size-3.5" aria-hidden="true" />}
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full min-w-0">
                    <span className="truncate">
                      {!line.roomNumber && <span className="sr-only">Sin asignar · </span>}
                      {typeName(line)}
                      <span
                        className={cn(
                          "font-normal",
                          stay ? "text-warning-foreground/90" : "text-muted-foreground",
                        )}
                      >
                        {" "}
                        · {occupantsLabel([line])}
                      </span>
                    </span>
                  </ItemTitle>
                </ItemContent>
                {stay && onAssign ? (
                  <ItemActions>
                    <Button variant="outline" size="xs" onClick={() => onAssign(stay)}>
                      Asignar
                    </Button>
                  </ItemActions>
                ) : (
                  line.housekeepingStatus === "dirty" && (
                    <ItemActions>
                      <DirtyRoomBadge />
                    </ItemActions>
                  )
                )}
              </Item>
            </Fragment>
          );
        })}
      </ItemGroup>
    </section>
  );
}
