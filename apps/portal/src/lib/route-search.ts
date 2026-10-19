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
export const reservationViews = ["all", "arrivals", "departures", "in-house"] as const;
export type ReservationView = (typeof reservationViews)[number];
export type ReservationSort = "checkIn" | "checkOut" | "guestName" | "balance";
export type ReservationsSearch = {
  view: ReservationView;
  day: string;
  q: string;
  statuses: string;
  balance: "all" | "outstanding" | "settled" | "credit";
  assignment: "all" | "assigned" | "unassigned";
  sort: ReservationSort;
  direction: "asc" | "desc";
  size: 25 | 50 | 100;
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

export function viewDefaults(view: ReservationView) {
  return {
    statuses:
      view === "in-house"
        ? "checked_in"
        : view === "all"
          ? "all"
          : "confirmed,checked_in,checked_out",
    sort: (view === "all"
      ? "checkIn"
      : view === "in-house"
        ? "checkOut"
        : "guestName") as ReservationSort,
    direction: view === "all" ? ("desc" as const) : ("asc" as const),
  };
}

function choice<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function reservationsSearch(search: Record<string, unknown>): ReservationsSearch {
  const page = Number(search.page);
  const view = choice(search.view, reservationViews, "arrivals");
  const defaults = viewDefaults(view);
  const rawStatuses = search.statuses ?? search.status;
  const selected = typeof rawStatuses === "string" ? rawStatuses.split(",") : [];
  const statuses =
    rawStatuses === "all" || rawStatuses === ""
      ? "all"
      : reservationStatusValues.filter((status) => selected.includes(status)).join(",") ||
        defaults.statuses;
  const size = Number(search.size);
  return {
    view,
    day: validDay(search.day) ?? validDay(search.checkIn) ?? propertyToday(),
    q: typeof search.q === "string" ? search.q : "",
    statuses: view === "in-house" ? "checked_in" : statuses,
    balance: choice(search.balance, ["all", "outstanding", "settled", "credit"], "all"),
    assignment: choice(search.assignment, ["all", "assigned", "unassigned"], "all"),
    sort: choice(search.sort, ["checkIn", "checkOut", "guestName", "balance"], defaults.sort),
    direction: choice(search.direction, ["asc", "desc"], defaults.direction),
    size: size === 25 || size === 100 ? size : 50,
    page:
      Number.isSafeInteger(page) && page >= 0 && page <= Math.floor(Number.MAX_SAFE_INTEGER / 100)
        ? page
        : 0,
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
