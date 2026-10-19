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
  view: "all" | "arrivals" | "departures" | "inHouse";
  status: ReservationStatus[];
  checkIn: string;
  balance: "all" | "outstanding" | "settled" | "credit";
  assignment: "all" | "assigned" | "unassigned";
  sort: "checkIn" | "checkOut" | "guestName" | "balance";
  direction: "asc" | "desc";
  pageSize: 25 | 50 | 100;
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

// A missing, empty, invalid, or `all` day is the property date, read when the URL is
// parsed so the default is not frozen at module import.
function reservationCheckIn(value: unknown) {
  return validDay(value) ?? propertyToday();
}

export function reservationsSearch(search: Record<string, unknown>): ReservationsSearch {
  const page = Number(search.page);
  const view = ["all", "arrivals", "departures", "inHouse"].includes(String(search.view))
    ? (search.view as ReservationsSearch["view"])
    : "arrivals";
  const defaults =
    view === "arrivals" || view === "departures"
      ? (["confirmed", "checked_in", "checked_out"] as ReservationStatus[])
      : [];
  const inputStatus = Array.isArray(search.status)
    ? search.status
    : typeof search.status === "string"
      ? search.status.split(",")
      : [];
  const validStatuses = inputStatus.filter((item): item is ReservationStatus =>
    (reservationStatusValues as readonly unknown[]).includes(item),
  );
  const status =
    view === "inHouse"
      ? (["checked_in"] as ReservationStatus[])
      : validStatuses.length
        ? validStatuses
        : defaults;
  const pageSize = Number(search.pageSize);
  return {
    q: typeof search.q === "string" ? search.q : "",
    view,
    status,
    checkIn: reservationCheckIn(search.checkIn),
    balance: ["outstanding", "settled", "credit"].includes(String(search.balance))
      ? (search.balance as ReservationsSearch["balance"])
      : "all",
    assignment: ["assigned", "unassigned"].includes(String(search.assignment))
      ? (search.assignment as ReservationsSearch["assignment"])
      : "all",
    sort: ["checkIn", "checkOut", "guestName", "balance"].includes(String(search.sort))
      ? (search.sort as ReservationsSearch["sort"])
      : view === "inHouse"
        ? "checkOut"
        : view === "all"
          ? "checkIn"
          : "guestName",
    direction: search.direction === "desc" ? "desc" : "asc",
    pageSize: pageSize === 25 || pageSize === 100 ? pageSize : 50,
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
