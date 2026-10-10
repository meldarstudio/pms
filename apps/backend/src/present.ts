import type { guests, payments, reservationRoomNights, reservationRooms, reservations, roomTypes, rooms } from './db/schema'
import { nightsBetween } from './lib/dates'
import { roomCharges } from './lib/billing'

type Guest = typeof guests.$inferSelect
type Reservation = typeof reservations.$inferSelect
type Line = typeof reservationRooms.$inferSelect
type Night = typeof reservationRoomNights.$inferSelect
type Payment = typeof payments.$inferSelect
type RoomType = typeof roomTypes.$inferSelect
type Room = typeof rooms.$inferSelect

const unbilled = new Set(['cancelled'])

export function presentGuest(guest: Guest) {
  return {
    id: guest.id,
    firstName: guest.firstName,
    lastName: guest.lastName,
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
  payments: Payment[]
  types: RoomType[]
  roomRows: Room[]
  currency: string
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
      id: line.id,
      roomTypeId: line.roomTypeId,
      roomTypeName: typeById.get(line.roomTypeId)?.name ?? null,
      roomId: line.roomId,
      roomNumber: line.roomId ? (roomById.get(line.roomId)?.number ?? null) : null,
      adults: line.adults,
      children: line.children,
      status: line.status,
      ...roomCharges(lineTotal, line.discountCents),
      nights: nights.map((night) => ({ date: night.date, priceCents: night.priceCents })),
    }
  })

  const billable = roomsOut.filter((line) => !unbilled.has(line.status))
  const subtotalCents = billable.reduce((sum, line) => sum + line.subtotalCents, 0)
  const discountCents = billable.reduce((sum, line) => sum + line.discountCents, 0)
  const totalCents = subtotalCents - discountCents
  const paidCents = input.payments.reduce((sum, payment) => sum + payment.amountCents, 0)
  const paymentRows = [...input.payments].sort((a, b) => a.paidAt.localeCompare(b.paidAt))

  return {
    id: input.reservation.id,
    code: input.reservation.code,
    guestId: input.reservation.guestId,
    guest: presentGuest(input.guest),
    checkIn: input.reservation.checkIn,
    checkOut: input.reservation.checkOut,
    source: input.reservation.source,
    notes: input.reservation.notes,
    createdAt: input.reservation.createdAt,
    currency: input.currency,
    nights: nightsBetween(input.reservation.checkIn, input.reservation.checkOut).length,
    totalCents,
    subtotalCents,
    discountCents,
    paidCents,
    balanceCents: totalCents - paidCents,
    rooms: roomsOut,
    payments: paymentRows.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paidAt,
      notes: payment.notes,
    })),
  }
}
