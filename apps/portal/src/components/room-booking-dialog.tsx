import { useState, type FormEvent } from "react"
import { addDays, format, parse } from "date-fns"
import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { type CreateReservationInput, type ReservationDetail } from "@/lib/api"
import {
  useAssignRoom,
  useAvailability,
  useCreateReservation,
  useReservations,
  useRoomClosures,
} from "@/lib/queries"

const openStatuses = new Set(["confirmed", "checked_in"])

export type BookingTarget = {
  roomId: string
  roomTypeId: string
  number: string
  typeName: string
  checkIn: string
}

type CreatedReservation = {
  reservationId: string
  lineId: string
  code: string
}

function bookingError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Could not book the room."
  if (message === "no availability") {
    return "This room type is no longer available for those dates."
  }
  if (message === "room is already assigned for those dates") {
    return "This room was just assigned to another stay."
  }
  if (message === "room is closed for those dates") {
    return "This room is closed for those dates."
  }
  if (message === "too many guests for this room type") {
    return "This room cannot fit the whole party."
  }
  if (message === "stay cannot be longer than 60 nights") {
    return "A stay cannot be longer than 60 nights."
  }
  return message
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100)
}

function overlapsDay(start: string, end: string, day: string) {
  const nextDay = format(
    addDays(parse(day, "yyyy-MM-dd", new Date()), 1),
    "yyyy-MM-dd"
  )
  return start < nextDay && end > day
}

export function RoomBookingDialog({
  target,
  onClose,
}: {
  target: BookingTarget | null
  onClose: () => void
}) {
  const create = useCreateReservation()
  const assign = useAssignRoom()
  const [confirmation, setConfirmation] = useState<ReservationDetail | null>(
    null
  )
  const pending = create.isPending || assign.isPending

  function close() {
    setConfirmation(null)
    create.reset()
    assign.reset()
    onClose()
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && (pending || confirmation)) return
        if (!next) close()
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!confirmation}>
        {target && confirmation ? (
          <BookingConfirmation
            target={target}
            reservation={confirmation}
            onClose={close}
          />
        ) : target ? (
          <BookingForm
            key={`${target.roomId}-${target.checkIn}`}
            target={target}
            createPending={create.isPending}
            assignPending={assign.isPending}
            onCreate={(input) => create.mutateAsync(input)}
            onAssign={(input) => assign.mutateAsync(input)}
            onConfirmed={setConfirmation}
            onCancel={close}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function BookingForm({
  target,
  createPending,
  assignPending,
  onCreate,
  onAssign,
  onConfirmed,
  onCancel,
}: {
  target: BookingTarget
  createPending: boolean
  assignPending: boolean
  onCreate: (input: CreateReservationInput) => Promise<ReservationDetail>
  onAssign: (input: {
    reservationId: string
    lineId: string
    roomId: string
  }) => Promise<ReservationDetail>
  onConfirmed: (reservation: ReservationDetail) => void
  onCancel: () => void
}) {
  const startDate = parse(target.checkIn, "yyyy-MM-dd", new Date())
  const rangeTo = format(addDays(startDate, 59), "yyyy-MM-dd")
  const [nights, setNights] = useState(1)
  const [adults, setAdults] = useState("1")
  const [children, setChildren] = useState("0")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [created, setCreated] = useState<CreatedReservation | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const checkOut = format(addDays(startDate, nights), "yyyy-MM-dd")
  const reservations = useReservations(target.checkIn, rangeTo)
  const closures = useRoomClosures(target.checkIn, rangeTo)
  const availability = useAvailability(target.checkIn, checkOut)
  const pending = createPending || assignPending
  const adultCount = Number(adults)
  const childCount = Number(children)
  const partyValid =
    Number.isInteger(adultCount) &&
    adultCount >= 1 &&
    Number.isInteger(childCount) &&
    childCount >= 0
  const roomType = availability.data?.roomTypes.find(
    (item) => item.id === target.roomTypeId
  )

  let maxNights = 60
  if (reservations.data && closures.data) {
    for (let offset = 0; offset < 60; offset += 1) {
      const day = format(addDays(startDate, offset), "yyyy-MM-dd")
      const hasStay = reservations.data.some(
        (reservation) =>
          overlapsDay(reservation.checkIn, reservation.checkOut, day) &&
          reservation.rooms.some(
            (line) =>
              line.roomId === target.roomId && openStatuses.has(line.status)
          )
      )
      const hasClosure = closures.data.some(
        (closure) =>
          closure.roomId === target.roomId &&
          overlapsDay(closure.starts, closure.ends, day)
      )
      if (hasStay || hasClosure) {
        maxNights = offset
        break
      }
    }
  }

  const occupancyError =
    partyValid && roomType && adultCount + childCount > roomType.maxOccupancy
      ? `${target.typeName} rooms fit up to ${roomType.maxOccupancy} guests.`
      : null
  const partyError = !partyValid
    ? "Enter at least one adult and a valid number of children."
    : null
  const roomError =
    maxNights < nights ? "This room is no longer free for this stay." : null
  const availabilityError =
    !created && roomType && roomType.free < 1
      ? `No ${target.typeName} rooms are available for this stay.`
      : null
  const queryError =
    reservations.error?.message ??
    closures.error?.message ??
    availability.error?.message ??
    null
  const shownError =
    localError ??
    partyError ??
    occupancyError ??
    roomError ??
    availabilityError ??
    queryError
  const loading =
    reservations.isFetching || closures.isFetching || availability.isFetching
  const locked = created !== null
  const formValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    partyValid &&
    !occupancyError &&
    maxNights >= nights &&
    Boolean(roomType) &&
    (locked || (roomType?.free ?? 0) > 0)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!formValid || pending || loading) return
    setLocalError(null)

    let saved = created
    try {
      if (!saved) {
        const reservation = await onCreate({
          guest: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            ...(phone.trim() ? { phone: phone.trim() } : {}),
          },
          checkIn: target.checkIn,
          checkOut,
          rooms: [
            {
              roomTypeId: target.roomTypeId,
              adults: adultCount,
              children: childCount,
            },
          ],
        })
        const line = reservation.rooms[0]
        if (!line) throw new Error("The reservation has no room line.")
        saved = {
          reservationId: reservation.id,
          lineId: line.id,
          code: reservation.code,
        }
        setCreated(saved)
      }

      const reservation = await onAssign({
        reservationId: saved.reservationId,
        lineId: saved.lineId,
        roomId: target.roomId,
      })
      onConfirmed(reservation)
    } catch (error) {
      const message = bookingError(error)
      setLocalError(
        saved
          ? `Reservation ${saved.code} was created but the room was not assigned. ${message}`
          : message
      )
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Book room {target.number}</DialogTitle>
        <DialogDescription>
          {target.typeName}, arriving {format(startDate, "EEE, MMM d, yyyy")}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field data-invalid={shownError ? true : undefined}>
          <FieldLabel>Stay</FieldLabel>
          <div className="flex items-center justify-between border px-2.5 py-2">
            <div>
              <div className="font-medium">
                {nights} {nights === 1 ? "night" : "nights"}
              </div>
              <div className="text-muted-foreground">
                Checkout {format(addDays(startDate, nights), "EEE, MMM d")}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Remove a night"
                disabled={locked || nights <= 1}
                onClick={() => {
                  setNights((value) => value - 1)
                  setLocalError(null)
                }}
              >
                <MinusIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Add a night"
                disabled={
                  locked || loading || nights >= maxNights || nights >= 60
                }
                onClick={() => {
                  setNights((value) => value + 1)
                  setLocalError(null)
                }}
              >
                <PlusIcon />
              </Button>
            </div>
          </div>
          <FieldDescription>
            {availability.isPending
              ? "Checking price and availability..."
              : roomType
                ? `${money(roomType.totalCents, availability.data!.currency)} total for room ${target.number}.`
                : "Checking this room type..."}
          </FieldDescription>
          {shownError ? <FieldError>{shownError}</FieldError> : null}
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="booking-adults">Adults</FieldLabel>
            <Input
              id="booking-adults"
              type="number"
              min={1}
              step={1}
              value={adults}
              disabled={locked}
              onChange={(event) => {
                setAdults(event.target.value)
                setLocalError(null)
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="booking-children">Children</FieldLabel>
            <Input
              id="booking-children"
              type="number"
              min={0}
              step={1}
              value={children}
              disabled={locked}
              onChange={(event) => {
                setChildren(event.target.value)
                setLocalError(null)
              }}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="booking-first-name">First name</FieldLabel>
            <Input
              id="booking-first-name"
              autoComplete="given-name"
              maxLength={100}
              required
              value={firstName}
              disabled={locked}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="booking-last-name">Last name</FieldLabel>
            <Input
              id="booking-last-name"
              autoComplete="family-name"
              maxLength={100}
              required
              value={lastName}
              disabled={locked}
              onChange={(event) => setLastName(event.target.value)}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="booking-phone">Phone</FieldLabel>
          <Input
            id="booking-phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            placeholder="Optional"
            value={phone}
            disabled={locked}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
        >
          {created ? "Close" : "Cancel"}
        </Button>
        <Button type="submit" disabled={!formValid || pending || loading}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {created ? "Retry room assignment" : "Book room"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function BookingConfirmation({
  target,
  reservation,
  onClose,
}: {
  target: BookingTarget
  reservation: ReservationDetail
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <div className="flex size-8 items-center justify-center border bg-booking text-booking-foreground">
          <CheckIcon className="size-4" />
        </div>
        <DialogTitle>Room {target.number} is booked</DialogTitle>
        <DialogDescription>
          {format(
            parse(reservation.checkIn, "yyyy-MM-dd", new Date()),
            "MMM d"
          )}
          {" to "}
          {format(
            parse(reservation.checkOut, "yyyy-MM-dd", new Date()),
            "MMM d, yyyy"
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 border">
        <div className="border-r p-3">
          <div className="text-muted-foreground">Confirmation</div>
          <div className="mt-1 font-mono text-base font-semibold tracking-wider">
            {reservation.code}
          </div>
        </div>
        <div className="p-3">
          <div className="text-muted-foreground">Balance</div>
          <div className="mt-1 text-base font-semibold">
            {money(reservation.totalCents, reservation.currency)}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </div>
  )
}
