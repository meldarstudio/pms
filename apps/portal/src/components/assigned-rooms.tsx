import { CircleAlertIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { useRef, useState } from "react";
import { RoomAssignmentSteps } from "@/components/room-assignment-flow";
import { DirtyRoomBadge } from "@/components/dirty-room-badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useResponsivePanel } from "@/components/responsive-panel";
import type { ReservationDetail } from "@/lib/api";
import { receivesAssignments, type ReservationStay } from "@/lib/assignment-availability";
import { useHousekeeping } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { occupantsLabel } from "@/lib/reservation-list";
import { useRoomAssignment } from "@/lib/use-room-assignment";

type Line = ReservationDetail["rooms"][number];

function typeName(line: Line) {
  return line.roomTypeName || "Habitación";
}

function assignableStays(detail: ReservationDetail): ReservationStay[] {
  if (!receivesAssignments(detail.status)) return [];
  return detail.rooms.map((line, index) => ({
    id: line.id,
    reservationId: detail.id,
    guestName: detail.guest.fullName,
    status: detail.status,
    checkIn: detail.checkIn,
    checkOut: detail.checkOut,
    roomId: line.roomId,
    roomNumber: line.roomNumber,
    roomTypeId: line.roomTypeId,
    roomIndex: index + 1,
    roomCount: detail.rooms.length,
  }));
}

type EditGuests = (lineId: string) => void;

export function AssignedRooms({
  detail,
  onEditGuests,
}: {
  detail: ReservationDetail;
  onEditGuests: EditGuests;
}) {
  const stays = assignableStays(detail);
  return stays.length > 0 ? (
    <AssignableRooms detail={detail} stays={stays} onEditGuests={onEditGuests} />
  ) : (
    <RoomList detail={detail} stays={stays} onEditGuests={onEditGuests} />
  );
}

function AssignableRooms({
  detail,
  stays,
  onEditGuests,
}: {
  detail: ReservationDetail;
  stays: ReservationStay[];
  onEditGuests: EditGuests;
}) {
  const housekeeping = useHousekeeping();
  const rooms = housekeeping.data?.rooms ?? null;
  const unassigned = stays.filter((stay) => stay.roomId === null);
  const assignment = useRoomAssignment(rooms, unassigned);
  const { asDrawer: isMobile } = useResponsivePanel(assignment.target, { tabletDrawer: true });
  const Panel = isMobile ? Drawer : Sheet;
  const PanelContent = isMobile ? DrawerContent : SheetContent;
  const PanelHeader = isMobile ? DrawerHeader : SheetHeader;
  const PanelFooter = isMobile ? DrawerFooter : SheetFooter;
  const PanelTitle = isMobile ? DrawerTitle : SheetTitle;
  const PanelDescription = isMobile ? DrawerDescription : SheetDescription;
  const PanelClose = isMobile ? DrawerClose : SheetClose;
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const replacing = assignment.target?.roomId != null;
  const selectedRoom = rooms?.find((room) => room.id === selectedRoomId);
  const canConfirm =
    selectedRoom && assignment.ready && assignment.roomProblems.get(selectedRoom.id) === null;
  const typeNames = new Map(detail.rooms.map((line) => [line.roomTypeId, typeName(line)]));
  return (
    <>
      <RoomList
        detail={detail}
        stays={stays}
        onEditGuests={onEditGuests}
        onAssign={(stay, button) => {
          trigger.current = button;
          setSelectedRoomId(null);
          assignment.selectStay(stay);
        }}
      />
      <Panel
        {...(isMobile ? { showSwipeHandle: true } : {})}
        open={assignment.target !== null}
        onOpenChange={(open, details) => {
          if (assignment.pending) {
            details.cancel();
            return;
          }
          if (!open) assignment.cancel();
        }}
      >
        <PanelContent
          {...(isMobile ? {} : { showCloseButton: false })}
          finalFocus={() => (trigger.current?.isConnected ? trigger.current : true)}
          className={cn(
            !isMobile && "overflow-hidden",
            isMobile && "data-[swipe-axis=y]:max-h-[85dvh] pb-[env(safe-area-inset-bottom)]",
          )}
        >
          <PanelHeader className="shrink-0 border-b pb-4">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <PanelTitle>{replacing ? "Cambiar habitación" : "Elegir habitación"}</PanelTitle>
                <PanelDescription>
                  {replacing ? (
                    <>
                      <span className="block font-medium text-foreground">
                        Habitación actual: {assignment.target?.roomNumber}
                      </span>
                      {assignment.target?.status === "checked_in"
                        ? "El cambio se aplica a toda la estadía."
                        : "Elige otra habitación del mismo tipo."}
                    </>
                  ) : (
                    "Toca una habitación disponible para asignarla a toda la estancia."
                  )}
                </PanelDescription>
              </div>
              <PanelClose
                render={<Button variant="ghost" size="icon-sm" disabled={assignment.pending} />}
                aria-label="Cerrar"
              >
                <XIcon />
              </PanelClose>
            </div>
          </PanelHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <RoomAssignmentSteps
              stays={unassigned}
              rooms={rooms}
              typeNames={typeNames}
              loading={housekeeping.isPending}
              listError={housekeeping.error?.message ?? null}
              assignment={assignment}
              onSelectStay={assignment.selectStay}
              onRetry={() => void housekeeping.refetch()}
              onRetryAssignment={() => {
                void housekeeping.refetch();
                if (replacing) void assignment.retryAvailability();
              }}
              selection={
                replacing
                  ? {
                      roomId: selectedRoomId,
                      select: (id) => setSelectedRoomId((current) => (current === id ? null : id)),
                    }
                  : undefined
              }
            />
          </div>
          {replacing && (
            <PanelFooter className="shrink-0 border-t">
              <Button
                disabled={!canConfirm || assignment.pending}
                onClick={() => {
                  if (canConfirm) void assignment.assignRoom(selectedRoom.id);
                }}
              >
                {selectedRoom ? `Cambiar a ${selectedRoom.number}` : "Cambiar habitación"}
              </Button>
            </PanelFooter>
          )}
        </PanelContent>
      </Panel>
    </>
  );
}

function RoomList({
  detail,
  stays,
  onAssign,
  onEditGuests,
}: {
  detail: ReservationDetail;
  stays: ReservationStay[];
  onAssign?: (stay: ReservationStay, button: HTMLButtonElement) => void;
  onEditGuests: EditGuests;
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
        const unassigned = stay?.roomId === null;
        return (
          <li
            key={line.id}
            className={cn(
              "flex min-w-0 border",
              unassigned && "border-warning-foreground/30 bg-warning text-warning-foreground",
            )}
          >
            <div
              className={cn(
                "flex w-20 shrink-0 items-center justify-center border-r border-dashed font-mono text-xl font-semibold sm:w-24 sm:text-2xl",
                unassigned ? "border-warning-foreground/40" : "bg-muted/40",
              )}
            >
              {line.roomNumber !== null ? (
                stay && onAssign ? (
                  <Button
                    variant="ghost"
                    className="h-full min-h-11 w-full px-1 active:bg-muted"
                    aria-label={`Cambiar habitación ${line.roomNumber}`}
                    aria-haspopup="dialog"
                    onClick={(event) => onAssign(stay, event.currentTarget)}
                  >
                    <span className="truncate text-xl font-semibold sm:text-2xl">
                      {line.roomNumber}
                    </span>
                  </Button>
                ) : (
                  line.roomNumber
                )
              ) : unassigned && onAssign ? (
                <Button
                  variant="outline"
                  size="xs"
                  className="font-sans"
                  aria-label={`Asignar ${typeName(line)}`}
                  onClick={(event) => onAssign(stay, event.currentTarget)}
                >
                  Asignar
                </Button>
              ) : (
                <>
                  <CircleAlertIcon aria-hidden className="size-4 text-muted-foreground" />
                  <span className="sr-only">Sin asignar</span>
                </>
              )}
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                  {typeName(line)}
                  {unassigned && <span className="text-xs font-normal">Sin asignar</span>}
                  {line.housekeepingStatus === "dirty" && <DirtyRoomBadge />}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-auto w-fit justify-start border-0 px-0 py-0 text-xs font-normal pointer-coarse:min-h-(--control-h-xs) underline-offset-4 hover:bg-transparent hover:underline dark:hover:bg-transparent",
                    unassigned ? "opacity-80" : "text-muted-foreground",
                  )}
                  aria-label={`Cambiar huéspedes de ${line.roomNumber ? `habitación ${line.roomNumber}` : typeName(line).toLowerCase()}: ${occupantsLabel([line])}`}
                  aria-haspopup="dialog"
                  onClick={() => onEditGuests(line.id)}
                >
                  {occupantsLabel([line])}
                </Button>
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
