import { parseISO } from "date-fns";
import { format } from "./dates.ts";
import type { ReservationChannel, StaffReservationChannel } from "./api.ts";
import type { ReservationStatus } from "./route-search.ts";

export const reservationStatusOptions: {
  value: "all" | ReservationStatus;
  label: string;
}[] = [
  { value: "all", label: "Todos los estados" },
  { value: "confirmed", label: "Confirmada" },
  { value: "checked_in", label: "Check-in" },
  { value: "checked_out", label: "Check-out" },
  { value: "cancelled", label: "Cancelada" },
  { value: "no_show", label: "No se presentó" },
];

const otherStatusLabels: Record<string, string> = { unfulfilled: "Cancelada" };

export const reservationChannelLabels: Record<ReservationChannel, string> = {
  online: "Web",
  expedia: "Expedia",
  whatsapp: "WhatsApp",
  walk_in: "Walk-in",
  unspecified: "Sin especificar",
};

export const staffReservationChannels: readonly StaffReservationChannel[] = [
  "walk_in",
  "whatsapp",
  "expedia",
];

export const reservationChannels: readonly ReservationChannel[] = [
  "online",
  ...staffReservationChannels,
  "unspecified",
];

export function reservationStatusLabel(status: string) {
  return (
    reservationStatusOptions.find((option) => option.value === status)?.label ??
    otherStatusLabels[status] ??
    status
  );
}

export function stayDateLabel(value: string) {
  return format(parseISO(value), "d MMM yyyy");
}

const roomNumberOrder = new Intl.Collator("es", { numeric: true });

const listedRoomLimit = 3;

export function roomsSummary(rooms: readonly { roomNumber: string | null }[]) {
  const numbers = rooms
    .flatMap((room) => (room.roomNumber == null ? [] : [room.roomNumber]))
    .sort(roomNumberOrder.compare);
  const unassigned = rooms.length - numbers.length;
  return {
    numbers,
    listed: numbers.slice(0, listedRoomLimit),
    unlisted: Math.max(0, numbers.length - listedRoomLimit),
    unassignedLabel: unassigned ? `${unassigned} sin asignar` : "",
  };
}

export function roomsLabel(rooms: readonly { roomNumber: string | null }[]) {
  const { numbers, unassignedLabel } = roomsSummary(rooms);
  return [numbers.join(", "), unassignedLabel].filter(Boolean).join(" · ") || "Sin asignar";
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
