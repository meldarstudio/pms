import { useId, useRef, useState, type FormEvent } from "react"
import {
  addDays,
  differenceInCalendarDays,
  parse,
  startOfDay,
  startOfToday,
} from "date-fns"

import { EllipsisIcon, PlusIcon, UnlinkIcon, XIcon } from "lucide-react"

import {
  BookingSummary,
  type BookingSummaryRoom,
} from "@/components/booking-summary"
import { DateField } from "@/components/date-field"
import { ReservationPayments } from "@/components/reservation-payments"
import { ReservationStatusSelect } from "@/components/reservation-status-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  type CreateReservationInput,
  type PatchGuestInput,
  type PatchReservationInput,
  type ReservationDetail,
  type ReservationGuest,
  type RecordPaymentInput,
  type ReservationStatusAction,
} from "@/lib/api"
import {
  useAddReservationRoom,
  useAssignRoom,
  useUnassignRoom,
  useCancelReservationRoom,
  useAvailability,
  useChangeReservationStatus,
  useCreateReservation,
  usePatchGuest,
  usePatchReservation,
  useReservation,
  useReservations,
  useRoomClosures,
  useRooms,
  useRecordReservationPayment,
} from "@/lib/queries"
import { bookingRoomCharges, bookingSummary } from "@/lib/booking-prices"
import { createBooking, type CreatedBooking } from "@/lib/create-booking"
import {
  contactErrors,
  partyCounts,
  type FieldErrors,
} from "@/lib/form-validation"
import { useFieldValidation } from "@/lib/use-field-validation"
import { translateError } from "@/lib/errors"
import { roomLineActions } from "@/lib/reservation-room-actions"
import {
  isRoomStatus,
  planBulkStatus,
  type RoomStatus,
  type StatusRoom,
} from "@/lib/reservation-status"
import { CURRENCY, formatMajor, parseMajorToCents } from "@/lib/money"
import { format } from "@/lib/dates"
import { toast } from "@/lib/toast"

const openStatuses = new Set(["confirmed", "checked_in"])

export type BookingTarget =
  | {
      mode: "create"
      roomId: string
      roomTypeId: string
      number: string
      typeName: string
      checkIn: string
    }
  | {
      mode: "new"
    }
  | {
      mode: "edit"
      reservationId: string
      roomId: string
      number: string
      typeName: string
    }

type RoomLineChoice = {
  key: string
  typeId: string | null
  roomId: string | null
  adults: string
  children: string
  discount: string
  savedDiscountCents: number | null
  lineId: string | null
  status: string | null
  savedRoomId: string | null
  roomNumber: string | null
  savedAdults: number | null
  savedChildren: number | null
  typeName: string | null
  removed: boolean
}

function emptyRoomLine(): RoomLineChoice {
  return {
    key: crypto.randomUUID(),
    typeId: null,
    roomId: null,
    adults: "1",
    children: "0",
    discount: "",
    savedDiscountCents: null,
    lineId: null,
    status: null,
    savedRoomId: null,
    roomNumber: null,
    savedAdults: null,
    savedChildren: null,
    typeName: null,
    removed: false,
  }
}

function linesFromDetail(rooms: ReservationDetail["rooms"]): RoomLineChoice[] {
  return rooms.map((room) => ({
    key: room.id,
    typeId: room.roomTypeId,
    roomId: room.roomId,
    adults: String(room.adults),
    children: String(room.children),
    discount: room.discountCents === 0 ? "" : formatMajor(room.discountCents),
    savedDiscountCents: room.discountCents,
    lineId: room.id,
    status: room.status,
    savedRoomId: room.roomId,
    roomNumber: room.roomNumber,
    savedAdults: room.adults,
    savedChildren: room.children,
    typeName: room.roomTypeName,
    removed: false,
  }))
}

function removedRoomLabel(line: RoomLineChoice, typeName: string) {
  if (line.roomNumber) return `Habitación ${line.roomNumber}`
  return typeName
}

function bookingError(error: unknown) {
  return error instanceof Error
    ? translateError(error.message)
    : "No se pudo guardar la reserva."
}

function createdToast(
  reservation: Pick<ReservationDetail, "id" | "code">,
  onView: (id: string) => void
) {
  const toastId = toast.add({
    title: `Reserva creada · ${reservation.code}`,
    type: "success",
    timeout: 8000,
    actionProps: {
      children: "Ver reserva",
      onClick: () => {
        toast.close(toastId)
        onView(reservation.id)
      },
    },
  })
}

function overlapsDay(start: string, end: string, day: string) {
  const nextDay = format(
    addDays(parse(day, "yyyy-MM-dd", new Date()), 1),
    "yyyy-MM-dd"
  )
  return start < nextDay && end > day
}

function openRooms(
  typeId: string | null,
  excludeRoomId: string | null,
  rooms: { id: string; number: string; roomTypeId: string }[] | undefined,
  reservations:
    | {
        id: string
        checkIn: string
        checkOut: string
        rooms: { roomId: string | null; status: string }[]
      }[]
    | undefined,
  closures: { roomId: string; starts: string; ends: string }[] | undefined,
  ready: boolean,
  checkIn: string,
  checkOut: string,
  excludeReservationId?: string
) {
  if (!typeId || !ready || !rooms || !reservations || !closures) return []
  return rooms
    .filter((room) => room.roomTypeId === typeId && room.id !== excludeRoomId)
    .filter(
      (room) =>
        !reservations.some(
          (reservation) =>
            reservation.id !== excludeReservationId &&
            reservation.checkIn < checkOut &&
            reservation.checkOut > checkIn &&
            reservation.rooms.some(
              (item) => item.roomId === room.id && openStatuses.has(item.status)
            )
        ) &&
        !closures.some(
          (closure) =>
            closure.roomId === room.id &&
            closure.starts < checkOut &&
            closure.ends > checkIn
        )
    )
    .sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true })
    )
}

function maxFreeNights(
  checkInDate: Date,
  roomIds: string[],
  reservations:
    | {
        id: string
        checkIn: string
        checkOut: string
        rooms: { roomId: string | null; status: string }[]
      }[]
    | undefined,
  closures: { roomId: string; starts: string; ends: string }[] | undefined,
  ready: boolean,
  excludeReservationId?: string
) {
  if (!ready || !reservations || !closures || roomIds.length === 0) return 60
  let limit = 60
  for (const roomId of roomIds) {
    for (let offset = 0; offset < limit; offset += 1) {
      const day = format(addDays(checkInDate, offset), "yyyy-MM-dd")
      const hasStay = reservations.some(
        (reservation) =>
          reservation.id !== excludeReservationId &&
          overlapsDay(reservation.checkIn, reservation.checkOut, day) &&
          reservation.rooms.some(
            (item) => item.roomId === roomId && openStatuses.has(item.status)
          )
      )
      const hasClosure = closures.some(
        (closure) =>
          closure.roomId === roomId &&
          overlapsDay(closure.starts, closure.ends, day)
      )
      if (hasStay || hasClosure) {
        limit = offset
        break
      }
    }
  }
  return limit
}

function clampCheckOut(checkIn: Date, checkOut: Date) {
  const nights = differenceInCalendarDays(checkOut, checkIn)
  if (nights < 1) return addDays(checkIn, 1)
  if (nights > 60) return addDays(checkIn, 60)
  return checkOut
}

function guestChanges(
  guest: ReservationGuest,
  values: {
    firstName: string
    lastName: string
    email: string
    phone: string
    notes: string
  }
) {
  const body: PatchGuestInput = {}
  if (values.firstName !== guest.firstName) body.firstName = values.firstName
  if (values.lastName !== guest.lastName) body.lastName = values.lastName
  if (values.email && values.email !== (guest.email ?? "")) {
    body.email = values.email
  }
  if (values.phone && values.phone !== (guest.phone ?? "")) {
    body.phone = values.phone
  }
  if (values.notes && values.notes !== (guest.notes ?? "")) {
    body.notes = values.notes
  }
  return Object.keys(body).length > 0 ? body : null
}

export function RoomBookingDialog({
  target,
  timeZone,
  onClose,
  onViewReservation,
}: {
  target: BookingTarget | null
  timeZone: string
  onClose: () => void
  onViewReservation: (id: string) => void
}) {
  const [tab, setTab] = useState<"details" | "payments">("details")
  const [saving, setSaving] = useState(false)
  const editingId = target?.mode === "edit" ? target.reservationId : null
  const detail = useReservation(editingId)
  const create = useCreateReservation()
  const assign = useAssignRoom()
  const unassign = useUnassignRoom()
  const addRoom = useAddReservationRoom()
  const cancelRoom = useCancelReservationRoom()
  const patchReservation = usePatchReservation()
  const patchGuest = usePatchGuest()
  const recordPayment = useRecordReservationPayment()
  const changeStatus = useChangeReservationStatus()
  const pending =
    saving ||
    create.isPending ||
    assign.isPending ||
    unassign.isPending ||
    addRoom.isPending ||
    cancelRoom.isPending ||
    patchReservation.isPending ||
    patchGuest.isPending ||
    recordPayment.isPending ||
    changeStatus.isPending

  function close() {
    create.reset()
    assign.reset()
    unassign.reset()
    addRoom.reset()
    cancelRoom.reset()
    patchReservation.reset()
    patchGuest.reset()
    recordPayment.reset()
    changeStatus.reset()
    setTab("details")
    onClose()
  }

  function viewReservation(id: string) {
    setTab("details")
    onViewReservation(id)
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && pending) return
        if (!next) close()
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-5xl">
        {target?.mode === "edit" ? (
          detail.isPending ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Editar reserva</DialogTitle>
              </DialogHeader>
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            </div>
          ) : detail.error || !detail.data ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Editar reserva</DialogTitle>
              </DialogHeader>
              <Field data-invalid>
                <FieldError>
                  {detail.error
                    ? bookingError(detail.error)
                    : "No se pudo cargar esta reserva."}
                </FieldError>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Cerrar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <BookingForm
              key={detail.data.id}
              mode="edit"
              target={target}
              detail={detail.data}
              timeZone={timeZone}
              pending={pending}
              onSaving={setSaving}
              activeTab={tab}
              onTab={setTab}
              onViewReservation={viewReservation}
              onRecordPayment={(id, body) =>
                recordPayment.mutateAsync({ id, body })
              }
              onCreate={(input) => create.mutateAsync(input)}
              onAssign={(input) => assign.mutateAsync(input)}
              onUnassign={(input) => unassign.mutateAsync(input)}
              onPatchReservation={(input) =>
                patchReservation.mutateAsync(input)
              }
              onPatchGuest={(input) => patchGuest.mutateAsync(input)}
              onAddRoom={(input) => addRoom.mutateAsync(input)}
              onChangeStatus={(input) => changeStatus.mutateAsync(input)}
              onCancelRoom={(input) => cancelRoom.mutateAsync(input)}
              onDone={close}
            />
          )
        ) : target?.mode === "create" ? (
          <BookingForm
            key={`${target.roomId}-${target.checkIn}`}
            mode="create"
            target={target}
            timeZone={timeZone}
            pending={pending}
            onSaving={setSaving}
            activeTab={tab}
            onTab={setTab}
            onViewReservation={viewReservation}
            onRecordPayment={(id, body) =>
              recordPayment.mutateAsync({ id, body })
            }
            onCreate={(input) => create.mutateAsync(input)}
            onAssign={(input) => assign.mutateAsync(input)}
            onUnassign={(input) => unassign.mutateAsync(input)}
            onPatchReservation={(input) => patchReservation.mutateAsync(input)}
            onPatchGuest={(input) => patchGuest.mutateAsync(input)}
            onAddRoom={(input) => addRoom.mutateAsync(input)}
            onChangeStatus={(input) => changeStatus.mutateAsync(input)}
            onCancelRoom={(input) => cancelRoom.mutateAsync(input)}
            onDone={close}
          />
        ) : target?.mode === "new" ? (
          <BookingForm
            key="new"
            mode="create"
            target={target}
            timeZone={timeZone}
            pending={pending}
            onSaving={setSaving}
            activeTab={tab}
            onTab={setTab}
            onViewReservation={viewReservation}
            onRecordPayment={(id, body) =>
              recordPayment.mutateAsync({ id, body })
            }
            onCreate={(input) => create.mutateAsync(input)}
            onAssign={(input) => assign.mutateAsync(input)}
            onUnassign={(input) => unassign.mutateAsync(input)}
            onPatchReservation={(input) => patchReservation.mutateAsync(input)}
            onPatchGuest={(input) => patchGuest.mutateAsync(input)}
            onAddRoom={(input) => addRoom.mutateAsync(input)}
            onChangeStatus={(input) => changeStatus.mutateAsync(input)}
            onCancelRoom={(input) => cancelRoom.mutateAsync(input)}
            onDone={close}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function BookingForm({
  mode,
  target,
  detail,
  timeZone,
  pending,
  onSaving,
  activeTab,
  onTab,
  onViewReservation,
  onRecordPayment,
  onCreate,
  onAssign,
  onUnassign,
  onPatchReservation,
  onPatchGuest,
  onAddRoom,
  onChangeStatus,
  onCancelRoom,
  onDone,
}: {
  mode: "create" | "edit"
  target: BookingTarget
  detail?: ReservationDetail
  timeZone: string
  pending: boolean
  onSaving: (saving: boolean) => void
  activeTab: "details" | "payments"
  onTab: (tab: "details" | "payments") => void
  onViewReservation: (id: string) => void
  onRecordPayment: (
    id: string,
    body: RecordPaymentInput
  ) => Promise<ReservationDetail>
  onCreate: (input: CreateReservationInput) => Promise<ReservationDetail>
  onAssign: (input: {
    reservationId: string
    lineId: string
    roomId: string
  }) => Promise<ReservationDetail>
  onUnassign: (input: {
    reservationId: string
    lineId: string
  }) => Promise<ReservationDetail>
  onPatchReservation: (
    input: { id: string } & PatchReservationInput
  ) => Promise<ReservationDetail>
  onPatchGuest: (input: {
    id: string
    body: PatchGuestInput
  }) => Promise<ReservationGuest>
  onAddRoom: (input: {
    id: string
    roomTypeId: string
    adults: number
    children: number
    discountCents: number
  }) => Promise<ReservationDetail>
  onChangeStatus: (input: {
    id: string
    action: ReservationStatusAction
  }) => Promise<ReservationDetail>
  onCancelRoom: (input: {
    id: string
    lineId: string
  }) => Promise<ReservationDetail>
  onDone: () => void
}) {
  const detailsFormId = useId()
  const paymentFormId = useId()
  const statusSelectId = useId()
  const blank = target.mode === "new"
  const editing = mode === "edit" && detail && target.mode === "edit"
  const line = editing
    ? (detail.rooms.find((room) => room.roomId === target.roomId) ??
      detail.rooms[0])
    : undefined
  const today = format(startOfToday(), "yyyy-MM-dd")
  const initialCheckIn =
    target.mode === "edit"
      ? (detail?.checkIn ?? "")
      : target.mode === "create"
        ? target.checkIn
        : today
  const initialCheckOut =
    target.mode === "edit"
      ? (detail?.checkOut ?? "")
      : format(
          addDays(parse(initialCheckIn, "yyyy-MM-dd", new Date()), 1),
          "yyyy-MM-dd"
        )
  const [checkInDate, setCheckInDate] = useState(() =>
    startOfDay(parse(initialCheckIn, "yyyy-MM-dd", new Date()))
  )
  const [checkOutDate, setCheckOutDate] = useState(() =>
    startOfDay(parse(initialCheckOut, "yyyy-MM-dd", new Date()))
  )
  const [roomLines, setRoomLines] = useState<RoomLineChoice[]>(() =>
    target.mode === "edit" && detail
      ? linesFromDetail(detail.rooms)
      : [emptyRoomLine()]
  )
  const [linkedLines, setLinkedLines] = useState<Record<string, string>>({})
  const [adults, setAdults] = useState(line ? String(line.adults) : "1")
  const [children, setChildren] = useState(line ? String(line.children) : "0")
  const [firstName, setFirstName] = useState(
    editing ? detail.guest.firstName : ""
  )
  const [lastName, setLastName] = useState(editing ? detail.guest.lastName : "")
  const [email, setEmail] = useState(editing ? (detail.guest.email ?? "") : "")
  const [phone, setPhone] = useState(editing ? (detail.guest.phone ?? "") : "")
  const [notes, setNotes] = useState(editing ? (detail.guest.notes ?? "") : "")
  const [statusChoice, setStatusChoice] = useState<RoomStatus | null>(null)
  const [created, setCreated] = useState<CreatedBooking | null>(null)
  const createdRef = useRef<CreatedBooking | null>(null)
  const submitting = useRef(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const checkIn = format(checkInDate, "yyyy-MM-dd")
  const checkOut = format(checkOutDate, "yyyy-MM-dd")
  const datesChanged =
    !editing || checkIn !== detail.checkIn || checkOut !== detail.checkOut
  const nights = differenceInCalendarDays(checkOutDate, checkInDate)
  const rangeTo = format(addDays(checkInDate, 59), "yyyy-MM-dd")
  const reservations = useReservations(checkIn, rangeTo)
  const closures = useRoomClosures(checkIn, rangeTo)
  const availability = useAvailability(checkIn, checkOut)
  const counts = partyCounts(adults, children)
  const { adultCount, childCount, valid: partyValid } = counts
  const emailValue = email.trim()
  const contact = contactErrors(firstName, lastName, email)
  const roomTypeId =
    line?.roomTypeId ?? (target.mode === "create" ? target.roomTypeId : "")
  const typeName =
    line?.roomTypeName ??
    (target.mode === "create"
      ? target.typeName
      : (availability.data?.roomTypes.find((item) => item.id === roomTypeId)
          ?.name ?? ""))
  const roomType = availability.data?.roomTypes.find(
    (item) => item.id === roomTypeId
  )
  const rooms = useRooms()
  const conflictsReady =
    Boolean(reservations.data && closures.data) &&
    !reservations.isPlaceholderData &&
    !closures.isPlaceholderData &&
    !reservations.isError &&
    !closures.isError
  const excludeReservationId = editing ? detail.id : created?.reservation.id

  const rows = blank || Boolean(editing)
  const constraintRoomIds =
    target.mode === "create"
      ? [target.roomId]
      : editing
        ? roomLines.flatMap((roomLine) => {
            if (roomLine.removed) return []
            if (roomLine.status && !openStatuses.has(roomLine.status)) return []
            return roomLine.roomId ? [roomLine.roomId] : []
          })
        : []
  const maxNights = maxFreeNights(
    checkInDate,
    constraintRoomIds,
    reservations.data,
    closures.data,
    conflictsReady,
    excludeReservationId
  )

  const stayError =
    editing && !datesChanged
      ? null
      : nights < 1
        ? "La salida debe ser posterior a la entrada."
        : nights > 60
          ? "La estancia no puede superar las 60 noches."
          : null
  const locked = created !== null
  const datesLocked =
    locked ||
    Boolean(
      editing && detail.rooms.some((room) => room.status === "checked_out")
    )
  const partyLocked =
    locked || (Boolean(editing) && (!line || !openStatuses.has(line.status)))
  const occupancyError =
    !rows &&
    !partyLocked &&
    partyValid &&
    roomType &&
    adultCount + childCount > roomType.maxOccupancy
      ? `${typeName} admite hasta ${roomType.maxOccupancy} huéspedes.`
      : null
  const needsConflict = !blank && (!editing || datesChanged)
  const catalog = availability.data?.roomTypes ?? []
  const freeFor = (typeId: string | null) =>
    openRooms(
      typeId,
      null,
      rooms.data,
      reservations.data,
      closures.data,
      conflictsReady,
      checkIn,
      checkOut,
      excludeReservationId
    )
  const lineViews = roomLines.map((roomLine) => {
    const counts = partyCounts(roomLine.adults, roomLine.children)
    const type = catalog.find((item) => item.id === roomLine.typeId)
    const closed = Boolean(
      roomLine.status && !openStatuses.has(roomLine.status)
    )
    const freshTaken = roomLines.filter(
      (item) =>
        !item.removed &&
        !item.lineId &&
        item.key !== roomLine.key &&
        item.typeId === roomLine.typeId
    ).length
    const free = freeFor(roomLine.typeId).filter(
      (room) =>
        !roomLines.some(
          (item) =>
            !item.removed &&
            (!item.status || openStatuses.has(item.status)) &&
            item.key !== roomLine.key &&
            item.roomId === room.id
        )
    )
    const pinned =
      rooms.data?.find((room) => room.id === roomLine.roomId) ??
      (roomLine.roomId
        ? {
            id: roomLine.roomId,
            number: roomLine.roomNumber ?? roomLine.roomId,
          }
        : undefined)
    const roomChoices =
      pinned && !free.some((room) => room.id === pinned.id)
        ? [pinned, ...free]
        : free
    const roomReady =
      !roomLine.roomId ||
      (roomLine.lineId !== null &&
        roomLine.roomId === roomLine.savedRoomId &&
        (locked || !datesChanged)) ||
      (conflictsReady && free.some((room) => room.id === roomLine.roomId))
    const lineOccupancyError =
      !closed &&
      counts.valid &&
      type &&
      counts.adultCount + counts.childCount > type.maxOccupancy
        ? `${type.name} admite hasta ${type.maxOccupancy} huéspedes.`
        : null
    const lineTypeName = roomLine.typeName ?? type?.name ?? "Tipo de habitación"
    const saved = (detail ?? created?.reservation)?.rooms.find(
      (room) => room.id === roomLine.lineId
    )
    const discountCents = parseMajorToCents(roomLine.discount.trim() || "0")
    const quoteDatesChanged = !saved || (!locked && !closed && datesChanged)
    const charges = bookingRoomCharges(
      saved?.nights,
      type?.nights,
      quoteDatesChanged,
      discountCents ?? 0
    )
    const discountError =
      discountCents === null
        ? "Ingresa un importe no negativo con hasta dos decimales."
        : charges &&
            discountCents > charges.subtotalCents &&
            discountCents !== roomLine.savedDiscountCents
          ? "El descuento no puede superar el importe de la habitación."
          : null
    return {
      line: roomLine,
      counts,
      type,
      closed,
      free: roomChoices,
      roomReady,
      occupancyError: lineOccupancyError,
      typeName: lineTypeName,
      charges,
      roomNumber: pinned?.number ?? null,
      discountCents,
      discountError,
      prefix: `booking-room-${roomLine.key}`,
      actions: roomLineActions(roomLine, roomLines),
      typeError:
        !roomLine.lineId && !closed
          ? !roomLine.typeId
            ? "Selecciona un tipo de habitación."
            : availability.data && (!type || type.free - freshTaken < 1)
              ? "Este tipo ya no está disponible para la estancia."
              : null
          : null,
      roomError:
        !closed && conflictsReady && rooms.data && !roomReady
          ? "Esta habitación ya no está disponible para la estancia."
          : null,
      types: roomLine.lineId
        ? [{ id: roomLine.typeId ?? "", name: lineTypeName, free: 1 }]
        : catalog.map((item) => ({
            ...item,
            free:
              item.free -
              roomLines.filter(
                (other) =>
                  !other.removed &&
                  !other.lineId &&
                  other.key !== roomLine.key &&
                  other.typeId === item.id
              ).length,
          })),
    }
  })
  const roomError =
    target.mode === "create" && conflictsReady && maxNights < nights
      ? "Esta habitación ya no está disponible para la estancia."
      : null
  const availabilityError =
    !editing && !created && roomType && roomType.free < 1
      ? `No hay habitaciones ${typeName} disponibles para la estancia.`
      : null
  const needsAvailability =
    !locked &&
    (!editing ||
      datesChanged ||
      roomLines.some(
        (item) =>
          !item.removed &&
          (!item.lineId ||
            (item.status &&
              openStatuses.has(item.status) &&
              (Number(item.adults) !== item.savedAdults ||
                Number(item.children) !== item.savedChildren)))
      ))
  const queryError =
    reservations.error?.message ??
    closures.error?.message ??
    (rows ? rooms.error?.message : null) ??
    (needsAvailability ? availability.error?.message : null) ??
    null
  const loading =
    ((needsConflict || rows) &&
      (reservations.isFetching || closures.isFetching)) ||
    (rows && rooms.isPending) ||
    (needsAvailability && availability.isFetching)
  const nightLabel = `${nights} ${nights === 1 ? "noche" : "noches"}`
  const currency = CURRENCY
  const singleDiscountCents = parseMajorToCents(
    roomLines[0]?.discount.trim() || "0"
  )
  const singleCharges = bookingRoomCharges(
    created?.reservation.rooms[0]?.nights,
    roomType?.nights,
    !locked,
    singleDiscountCents ?? 0
  )
  const singleDiscountError =
    singleDiscountCents === null
      ? "Ingresa un importe no negativo con hasta dos decimales."
      : singleCharges && singleDiscountCents > singleCharges.subtotalCents
        ? "El descuento no puede superar el importe de la habitación."
        : null
  const paidCents = detail?.paidCents ?? 0
  const summaryRooms: BookingSummaryRoom[] = rows
    ? lineViews.map((view) => ({
        key: view.line.key,
        typeName: view.typeName,
        adults: view.counts.valid ? view.counts.adultCount : null,
        children: view.counts.valid ? view.counts.childCount : null,
        status: view.line.removed ? "cancelled" : view.line.status,
        charges: view.charges,
        invalid: view.line.removed
          ? false
          : Boolean(stayError || view.discountError),
      }))
    : [
        {
          key: roomLines[0]!.key,
          typeName: typeName || "Tipo de habitación",
          adults: partyValid ? adultCount : null,
          children: partyValid ? childCount : null,
          status: null,
          charges: singleCharges,
          invalid: Boolean(stayError || singleDiscountError),
        },
      ]
  const summary = stayError ? null : bookingSummary(summaryRooms, paidCents)
  const dateFormat =
    checkInDate.getFullYear() === checkOutDate.getFullYear()
      ? "d MMM"
      : "d MMM yyyy"
  const stayLabel = `${format(checkInDate, dateFormat)} al ${format(checkOutDate, dateFormat)} · ${nightLabel}`
  const summaryMessage = summary
    ? "Importes en soles."
    : stayError ||
        (rows
          ? lineViews.some((view) => !view.line.removed && view.discountError)
          : singleDiscountError)
      ? "Ingresa fechas y descuentos válidos para ver el total."
      : availability.error
        ? "No se pudieron cargar los precios."
        : rows && lineViews.some((view) => !view.line.typeId)
          ? "Selecciona un tipo de habitación para ver el total."
          : "Consultando precios..."
  const errors: FieldErrors = {
    "booking-first-name": locked ? null : contact.firstName,
    "booking-last-name": locked ? null : contact.lastName,
    "booking-email": locked ? null : contact.email,
    "booking-check-out": datesLocked ? null : stayError,
  }
  if (rows) {
    for (const view of lineViews) {
      if (view.line.removed) continue
      errors[`${view.prefix}-type`] = view.typeError
      errors[`${view.prefix}-room`] = view.roomError
      errors[`${view.prefix}-adults`] =
        locked || view.closed
          ? null
          : (view.counts.adultsError ?? view.occupancyError)
      errors[`${view.prefix}-children`] =
        locked || view.closed
          ? null
          : (view.counts.childrenError ?? view.occupancyError)
      errors[`${view.prefix}-discount`] =
        locked || view.line.status === "cancelled" ? null : view.discountError
    }
  } else {
    errors["booking-check-out"] = datesLocked
      ? null
      : (stayError ?? roomError ?? availabilityError)
    errors["booking-adults"] = partyLocked
      ? null
      : (counts.adultsError ?? occupancyError)
    errors["booking-children"] = partyLocked
      ? null
      : (counts.childrenError ?? occupancyError)
    errors["booking-discount"] = locked ? null : singleDiscountError
  }
  const validation = useFieldValidation(errors)
  const firstNameError = validation.errorFor("booking-first-name")
  const lastNameError = validation.errorFor("booking-last-name")
  const emailError = validation.errorFor("booking-email")
  const singleOccupancyError =
    occupancyError &&
    (validation.errorFor("booking-adults") ||
      validation.errorFor("booking-children"))
  const checkOutError = validation.errorFor("booking-check-out")
  const shownError = localError ?? queryError
  const statusRooms: StatusRoom[] = roomLines.flatMap((roomLine) =>
    roomLine.removed
      ? []
      : [
          {
            status:
              roomLine.status && isRoomStatus(roomLine.status)
                ? roomLine.status
                : "confirmed",
            roomId: roomLine.roomId,
          },
        ]
  )

  function moveCheckIn(date: Date) {
    setCheckInDate(date)
    setCheckOutDate((current) => clampCheckOut(date, current))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || submitting.current) return
    if (!validation.validate(event.currentTarget)) return
    if (loading || queryError) return
    setLocalError(null)
    submitting.current = true
    onSaving(true)
    try {
      await save()
    } finally {
      submitting.current = false
      onSaving(false)
    }
  }

  async function save() {
    if (editing && detail && target.mode === "edit") {
      const datesChanged =
        checkIn !== detail.checkIn || checkOut !== detail.checkOut
      const guest = guestChanges(detail.guest, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: emailValue,
        phone: phone.trim(),
        notes: notes.trim(),
      })
      const resolvedId = (roomLine: RoomLineChoice) =>
        roomLine.lineId ?? linkedLines[roomLine.key] ?? null
      const partyRooms = lineViews.flatMap((view) => {
        const lineId = resolvedId(view.line)
        if (!lineId || view.line.removed) return []
        const partyChanged =
          !view.closed &&
          view.counts.valid &&
          (view.counts.adultCount !== view.line.savedAdults ||
            view.counts.childCount !== view.line.savedChildren)
        const discountChanged =
          view.discountCents !== null &&
          view.discountCents !== view.line.savedDiscountCents
        if (!partyChanged && !discountChanged) return []
        return [
          {
            id: lineId,
            ...(partyChanged
              ? {
                  adults: view.counts.adultCount,
                  children: view.counts.childCount,
                }
              : {}),
            ...(discountChanged ? { discountCents: view.discountCents! } : {}),
          },
        ]
      })
      const statusPlan = statusChoice
        ? planBulkStatus(statusRooms, statusChoice)
        : null
      if (statusPlan && !statusPlan.ok) {
        setLocalError(statusPlan.reason)
        return
      }
      const assigns = lineViews.flatMap((view) => {
        const lineId = resolvedId(view.line)
        if (!lineId || view.line.removed || view.closed || !view.line.roomId)
          return []
        if (view.line.roomId === view.line.savedRoomId) return []
        return [{ key: view.line.key, lineId, roomId: view.line.roomId }]
      })
      const unassigns = lineViews.flatMap((view) => {
        const lineId = resolvedId(view.line)
        if (
          !lineId ||
          view.line.removed ||
          view.line.status !== "confirmed" ||
          view.line.roomId ||
          !view.line.savedRoomId
        )
          return []
        return [{ key: view.line.key, lineId }]
      })
      const additions = lineViews.filter(
        (view) =>
          !view.line.removed &&
          !resolvedId(view.line) &&
          view.line.typeId &&
          view.counts.valid
      )
      const removals = lineViews.flatMap((view) => {
        if (
          !view.line.removed ||
          !view.line.lineId ||
          view.line.status !== "confirmed"
        )
          return []
        return [{ key: view.line.key, lineId: view.line.lineId }]
      })
      if (
        !datesChanged &&
        !guest &&
        partyRooms.length === 0 &&
        assigns.length === 0 &&
        unassigns.length === 0 &&
        additions.length === 0 &&
        removals.length === 0 &&
        !statusPlan
      ) {
        onDone()
        return
      }
      try {
        for (const removal of removals) {
          await onCancelRoom({ id: detail.id, lineId: removal.lineId })
          setRoomLines((current) =>
            current.map((item) =>
              item.key === removal.key
                ? { ...item, status: "cancelled", removed: false }
                : item
            )
          )
        }
      } catch (error) {
        setLocalError(`No se pudo quitar la habitación. ${bookingError(error)}`)
        return
      }
      try {
        for (const unassign of unassigns) {
          await onUnassign({
            reservationId: detail.id,
            lineId: unassign.lineId,
          })
          setRoomLines((current) =>
            current.map((item) =>
              item.key === unassign.key
                ? { ...item, savedRoomId: null, roomNumber: null }
                : item
            )
          )
        }
      } catch (error) {
        setLocalError(
          `No se pudo desasignar la habitación. ${bookingError(error)}`
        )
        return
      }
      try {
        if (datesChanged || partyRooms.length > 0) {
          await onPatchReservation({
            id: detail.id,
            ...(datesChanged ? { checkIn, checkOut } : {}),
            ...(partyRooms.length > 0 ? { rooms: partyRooms } : {}),
          })
        }
        if (guest) await onPatchGuest({ id: detail.guest.id, body: guest })
      } catch (error) {
        const message = bookingError(error)
        setLocalError(message)
        return
      }
      try {
        for (const assign of assigns) {
          await onAssign({
            reservationId: detail.id,
            lineId: assign.lineId,
            roomId: assign.roomId,
          })
          setRoomLines((current) =>
            current.map((item) =>
              item.key === assign.key
                ? { ...item, savedRoomId: assign.roomId }
                : item
            )
          )
        }
      } catch (error) {
        setLocalError(
          `La reserva existe, pero no se completó la asignación. ${bookingError(error)}`
        )
        return
      }
      const known = { ...linkedLines }
      const knownIds = new Set([
        ...detail.rooms.map((room) => room.id),
        ...Object.values(known),
      ])
      let assignmentError: string | null = null
      try {
        for (const view of additions) {
          if (!view.line.typeId) continue
          const created = await onAddRoom({
            id: detail.id,
            roomTypeId: view.line.typeId,
            adults: view.counts.adultCount,
            children: view.counts.childCount,
            discountCents: view.discountCents!,
          })
          const createdLine = created.rooms.find(
            (room) => !knownIds.has(room.id)
          )
          if (!createdLine)
            throw new Error("La reserva no contiene habitaciones.")
          known[view.line.key] = createdLine.id
          knownIds.add(createdLine.id)
          setLinkedLines({ ...known })
          setRoomLines((current) =>
            current.map((item) =>
              item.key === view.line.key
                ? {
                    ...item,
                    lineId: createdLine.id,
                    status: "confirmed",
                    savedAdults: view.counts.adultCount,
                    savedChildren: view.counts.childCount,
                    savedDiscountCents: createdLine.discountCents,
                  }
                : item
            )
          )
          if (!view.line.roomId) continue
          try {
            await onAssign({
              reservationId: detail.id,
              lineId: createdLine.id,
              roomId: view.line.roomId,
            })
            setRoomLines((current) =>
              current.map((item) =>
                item.key === view.line.key
                  ? { ...item, savedRoomId: view.line.roomId }
                  : item
              )
            )
          } catch (error) {
            assignmentError = bookingError(error)
          }
        }
      } catch (error) {
        const message = bookingError(error)
        setLocalError(message)
        return
      }
      if (assignmentError) {
        setLocalError(
          `La habitación se añadió a la reserva, pero no se asignó. ${assignmentError}`
        )
        return
      }
      if (statusPlan?.ok) {
        try {
          await onChangeStatus({ id: detail.id, action: statusPlan.action })
        } catch (error) {
          setLocalError(
            `Los demás cambios se guardaron, pero no se pudo cambiar el estado. ${bookingError(error)}`
          )
          return
        }
      }
      onDone()
      return
    }

    const phoneValue = phone.trim()
    const notesValue = notes.trim()
    const guestInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      ...(emailValue ? { email: emailValue } : {}),
      ...(phoneValue ? { phone: phoneValue } : {}),
      ...(notesValue ? { notes: notesValue } : {}),
    }
    const requested = blank
      ? lineViews.map((view) => ({
          key: view.line.key,
          roomTypeId: view.line.typeId!,
          adults: view.counts.adultCount,
          children: view.counts.childCount,
          discountCents: view.discountCents!,
          roomId: view.line.roomId,
        }))
      : target.mode === "create"
        ? [
            {
              key: roomLines[0]!.key,
              roomTypeId: target.roomTypeId,
              adults: adultCount,
              children: childCount,
              discountCents: singleDiscountCents!,
              roomId: target.roomId,
            },
          ]
        : []
    try {
      const reservation = await createBooking({
        input: {
          guest: guestInput,
          checkIn,
          checkOut,
          rooms: requested.map(
            ({ roomTypeId, adults, children, discountCents }) => ({
              roomTypeId,
              adults,
              children,
              discountCents,
            })
          ),
        },
        rooms: requested,
        saved: createdRef.current,
        create: onCreate,
        assign: onAssign,
        onProgress: (saved) => {
          createdRef.current = saved
          setCreated(saved)
          setRoomLines((current) =>
            current.map((item) => {
              const line = saved.reservation.rooms.find(
                (room) => room.id === saved.lineIds[item.key]
              )
              return line
                ? {
                    ...item,
                    lineId: line.id,
                    status: line.status,
                    savedAdults: line.adults,
                    savedChildren: line.children,
                    savedDiscountCents: line.discountCents,
                    savedRoomId: line.roomId,
                  }
                : item
            })
          )
        },
      })
      createdToast(reservation, onViewReservation)
      onDone()
    } catch (error) {
      const message = bookingError(error)
      setLocalError(
        createdRef.current
          ? `La reserva ${createdRef.current.reservation.code} se creó, pero no se completó la asignación. ${message}`
          : message
      )
    }
  }

  const detailsForm = (
    <form
      id={detailsFormId}
      noValidate
      onSubmit={submit}
      aria-busy={pending}
      className="grid gap-6 py-5 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start"
    >
      <FieldGroup className="min-w-0 gap-6">
        <FieldSet>
          <FieldLegend className="sr-only">Fechas de estancia</FieldLegend>
          <FieldGroup className="grid max-w-md grid-cols-2 gap-3">
            <DateField
              id="booking-check-in"
              label="Entrada"
              value={checkInDate}
              timeZone={timeZone}
              locked={datesLocked || pending}
              onBlur={() => validation.touch("booking-check-out")}
              disabled={{ before: startOfToday() }}
              onChange={moveCheckIn}
            />
            <DateField
              id="booking-check-out"
              label="Salida"
              value={checkOutDate}
              timeZone={timeZone}
              locked={datesLocked || pending}
              error={checkOutError}
              onBlur={() => validation.touch("booking-check-out")}
              disabled={[
                { before: addDays(checkInDate, 1) },
                { after: addDays(checkInDate, maxNights) },
              ]}
              onChange={(date) => {
                setCheckOutDate(clampCheckOut(checkInDate, date))
              }}
            />
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Habitaciones y huéspedes</FieldLegend>
          {rows ? (
            <FieldGroup className="gap-3">
              {lineViews.map((view, index) =>
                view.line.removed ? (
                  <RemovedRoomRow
                    key={view.line.key}
                    label={removedRoomLabel(view.line, view.typeName)}
                    disabled={pending}
                    onUndo={() => {
                      setRoomLines((current) =>
                        current.map((item) =>
                          item.key === view.line.key
                            ? { ...item, removed: false }
                            : item
                        )
                      )
                    }}
                  />
                ) : (
                  <RoomLineRow
                    key={view.line.key}
                    prefix={view.prefix}
                    index={index}
                    typeId={view.line.typeId}
                    typeName={view.typeName}
                    roomId={view.line.roomId}
                    adults={view.line.adults}
                    children={view.line.children}
                    discount={view.line.discount}
                    typeError={
                      view.line.typeId && view.typeError
                        ? view.typeError
                        : validation.errorFor(`${view.prefix}-type`)
                    }
                    roomError={
                      view.roomError ??
                      validation.errorFor(`${view.prefix}-room`)
                    }
                    adultsError={
                      view.counts.adultsError &&
                      validation.errorFor(`${view.prefix}-adults`)
                    }
                    childrenError={
                      view.counts.childrenError &&
                      validation.errorFor(`${view.prefix}-children`)
                    }
                    occupancyError={
                      view.occupancyError &&
                      (validation.errorFor(`${view.prefix}-adults`) ||
                        validation.errorFor(`${view.prefix}-children`))
                    }
                    discountError={validation.errorFor(
                      `${view.prefix}-discount`
                    )}
                    discountDisabled={
                      locked || pending || view.line.status === "cancelled"
                    }
                    types={view.types}
                    rooms={view.free}
                    typesLoading={availability.isPending && !view.line.lineId}
                    roomsLoading={Boolean(view.line.typeId) && !conflictsReady}
                    disabled={pending || view.closed}
                    partyDisabled={locked || pending || view.closed}
                    typeLocked={locked || Boolean(view.line.lineId)}
                    allowLater={
                      !view.line.savedRoomId || view.line.status === "confirmed"
                    }
                    status={view.line.status}
                    actions={view.actions}
                    onBlur={validation.touch}
                    onType={(value) => {
                      if (view.line.lineId) return
                      setRoomLines((current) =>
                        current.map((item) =>
                          item.key === view.line.key
                            ? { ...item, typeId: value, roomId: null }
                            : item
                        )
                      )
                    }}
                    onRoom={(value) => {
                      if (
                        !value &&
                        view.line.savedRoomId &&
                        view.line.status !== "confirmed"
                      )
                        return
                      setRoomLines((current) =>
                        current.map((item) =>
                          item.key === view.line.key
                            ? { ...item, roomId: value }
                            : item
                        )
                      )
                    }}
                    onAdults={(value) => {
                      setRoomLines((current) =>
                        current.map((item) =>
                          item.key === view.line.key
                            ? { ...item, adults: value }
                            : item
                        )
                      )
                    }}
                    onChildren={(value) => {
                      setRoomLines((current) =>
                        current.map((item) =>
                          item.key === view.line.key
                            ? { ...item, children: value }
                            : item
                        )
                      )
                    }}
                    onDiscount={(value) => {
                      setRoomLines((current) =>
                        current.map((item) =>
                          item.key === view.line.key
                            ? { ...item, discount: value }
                            : item
                        )
                      )
                    }}
                    onUnassign={() => {
                      setRoomLines((current) =>
                        current.map((item) =>
                          item.key === view.line.key &&
                          roomLineActions(item, current).canUnassign
                            ? { ...item, roomId: null }
                            : item
                        )
                      )
                    }}
                    onRemove={() => {
                      setRoomLines((current) => {
                        const item = current.find(
                          (item) => item.key === view.line.key
                        )
                        if (!item || !roomLineActions(item, current).canRemove)
                          return current
                        return item.lineId
                          ? current.map((line) =>
                              line.key === item.key
                                ? { ...line, removed: true }
                                : line
                            )
                          : current.filter((line) => line.key !== item.key)
                      })
                    }}
                  />
                )
              )}
              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={
                  locked ||
                  pending ||
                  lineViews.filter((view) => !view.line.removed).length >= 60
                }
                onClick={() =>
                  setRoomLines((current) => [...current, emptyRoomLine()])
                }
              >
                <PlusIcon data-icon="inline-start" />
                Añadir habitación
              </Button>
            </FieldGroup>
          ) : (
            <FieldGroup className="grid grid-cols-2 gap-3 @2xs/field-group:grid-cols-3 @xl/field-group:grid-cols-[minmax(0,1fr)_7rem_4rem_4rem_6.5rem]">
              <Field
                className="col-span-2 min-w-0 @xl/field-group:col-span-1"
                data-disabled
              >
                <FieldLabel htmlFor="booking-room-type">Tipo</FieldLabel>
                <Input id="booking-room-type" value={typeName} disabled />
              </Field>
              <Field className="min-w-0" data-disabled>
                <FieldLabel htmlFor="booking-room">Hab.</FieldLabel>
                <Input
                  id="booking-room"
                  value={target.mode === "create" ? target.number : ""}
                  disabled
                />
              </Field>
              <GuestCountField
                id="booking-adults"
                label="Adultos"
                min={1}
                value={adults}
                disabled={partyLocked || pending}
                error={
                  counts.adultsError && validation.errorFor("booking-adults")
                }
                occupancyErrorId={
                  singleOccupancyError ? "booking-occupancy-error" : undefined
                }
                onBlur={() => validation.touch("booking-adults")}
                onChange={setAdults}
              />
              <GuestCountField
                id="booking-children"
                label="Niños"
                min={0}
                value={children}
                disabled={partyLocked || pending}
                error={
                  counts.childrenError &&
                  validation.errorFor("booking-children")
                }
                occupancyErrorId={
                  singleOccupancyError ? "booking-occupancy-error" : undefined
                }
                onBlur={() => validation.touch("booking-children")}
                onChange={setChildren}
              />
              <DiscountField
                id="booking-discount"
                value={roomLines[0]?.discount ?? ""}
                error={validation.errorFor("booking-discount")}
                disabled={locked || pending}
                onBlur={() => validation.touch("booking-discount")}
                onChange={(value) => {
                  setRoomLines((current) =>
                    current.map((item, index) =>
                      index === 0 ? { ...item, discount: value } : item
                    )
                  )
                }}
              />
              {singleOccupancyError ? (
                <FieldError
                  id="booking-occupancy-error"
                  className="col-span-full"
                >
                  {singleOccupancyError}
                </FieldError>
              ) : null}
            </FieldGroup>
          )}
        </FieldSet>

        <FieldSet className="min-w-0">
          <FieldLegend>Contacto principal</FieldLegend>
          <FieldGroup className="gap-3">
            <FieldGroup className="grid grid-cols-2 gap-3">
              <Field
                data-invalid={Boolean(firstNameError) || undefined}
                data-disabled={locked || pending || undefined}
              >
                <FieldLabel htmlFor="booking-first-name">Nombres</FieldLabel>
                <Input
                  id="booking-first-name"
                  autoComplete="given-name"
                  maxLength={100}
                  required
                  value={firstName}
                  disabled={locked || pending}
                  aria-invalid={Boolean(firstNameError) || undefined}
                  aria-describedby={
                    firstNameError ? "booking-first-name-error" : undefined
                  }
                  onBlur={() => validation.touch("booking-first-name")}
                  onChange={(event) => setFirstName(event.target.value)}
                />
                {firstNameError ? (
                  <FieldError id="booking-first-name-error">
                    {firstNameError}
                  </FieldError>
                ) : null}
              </Field>
              <Field
                data-invalid={Boolean(lastNameError) || undefined}
                data-disabled={locked || pending || undefined}
              >
                <FieldLabel htmlFor="booking-last-name">Apellidos</FieldLabel>
                <Input
                  id="booking-last-name"
                  autoComplete="family-name"
                  maxLength={100}
                  required
                  value={lastName}
                  disabled={locked || pending}
                  aria-invalid={Boolean(lastNameError) || undefined}
                  aria-describedby={
                    lastNameError ? "booking-last-name-error" : undefined
                  }
                  onBlur={() => validation.touch("booking-last-name")}
                  onChange={(event) => setLastName(event.target.value)}
                />
                {lastNameError ? (
                  <FieldError id="booking-last-name-error">
                    {lastNameError}
                  </FieldError>
                ) : null}
              </Field>
            </FieldGroup>
            <FieldGroup className="grid gap-3 @sm/field-group:grid-cols-2">
              <Field
                data-invalid={Boolean(emailError) || undefined}
                data-disabled={locked || pending || undefined}
              >
                <FieldLabel htmlFor="booking-email">Correo</FieldLabel>
                <Input
                  id="booking-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Opcional"
                  aria-invalid={Boolean(emailError) || undefined}
                  aria-describedby={
                    emailError ? "booking-email-error" : undefined
                  }
                  value={email}
                  disabled={locked || pending}
                  onBlur={() => validation.touch("booking-email")}
                  onChange={(event) => {
                    setEmail(event.target.value)
                  }}
                />
                {emailError ? (
                  <FieldError id="booking-email-error">{emailError}</FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="booking-phone">Teléfono</FieldLabel>
                <Input
                  id="booking-phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={40}
                  placeholder="Opcional"
                  value={phone}
                  disabled={locked || pending}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel htmlFor="booking-notes">Notas del huésped</FieldLabel>
              <Textarea
                id="booking-notes"
                maxLength={2000}
                placeholder="Opcional"
                value={notes}
                disabled={locked || pending}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </FieldGroup>
        </FieldSet>
      </FieldGroup>
      <BookingSummary
        rooms={summaryRooms}
        summary={summary}
        paidCents={paidCents}
        currency={currency}
        stayLabel={stayLabel}
        showPayments={Boolean(editing)}
        message={summaryMessage}
      />
    </form>
  )
  const paymentTab = editing && activeTab === "payments"
  const content = (
    <>
      <DialogHeader className="shrink-0 gap-2 pr-8 pb-1">
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {editing ? "Editar reserva" : "Nueva reserva"}
          {editing ? <Badge variant="secondary">{detail.code}</Badge> : null}
        </DialogTitle>
        {editing ? (
          <TabsList
            variant="line"
            className="mt-1 -ml-1.5"
            aria-label="Secciones de la reserva"
          >
            <TabsTrigger value="details" disabled={pending}>
              Detalles
            </TabsTrigger>
            <TabsTrigger value="payments" disabled={pending}>
              Pagos
            </TabsTrigger>
          </TabsList>
        ) : null}
      </DialogHeader>

      <div className="min-h-0 overflow-y-auto px-1">
        {editing ? (
          <TabsContent
            value="details"
            keepMounted
            className="data-hidden:hidden"
          >
            {detailsForm}
          </TabsContent>
        ) : (
          detailsForm
        )}
        {editing ? (
          <TabsContent
            value="payments"
            keepMounted
            className="data-hidden:hidden"
          >
            <ReservationPayments
              formId={paymentFormId}
              reservation={detail}
              pending={pending}
              onError={setPaymentError}
              onRecord={(body) => onRecordPayment(detail.id, body)}
            />
          </TabsContent>
        ) : null}
      </div>

      <DialogFooter className="grid shrink-0 grid-cols-2 pt-3 sm:flex sm:flex-wrap sm:items-end">
        {(paymentTab ? paymentError : shownError) ? (
          <FieldError className="col-span-2 min-w-0 wrap-anywhere sm:basis-full">
            {paymentTab ? paymentError : shownError}
          </FieldError>
        ) : null}
        {!paymentTab && loading ? (
          <p role="status" className="col-span-2 min-w-0 sm:basis-full">
            Consultando disponibilidad...
          </p>
        ) : null}
        {editing && !paymentTab && !created ? (
          <FieldGroup className="col-span-2 min-w-0 sm:mr-auto sm:max-w-sm">
            <ReservationStatusSelect
              id={statusSelectId}
              rooms={statusRooms}
              choice={statusChoice}
              disabled={pending}
              onChange={(status) => {
                setLocalError(null)
                setStatusChoice(status)
              }}
            />
          </FieldGroup>
        ) : null}
        {created ? (
          <Button
            type="button"
            variant="outline"
            className="col-span-2"
            disabled={pending}
            onClick={() => onViewReservation(created.reservation.id)}
          >
            Ver reserva
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onDone}
        >
          {editing || created ? "Cerrar" : "Cancelar"}
        </Button>
        <Button
          type="submit"
          form={paymentTab ? paymentFormId : detailsFormId}
          disabled={pending || (!paymentTab && loading)}
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {paymentTab
            ? "Registrar pago"
            : created
              ? "Reintentar asignación"
              : editing
                ? "Guardar"
                : "Crear reserva"}
        </Button>
      </DialogFooter>
    </>
  )

  return editing ? (
    <Tabs
      className="max-h-[calc(100svh-4rem)] min-h-0 gap-0"
      value={activeTab}
      onValueChange={(value) => {
        if (!pending && (value === "details" || value === "payments"))
          onTab(value)
      }}
    >
      {content}
    </Tabs>
  ) : (
    <div className="flex max-h-[calc(100svh-4rem)] min-h-0 flex-col">
      {content}
    </div>
  )
}

function RemovedRoomRow({
  label,
  disabled,
  onUndo,
}: {
  label: string
  disabled: boolean
  onUndo: () => void
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border p-3">
      <p className="min-w-0 truncate">{label} quitada</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={onUndo}
      >
        Deshacer
      </Button>
    </div>
  )
}

function RoomLineMenu({
  index,
  actions,
  disabled,
  size = "icon",
  onUnassign,
  onRemove,
}: {
  index: number
  actions: ReturnType<typeof roomLineActions>
  disabled: boolean
  size?: "icon" | "icon-sm"
  onUnassign: () => void
  onRemove: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="ghost"
            size={size}
            aria-label={`Opciones de habitación ${index + 1}`}
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={!actions.canUnassign}
            onClick={onUnassign}
          >
            <UnlinkIcon />
            Desasignar habitación
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!actions.canRemove}
            onClick={onRemove}
          >
            <XIcon />
            Quitar habitación
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RoomLineRow({
  prefix,
  index,
  typeId,
  typeName,
  roomId,
  adults,
  children,
  discount,
  typeError,
  roomError,
  adultsError,
  childrenError,
  occupancyError,
  discountError,
  discountDisabled,
  types,
  rooms,
  typesLoading,
  roomsLoading,
  disabled,
  partyDisabled,
  typeLocked,
  allowLater,
  status,
  actions,
  onBlur,
  onType,
  onRoom,
  onAdults,
  onChildren,
  onDiscount,
  onUnassign,
  onRemove,
}: {
  prefix: string
  index: number
  typeId: string | null
  typeName: string
  roomId: string | null
  adults: string
  children: string
  discount: string
  typeError: string | null
  roomError: string | null
  adultsError: string | null
  childrenError: string | null
  occupancyError: string | null
  discountError: string | null
  discountDisabled: boolean
  types: { id: string; name: string; free: number }[]
  rooms: { id: string; number: string }[]
  typesLoading: boolean
  roomsLoading: boolean
  disabled: boolean
  partyDisabled: boolean
  typeLocked: boolean
  allowLater: boolean
  status: string | null
  actions: ReturnType<typeof roomLineActions>
  onBlur: (id: string) => void
  onType: (value: string | null) => void
  onRoom: (value: string | null) => void
  onAdults: (value: string) => void
  onChildren: (value: string) => void
  onDiscount: (value: string) => void
  onUnassign: () => void
  onRemove: () => void
}) {
  const [typeOpen, setTypeOpen] = useState(false)
  const [roomOpen, setRoomOpen] = useState(false)
  const typeItems = [
    { value: null, label: "Seleccionar tipo", disabled: false },
    ...types.map((type) => ({
      value: type.id,
      label: type.name,
      disabled: typeLocked ? false : type.free < 1,
    })),
  ]
  if (typeId && !typeItems.some((item) => item.value === typeId)) {
    typeItems.push({ value: typeId, label: typeName, disabled: !typeLocked })
  }
  const roomItems = [
    ...(allowLater
      ? [{ value: null, label: "Sin asignar", disabled: false }]
      : []),
    ...rooms.map((room) => ({
      value: room.id,
      label: room.number,
      disabled: room.id === roomId && Boolean(roomError),
    })),
  ]
  const typeDisabled = disabled || typeLocked || typesLoading
  const statusLabel =
    status === "checked_out"
      ? "Salida"
      : status === "cancelled"
        ? "Cancelada"
        : status === "no_show"
          ? "No se presentó"
          : null

  return (
    <FieldSet className="@container/room-line min-w-0 gap-3 border p-3">
      <FieldLegend variant="label" className="sr-only">
        Habitación {index + 1}
      </FieldLegend>
      <div className="flex items-center justify-between gap-3 @xl/room-line:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Habitación {index + 1}</span>
          {statusLabel ? (
            <Badge variant="secondary">{statusLabel}</Badge>
          ) : null}
        </div>
        {actions.visible ? (
          <RoomLineMenu
            index={index}
            actions={actions}
            size="icon-sm"
            disabled={disabled}
            onUnassign={onUnassign}
            onRemove={onRemove}
          />
        ) : null}
      </div>
      <FieldGroup className="grid grid-cols-2 gap-3 @2xs/room-line:grid-cols-3 @xl/room-line:grid-cols-[minmax(0,1fr)_7rem_4rem_4rem_6.5rem_2rem]">
        <Field
          className="col-span-2 min-w-0 @xl/room-line:col-span-1"
          data-disabled={typeDisabled || undefined}
          data-invalid={Boolean(typeError) || undefined}
        >
          <FieldLabel htmlFor={`${prefix}-type`}>Tipo</FieldLabel>
          <Select
            items={typeItems}
            value={typeId}
            disabled={typeDisabled}
            onValueChange={onType}
            onOpenChange={(open) => {
              setTypeOpen(open)
              if (!open) onBlur(`${prefix}-type`)
            }}
          >
            <SelectTrigger
              id={`${prefix}-type`}
              className="w-full"
              aria-invalid={Boolean(typeError) || undefined}
              aria-describedby={typeError ? `${prefix}-type-error` : undefined}
              onBlur={() => {
                if (!typeOpen) onBlur(`${prefix}-type`)
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {typeItems.map((item) => (
                  <SelectItem
                    key={item.value ?? "type-placeholder"}
                    value={item.value}
                    disabled={item.disabled}
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {typeError ? (
            <FieldError id={`${prefix}-type-error`}>{typeError}</FieldError>
          ) : null}
          {statusLabel ? (
            <div className="hidden @xl/room-line:block">
              <Badge variant="secondary">{statusLabel}</Badge>
            </div>
          ) : null}
        </Field>
        <Field
          className="min-w-0"
          data-disabled={disabled || !typeId || roomsLoading || undefined}
          data-invalid={Boolean(roomError) || undefined}
        >
          <FieldLabel htmlFor={`${prefix}-room`}>Hab.</FieldLabel>
          <Select
            items={roomItems}
            value={roomId}
            disabled={disabled || !typeId || roomsLoading}
            onValueChange={onRoom}
            onOpenChange={(open) => {
              setRoomOpen(open)
              if (!open) onBlur(`${prefix}-room`)
            }}
          >
            <SelectTrigger
              id={`${prefix}-room`}
              className="w-full"
              aria-invalid={Boolean(roomError) || undefined}
              aria-describedby={roomError ? `${prefix}-room-error` : undefined}
              onBlur={() => {
                if (!roomOpen) onBlur(`${prefix}-room`)
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {roomItems.map((item) => (
                  <SelectItem
                    key={item.value ?? "room-placeholder"}
                    value={item.value}
                    disabled={item.disabled}
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {roomError ? (
            <FieldError id={`${prefix}-room-error`}>{roomError}</FieldError>
          ) : null}
        </Field>
        <GuestCountField
          id={`${prefix}-adults`}
          label="Adultos"
          min={1}
          value={adults}
          disabled={partyDisabled}
          error={adultsError}
          occupancyErrorId={
            occupancyError ? `${prefix}-occupancy-error` : undefined
          }
          onBlur={() => onBlur(`${prefix}-adults`)}
          onChange={onAdults}
        />
        <GuestCountField
          id={`${prefix}-children`}
          label="Niños"
          min={0}
          value={children}
          disabled={partyDisabled}
          error={childrenError}
          occupancyErrorId={
            occupancyError ? `${prefix}-occupancy-error` : undefined
          }
          onBlur={() => onBlur(`${prefix}-children`)}
          onChange={onChildren}
        />
        <DiscountField
          id={`${prefix}-discount`}
          value={discount}
          error={discountError}
          disabled={discountDisabled}
          onBlur={() => onBlur(`${prefix}-discount`)}
          onChange={onDiscount}
        />
        {actions.visible ? (
          <div className="hidden flex-col gap-2 self-start @xl/room-line:flex">
            <span
              className="text-xs leading-snug select-none"
              aria-hidden="true"
            >
              &nbsp;
            </span>
            <RoomLineMenu
              index={index}
              actions={actions}
              disabled={disabled}
              onUnassign={onUnassign}
              onRemove={onRemove}
            />
          </div>
        ) : null}
      </FieldGroup>
      {occupancyError ? (
        <FieldError id={`${prefix}-occupancy-error`}>
          {occupancyError}
        </FieldError>
      ) : null}
    </FieldSet>
  )
}

function DiscountField({
  id,
  value,
  error,
  disabled,
  onBlur,
  onChange,
}: {
  id: string
  value: string
  error: string | null
  disabled: boolean
  onBlur: () => void
  onChange: (value: string) => void
}) {
  return (
    <Field
      data-invalid={Boolean(error) || undefined}
      data-disabled={disabled || undefined}
    >
      <FieldLabel htmlFor={id}>Descuento</FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="0"
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  )
}

function GuestCountField({
  id,
  label,
  min,
  value,
  disabled,
  error,
  occupancyErrorId,
  onBlur,
  onChange,
}: {
  id: string
  label: string
  min: number
  value: string
  disabled: boolean
  error: string | null
  occupancyErrorId?: string
  onBlur: () => void
  onChange: (value: string) => void
}) {
  const description = [error ? `${id}-error` : null, occupancyErrorId]
    .filter(Boolean)
    .join(" ")
  const invalid = Boolean(error || occupancyErrorId)
  return (
    <Field
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
    >
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={min}
        step={1}
        required
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={description || undefined}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  )
}
