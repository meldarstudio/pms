import { onlineArrivalCalendar as onlineArrivalCalendarIn } from "@pms/shared/online-arrival";
import type { RoomId } from "@/lib/rooms";

export const ratePlanCodes = ["flexible", "non_refundable"] as const;
export type RatePlanCode = (typeof ratePlanCodes)[number];

export const MAX_NIGHTS = 60;
export const DEFAULT_ADULTS = 1;
export const DEFAULT_CHILDREN = 0;
export const MAX_ADULTS_CHOICE = 8;
export const MAX_CHILDREN_CHOICE = 8;
export const MAX_ROOM_REQUESTS_CHOICE = 5;
export const MAX_ROOM_REQUESTS = 60;

export type RoomRequest = {
  adults: number;
  children: number;
  room: RoomId | null;
  failed: boolean;
};

export type StaySearch = {
  checkIn: string;
  checkOut: string;
  requests: RoomRequest[];
  at: number;
  plan: RatePlanCode | null;
  featured: RoomId | null;
};

export const newRoomRequest = (): RoomRequest => ({
  adults: DEFAULT_ADULTS,
  children: DEFAULT_CHILDREN,
  room: null,
  failed: false,
});

export const firstOpenRequest = (requests: readonly RoomRequest[]) => {
  const index = requests.findIndex((request) => !request.room || request.failed);
  return index === -1 ? requests.length : index;
};

export const ratesOpen = (search: StaySearch) =>
  search.plan !== null &&
  search.at === search.requests.length &&
  firstOpenRequest(search.requests) === search.requests.length;

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

function count(value: string | undefined, fallback: number, min: number) {
  if (value === undefined || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return parsed >= min ? parsed : fallback;
}

const listParam = (params: URLSearchParams, name: string) => params.get(name)?.split(",") ?? [];

export function readSearch(params: URLSearchParams, roomIds: readonly string[]): StaySearch {
  const checkIn = params.get("checkIn");
  const checkOut = params.get("checkOut");
  const plan = params.get("plan");
  const knownRoom = (value: string | null | undefined) =>
    value && roomIds.includes(value) ? (value as RoomId) : null;
  const featured = knownRoom(params.get("room"));
  const ratePlan =
    plan && (ratePlanCodes as readonly string[]).includes(plan) ? (plan as RatePlanCode) : null;
  const adults = listParam(params, "adults");
  const children = listParam(params, "children");
  const types = params.has("types") ? listParam(params, "types") : null;
  const oneRoomRateLink = types === null && ratePlan ? featured : null;
  const failed = count(params.get("failed") ?? undefined, 0, 1);
  const requests = Array.from(
    { length: Math.min(Math.max(adults.length, 1), MAX_ROOM_REQUESTS) },
    (_, index): RoomRequest => ({
      adults: count(adults[index], DEFAULT_ADULTS, 1),
      children: count(children[index], DEFAULT_CHILDREN, 0),
      room: index === 0 && oneRoomRateLink ? oneRoomRateLink : knownRoom(types?.[index]),
      failed: failed === index + 1,
    }),
  );
  const open = firstOpenRequest(requests);
  const step = count(params.get("step") ?? undefined, 0, 1);
  return {
    checkIn: isDateLabel(checkIn) ? checkIn : "",
    checkOut: isDateLabel(checkOut) ? checkOut : "",
    requests,
    at: step ? Math.min(step - 1, open) : open,
    plan: ratePlan,
    featured,
  };
}

export function searchParams(search: StaySearch) {
  const params = new URLSearchParams();
  const { requests } = search;
  if (search.checkIn) params.set("checkIn", search.checkIn);
  if (search.checkOut) params.set("checkOut", search.checkOut);
  params.set("adults", requests.map((request) => request.adults).join(","));
  params.set("children", requests.map((request) => request.children).join(","));
  if (requests.some((request) => request.room))
    params.set("types", requests.map((request) => request.room ?? "").join(","));
  if (search.at < requests.length && search.at !== firstOpenRequest(requests))
    params.set("step", String(search.at + 1));
  if (search.plan) params.set("plan", search.plan);
  if (search.featured) params.set("room", search.featured);
  const failed = requests.findIndex((request) => request.failed);
  if (failed !== -1) params.set("failed", String(failed + 1));
  return params;
}

export const occupancyOnly = (search: StaySearch): StaySearch => ({
  ...search,
  requests: search.requests.map(({ adults, children }) => ({
    ...newRoomRequest(),
    adults,
    children,
  })),
  at: 0,
  plan: null,
  featured: null,
});

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

const PROPERTY_TIME_ZONE = "America/Lima";

export const onlineArrivalCalendar = () => onlineArrivalCalendarIn(PROPERTY_TIME_ZONE, new Date());

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
