import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { addDays, differenceInCalendarDays, eachDayOfInterval, parse, startOfDay } from "date-fns";
import {
  BedDoubleIcon,
  CircleHelpIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  RefreshCwIcon,
} from "lucide-react";

import {
  RoomActionsMenu,
  RoomClosureDialog,
  type ClosureTarget,
} from "@/components/room-closure-dialog";
import { RoomEditDialog, type RoomEditTarget } from "@/components/room-edit-dialog";
import { RoomBookingDialog, type BookingTarget } from "@/components/room-booking-dialog";
import { groupRoomLabel } from "@/components/room-assignment-flow";
import { RoomAssignmentPanel } from "@/components/room-assignment-panel";
import { RoomAssignmentSheet } from "@/components/room-assignment-sheet";
import { NewReservationButton } from "@/components/new-reservation-button";
import { primaryActionClearance } from "@/components/page-primary-action";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ButtonGroup } from "@/components/ui/button-group";
import { Separator } from "@/components/ui/separator";
import { PropertyDatePicker } from "@/components/property-date-picker";
import { dateOnlyCarrier } from "@/lib/property-calendar";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SetupRequired } from "@/components/setup-required";
import { Skeleton } from "@/components/ui/skeleton";
import { type RoomClosure } from "@/lib/api";
import type { ReservationStay } from "@/lib/room-assignment";
import { useRoomAssignment } from "@/lib/use-room-assignment";
import { format } from "@/lib/dates";
import { useCalendar } from "@/lib/queries";
import { useIsMobile } from "@/hooks/use-mobile";

const spans = [
  { label: "7 días", value: "7" },
  { label: "14 días", value: "14" },
];

export const stayColors: Record<string, string> = {
  confirmed:
    "border-booking-confirmed-foreground/20 bg-booking-confirmed text-booking-confirmed-foreground",
  checked_in: "border-booking-foreground/20 bg-booking text-booking-foreground",
  checked_out:
    "border-booking-completed-foreground/20 bg-booking-completed text-booking-completed-foreground",
};
const stayLabels: Record<string, string> = {
  confirmed: "Confirmada",
  checked_in: "Check-in",
  checked_out: "Check-out",
};

type TrackItem = {
  id: string;
  reservationId?: string;
  status?: string;
  kind: "stay" | "closure";
  label: string;
  title: string;
  checkIn: string;
  checkOut: string;
};

type PlacedTrack = TrackItem & { start: number; end: number; lane: number };

type AssignmentPreview = {
  stay: PlacedTrack;
  disabled: boolean;
  onSelect: () => void;
};

// Short reasons fit the room column; the full sentence stays in the row title.
const assignmentNotes: Record<string, string> = {
  "Occupied during this stay": "Ocupada",
  "Closed during this stay": "Cerrada",
};

function clipStay(stay: TrackItem, rangeStart: Date, dayCount: number) {
  // Both bookings and closures block nights, with half-day endpoints.
  const start = Math.max(
    0,
    differenceInCalendarDays(parse(stay.checkIn, "yyyy-MM-dd", rangeStart), rangeStart) + 0.5,
  );
  const end = Math.min(
    dayCount,
    differenceInCalendarDays(parse(stay.checkOut, "yyyy-MM-dd", rangeStart), rangeStart) + 0.5,
  );
  if (start >= end) return null;
  return {
    ...stay,
    start,
    end,
  };
}

function placeStays(stays: TrackItem[], rangeStart: Date, dayCount: number) {
  const clipped = stays.flatMap((stay) => {
    const next = clipStay(stay, rangeStart, dayCount);
    return next ? [next] : [];
  });
  clipped.sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  return clipped.map((stay) => {
    let lane = laneEnds.findIndex((end) => end <= stay.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(stay.end);
    } else {
      laneEnds[lane] = stay.end;
    }
    return { ...stay, lane };
  });
}

function stayTrack(stay: {
  id: string;
  reservationId: string;
  guestName: string;
  status?: string;
  checkIn: string;
  checkOut: string;
}): TrackItem {
  return {
    id: stay.id,
    reservationId: stay.reservationId,
    kind: "stay",
    status: stay.status,
    label: stay.guestName,
    title: `${stay.guestName} · ${stayLabels[stay.status ?? "confirmed"]}, ${stay.checkIn} al ${stay.checkOut}`,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
  };
}

function closureTrack(closure: RoomClosure): TrackItem {
  return {
    id: closure.id,
    kind: "closure",
    label: closure.reason || "Cerrada",
    title: closure.reason
      ? `${closure.reason}, ${closure.starts} al ${closure.ends}`
      : `Cerrada, ${closure.starts} al ${closure.ends}`,
    checkIn: closure.starts,
    checkOut: closure.ends,
  };
}

function barStyle(item: PlacedTrack, dayCount: number, laneCount: number) {
  return {
    top: `calc(${(item.lane / laneCount) * 100}% + 0.25rem)`,
    height: `calc(${100 / laneCount}% - 0.5rem)`,
    left: `calc(${(item.start / dayCount) * 100}% + 0.25rem)`,
    width: `calc(${((item.end - item.start) / dayCount) * 100}% - 0.5rem)`,
  };
}

function StayBar({
  stay,
  dayCount,
  laneCount,
  onOpen,
}: {
  stay: PlacedTrack;
  dayCount: number;
  laneCount: number;
  onOpen?: (reservationId: string) => void;
}) {
  const className = cn(
    "absolute z-10 flex items-center overflow-hidden rounded-none border px-2.5 text-left text-xs",
    stayColors[stay.status ?? "confirmed"] ?? stayColors.confirmed,
  );
  if (!onOpen || !stay.reservationId) {
    return (
      <div title={stay.title} className={className} style={barStyle(stay, dayCount, laneCount)}>
        <span className="truncate">{stay.label}</span>
      </div>
    );
  }
  const reservationId = stay.reservationId;
  return (
    <button
      type="button"
      title={stay.title}
      aria-label={`Editar reserva de ${stay.label} · ${stayLabels[stay.status ?? "confirmed"]}`}
      className={cn(
        className,
        "cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
      style={barStyle(stay, dayCount, laneCount)}
      onClick={() => onOpen(reservationId)}
    >
      <span className="truncate">{stay.label}</span>
    </button>
  );
}

function ClosureBar({
  item,
  dayCount,
  laneCount,
  onOpen,
}: {
  item: PlacedTrack;
  dayCount: number;
  laneCount: number;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      title={item.title}
      className="absolute z-10 flex items-center overflow-hidden rounded-none border border-closure-foreground/20 bg-closure px-2.5 text-left text-xs text-closure-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
      style={barStyle(item, dayCount, laneCount)}
      onClick={() => onOpen(item.id)}
    >
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function RoomTrack({
  stays,
  dayCount,
  days,
  roomNumber,
  onBookDay,
  onOpenStay,
  onOpenClosure,
  assignmentActive = false,
  assignmentReason,
  assignmentPreview,
  highlighted = false,
}: {
  stays: PlacedTrack[];
  dayCount: number;
  days: Date[];
  roomNumber: string;
  onBookDay?: (day: Date) => void;
  onOpenStay?: (reservationId: string) => void;
  onOpenClosure?: (id: string) => void;
  assignmentActive?: boolean;
  assignmentReason?: string;
  assignmentPreview?: AssignmentPreview;
  highlighted?: boolean;
}) {
  const lanes = stays.reduce((max, stay) => Math.max(max, stay.lane + 1), 1);
  const { today } = usePropertyCalendar();
  return (
    <div
      className={cn(
        "relative isolate min-w-0 border-b",
        assignmentActive && !assignmentPreview && "bg-muted/30 opacity-50",
        highlighted && "bg-assignment/30",
      )}
      title={assignmentReason}
      style={{
        gridColumn: `2 / span ${dayCount}`,
        minHeight: `${Math.max(2.5, lanes * 1.75 + 0.75)}rem`,
      }}
    >
      <div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))` }}
      >
        {days.map((day, dayIndex) => {
          const date = format(day, "yyyy-MM-dd");
          // Availability is based on nights, not the bar's half-day drawing.
          const occupied = stays.some((stay) => stay.checkIn <= date && stay.checkOut > date);
          const morningBlocked = stays.some((stay) => stay.checkOut === date);
          const disabled = !onBookDay || occupied || date < today;

          return (
            <div key={date} className={cn("relative", dayIndex < dayCount - 1 && "border-r")}>
              {onBookDay ? (
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 outline-none enabled:cursor-pointer enabled:hover:bg-accent/50 enabled:focus-visible:bg-accent enabled:focus-visible:ring-1 enabled:focus-visible:ring-ring enabled:focus-visible:ring-inset disabled:cursor-default"
                  style={{ width: morningBlocked ? "50%" : "100%" }}
                  aria-label={`Nueva reserva para habitación ${roomNumber} el ${format(day, "d MMM yyyy")}`}
                  disabled={disabled}
                  onClick={() => onBookDay(day)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {stays.map((stay) =>
        stay.kind === "closure" && onOpenClosure ? (
          <ClosureBar
            key={`closure-${stay.id}`}
            item={stay}
            dayCount={dayCount}
            laneCount={lanes}
            onOpen={onOpenClosure}
          />
        ) : (
          <StayBar
            key={`stay-${stay.id}`}
            stay={stay}
            dayCount={dayCount}
            laneCount={lanes}
            onOpen={onOpenStay}
          />
        ),
      )}
      {assignmentPreview ? (
        <button
          type="button"
          aria-label={`Asignar ${assignmentPreview.stay.label} a habitación ${roomNumber}, ${assignmentPreview.stay.checkIn} al ${assignmentPreview.stay.checkOut}`}
          disabled={assignmentPreview.disabled}
          onClick={assignmentPreview.onSelect}
          className={cn(
            "absolute z-20 flex cursor-pointer items-center overflow-hidden rounded-none border border-dashed border-assignment-foreground/50 bg-assignment/40 px-2.5 text-left text-xs text-assignment-foreground outline-none hover:bg-assignment/70 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
            highlighted && "bg-assignment/70",
          )}
          style={barStyle(assignmentPreview.stay, dayCount, 1)}
        >
          <span className="truncate">{assignmentPreview.stay.label}</span>
        </button>
      ) : null}
    </div>
  );
}

export function RoomCalendar({
  start,
  span,
  onStartChange,
  onSpanChange,
  onOpenReservation,
}: {
  start: Date;
  span: 7 | 14;
  onStartChange: (date: Date) => void;
  onSpanChange: (span: 7 | 14) => void;
  onOpenReservation: (id: string) => void;
}) {
  const { today } = usePropertyCalendar();
  const isMobile = useIsMobile();
  const roomColumnWidth = isMobile ? 8 : 10;
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [closureTarget, setClosureTarget] = useState<ClosureTarget | null>(null);
  const [roomTarget, setRoomTarget] = useState<RoomEditTarget | null>(null);
  const [bookingTarget, setBookingTarget] = useState<BookingTarget | null>(null);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const assignmentTriggerRef = useRef<HTMLButtonElement>(null);
  const gridScroller = useRef<HTMLDivElement>(null);
  const gridCorner = useRef<HTMLDivElement>(null);
  // Tied to the stay it was made for: the hovered room's button unmounts when it is
  // assigned, so no blur clears it before the next stay opens.
  const [highlight, setHighlight] = useState<{ stayId: string; roomId: string } | null>(null);
  const [manualRefresh, setManualRefresh] = useState<Promise<void> | null>(null);
  const from = format(start, "yyyy-MM-dd");
  const to = format(addDays(start, span - 1), "yyyy-MM-dd");
  const calendarQuery = useCalendar(from, to);
  const calendar = calendarQuery.data;
  const error = calendarQuery.error?.message ?? null;
  const rooms = !calendar
    ? calendarQuery.isError
      ? []
      : null
    : calendar.rooms.map((room) => ({ ...room, typeName: room.roomTypeName }));
  if (manualRefresh && !calendar) setManualRefresh(null);
  const refreshing = manualRefresh !== null && !!calendar;
  const bookingDataReady = !!calendar;
  const unassigned = calendar?.unassigned ?? [];
  const assignment = useRoomAssignment(rooms, unassigned);
  const highlightedRoomId =
    highlight && highlight.stayId === assignment.target?.id ? highlight.roomId : null;
  const typeNames = new Map((rooms ?? []).map((room) => [room.roomTypeId, room.roomTypeName]));
  const listLoading = !calendar && calendarQuery.isFetching;
  const unassignedLabel = listLoading
    ? "Mostrar habitaciones reservadas sin asignar"
    : `Mostrar habitaciones reservadas sin asignar, ${unassigned.length}`;
  const listError = calendar ? null : error;
  const previewTrack =
    !isMobile && assignment.target
      ? placeStays([stayTrack(assignment.target)], start, span)[0]
      : undefined;

  function refreshCalendar() {
    return queryClient.invalidateQueries({ queryKey: ["calendar"] });
  }

  function refreshFromButton() {
    const refresh = refreshCalendar();
    setManualRefresh(refresh);
    void refresh.finally(() => {
      setManualRefresh((current) => (current === refresh ? null : current));
    });
  }

  function retryAssignment() {
    void queryClient.invalidateQueries();
  }

  function changeStart(date: Date) {
    if (assignment.pending) return;
    assignment.cancel();
    onStartChange(date);
  }

  function selectStay(stay: ReservationStay) {
    if (assignment.pending) return;
    assignment.selectStay(stay);
    setHighlight(null);
    if (isMobile) return;
    // Gaps can only be judged with the whole stay on screen, checkout morning
    // included. The list only holds stays that overlap the window.
    const checkIn = parse(stay.checkIn, "yyyy-MM-dd", start);
    const checkOut = parse(stay.checkOut, "yyyy-MM-dd", start);
    const lastDay = addDays(start, span - 1);
    if (checkIn < start) onStartChange(checkIn);
    else if (checkOut > lastDay)
      onStartChange(
        differenceInCalendarDays(checkOut, checkIn) < span ? addDays(checkOut, 1 - span) : checkIn,
      );
  }

  function closeUnassigned() {
    if (assignment.pending) return;
    assignment.cancel();
    setUnassignedOpen(false);
    setHighlight(null);
    assignmentTriggerRef.current?.focus();
  }

  useEffect(() => {
    const scroller = gridScroller.current;
    const row = highlightedRoomId
      ? scroller?.querySelector<HTMLElement>(`[data-room-id="${highlightedRoomId}"]`)
      : null;
    if (!scroller || !row) return;
    // Scroll only the grid: scrollIntoView would also move the app shell.
    const view = scroller.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const top = view.top + (gridCorner.current?.offsetHeight ?? 0);
    if (box.top < top) scroller.scrollBy?.({ top: box.top - top, behavior: "smooth" });
    else if (box.bottom > view.bottom)
      scroller.scrollBy?.({ top: box.bottom - view.bottom, behavior: "smooth" });
  }, [highlightedRoomId]);

  const days = eachDayOfInterval({
    start,
    end: addDays(start, span - 1),
  });
  const closuresByRoom = new Map<string, RoomClosure[]>();
  for (const room of rooms ?? []) {
    closuresByRoom.set(room.id, room.closures);
  }

  function openClosure(id: string) {
    const closure = (rooms ?? []).flatMap((room) => room.closures).find((item) => item.id === id);
    const room = rooms?.find((item) => item.id === closure?.roomId);
    if (!closure || !room) return;
    setClosureTarget({
      mode: "edit",
      closure,
      number: room.number,
      typeName: room.typeName,
    });
  }

  const rangeLabel = `${format(start, "d MMM")} al ${format(addDays(start, span - 1), "d MMM yyyy")}`;
  const assignmentSteps = {
    stays: unassigned,
    rooms,
    typeNames,
    loading: listLoading,
    listError,
    assignment,
    onSelectStay: selectStay,
    onRetry: () => void refreshCalendar(),
    onRetryAssignment: retryAssignment,
  };

  if (calendar?.missingSetup) return <SetupRequired missing={calendar.missingSetup} />;

  const newReservationButton = (
    <NewReservationButton
      scrollRef={gridScroller}
      disabled={assignment.pending}
      onClick={() => setBookingTarget({ mode: "new" })}
    />
  );
  const refreshButton = (
    <Button
      variant="outline"
      size="icon"
      aria-label={refreshing ? "Actualizando…" : "Actualizar"}
      aria-busy={refreshing || undefined}
      disabled={!calendar || assignment.pending || refreshing}
      onClick={refreshFromButton}
    >
      <RefreshCwIcon data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
    </Button>
  );

  const assignmentTrigger = (
    <Button
      ref={assignmentTriggerRef}
      variant="outline"
      size="icon"
      className="relative"
      aria-label={unassignedLabel}
      aria-haspopup={isMobile ? "dialog" : undefined}
      aria-controls={!isMobile && unassignedOpen ? "unassigned-panel" : undefined}
      aria-expanded={unassignedOpen}
      disabled={assignment.pending}
      onClick={() => (!isMobile && unassignedOpen ? closeUnassigned() : setUnassignedOpen(true))}
    >
      <BedDoubleIcon />
      {unassigned.length > 0 && (
        <Badge
          variant="default"
          aria-hidden="true"
          className="pointer-events-none absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1"
        >
          {unassigned.length}
        </Badge>
      )}
    </Button>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {isMobile && newReservationButton}
      <RoomClosureDialog target={closureTarget} onClose={() => setClosureTarget(null)} />
      <RoomEditDialog target={roomTarget} onClose={() => setRoomTarget(null)} />
      <RoomBookingDialog
        target={bookingTarget}
        onClose={() => setBookingTarget(null)}
        onViewReservation={(id) => {
          setBookingTarget(null);
          onOpenReservation(id);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-2.5 py-2">
        {isMobile ? (
          refreshButton
        ) : (
          <div className="flex items-center gap-2">
            <Select
              items={spans}
              value={String(span)}
              disabled={assignment.pending}
              onValueChange={(value) => {
                if (value) {
                  assignment.cancel();
                  onSpanChange(Number(value) as 7 | 14);
                }
              }}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="start">
                <SelectGroup>
                  {spans.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={assignment.pending}
              onClick={() => changeStart(dateOnlyCarrier(today))}
            >
              Hoy
            </Button>
            {refreshButton}
          </div>
        )}
        <ButtonGroup>
          {!isMobile && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Período anterior"
              disabled={assignment.pending}
              onClick={() => changeStart(addDays(start, -span))}
            >
              <ChevronsLeftIcon />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Día anterior"
            disabled={assignment.pending}
            onClick={() => changeStart(addDays(start, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="min-w-32 justify-between md:min-w-36"
                  disabled={assignment.pending}
                />
              }
            >
              {format(start, "d MMM yyyy")}
              <CalendarIcon data-icon="inline-end" />
            </PopoverTrigger>
            <PopoverContent className="w-auto gap-0 p-0">
              <PropertyDatePicker
                mode="single"
                selected={start}
                onSelect={(date) => {
                  if (!date) return;
                  changeStart(startOfDay(date));
                  setPickerOpen(false);
                }}
              />
              {isMobile && (
                <>
                  <Separator />
                  <div className="flex p-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={assignment.pending}
                      onClick={() => {
                        changeStart(dateOnlyCarrier(today));
                        setPickerOpen(false);
                      }}
                    >
                      Hoy
                    </Button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            aria-label="Día siguiente"
            disabled={assignment.pending}
            onClick={() => changeStart(addDays(start, 1))}
          >
            <ChevronRightIcon />
          </Button>
          {!isMobile && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Período siguiente"
              disabled={assignment.pending}
              onClick={() => changeStart(addDays(start, span))}
            >
              <ChevronsRightIcon />
            </Button>
          )}
        </ButtonGroup>
        {isMobile ? (
          <>
            {assignmentTrigger}
            <RoomAssignmentSheet
              open={unassignedOpen}
              onOpenChange={setUnassignedOpen}
              returnFocusRef={assignmentTriggerRef}
              rangeLabel={rangeLabel}
              {...assignmentSteps}
            />
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Colores de reservas"
                  />
                }
              >
                <CircleHelpIcon />
              </TooltipTrigger>
              <TooltipContent variant="legend" side="bottom" align="end" sideOffset={8}>
                <div aria-label="Colores de reservas" className="flex min-w-40 flex-col gap-2.5">
                  {Object.entries(stayLabels).map(([status, label]) => (
                    <span key={status} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn("size-3 rounded-none border", stayColors[status])}
                      />
                      {label}
                    </span>
                  ))}
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-3 rounded-none border border-closure-foreground/20 bg-closure"
                    />
                    Cerrada
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
            {assignmentTrigger}
            {newReservationButton}
          </div>
        )}
      </div>
      {error ? (
        <div className="flex items-center justify-between gap-2 border-b px-2.5 py-2">
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void refreshCalendar()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {!isMobile && assignment.target ? (
        <div className="flex items-center justify-between gap-2 border-b bg-assignment/40 px-2.5 py-1.5 text-xs text-assignment-foreground">
          <p className="min-w-0 truncate">
            Asignando habitación a{" "}
            <span className="font-medium">{assignment.target.guestName}</span>
            {assignment.target.roomCount > 1 ? ` · ${groupRoomLabel(assignment.target)}` : ""} · Esc
            para cancelar
          </p>
          <Button
            variant="ghost"
            size="sm"
            disabled={assignment.pending}
            onClick={assignment.cancel}
            aria-keyshortcuts="Escape"
          >
            Cancelar asignación
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          ref={gridScroller}
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-auto overscroll-none",
            primaryActionClearance,
          )}
        >
          <div
            role={rooms === null ? "region" : undefined}
            aria-label={rooms === null ? "Cargando calendario" : undefined}
            aria-busy={rooms === null ? true : undefined}
            className="grid w-full"
            style={{
              gridTemplateColumns: `${roomColumnWidth}rem repeat(${span}, minmax(6rem, 1fr))`,
              minWidth: `${roomColumnWidth + span * 6}rem`,
            }}
          >
            <div
              ref={gridCorner}
              className="sticky top-0 left-0 z-40 border-r border-b bg-background"
            />
            {days.map((day, dayIndex) => (
              <div
                key={format(day, "yyyy-MM-dd")}
                className={cn(
                  "sticky top-0 z-30 flex min-w-0 flex-col items-center gap-0.5 border-b bg-background px-2.5 py-1.5",
                  dayIndex < span - 1 && "border-r",
                )}
              >
                <span
                  className={cn(
                    "text-xs tracking-wide uppercase",
                    format(day, "yyyy-MM-dd") === today
                      ? "font-medium text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {format(day, "yyyy-MM-dd") === today ? "Hoy" : format(day, "EEE")}
                </span>
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center px-1 text-xs",
                    format(day, "yyyy-MM-dd") === today
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
                <span className="text-xs text-muted-foreground">{format(day, "MMM")}</span>
              </div>
            ))}
            {rooms === null
              ? Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="contents">
                    <div className="sticky left-0 z-20 border-r border-b bg-background px-2.5 py-2">
                      <Skeleton className="h-6 w-16" />
                    </div>
                    <Skeleton
                      className="border-b"
                      style={{
                        gridColumn: `2 / span ${span}`,
                        minHeight: "2.5rem",
                      }}
                    />
                  </div>
                ))
              : null}
            {rooms?.map((room) => (
              <RoomRowView
                key={room.id}
                roomId={room.id}
                number={room.number}
                typeName={room.typeName}
                stays={placeStays(
                  [
                    ...room.stays.map(stayTrack),
                    ...(closuresByRoom.get(room.id) ?? []).map(closureTrack),
                  ],
                  start,
                  span,
                )}
                days={days}
                dayCount={span}
                onEditRoom={() =>
                  setRoomTarget({
                    roomId: room.id,
                    number: room.number,
                    roomTypeId: room.roomTypeId,
                    typeName: room.typeName,
                  })
                }
                onCloseRoom={() =>
                  setClosureTarget({
                    mode: "create",
                    roomId: room.id,
                    number: room.number,
                    typeName: room.typeName,
                  })
                }
                onBookDay={
                  bookingDataReady && !assignment.target
                    ? (day) =>
                        setBookingTarget({
                          mode: "create",
                          roomId: room.id,
                          roomTypeId: room.roomTypeId,
                          number: room.number,
                          typeName: room.typeName,
                          checkIn: format(day, "yyyy-MM-dd"),
                        })
                    : undefined
                }
                onOpenStay={
                  assignment.target
                    ? undefined
                    : (reservationId) =>
                        setBookingTarget({
                          mode: "edit",
                          reservationId,
                          roomId: room.id,
                          number: room.number,
                          typeName: room.typeName,
                        })
                }
                onOpenClosure={openClosure}
                assignmentActive={assignment.target !== null}
                assignmentReason={
                  assignment.target
                    ? assignment.checking
                      ? "Consultando disponibilidad para toda la estancia"
                      : (assignment.error ?? assignment.roomIssues.get(room.id) ?? undefined)
                    : undefined
                }
                assignmentNote={
                  assignment.target?.roomTypeId === room.roomTypeId
                    ? assignmentNotes[assignment.roomIssueCodes.get(room.id) ?? ""]
                    : undefined
                }
                highlighted={highlightedRoomId === room.id}
                assignmentPreview={
                  assignment.ready && previewTrack && assignment.roomIssues.get(room.id) === null
                    ? {
                        stay: previewTrack,
                        disabled: assignment.pending,
                        onSelect: () => {
                          void assignment.assignRoom(room.id);
                        },
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
        {!isMobile && unassignedOpen && (
          <aside
            aria-label="Habitaciones reservadas sin asignar"
            // border-l is the fixed scroll-edge separator; last grid columns
            // omit border-r so it does not double-stack when flush.
            className="flex min-h-0 w-80 shrink-0 flex-col border-l bg-background"
          >
            <RoomAssignmentPanel
              rangeLabel={rangeLabel}
              onClose={closeUnassigned}
              onHighlightRoom={(roomId) =>
                setHighlight(
                  roomId && assignment.target ? { stayId: assignment.target.id, roomId } : null,
                )
              }
              {...assignmentSteps}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function RoomRowView({
  number,
  typeName,
  stays,
  days,
  dayCount,
  onEditRoom,
  onCloseRoom,
  onBookDay,
  onOpenStay,
  onOpenClosure,
  roomId,
  assignmentActive = false,
  assignmentReason,
  assignmentNote,
  assignmentPreview,
  highlighted = false,
}: {
  roomId: string;
  number: string;
  typeName: string;
  stays: PlacedTrack[];
  days: Date[];
  dayCount: number;
  onEditRoom?: () => void;
  onCloseRoom?: () => void;
  onBookDay?: (day: Date) => void;
  onOpenStay?: (reservationId: string) => void;
  onOpenClosure?: (id: string) => void;
  assignmentActive?: boolean;
  assignmentReason?: string;
  assignmentNote?: string;
  assignmentPreview?: AssignmentPreview;
  highlighted?: boolean;
}) {
  return (
    <>
      <div
        data-room-id={roomId}
        className={cn(
          "group/room sticky left-0 z-20 flex min-w-0 items-center gap-1 border-r border-b bg-background px-2.5",
          "can-hover:has-data-popup-open:[&_[data-slot=room-label]]:pr-7",
          assignmentActive && !assignmentPreview && "text-muted-foreground",
          assignmentPreview && "bg-assignment",
          highlighted && "ring-1 ring-assignment-foreground/50 ring-inset",
        )}
        title={assignmentReason}
      >
        <div
          data-slot="room-label"
          className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 can-hover:group-focus-within/room:pr-7 can-hover:group-hover/room:pr-7"
        >
          <span className="truncate text-xs font-medium" title={number}>
            {number}
          </span>
          {assignmentNote ? (
            <span className="truncate text-xs font-medium">{assignmentNote}</span>
          ) : (
            <span className="truncate text-xs text-muted-foreground" title={typeName}>
              {typeName}
            </span>
          )}
        </div>
        {onEditRoom && onCloseRoom ? (
          <div
            className={cn(
              "shrink-0",
              "can-hover:pointer-events-none can-hover:absolute can-hover:top-1/2 can-hover:right-2.5 can-hover:-translate-y-1/2 can-hover:opacity-0",
              "can-hover:group-hover/room:pointer-events-auto can-hover:group-hover/room:opacity-100",
              "can-hover:group-focus-within/room:pointer-events-auto can-hover:group-focus-within/room:opacity-100",
              "can-hover:has-data-popup-open:pointer-events-auto can-hover:has-data-popup-open:opacity-100",
            )}
          >
            <RoomActionsMenu number={number} onEditRoom={onEditRoom} onCloseRoom={onCloseRoom} />
          </div>
        ) : null}
      </div>
      <RoomTrack
        stays={stays}
        dayCount={dayCount}
        days={days}
        roomNumber={number}
        onBookDay={onBookDay}
        onOpenStay={onOpenStay}
        onOpenClosure={onOpenClosure}
        assignmentActive={assignmentActive}
        assignmentReason={assignmentReason}
        assignmentPreview={assignmentPreview}
        highlighted={highlighted}
      />
    </>
  );
}
