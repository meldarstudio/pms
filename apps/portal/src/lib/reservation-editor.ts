import type {
  BookingContact,
  ReservationDetail,
  Reservation,
  RoomClosure,
  StayingGuest,
  WorkflowAction,
  WorkflowRoom,
} from "./api.ts"

export type RoomDraft = {
  id: string
  room: WorkflowRoom
  removed: boolean
}
export function minimumCheckOut(checkIn: string) {
  const date = new Date(`${checkIn}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function changeCheckIn(
  room: { checkIn: string; checkOut: string },
  checkIn: string
): { checkIn: string; checkOut: string } {
  return {
    ...room,
    checkIn,
    checkOut:
      room.checkOut > checkIn ? room.checkOut : minimumCheckOut(checkIn),
  }
}

export const stayValue = (
  line: ReservationDetail["rooms"][number]
): WorkflowRoom => ({
  roomTypeId: line.roomTypeId,
  roomId: line.roomId,
  adults: line.adults,
  children: line.children,
})
export const contactValue = (contact: BookingContact): BookingContact => ({
  fullName: contact.fullName.trim(),
  email: contact.email?.trim() || null,
  phone: contact.phone?.trim() || null,
  documentType: contact.documentType?.trim() || null,
  documentNumber: contact.documentNumber?.trim() || null,
})
export const guestValues = (guests: StayingGuest[]) =>
  guests.map((g) => ({
    ...contactValue(g),
    id: g.id,
    reservationRoomId: g.reservationRoomId,
  }))
export function roomEdits(
  detail: ReservationDetail,
  drafts: RoomDraft[]
): WorkflowAction[] {
  const actions: WorkflowAction[] = []
  for (const draft of drafts) {
    const saved = detail.rooms.find((l) => l.id === draft.id)
    if (draft.removed) {
      if (saved)
        actions.push({
          type: "remove-room",
          lineId: saved.id,
        })
    } else if (!saved) actions.push({ type: "add-room", room: draft.room })
    else {
      const previous = stayValue(saved)
      if (JSON.stringify(draft.room) !== JSON.stringify(previous))
        actions.push({ type: "edit-room", lineId: saved.id, room: draft.room })
    }
  }
  return actions
}
export function overlappingRoomIds(others: WorkflowRoom[]): Set<string> {
  return new Set(others.flatMap((room) => (room.roomId ? [room.roomId] : [])))
}

export function unavailableRoomIds(
  room: { checkIn: string; checkOut: string },
  reservations: Reservation[],
  closures: RoomClosure[],
  reservationId?: string
): Set<string> {
  const overlaps = (start: string, end: string) =>
    room.checkIn < end && start < room.checkOut
  const ids = new Set<string>()
  for (const reservation of reservations) {
    if (reservation.id === reservationId) continue
    for (const line of reservation.rooms) {
      if (
        !line.roomId ||
        reservation.status === "cancelled" ||
        reservation.status === "no_show"
      )
        continue
      const start = reservation.checkIn
      if (overlaps(start, reservation.checkOut)) ids.add(line.roomId)
    }
  }
  for (const closure of closures) {
    if (overlaps(closure.starts, closure.ends)) ids.add(closure.roomId)
  }
  return ids
}

// Notes and guest/contact text do not change charges or dated inventory.
export function billingPreviewActions(actions: WorkflowAction[]) {
  return actions.filter(
    (action) => !["notes", "contact", "set-guests"].includes(action.type)
  )
}
