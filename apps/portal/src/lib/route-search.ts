import { format, isValid, parse, startOfToday } from "date-fns"
import { utcToday } from "./reservation-form-schemas.ts"

export type CalendarSearch = { from: string; span: 7 | 14 }
export type InventorySearch = { from: string; span: 7 | 14 }
export const reservationStatusValues = [
  "confirmed",
  "checked_in",
  "checked_out",
  "no_show",
  "cancelled",
] as const
export type ReservationStatus = (typeof reservationStatusValues)[number]
export type ReservationsSearch = {
  q: string
  status: "all" | ReservationStatus
  checkIn: string
  page: number
}

export function validDay(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const date = parse(value, "yyyy-MM-dd", new Date())
  if (!isValid(date) || format(date, "yyyy-MM-dd") !== value) {
    return undefined
  }
  return value
}

function spanValue(value: unknown, fallback: 7 | 14): 7 | 14 {
  return value === 7 || value === "7"
    ? 7
    : value === 14 || value === "14"
      ? 14
      : fallback
}

export function calendarSearch(
  search: Record<string, unknown>
): CalendarSearch {
  return {
    from: validDay(search.from) ?? format(startOfToday(), "yyyy-MM-dd"),
    span: spanValue(search.span, 7),
  }
}

export function inventorySearch(
  search: Record<string, unknown>
): InventorySearch {
  return {
    from: validDay(search.from) ?? format(startOfToday(), "yyyy-MM-dd"),
    span: spanValue(search.span, 14),
  }
}

const reservationFilters = ["all", ...reservationStatusValues] as const

function reservationStatus(value: unknown): ReservationsSearch["status"] {
  return typeof value === "string" &&
    (reservationFilters as readonly string[]).includes(value)
    ? (value as ReservationsSearch["status"])
    : "all"
}

// `all` and "" mean every date. A missing or invalid day is today, read when
// the URL is parsed so the default is not frozen at module import.
function reservationCheckIn(value: unknown) {
  if (value === "all" || value === "") return ""
  return validDay(value) ?? utcToday()
}

export function reservationsSearch(
  search: Record<string, unknown>
): ReservationsSearch {
  const page = Number(search.page)
  return {
    q: typeof search.q === "string" ? search.q : "",
    status: reservationStatus(search.status),
    checkIn: reservationCheckIn(search.checkIn),
    page: Number.isInteger(page) && page >= 0 ? page : 0,
  }
}

/** Empty check-in is written as `all` so a missing param can still mean today. */
export function commitReservationsSearch<T extends { checkIn: string }>(
  search: T
): T {
  if (search.checkIn !== "") return search
  return { ...search, checkIn: "all" }
}

export const lastReservationsSearch: {
  current: ReservationsSearch | null
} = {
  current: null,
}

export const lastCalendarSearch: { current: CalendarSearch | null } = {
  current: null,
}
