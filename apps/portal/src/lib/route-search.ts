import { format, isValid, parse, startOfToday } from "date-fns"

export type CalendarSearch = { from: string; span: 7 | 14 }
export type InventorySearch = { from: string; span: 7 | 14 }
export type ReservationsSearch = {
  q: string
  status: string
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

const reservationStatuses = [
  "all",
  "confirmed",
  "checked_in",
  "checked_out",
  "no_show",
  "cancelled",
]

export function reservationsSearch(
  search: Record<string, unknown>
): ReservationsSearch {
  const page = Number(search.page)
  return {
    q: typeof search.q === "string" ? search.q : "",
    status:
      typeof search.status === "string" &&
      reservationStatuses.includes(search.status)
        ? search.status
        : "all",
    page: Number.isInteger(page) && page >= 0 ? page : 0,
  }
}

export const lastReservationsSearch: { current: ReservationsSearch } = {
  current: { q: "", status: "all", page: 0 },
}

export const lastCalendarSearch: { current: CalendarSearch | null } = {
  current: null,
}
