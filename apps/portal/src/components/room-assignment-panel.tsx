import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfToday,
} from "date-fns"
import { CheckIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import type { Room } from "@/lib/api"
import type { ReservationStay } from "@/lib/room-assignment"

export function assignmentStayLabel(stay: ReservationStay) {
  const nights = differenceInCalendarDays(
    parseISO(stay.checkOut),
    parseISO(stay.checkIn)
  )
  return `${format(parseISO(stay.checkIn), "MMM d")} to ${format(parseISO(stay.checkOut), "MMM d, yyyy")} · ${nights} ${nights === 1 ? "night" : "nights"}`
}

type RoomAssignmentPanelProps = {
  stays: ReservationStay[]
  typeNames: Map<string, string>
  loading: boolean
  listError: string | null
  rangeLabel: string
  target: ReservationStay | null
  selectedRoom: Room | null
  checking: boolean
  ready: boolean
  eligibleCount: number
  canAssign: boolean
  pending: boolean
  error: string | null
  onSelect: (stay: ReservationStay) => void
  onConfirm: () => void
  onCancel: () => void
  onClose: () => void
  onRetry: () => void
}

export function RoomAssignmentPanel({
  stays,
  typeNames,
  loading,
  listError,
  rangeLabel,
  target,
  selectedRoom,
  checking,
  ready,
  eligibleCount,
  canAssign,
  pending,
  error,
  onSelect,
  onConfirm,
  onCancel,
  onClose,
  onRetry,
}: RoomAssignmentPanelProps) {
  const today = format(startOfToday(), "yyyy-MM-dd")

  return (
    <section
      id="unassigned-panel"
      aria-labelledby="unassigned-heading"
      className="flex h-full min-h-0 flex-col bg-background text-xs"
    >
      <div className="flex items-start justify-between gap-2 border-b p-3">
        <div>
          <h2 id="unassigned-heading" className="font-medium">
            Unassigned · {loading ? "…" : stays.length}
          </h2>
          <p className="mt-1 text-muted-foreground">
            Stays overlapping {rangeLabel}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close unassigned panel"
          disabled={pending}
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {listError ? (
          <div role="alert" className="space-y-2">
            <p className="text-destructive">{listError}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : loading ? (
          <div
            className="space-y-2"
            aria-label="Loading unassigned reservations"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        ) : stays.length === 0 ? (
          <p className="py-4 text-muted-foreground">
            All reserved rooms in these dates are assigned.
          </p>
        ) : (
          <ul className="space-y-2">
            {stays.map((stay) => {
              const selected = target?.id === stay.id
              return (
                <li key={stay.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={pending}
                    onClick={() => onSelect(stay)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-1 border p-2.5 text-left outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50",
                      selected && "border-booking-foreground/40 bg-booking/40"
                    )}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2">
                      <span
                        className="min-w-0 flex-1 truncate font-medium"
                        title={stay.guestName}
                      >
                        {stay.guestName}
                      </span>
                      {selected ? (
                        <CheckIcon className="size-3.5 shrink-0" />
                      ) : null}
                    </span>
                    <span className="text-muted-foreground">
                      {typeNames.get(stay.roomTypeId) ?? "Room"}
                      {stay.roomCount > 1
                        ? ` · Room ${stay.roomIndex} of ${stay.roomCount}`
                        : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {assignmentStayLabel(stay)}
                    </span>
                    {stay.checkIn === today ? (
                      <span className="font-medium">Arrives today</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {target ? (
        <div className="space-y-3 border-t p-3">
          <div className="space-y-1">
            <p className="font-medium">Assign room for {target.guestName}</p>
            <p className="text-muted-foreground">
              {typeNames.get(target.roomTypeId) ?? "Room"}
              {target.roomCount > 1
                ? ` · Room ${target.roomIndex} of ${target.roomCount}`
                : ""}
            </p>
            <p className="text-muted-foreground">
              {assignmentStayLabel(target)}
            </p>
          </div>
          <p role="status" className="text-muted-foreground">
            {pending
              ? "Assigning room…"
              : checking
                ? "Checking rooms for the entire stay…"
                : ready && eligibleCount === 0
                  ? "No matching room is free for the full stay."
                  : ready
                    ? `${eligibleCount} ${eligibleCount === 1 ? "room" : "rooms"} available.`
                    : "Room availability could not be confirmed."}
          </p>
          {error ? (
            <div role="alert" className="space-y-2">
              <p className="text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={onRetry}
              >
                Check again
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button disabled={!canAssign || pending} onClick={onConfirm}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {selectedRoom
                ? `Assign to room ${selectedRoom.number}`
                : "Assign room"}
            </Button>
            <Button variant="outline" disabled={pending} onClick={onCancel}>
              Cancel assignment
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
