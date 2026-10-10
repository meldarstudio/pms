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
  reason: string
}
export const isActiveStay = (status: string) =>
  status === "confirmed" || status === "checked_in"
export const stayValue = (
  line: ReservationDetail["rooms"][number]
): WorkflowRoom => ({
  roomTypeId: line.roomTypeId,
  roomId: line.roomId,
  adults: line.adults,
  children: line.children,
  checkIn: line.checkIn,
  checkOut: line.checkOut,
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
export function sharedStay(drafts: RoomDraft[]) {
  const rooms = drafts.filter((d) => !d.removed).map((d) => d.room)
  if (
    !rooms.length ||
    rooms.some(
      (r) => r.checkIn !== rooms[0].checkIn || r.checkOut !== rooms[0].checkOut
    )
  )
    return null
  return { checkIn: rooms[0].checkIn, checkOut: rooms[0].checkOut }
}
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
          type: "cancel-room",
          lineId: saved.id,
          reason: draft.reason,
          accidental: true,
        })
    } else if (!saved) actions.push({ type: "add-room", room: draft.room })
    else {
      const previous = stayValue(saved)
      // Assignment changes during occupancy are moves; extensions remain date amendments.
      const amended =
        saved.status === "checked_in"
          ? { ...draft.room, roomId: previous.roomId }
          : draft.room
      if (JSON.stringify(amended) !== JSON.stringify(previous))
        actions.push({ type: "edit-room", lineId: saved.id, room: amended })
      if (
        saved.status === "checked_in" &&
        draft.room.roomId &&
        draft.room.roomId !== previous.roomId
      )
        actions.push({
          type: "move",
          lineId: saved.id,
          roomId: draft.room.roomId,
        })
    }
  }
  return actions
}
export function nextStayAction(
  rooms: ReservationDetail["rooms"]
): "check-in" | "check-out" | null {
  const active = rooms.filter((l) => isActiveStay(l.status))
  if (!active.length) return null
  if (active.every((l) => l.status === "confirmed")) return "check-in"
  if (active.every((l) => l.status === "checked_in")) return "check-out"
  return null
}

export function overlappingRoomIds(
  room: WorkflowRoom,
  others: WorkflowRoom[]
): Set<string> {
  return new Set(
    others
      .filter(
        (other) =>
          other.roomId &&
          room.checkIn < other.checkOut &&
          other.checkIn < room.checkOut
      )
      .map((other) => other.roomId!)
  )
}

export function unavailableRoomIds(
  room: WorkflowRoom,
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
        line.status === "cancelled" ||
        line.status === "no_show"
      )
        continue
      const start = line.assignmentStart ?? line.checkIn ?? reservation.checkIn
      if (overlaps(start, line.checkOut ?? reservation.checkOut))
        ids.add(line.roomId)
    }
  }
  for (const closure of closures) {
    if (overlaps(closure.starts, closure.ends)) ids.add(closure.roomId)
  }
  return ids
}
