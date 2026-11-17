import type { RoomId } from "@/lib/rooms";

export const ratePlanCodes = ["flexible", "non_refundable"] as const;
export type RatePlanCode = (typeof ratePlanCodes)[number];

export const MAX_NIGHTS = 60;
export const DEFAULT_ADULTS = 2;
export const DEFAULT_CHILDREN = 0;
export const MAX_ADULTS_CHOICE = 8;
export const MAX_CHILDREN_CHOICE = 8;

export type StaySearch = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  room: RoomId | null;
  plan: RatePlanCode | null;
};

export type SearchProblem =
  | "checkInRequired"
  | "checkOutRequired"
  | "checkOutBeforeCheckIn"
  | "tooManyNights";

const DATE_LABEL = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function isDateLabel(value: string | null): value is string {
  if (!value || !DATE_LABEL.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function count(value: string | null, fallback: number, min: number) {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return parsed >= min ? parsed : fallback;
}

export function readSearch(params: URLSearchParams, roomIds: readonly string[]): StaySearch {
  const checkIn = params.get("checkIn");
  const checkOut = params.get("checkOut");
  const room = params.get("room");
  const plan = params.get("plan");
  return {
    checkIn: isDateLabel(checkIn) ? checkIn : "",
    checkOut: isDateLabel(checkOut) ? checkOut : "",
    adults: count(params.get("adults"), DEFAULT_ADULTS, 1),
    children: count(params.get("children"), DEFAULT_CHILDREN, 0),
    room: room && roomIds.includes(room) ? (room as RoomId) : null,
    plan:
      plan && (ratePlanCodes as readonly string[]).includes(plan) ? (plan as RatePlanCode) : null,
  };
}

export function searchParams(search: StaySearch, { withChoice = true } = {}) {
  const params = new URLSearchParams();
  if (search.checkIn) params.set("checkIn", search.checkIn);
  if (search.checkOut) params.set("checkOut", search.checkOut);
  params.set("adults", String(search.adults));
  params.set("children", String(search.children));
  if (search.room) params.set("room", search.room);
  if (withChoice && search.room && search.plan) params.set("plan", search.plan);
  return params;
}

export function nightsBetween(checkIn: string, checkOut: string) {
  if (!isDateLabel(checkIn) || !isDateLabel(checkOut)) return null;
  return Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / DAY_MS,
  );
}

export function addDays(label: string, days: number) {
  const date = new Date(`${label}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const ONLINE_SAME_DAY_CLOSE_HOUR = 23;

const propertyClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function propertyNow() {
  const parts = propertyClock.formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)!.value;
  return {
    today: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
  };
}

export function onlineArrivalCalendar() {
  const { today, hour } = propertyNow();
  return {
    today,
    firstNewArrival: hour < ONLINE_SAME_DAY_CLOSE_HOUR ? today : addDays(today, 1),
  };
}

export const firstOnlineArrival = () => onlineArrivalCalendar().firstNewArrival;

export type ArrivalProblem = "checkInPast" | "sameDayClosed";

export function arrivalProblem(checkIn: string): ArrivalProblem | null {
  const { today, firstNewArrival } = onlineArrivalCalendar();
  if (!checkIn || checkIn >= firstNewArrival) return null;
  return checkIn < today ? "checkInPast" : "sameDayClosed";
}

export function searchProblems(search: StaySearch) {
  const problems: { field: "checkIn" | "checkOut"; problem: SearchProblem }[] = [];
  if (!search.checkIn) problems.push({ field: "checkIn", problem: "checkInRequired" });
  if (!search.checkOut) problems.push({ field: "checkOut", problem: "checkOutRequired" });
  else if (search.checkIn) {
    const nights = nightsBetween(search.checkIn, search.checkOut) ?? 0;
    if (nights < 1) problems.push({ field: "checkOut", problem: "checkOutBeforeCheckIn" });
    else if (nights > MAX_NIGHTS) problems.push({ field: "checkOut", problem: "tooManyNights" });
  }
  return problems;
}
