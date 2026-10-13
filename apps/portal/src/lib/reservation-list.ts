import { parseISO } from "date-fns"
import { format } from "./dates.ts"
import type { ReservationStatus } from "./route-search.ts"

export const reservationStatusOptions: {
  value: "all" | ReservationStatus
  label: string
}[] = [
  { value: "all", label: "Todos los estados" },
  { value: "confirmed", label: "Confirmada" },
  { value: "checked_in", label: "En estancia" },
  { value: "checked_out", label: "Salida registrada" },
  { value: "no_show", label: "No se presentó" },
  { value: "cancelled", label: "Cancelada" },
]

export function reservationStatusLabel(status: string) {
  return (
    reservationStatusOptions.find((option) => option.value === status)?.label ??
    status
  )
}

export function groupAdjacentByCheckIn<T extends { checkIn: string }>(
  rows: readonly T[]
) {
  const groups: { checkIn: string; rows: T[] }[] = []
  for (const row of rows) {
    const current = groups.at(-1)
    if (current?.checkIn === row.checkIn) current.rows.push(row)
    else groups.push({ checkIn: row.checkIn, rows: [row] })
  }
  return groups
}

export function arrivalBandLabel(checkIn: string) {
  const label = format(parseISO(checkIn), "EEEE, d 'de' MMMM 'de' yyyy")
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function stayDateLabel(value: string) {
  return format(parseISO(value), "d MMM yyyy")
}

export function roomsLabel(
  rooms: readonly {
    roomNumber: string | null
    roomTypeName?: string | null
  }[]
) {
  if (rooms.length === 0) return "—"
  return rooms
    .map((room) => room.roomNumber ?? room.roomTypeName ?? "Sin asignar")
    .join(", ")
}

export function occupantsLabel(
  rooms: readonly { adults: number; children: number }[]
) {
  const adults = rooms.reduce((sum, room) => sum + room.adults, 0)
  const children = rooms.reduce((sum, room) => sum + room.children, 0)
  const parts: string[] = []
  if (adults > 0) {
    parts.push(`${adults} ${adults === 1 ? "adulto" : "adultos"}`)
  }
  if (children > 0) {
    parts.push(`${children} ${children === 1 ? "niño" : "niños"}`)
  }
  return parts.length > 0 ? parts.join(" · ") : "—"
}
