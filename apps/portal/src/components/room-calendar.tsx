import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { cn } from "cn"
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  parse,
  startOfDay,
  startOfToday,
} from "date-fns"
import {
  CircleHelpIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  PanelRightIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react"

import {
  RoomActionsMenu,
  RoomClosureDialog,
  type ClosureTarget,
} from "@/components/room-closure-dialog"
import {
  RoomEditDialog,
  type RoomEditTarget,
} from "@/components/room-edit-dialog"
import {
  RoomBookingDialog,
  type BookingTarget,
} from "@/components/room-booking-dialog"
import { RoomAssignmentPanel } from "@/components/room-assignment-panel"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { type RoomClosure } from "@/lib/api"
import {
  reservationStays,
  unassignedStays,
  type ReservationStay,
} from "@/lib/room-assignment"
import { useRoomAssignment } from "@/lib/use-room-assignment"
import { format } from "@/lib/dates"
import {
  useReservations,
  useRoomClosures,
  useRoomTypes,
  useRooms,
} from "@/lib/queries"

const spans = [
  { label: "7 días", value: "7" },
  { label: "14 días", value: "14" },
]

export const stayColors: Record<string, string> = {
  confirmed:
    "border-booking-confirmed-foreground/20 bg-booking-confirmed text-booking-confirmed-foreground",
  checked_in: "border-booking-foreground/20 bg-booking text-booking-foreground",
  checked_out:
    "border-booking-completed-foreground/20 bg-booking-completed text-booking-completed-foreground",
}
const stayLabels: Record<string, string> = {
  confirmed: "Confirmada",
  checked_in: "Check-in",
  checked_out: "Check-out",
}

type TrackItem = {
  id: string
  reservationId?: string
  status?: string
  kind: "stay" | "closure"
  label: string
  title: string
  checkIn: string
  checkOut: string
}

type PlacedTrack = TrackItem & { start: number; end: number; lane: number }

type AssignmentPreview = {
  stay: PlacedTrack
  selected: boolean
  disabled: boolean
  onSelect: () => void
}

function clipStay(stay: TrackItem, rangeStart: Date, dayCount: number) {
  // Both bookings and closures block nights, with half-day endpoints.
  const start = Math.max(
    0,
    differenceInCalendarDays(
      parse(stay.checkIn, "yyyy-MM-dd", rangeStart),
      rangeStart
    ) + 0.5
  )
  const end = Math.min(
    dayCount,
    differenceInCalendarDays(
      parse(stay.checkOut, "yyyy-MM-dd", rangeStart),
      rangeStart
    ) + 0.5
  )
  if (start >= end) return null
  return {
    ...stay,
    start,
    end,
  }
}

function placeStays(stays: TrackItem[], rangeStart: Date, dayCount: number) {
  const clipped = stays.flatMap((stay) => {
    const next = clipStay(stay, rangeStart, dayCount)
    return next ? [next] : []
  })
  clipped.sort((a, b) => a.start - b.start || a.end - b.end)
  const laneEnds: number[] = []
  return clipped.map((stay) => {
    let lane = laneEnds.findIndex((end) => end <= stay.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(stay.end)
    } else {
      laneEnds[lane] = stay.end
    }
    return { ...stay, lane }
  })
}

function stayTrack(stay: ReservationStay): TrackItem {
  return {
    id: stay.id,
    reservationId: stay.reservationId,
    kind: "stay",
    status: stay.status,
    label: stay.guestName,
    title: `${stay.guestName} · ${stayLabels[stay.status ?? "confirmed"]}, ${stay.checkIn} al ${stay.checkOut}`,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
  }
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
  }
}

function barStyle(item: PlacedTrack, dayCount: number, laneCount: number) {
  return {
    top: `calc(${(item.lane / laneCount) * 100}% + 0.25rem)`,
    height: `calc(${100 / laneCount}% - 0.5rem)`,
    left: `calc(${(item.start / dayCount) * 100}% + 0.25rem)`,
    width: `calc(${((item.end - item.start) / dayCount) * 100}% - 0.5rem)`,
  }
}

function StayBar({
  stay,
  dayCount,
  laneCount,
  onOpen,
}: {
  stay: PlacedTrack
  dayCount: number
  laneCount: number
  onOpen?: (reservationId: string) => void
}) {
  const className = cn(
    "absolute z-10 flex items-center overflow-hidden rounded-none border px-2.5 text-left text-xs",
    stayColors[stay.status ?? "confirmed"] ?? stayColors.confirmed
  )
  if (!onOpen || !stay.reservationId) {
    return (
      <div
        title={stay.title}
        className={className}
        style={barStyle(stay, dayCount, laneCount)}
      >
        <span className="truncate">{stay.label}</span>
      </div>
    )
  }
  const reservationId = stay.reservationId
  return (
    <button
      type="button"
      title={stay.title}
      aria-label={`Editar reserva de ${stay.label} · ${stayLabels[stay.status ?? "confirmed"]}`}
      className={cn(
        className,
        "cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring"
      )}
      style={barStyle(stay, dayCount, laneCount)}
      onClick={() => onOpen(reservationId)}
    >
      <span className="truncate">{stay.label}</span>
    </button>
  )
}

function ClosureBar({
  item,
  dayCount,
  laneCount,
  onOpen,
}: {
  item: PlacedTrack
  dayCount: number
  laneCount: number
  onOpen: (id: string) => void
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
  )
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
}: {
  stays: PlacedTrack[]
  dayCount: number
  days: Date[]
  roomNumber: string
  onBookDay?: (day: Date) => void
  onOpenStay?: (reservationId: string) => void
  onOpenClosure?: (id: string) => void
  assignmentActive?: boolean
  assignmentReason?: string
  assignmentPreview?: AssignmentPreview
}) {
  const lanes = stays.reduce((max, stay) => Math.max(max, stay.lane + 1), 1)
  return (
    <div
      className={cn(
        "relative isolate min-w-0 border-b",
        assignmentActive && !assignmentPreview && "bg-muted/30 opacity-50"
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
        {days.map((day) => {
          const date = format(day, "yyyy-MM-dd")
          // Availability is based on nights, not the bar's half-day drawing.
          const occupied = stays.some(
            (stay) => stay.checkIn <= date && stay.checkOut > date
          )
          const morningBlocked = stays.some((stay) => stay.checkOut === date)
          const disabled =
            !onBookDay ||
            occupied ||
            date < format(startOfToday(), "yyyy-MM-dd")

          return (
            <div key={date} className="relative border-r">
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
          )
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
        )
      )}
      {assignmentPreview ? (
        <button
          type="button"
          aria-label={`Asignar ${assignmentPreview.stay.label} a habitación ${roomNumber}, ${assignmentPreview.stay.checkIn} al ${assignmentPreview.stay.checkOut}`}
          aria-pressed={assignmentPreview.selected}
          disabled={assignmentPreview.disabled}
          onClick={assignmentPreview.onSelect}
          className={cn(
            "absolute z-20 flex cursor-pointer items-center overflow-hidden rounded-none border border-dashed border-booking-foreground/50 bg-booking/40 px-2.5 text-left text-xs text-booking-foreground outline-none hover:bg-booking/70 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
            assignmentPreview.selected &&
              "border-solid bg-booking ring-1 ring-booking-foreground/50"
          )}
          style={barStyle(assignmentPreview.stay, dayCount, 1)}
        >
          <span className="truncate">{assignmentPreview.stay.label}</span>
        </button>
      ) : null}
    </div>
  )
}

export function RoomCalendar({
  start,
  span,
  onStartChange,
  onSpanChange,
  onOpenReservation,
}: {
  start: Date
  span: 7 | 14
  onStartChange: (date: Date) => void
  onSpanChange: (span: 7 | 14) => void
  onOpenReservation: (id: string) => void
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const queryClient = useQueryClient()
  const today = format(startOfToday(), "yyyy-MM-dd")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [closureTarget, setClosureTarget] = useState<ClosureTarget | null>(null)
  const [roomTarget, setRoomTarget] = useState<RoomEditTarget | null>(null)
  const [bookingTarget, setBookingTarget] = useState<BookingTarget | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  // Include bookings and closures ending on the first visible morning.
  // Both list APIs use an exclusive end boundary for their `from` filter.
  const rangeFrom = format(addDays(start, -1), "yyyy-MM-dd")
  const rangeTo = format(addDays(start, span - 1), "yyyy-MM-dd")
  const roomsQuery = useRooms()
  const typesQuery = useRoomTypes()
  const reservationsQuery = useReservations(rangeFrom, rangeTo)
  const closuresQuery = useRoomClosures(rangeFrom, rangeTo)

  const typeNames = new Map(
    typesQuery.data?.map((type) => [type.id, type.name]) ?? []
  )
  const loading = roomsQuery.isPending || typesQuery.isPending
  const rooms = loading
    ? null
    : (roomsQuery.data ?? [])
        .map((room) => ({
          ...room,
          typeName: typeNames.get(room.roomTypeId) ?? "Room",
        }))
        .sort((a, b) =>
          a.number.localeCompare(b.number, undefined, { numeric: true })
        )
  const error =
    roomsQuery.error?.message ??
    typesQuery.error?.message ??
    reservationsQuery.error?.message ??
    closuresQuery.error?.message ??
    null
  const bookingDataReady =
    !reservationsQuery.isPending &&
    !reservationsQuery.isFetching &&
    !reservationsQuery.isPlaceholderData &&
    !reservationsQuery.isError &&
    !closuresQuery.isPending &&
    !closuresQuery.isFetching &&
    !closuresQuery.isPlaceholderData &&
    !closuresQuery.isError
  const stays = reservationsQuery.isError
    ? []
    : reservationStays(reservationsQuery.data ?? [], true).filter(
        (stay) => clipStay(stayTrack(stay), start, span) !== null
      )
  const assignment = useRoomAssignment(rooms)
  const unassigned = unassignedStays(
    reservationsQuery.isError ? [] : (reservationsQuery.data ?? []),
    format(start, "yyyy-MM-dd"),
    rangeTo
  )
  const listLoading =
    loading ||
    reservationsQuery.isPending ||
    reservationsQuery.isFetching ||
    reservationsQuery.isPlaceholderData
  const listError =
    roomsQuery.error?.message ??
    typesQuery.error?.message ??
    reservationsQuery.error?.message ??
    null
  const previewTrack = assignment.target
    ? placeStays([stayTrack(assignment.target)], start, span)[0]
    : undefined

  function refresh() {
    void queryClient.invalidateQueries()
  }

  function changeStart(date: Date) {
    if (assignment.pending) return
    assignment.cancel()
    onStartChange(date)
  }

  const days = eachDayOfInterval({
    start,
    end: addDays(start, span - 1),
  })
  const byRoom = new Map<string, ReservationStay[]>()
  const closuresByRoom = new Map<string, RoomClosure[]>()
  for (const stay of stays) {
    if (!stay.roomId) continue
    const list = byRoom.get(stay.roomId) ?? []
    list.push(stay)
    byRoom.set(stay.roomId, list)
  }
  for (const closure of closuresQuery.data ?? []) {
    const list = closuresByRoom.get(closure.roomId) ?? []
    list.push(closure)
    closuresByRoom.set(closure.roomId, list)
  }

  function openClosure(id: string) {
    const closure = (closuresQuery.data ?? []).find((item) => item.id === id)
    const room = rooms?.find((item) => item.id === closure?.roomId)
    if (!closure || !room) return
    setClosureTarget({
      mode: "edit",
      closure,
      number: room.number,
      typeName: room.typeName,
    })
  }

  const panel = (
    <RoomAssignmentPanel
      stays={unassigned}
      typeNames={typeNames}
      loading={listLoading}
      listError={listError}
      rangeLabel={`${format(start, "d MMM")} al ${format(addDays(start, span - 1), "d MMM yyyy")}`}
      target={assignment.target}
      selectedRoom={assignment.selectedRoom}
      checking={assignment.checking}
      ready={assignment.ready}
      eligibleCount={assignment.eligibleCount}
      canAssign={assignment.canAssign}
      pending={assignment.pending}
      error={assignment.error}
      onSelect={assignment.selectStay}
      onConfirm={() => void assignment.confirm()}
      onCancel={assignment.cancel}
      onClose={() => setPanelOpen(false)}
      onRetry={refresh}
    />
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <RoomClosureDialog
        target={closureTarget}
        timeZone={timeZone}
        onClose={() => setClosureTarget(null)}
      />
      <RoomEditDialog target={roomTarget} onClose={() => setRoomTarget(null)} />
      <RoomBookingDialog
        target={bookingTarget}
        timeZone={timeZone}
        onClose={() => setBookingTarget(null)}
        onViewReservation={(id) => {
          setBookingTarget(null)
          onOpenReservation(id)
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-2.5 py-2">
        <div className="flex items-center gap-2">
          <Select
            items={spans}
            value={String(span)}
            disabled={assignment.pending}
            onValueChange={(value) => {
              if (value) {
                assignment.cancel()
                onSpanChange(Number(value) as 7 | 14)
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
            onClick={() => changeStart(startOfToday())}
          >
            Hoy
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Actualizar"
            disabled={rooms === null || assignment.pending}
            onClick={refresh}
          >
            <RefreshCwIcon />
          </Button>
        </div>
        <ButtonGroup>
          <Button
            variant="outline"
            size="icon"
            aria-label="Período anterior"
            disabled={assignment.pending}
            onClick={() => changeStart(addDays(start, -span))}
          >
            <ChevronsLeftIcon />
          </Button>
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
                  className="min-w-36 justify-between"
                  disabled={assignment.pending}
                />
              }
            >
              {format(start, "d MMM yyyy")}
              <CalendarIcon data-icon="inline-end" />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={start}
                timeZone={timeZone}
                onSelect={(date) => {
                  if (!date) return
                  changeStart(startOfDay(date))
                  setPickerOpen(false)
                }}
              />
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
          <Button
            variant="outline"
            size="icon"
            aria-label="Período siguiente"
            disabled={assignment.pending}
            onClick={() => changeStart(addDays(start, span))}
          >
            <ChevronsRightIcon />
          </Button>
        </ButtonGroup>
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
            <TooltipContent
              variant="legend"
              side="bottom"
              align="end"
              sideOffset={8}
            >
              <div
                aria-label="Colores de reservas"
                className="flex min-w-40 flex-col gap-2.5"
              >
                {Object.entries(stayLabels).map(([status, label]) => (
                  <span key={status} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-3 rounded-none border",
                        stayColors[status]
                      )}
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
          <Button
            variant="outline"
            aria-expanded={panelOpen}
            aria-controls="unassigned-panel"
            disabled={assignment.pending}
            onClick={() => setPanelOpen((open) => !open)}
          >
            <PanelRightIcon data-icon="inline-start" />
            Sin asignar · {listLoading ? "…" : unassigned.length}
          </Button>
          <Button
            disabled={assignment.pending}
            onClick={() => setBookingTarget({ mode: "new" })}
          >
            <PlusIcon data-icon="inline-start" />
            Nueva reserva
          </Button>
        </div>
      </div>
      {error ? (
        <div className="flex items-center justify-between gap-2 border-b px-2.5 py-2">
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Reintentar
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-none">
          <div
            className="grid w-full"
            style={{
              gridTemplateColumns: `10rem repeat(${span}, minmax(6rem, 1fr))`,
              minWidth: `${10 + span * 6}rem`,
            }}
          >
            <div className="sticky top-0 left-0 z-40 border-r border-b bg-background" />
            {days.map((day) => (
              <div
                key={format(day, "yyyy-MM-dd")}
                className="sticky top-0 z-30 flex min-w-0 flex-col items-center gap-0.5 border-r border-b bg-background px-2.5 py-1.5"
              >
                <span
                  className={cn(
                    "text-xs tracking-wide uppercase",
                    format(day, "yyyy-MM-dd") === today
                      ? "font-medium text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  {format(day, "yyyy-MM-dd") === today
                    ? "Hoy"
                    : format(day, "EEE")}
                </span>
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center px-1 text-xs",
                    format(day, "yyyy-MM-dd") === today
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(day, "MMM")}
                </span>
              </div>
            ))}
            {rooms === null
              ? Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="contents">
                    <div className="sticky left-0 z-20 border-r border-b bg-background px-2.5 py-2">
                      <Skeleton className="h-6 w-16" />
                    </div>
                    <div
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
                number={room.number}
                typeName={room.typeName}
                stays={placeStays(
                  [
                    ...(byRoom.get(room.id) ?? []).map(stayTrack),
                    ...(closuresByRoom.get(room.id) ?? []).map(closureTrack),
                  ],
                  start,
                  span
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
                      : (assignment.error ??
                        assignment.roomIssues.get(room.id) ??
                        undefined)
                    : undefined
                }
                assignmentPreview={
                  assignment.ready &&
                  previewTrack &&
                  assignment.roomIssues.get(room.id) === null
                    ? {
                        stay: previewTrack,
                        selected: assignment.selectedRoom?.id === room.id,
                        disabled: assignment.pending,
                        onSelect: () => {
                          assignment.selectRoom(room.id)
                          setPanelOpen(true)
                        },
                      }
                    : undefined
                }
              />
            ))}
            {rooms !== null && rooms.length === 0 && !error ? (
              <div className="col-span-full px-2.5 py-4 text-xs text-muted-foreground">
                Aún no hay habitaciones.
              </div>
            ) : null}
          </div>
        </div>
        {panelOpen ? (
          <aside
            aria-label="Reservas sin asignar"
            className="min-h-0 w-80 shrink-0 bg-muted"
          >
            {panel}
          </aside>
        ) : null}
      </div>
    </div>
  )
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
  assignmentActive = false,
  assignmentReason,
  assignmentPreview,
}: {
  number: string
  typeName: string
  stays: PlacedTrack[]
  days: Date[]
  dayCount: number
  onEditRoom?: () => void
  onCloseRoom?: () => void
  onBookDay?: (day: Date) => void
  onOpenStay?: (reservationId: string) => void
  onOpenClosure?: (id: string) => void
  assignmentActive?: boolean
  assignmentReason?: string
  assignmentPreview?: AssignmentPreview
}) {
  return (
    <>
      <div
        className={cn(
          "group/room sticky left-0 z-20 flex min-w-0 items-center gap-1 border-r border-b bg-background px-2.5",
          "can-hover:has-data-popup-open:[&_[data-slot=room-label]]:pr-7",
          assignmentActive && !assignmentPreview && "text-muted-foreground",
          assignmentPreview && "bg-booking"
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
          <span
            className="truncate text-xs text-muted-foreground"
            title={typeName}
          >
            {typeName}
          </span>
        </div>
        {onEditRoom && onCloseRoom ? (
          <div
            className={cn(
              "shrink-0",
              "can-hover:pointer-events-none can-hover:absolute can-hover:top-1/2 can-hover:right-2.5 can-hover:-translate-y-1/2 can-hover:opacity-0",
              "can-hover:group-hover/room:pointer-events-auto can-hover:group-hover/room:opacity-100",
              "can-hover:group-focus-within/room:pointer-events-auto can-hover:group-focus-within/room:opacity-100",
              "can-hover:has-data-popup-open:pointer-events-auto can-hover:has-data-popup-open:opacity-100"
            )}
          >
            <RoomActionsMenu
              number={number}
              onEditRoom={onEditRoom}
              onCloseRoom={onCloseRoom}
            />
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
      />
    </>
  )
}
