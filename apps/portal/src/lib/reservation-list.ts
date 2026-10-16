import { parseISO } from "date-fns";
import { format } from "./dates.ts";
import type { ReservationStatus } from "./route-search.ts";

export const reservationStatusOptions: {
  value: "all" | ReservationStatus;
  label: string;
}[] = [
  { value: "all", label: "Todos los estados" },
  { value: "confirmed", label: "Confirmada" },
  { value: "checked_in", label: "Check-in" },
  { value: "checked_out", label: "Check-out" },
  { value: "no_show", label: "No se presentó" },
  { value: "cancelled", label: "Cancelada" },
];

export function reservationStatusLabel(status: string) {
  return reservationStatusOptions.find((option) => option.value === status)?.label ?? status;
}

export function stayDateLabel(value: string) {
  return format(parseISO(value), "d MMM yyyy");
}

export function roomsLabel(
  rooms: readonly {
    roomNumber: string | null;
    roomTypeName?: string | null;
  }[],
) {
  const numbers = rooms.map((room) => room.roomNumber);
  if (numbers.length === 0 || numbers.some((number) => number == null)) {
    return "Sin asignar";
  }
  return numbers.join(", ");
}

export function occupantsLabel(rooms: readonly { adults: number; children: number }[]) {
  const adults = rooms.reduce((sum, room) => sum + room.adults, 0);
  const children = rooms.reduce((sum, room) => sum + room.children, 0);
  const parts: string[] = [];
  if (adults > 0) {
    parts.push(`${adults} ${adults === 1 ? "adulto" : "adultos"}`);
  }
  if (children > 0) {
    parts.push(`${children} ${children === 1 ? "niño" : "niños"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}
