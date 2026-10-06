import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  max,
  min,
  parse,
  startOfDay,
  startOfToday,
} from "date-fns"
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react"

import {
  RoomActionsMenu,
  RoomClosureDialog,
  type ClosureTarget,
} from "@/components/room-closure-dialog"
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
import { type Reservation, type Room, type RoomClosure } from "@/lib/api"
import {
  useReservations,
  useRoomClosures,
  useRoomTypes,
  useRooms,
} from "@/lib/queries"

const spans = [
  { label: "7 days", value: "7" },
  { label: "14 days", value: "14" },
]

const openStatuses = new Set(["confirmed", "checked_in"])

type Stay = {
  id: string
  guestName: string
  checkIn: string
  checkOut: string
  roomId: string | null
  roomTypeId: string
}

type TrackItem = {
  id: string
  kind: "stay" | "closure"
  label: string
  title: string
  checkIn: string
  checkOut: string
}

type PlacedTrack = TrackItem & { start: number; end: number; lane: number }

function clipStay(stay: TrackItem, rangeStart: Date, dayCount: number) {
  const rangeEnd = addDays(rangeStart, dayCount)
  const from = max([parse(stay.checkIn, "yyyy-MM-dd", rangeStart), rangeStart])
  const to = min([parse(stay.checkOut, "yyyy-MM-dd", rangeStart), rangeEnd])
  if (from >= to) return null
  return {
    ...stay,
    start: differenceInCalendarDays(from, rangeStart),
    end: differenceInCalendarDays(to, rangeStart),
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

function staysFrom(reservations: Reservation[]) {
  const stays: Stay[] = []
  for (const reservation of reservations) {
    for (const line of reservation.rooms) {
      if (!openStatuses.has(line.status)) continue
      stays.push({
        id: line.id,
        guestName: reservation.guestName,
        checkIn: reservation.checkIn,
        checkOut: reservation.checkOut,
        roomId: line.roomId,
        roomTypeId: line.roomTypeId,
      })
    }
  }
  return stays
}

function stayTrack(stay: Stay): TrackItem {
  return {
    id: stay.id,
    kind: "stay",
    label: stay.guestName,
    title: `${stay.guestName}, ${stay.checkIn} to ${stay.checkOut}`,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
  }
}

function closureTrack(closure: RoomClosure): TrackItem {
  return {
    id: closure.id,
    kind: "closure",
    label: closure.reason || "Closed",
    title: closure.reason
      ? `${closure.reason}, ${closure.starts} to ${closure.ends}`
      : `Closed, ${closure.starts} to ${closure.ends}`,
    checkIn: closure.starts,
    checkOut: closure.ends,
  }
}

function barStyle(item: PlacedTrack, dayCount: number) {
  return {
    top: `${item.lane * 1.75 + 0.375}rem`,
    height: "1.25rem",
    left: `calc(${(item.start / dayCount) * 100}% + 0.25rem)`,
    width: `calc(${((item.end - item.start) / dayCount) * 100}% - 0.5rem)`,
  }
}

function StayBar({ stay, dayCount }: { stay: PlacedTrack; dayCount: number }) {
  return (
    <div
      title={stay.title}
      className="absolute flex items-center rounded-md border border-booking-foreground/20 bg-booking px-2.5 text-xs text-booking-foreground"
      style={barStyle(stay, dayCount)}
    >
      <span className="truncate">{stay.label}</span>
    </div>
  )
}

function ClosureBar({
  item,
  dayCount,
  onOpen,
}: {
  item: PlacedTrack
  dayCount: number
  onOpen: (id: string) => void
}) {
  return (
    <button
      type="button"
      title={item.title}
      className="absolute flex items-center rounded-md border border-closure-foreground/20 bg-closure px-2.5 text-left text-xs text-closure-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
      style={barStyle(item, dayCount)}
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
  onOpenClosure,
}: {
  stays: PlacedTrack[]
  dayCount: number
  days: Date[]
  onOpenClosure?: (id: string) => void
}) {
  const lanes = stays.reduce((max, stay) => Math.max(max, stay.lane + 1), 1)
  return (
    <div
      className="relative min-w-0 border-b"
      style={{
        gridColumn: `2 / span ${dayCount}`,
        minHeight: `${Math.max(2.5, lanes * 1.75 + 0.75)}rem`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))` }}
      >
        {days.map((day) => (
          <div key={format(day, "yyyy-MM-dd")} className="border-r" />
        ))}
      </div>
      {stays.map((stay) =>
        stay.kind === "closure" && onOpenClosure ? (
          <ClosureBar
            key={`closure-${stay.id}`}
            item={stay}
            dayCount={dayCount}
            onOpen={onOpenClosure}
          />
        ) : (
          <StayBar key={`stay-${stay.id}`} stay={stay} dayCount={dayCount} />
        )
      )}
    </div>
  )
}

export function RoomCalendar() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const queryClient = useQueryClient()
  const [start, setStart] = useState(startOfToday)
  const [span, setSpan] = useState(7)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [closureTarget, setClosureTarget] = useState<ClosureTarget | null>(null)
  const rangeFrom = format(start, "yyyy-MM-dd")
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
    closuresQuery.error?.message ??
    null
  const stays = reservationsQuery.isError
    ? []
    : staysFrom(reservationsQuery.data ?? [])

  function refresh() {
    void queryClient.invalidateQueries()
  }

  const days = eachDayOfInterval({
    start,
    end: addDays(start, span - 1),
  })
  const roomIds = new Set(rooms?.map((room) => room.id))
  const byRoom = new Map<string, Stay[]>()
  const closuresByRoom = new Map<string, RoomClosure[]>()
  const unassigned: Stay[] = []
  for (const stay of stays) {
    if (!stay.roomId || !roomIds.has(stay.roomId)) {
      unassigned.push(stay)
      continue
    }
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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <RoomClosureDialog
        target={closureTarget}
        timeZone={timeZone}
        onClose={() => setClosureTarget(null)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-2.5 py-2">
        <div className="flex items-center gap-2">
          <Select
            items={spans}
            value={String(span)}
            onValueChange={(value) => {
              if (value) setSpan(Number(value))
            }}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {spans.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setStart(startOfToday())}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh"
            disabled={rooms === null}
            onClick={refresh}
          >
            <RefreshCwIcon />
          </Button>
        </div>
        <ButtonGroup>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous period"
            onClick={() => setStart((value) => addDays(value, -span))}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous day"
            onClick={() => setStart((value) => addDays(value, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="min-w-36 justify-between"
                />
              }
            >
              {format(start, "MMM d, yyyy")}
              <CalendarIcon data-icon="inline-end" />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={start}
                timeZone={timeZone}
                onSelect={(date) => {
                  if (!date) return
                  setStart(startOfDay(date))
                  setPickerOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next day"
            onClick={() => setStart((value) => addDays(value, 1))}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next period"
            onClick={() => setStart((value) => addDays(value, span))}
          >
            <ChevronsRightIcon />
          </Button>
        </ButtonGroup>
        <div className="flex items-center gap-2">
          <Button>
            <PlusIcon data-icon="inline-start" />
            New Booking
          </Button>
        </div>
      </div>
      {error ? (
        <div className="flex items-center justify-between gap-2 border-b px-2.5 py-2">
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div
          className="grid w-full"
          style={{
            gridTemplateColumns: `max-content repeat(${span}, minmax(0, 1fr))`,
          }}
        >
          <div className="sticky top-0 left-0 z-30 border-r border-b bg-background" />
          {days.map((day) => (
            <div
              key={format(day, "yyyy-MM-dd")}
              className="sticky top-0 z-20 flex min-w-0 flex-col items-center gap-0.5 border-r border-b bg-background px-2.5 py-1.5"
            >
              <span className="text-xs tracking-wide text-muted-foreground uppercase">
                {format(day, "EEE")}
              </span>
              <span className="text-xs font-medium">{format(day, "d")}</span>
              <span className="text-xs text-muted-foreground">
                {format(day, "MMM")}
              </span>
            </div>
          ))}
          {rooms === null
            ? Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="contents">
                  <div className="sticky left-0 z-10 border-r border-b bg-background px-2.5 py-2">
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
              status={room.status}
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
              onCloseRoom={
                room.status === "in_service"
                  ? () =>
                      setClosureTarget({
                        mode: "create",
                        roomId: room.id,
                        number: room.number,
                        typeName: room.typeName,
                      })
                  : undefined
              }
              onOpenClosure={openClosure}
            />
          ))}
          {rooms !== null && rooms.length === 0 && !error ? (
            <div className="col-span-full px-2.5 py-4 text-xs text-muted-foreground">
              No rooms yet.
            </div>
          ) : null}
          {unassigned.length > 0 ? (
            <>
              <div className="sticky left-0 z-10 col-span-full border-b bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                Unassigned
              </div>
              {unassigned.map((stay) => (
                <RoomRowView
                  key={stay.id}
                  number="Unassigned"
                  typeName={typeNames.get(stay.roomTypeId) ?? "Room"}
                  stays={placeStays([stayTrack(stay)], start, span)}
                  days={days}
                  dayCount={span}
                />
              ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function RoomRowView({
  number,
  typeName,
  status,
  stays,
  days,
  dayCount,
  onCloseRoom,
  onOpenClosure,
}: {
  number: string
  typeName: string
  status?: Room["status"]
  stays: PlacedTrack[]
  days: Date[]
  dayCount: number
  onCloseRoom?: () => void
  onOpenClosure?: (id: string) => void
}) {
  return (
    <>
      <div className="sticky left-0 z-10 flex w-max items-center gap-1 border-r border-b bg-background px-2.5">
        <div className="flex flex-col justify-center gap-0.5">
          <span className="text-xs font-medium whitespace-nowrap">
            {number}
          </span>
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {status === "out_of_order" ? "Out of order" : typeName}
          </span>
        </div>
        {onCloseRoom ? (
          <RoomActionsMenu number={number} onCloseRoom={onCloseRoom} />
        ) : null}
      </div>
      <RoomTrack
        stays={stays}
        dayCount={dayCount}
        days={days}
        onOpenClosure={onOpenClosure}
      />
    </>
  )
}
