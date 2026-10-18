import { format, isValid, parse } from "date-fns";
import { propertyToday } from "./property-calendar.ts";

export type CalendarSearch = { from: string; span: 7 | 14 };
export type InventorySearch = { from: string; span: 7 | 14 };
export const reservationStatusValues = [
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
] as const;
export type ReservationStatus = (typeof reservationStatusValues)[number];
export type ReservationsSearch = {
  q: string;
  status: "all" | ReservationStatus;
  checkIn: string;
  page: number;
};

export function validDay(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = parse(value, "yyyy-MM-dd", new Date());
  if (!isValid(date) || format(date, "yyyy-MM-dd") !== value) {
    return undefined;
  }
  return value;
}

function spanValue(value: unknown, fallback: 7 | 14): 7 | 14 {
  return value === 7 || value === "7" ? 7 : value === 14 || value === "14" ? 14 : fallback;
}

export function calendarSearch(search: Record<string, unknown>): CalendarSearch {
  return {
    from: validDay(search.from) ?? propertyToday(),
    span: spanValue(search.span, 7),
  };
}

export function inventorySearch(search: Record<string, unknown>): InventorySearch {
  return {
    from: validDay(search.from) ?? propertyToday(),
    span: spanValue(search.span, 14),
  };
}

const reservationFilters = ["all", ...reservationStatusValues] as const;

function reservationStatus(value: unknown): ReservationsSearch["status"] {
  return typeof value === "string" && (reservationFilters as readonly string[]).includes(value)
    ? (value as ReservationsSearch["status"])
    : "all";
}

// A missing, empty, invalid, or `all` day is the property date, read when the URL is
// parsed so the default is not frozen at module import.
function reservationCheckIn(value: unknown) {
  return validDay(value) ?? propertyToday();
}

export function reservationsSearch(search: Record<string, unknown>): ReservationsSearch {
  const page = Number(search.page);
  return {
    q: typeof search.q === "string" ? search.q : "",
    status: reservationStatus(search.status),
    checkIn: reservationCheckIn(search.checkIn),
    page: Number.isInteger(page) && page >= 0 ? page : 0,
  };
}

export const lastReservationsSearch: {
  current: ReservationsSearch | null;
} = {
  current: null,
};

export const lastCalendarSearch: { current: CalendarSearch | null } = {
  current: null,
};
