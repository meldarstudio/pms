import { ChevronRightIcon, CircleAlertIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { RoomAssignmentSteps } from "@/components/room-assignment-flow";
import { RoomOccupancyForm } from "@/components/room-occupancy-form";
import { DirtyRoomBadge } from "@/components/dirty-room-badge";
import { NightlyPriceList } from "@/components/nightly-price-detail";
import { Button } from "@/components/ui/button";
import { useResponsivePanel } from "@/components/responsive-panel";
import type { ReservationDetail } from "@/lib/api";
import { receivesAssignments, type ReservationStay } from "@/lib/assignment-availability";
import { formatMoney } from "@/lib/money";
import { useHousekeeping } from "@/lib/queries";
import { useReservationCommands } from "@/lib/reservation-commands";
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

export function AssignedRooms({ detail }: { detail: ReservationDetail }) {
  const stays = assignableStays(detail);
  const housekeeping = useHousekeeping(stays.length > 0);
  const rooms = housekeeping.data?.rooms ?? null;
  const unassigned = stays.filter((stay) => stay.roomId === null);
  const [selected, setSelected] = useState<{ id: string; open: boolean } | null>(null);
  function closeDetails() {
    setSelected((current) => current && { ...current, open: false });
  }
  const assignment = useRoomAssignment(rooms, unassigned);
  const commands = useReservationCommands(detail.id);
  const selectedRoom = detail.rooms.find((line) => line.id === selected?.id);
  const room = selectedRoom?.roomNumber != null ? selectedRoom : undefined;
  const stay = stays.find((item) => item.id === room?.id);
  const picker = assignment.target;
  const switching = picker?.roomId != null;
  const assigning = picker?.roomId === null;
  const active = Boolean(picker || (selected?.open && room));
  const { asDrawer, surface } = useResponsivePanel(active ? "rooms" : null, { tabletDrawer: true });
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const switchHeading = useRef<HTMLHeadingElement>(null);
  const busy = commands.saving || assignment.pending;
  const typeNames = new Map(detail.rooms.map((line) => [line.roomTypeId, typeName(line)]));
  const roomSummary =
    room && (stay ? typeName(room) : `${typeName(room)} · ${occupantsLabel([room])}`);
  const pickerContent = (
    <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
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
          void Promise.all([housekeeping.refetch(), assignment.retryAvailability()]);
        }}
      />
    </div>
  );

  return (
    <>
      <RoomList
        detail={detail}
        stays={stays}
        onDetails={(line, button) => {
          trigger.current = button;
          setSelected({ id: line.id, open: true });
        }}
        onAssign={(target, button) => {
          trigger.current = button;
          assignment.selectStay(target);
        }}
      />
      <RoomPanel
        surface={surface}
        asDrawer={asDrawer}
        title={assigning ? "Elegir habitación" : `Habitación ${room?.roomNumber ?? ""}`}
        description={
          assigning
            ? "Toca una habitación disponible para asignarla a toda la estancia."
            : roomSummary
        }
        open={active && !switching}
        busy={busy}
        heading={heading}
        finalFocus={() => !switching && (trigger.current?.isConnected ? trigger.current : true)}
        onClose={() => {
          if (assigning) assignment.cancel();
          closeDetails();
        }}
      >
        {assigning ? (
          pickerContent
        ) : room && stay ? (
          <RoomOccupancyForm
            key={room.id}
            room={room}
            commands={commands}
            Footer={surface.Footer}
            onSwitchRoom={() => {
              closeDetails();
              assignment.selectStay(stay);
            }}
            onEditEnd={() => heading.current?.focus()}
          >
            <RoomPrices room={room} currency={detail.currency} />
          </RoomOccupancyForm>
        ) : (
          room && (
            <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
              <RoomPrices room={room} currency={detail.currency} />
            </div>
          )
        )}
      </RoomPanel>
      <RoomPanel
        surface={surface}
        asDrawer={asDrawer}
        title="Cambiar asignación"
        description={`Habitación actual: ${picker?.roomNumber ?? room?.roomNumber ?? "—"}`}
        open={switching}
        busy={busy}
        heading={switchHeading}
        finalFocus={() => (trigger.current?.isConnected ? trigger.current : true)}
        onClose={assignment.cancel}
      >
        {switching && pickerContent}
      </RoomPanel>
    </>
  );
}

function RoomPanel({
  surface,
  asDrawer,
  title,
  description,
  open,
  busy,
  heading,
  finalFocus,
  onClose,
  children,
}: {
  surface: ReturnType<typeof useResponsivePanel>["surface"];
  asDrawer: boolean;
  title: string;
  description?: string;
  open: boolean;
  busy: boolean;
  heading: RefObject<HTMLHeadingElement | null>;
  finalFocus: () => HTMLButtonElement | boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { Root, Content, Header, Title, Description, Close } = surface;
  return (
    <Root
      {...(asDrawer ? { showSwipeHandle: true } : {})}
      open={open}
      onOpenChange={(next, event) => {
        if (next) return;
        if (busy) event.cancel();
        else onClose();
      }}
    >
      <Content
        {...(asDrawer ? {} : { showCloseButton: false })}
        initialFocus={heading}
        finalFocus={finalFocus}
        className={cn(
          "overflow-hidden",
          asDrawer
            ? "data-[swipe-axis=y]:max-h-[85dvh] pb-[env(safe-area-inset-bottom)] data-ending-style:transition-[transform,opacity,filter]"
            : "data-[side=right]:sm:max-w-md",
        )}
      >
        <Header className="flex shrink-0 flex-row items-start gap-2 border-b px-4 py-3 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Title ref={heading} tabIndex={-1} className="wrap-anywhere outline-none">
              {title}
            </Title>
            {description && <Description className="wrap-anywhere">{description}</Description>}
          </div>
          <Close
            render={<Button type="button" variant="ghost" size="icon-sm" disabled={busy} />}
            aria-label="Cerrar"
          >
            <XIcon />
          </Close>
        </Header>
        {children}
      </Content>
    </Root>
  );
}

function RoomList({
  detail,
  stays,
  onAssign,
  onDetails,
}: {
  detail: ReservationDetail;
  stays: ReservationStay[];
  onAssign: (stay: ReservationStay, button: HTMLButtonElement) => void;
  onDetails: (room: Line, button: HTMLButtonElement) => void;
}) {
  const lines = detail.rooms.toSorted((a, b) =>
    a.roomNumber === null || b.roomNumber === null
      ? Number(a.roomNumber === null) - Number(b.roomNumber === null)
      : a.roomNumber.localeCompare(b.roomNumber, "es", { numeric: true }),
  );
  return (
    <>
      <ul aria-label="Habitaciones" className="flex flex-col gap-2">
        {lines.map((line) => {
          const stay = stays.find((item) => item.id === line.id);
          const unassigned = stay?.roomId === null;
          const actionable = unassigned || line.roomNumber !== null;
          return (
            <li
              key={line.id}
              className={cn(
                "relative flex min-w-0 border",
                unassigned && "border-warning-foreground/30 bg-warning text-warning-foreground",
                line.roomNumber !== null && "hover:bg-muted/40",
              )}
            >
              <div
                className={cn(
                  "flex w-20 shrink-0 items-center justify-center border-r border-dashed font-mono text-xl font-semibold sm:w-24 sm:text-2xl",
                  unassigned ? "border-warning-foreground/40" : "bg-muted/40",
                )}
              >
                {line.roomNumber !== null ? (
                  <span className="truncate px-1">{line.roomNumber}</span>
                ) : unassigned ? (
                  <span aria-hidden="true" className="font-sans text-xs font-medium">
                    Asignar
                  </span>
                ) : (
                  <>
                    <CircleAlertIcon aria-hidden className="size-4 text-muted-foreground" />
                    <span className="sr-only">Sin asignar</span>
                  </>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col px-4 py-3">
                <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                  {actionable ? (
                    <button
                      type="button"
                      aria-label={
                        unassigned
                          ? `Asignar ${typeName(line)}`
                          : `Ver detalles de la habitación ${line.roomNumber} · ${typeName(line)}`
                      }
                      aria-haspopup="dialog"
                      className="min-w-0 text-left wrap-anywhere outline-none after:absolute after:inset-0 enabled:cursor-pointer focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      onClick={(event) => {
                        if (unassigned) onAssign(stay, event.currentTarget);
                        else onDetails(line, event.currentTarget);
                      }}
                    >
                      {typeName(line)}
                    </button>
                  ) : (
                    typeName(line)
                  )}
                  {unassigned && <span className="text-xs font-normal">Sin asignar</span>}
                  {line.housekeepingStatus === "dirty" && <DirtyRoomBadge />}
                </span>
                <span
                  className={cn("text-xs", unassigned ? "opacity-80" : "text-muted-foreground")}
                >
                  {occupantsLabel([line])}
                </span>
              </div>
              {actionable && (
                <ChevronRightIcon
                  aria-hidden
                  className={cn(
                    "mr-4 size-4 shrink-0 self-center",
                    unassigned ? "opacity-80" : "text-muted-foreground",
                  )}
                />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function RoomPrices({ room, currency }: { room: Line; currency: ReservationDetail["currency"] }) {
  const money = (cents: number) => formatMoney(cents, currency);
  const hasSeparateCharge = room.totalCents !== room.subtotalCents;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Precios por noche</h3>
      {room.nights.length ? (
        <NightlyPriceList nights={room.nights} currency={currency} />
      ) : (
        <p className="text-muted-foreground">No hay precios por noche registrados.</p>
      )}
      <dl className="flex flex-col gap-1.5 border-t pt-3">
        <div
          className={cn(
            "flex flex-wrap items-baseline justify-between gap-x-4",
            hasSeparateCharge ? "text-muted-foreground" : "text-sm font-medium",
          )}
        >
          <dt>Subtotal de la habitación</dt>
          <dd className="ml-auto tabular-nums">{money(room.subtotalCents)}</dd>
        </div>
        {room.discountCents > 0 && (
          <div className="flex flex-wrap justify-between gap-x-4 text-muted-foreground">
            <dt>Descuento de la habitación</dt>
            <dd className="ml-auto tabular-nums">{money(-room.discountCents)}</dd>
          </div>
        )}
        {hasSeparateCharge && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm font-medium">
            <dt>Cargo de la habitación</dt>
            <dd className="ml-auto tabular-nums">{money(room.totalCents)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
