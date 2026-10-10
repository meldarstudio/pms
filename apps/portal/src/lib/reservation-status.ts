import type { ReservationStatusAction } from "./api.ts"

export type RoomStatus =
  "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show"

export type StatusRoom = {
  status: RoomStatus
  roomId: string | null
}

export const statusOptions: { value: RoomStatus; label: string }[] = [
  { value: "confirmed", label: "Confirmada" },
  { value: "checked_in", label: "Check-in" },
  { value: "checked_out", label: "Check-out" },
  { value: "cancelled", label: "Cancelada" },
  { value: "no_show", label: "No se presentó" },
]

export function isRoomStatus(value: string): value is RoomStatus {
  return statusOptions.some((option) => option.value === value)
}

export function statusLabel(status: RoomStatus | "mixed") {
  if (status === "mixed") return "Estados mixtos"
  return statusOptions.find((option) => option.value === status)!.label
}

export function commonStatus(rooms: { status: RoomStatus }[]) {
  const first = rooms[0]?.status
  return first && rooms.every((room) => room.status === first)
    ? first
    : ("mixed" as const)
}

export function statusSummary(rooms: { status: RoomStatus }[]) {
  const status = commonStatus(rooms)
  if (status !== "mixed") return statusLabel(status)
  return statusOptions
    .map((option) => {
      const count = rooms.filter((room) => room.status === option.value).length
      return count ? `${count} ${option.label}` : null
    })
    .filter(Boolean)
    .join(" · ")
}

const actions: Partial<Record<RoomStatus, ReservationStatusAction>> = {
  confirmed: "undo-check-in",
  checked_in: "check-in",
  checked_out: "check-out",
  cancelled: "cancel",
}

export type StatusPlan =
  | { ok: true; action: ReservationStatusAction; affected: number }
  | { ok: false; reason: string }

/**
 * Decides whether a bulk status can be applied to the reservation's rooms and
 * which backend action applies it. The rules mirror the backend: a room only
 * moves confirmed -> checked in -> checked out, a checked-in room can go back
 * to confirmed, and only confirmed rooms can be cancelled.
 */
export function planBulkStatus(
  rooms: StatusRoom[],
  target: RoomStatus
): StatusPlan {
  const action = actions[target]
  if (!action) {
    return {
      ok: false,
      reason: "Este estado se registra por habitación.",
    }
  }
  const count = (status: RoomStatus) =>
    rooms.filter((room) => room.status === status).length

  if (target === "confirmed") {
    const affected = count("checked_in")
    return affected
      ? { ok: true, action, affected }
      : { ok: false, reason: "Ninguna habitación tiene check-in." }
  }
  if (target === "checked_in") {
    const confirmed = rooms.filter((room) => room.status === "confirmed")
    if (confirmed.length === 0) {
      return { ok: false, reason: "No hay habitaciones confirmadas." }
    }
    if (confirmed.some((room) => !room.roomId)) {
      return {
        ok: false,
        reason: "Asigna una habitación a cada reserva antes del check-in.",
      }
    }
    return { ok: true, action, affected: confirmed.length }
  }
  if (target === "checked_out") {
    if (count("checked_in") === 0) {
      return { ok: false, reason: "Ninguna habitación tiene check-in." }
    }
    if (count("confirmed") > 0) {
      return {
        ok: false,
        reason: "Registra el check-in de todas las habitaciones primero.",
      }
    }
    return { ok: true, action, affected: count("checked_in") }
  }
  const affected = count("confirmed")
  return affected
    ? { ok: true, action, affected }
    : { ok: false, reason: "No hay habitaciones confirmadas." }
}
