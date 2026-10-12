import type {
  reservationGuests,
  payments,
  guests,
  reservationRoomNights,
  reservationRooms,
  reservations,
  roomTypes,
  rooms,
} from './db/schema'
import { nightsBetween } from './lib/dates'
import { bill } from './lib/workflow-billing'

type Guest = typeof guests.$inferSelect
type Reservation = typeof reservations.$inferSelect
type Line = typeof reservationRooms.$inferSelect
type Night = typeof reservationRoomNights.$inferSelect
type RoomType = typeof roomTypes.$inferSelect
type Room = typeof rooms.$inferSelect

const cancelled = (reservation: Reservation) => reservation.status === 'cancelled'

export function presentGuest(guest: Guest) {
  return {
    id: guest.id,
    fullName: guest.fullName,
    email: guest.email,
    phone: guest.phone,
    documentType: guest.documentType,
    documentNumber: guest.documentNumber,
    notes: guest.notes,
    createdAt: guest.createdAt,
  }
}

export function presentReservation(input: {
  reservation: Reservation
  guest: Guest
  lines: Line[]
  nights: Night[]
  types: RoomType[]
  roomRows: Room[]
  payments: (typeof payments.$inferSelect)[]
  currency: string
  stayingGuests?: (typeof reservationGuests.$inferSelect)[]
}) {
  const typeById = new Map(input.types.map((type) => [type.id, type]))
  const roomById = new Map(input.roomRows.map((room) => [room.id, room]))
  const nightsByLine = new Map<string, Night[]>()
  for (const night of input.nights) {
    const list = nightsByLine.get(night.reservationRoomId) ?? []
    list.push(night)
    nightsByLine.set(night.reservationRoomId, list)
  }

  const roomsOut = input.lines.map((line) => {
    const nights = (nightsByLine.get(line.id) ?? []).sort((a, b) => a.date.localeCompare(b.date))
    const lineTotal = nights.reduce((sum, night) => sum + night.priceCents, 0)
    return {
      ...line,
      id: line.id,
      roomTypeId: line.roomTypeId,
      roomTypeName: typeById.get(line.roomTypeId)?.name ?? null,
      roomId: line.roomId,
      roomNumber: line.roomId ? (roomById.get(line.roomId)?.number ?? null) : null,
      adults: line.adults,
      children: line.children,
      subtotalCents: lineTotal,
      discountCents: 0,
      totalCents: cancelled(input.reservation) ? 0 : lineTotal,
      nights: nights.map((night) => ({ date: night.date, priceCents: night.priceCents })),
    }
  })

  const billable = cancelled(input.reservation) ? [] : roomsOut
  const subtotalCents = billable.reduce((sum, line) => sum + line.subtotalCents, 0)
  const totals = bill(subtotalCents, input.payments, input.reservation.discountCents, {
    cancelled: cancelled(input.reservation),
  })

  return {
    id: input.reservation.id,
    code: input.reservation.code,
    status: input.reservation.status,
    cancellationReason: input.reservation.cancellationReason,
    cancelledAt: input.reservation.cancelledAt,
    guestId: input.reservation.guestId,
    guest: presentGuest(input.guest),
    stayingGuests: input.stayingGuests ?? [],
    checkIn: input.reservation.checkIn,
    checkOut: input.reservation.checkOut,
    source: input.reservation.source,
    notes: input.reservation.notes,
    createdAt: input.reservation.createdAt,
    currency: input.currency,
    nights: nightsBetween(input.reservation.checkIn, input.reservation.checkOut).length,
    ...totals,
    savedDiscountCents: input.reservation.discountCents,
    rooms: roomsOut,
    payments: input.payments,
  }
}
