import type { StaySearchCopy } from "@/lib/reservation/stay-copy";
import type { Lang } from "@/i18n/utils";
import { fill, formatDate } from "@/lib/reservation/format";
import {
  addDays,
  arrivalProblem,
  firstOnlineArrival,
  MAX_ADULTS_CHOICE,
  MAX_CHILDREN_CHOICE,
  MAX_NIGHTS,
  MAX_ROOM_REQUESTS_CHOICE,
  newRoomRequest,
  nightsBetween,
  onlineArrivalCalendar,
  searchParams,
  searchProblems,
  type RoomRequest,
  type StaySearch,
} from "@/lib/reservation/search";
import { resumeSearch, storeSearch } from "@/lib/reservation/stay-search-storage";

export type StaySearchProps = {
  lang: Lang;
  copy: StaySearchCopy;
  roomIds?: readonly string[];
  action?: string;
  nativeFallback?: boolean;
  initial?: StaySearch;
  onSearch?: (search: StaySearch) => void;
};
export type DateField = "checkIn" | "checkOut";
export type DatePicker = Omit<ReturnType<typeof openDatePicker>, "month">;

export const dateFields = ["checkIn", "checkOut"] as const;
export const guestFields = [
  {
    name: "adults",
    min: 1,
    max: MAX_ADULTS_CHOICE,
    decrease: "decreaseAdults",
    increase: "increaseAdults",
  },
  {
    name: "children",
    min: 0,
    max: MAX_CHILDREN_CHOICE,
    decrease: "decreaseChildren",
    increase: "increaseChildren",
  },
] as const;

export const initialSearch: StaySearch = {
  checkIn: "",
  checkOut: "",
  requests: [newRoomRequest()],
  at: 0,
  plan: null,
  featured: null,
};

export const calendarFocus = '[data-slot="calendar-day"][tabindex="0"]';
export const dayDisplay = (value: string, lang: Lang) =>
  formatDate(value, lang, { includeWeekday: false });
export const dateId = (field: DateField) =>
  field === "checkIn" ? "stay-check-in" : "stay-check-out";
export const placeholder = (copy: StaySearchCopy, field: DateField) =>
  field === "checkIn" ? copy.arrivalPlaceholder : copy.departurePlaceholder;

export const shownSearch = (search: StaySearch) => ({
  ...search,
  requests: search.requests.map((request) => ({ ...request })),
});

export function restoreSearch(roomIds: readonly string[]) {
  return shownSearch(resumeSearch(new URLSearchParams(window.location.search), roomIds));
}

export const canAddRoom = (requests: readonly RoomRequest[]) =>
  requests.length < MAX_ROOM_REQUESTS_CHOICE;

const counted = (count: number, one: string, other: string) =>
  count === 1 ? one : fill(other, { count });

export function occupancySummary(
  copy: StaySearchCopy,
  { adults, children }: Pick<RoomRequest, "adults" | "children">,
) {
  const adultsLabel = counted(adults, copy.adultsOne, copy.adultsOther);
  if (!children) return adultsLabel;
  return `${adultsLabel}, ${counted(children, copy.childrenOne, copy.childrenOther)}`;
}

export function partySummary(copy: StaySearchCopy, requests: readonly RoomRequest[]) {
  const guests = requests.reduce((sum, request) => sum + request.adults + request.children, 0);
  return `${counted(requests.length, copy.roomsOne, copy.roomsOther)}, ${counted(guests, copy.guestsOne, copy.guestsOther)}`;
}

export function stayProblems(search: StaySearch): {
  field: DateField;
  problem: keyof StaySearchCopy["problems"];
}[] {
  const arrival = arrivalProblem(search.checkIn);
  return arrival ? [{ field: "checkIn", problem: arrival }] : searchProblems(search);
}

export function openDatePicker(trigger: DateField, search: StaySearch) {
  const { today, firstNewArrival } = onlineArrivalCalendar();
  const selecting: DateField = trigger === "checkOut" && search.checkIn ? "checkOut" : "checkIn";
  const selected = selecting === "checkOut" ? search.checkOut || search.checkIn : search.checkIn;
  return {
    selecting,
    today,
    firstNewArrival,
    lastDate: `${Number(firstNewArrival.slice(0, 4)) + 2}-12-31`,
    month: (selected >= firstNewArrival ? selected : firstNewArrival).slice(0, 7),
  };
}

export function departureBounds(picker: DatePicker, { checkIn }: StaySearch) {
  return picker.selecting === "checkOut" && checkIn
    ? [{ before: addDays(checkIn, 1) }, { after: addDays(checkIn, MAX_NIGHTS) }]
    : undefined;
}

export function selectDate(value: string, picker: DatePicker, search: StaySearch) {
  if (value < firstOnlineArrival()) return;
  if (picker.selecting === "checkIn") return { ...search, checkIn: value, checkOut: "" };
  if (value <= search.checkIn || value > addDays(search.checkIn, MAX_NIGHTS)) return;
  return { ...search, checkOut: value };
}

export function selectedStayDates({ checkIn, checkOut }: StaySearch) {
  if (!checkIn) return [];
  const nights = nightsBetween(checkIn, checkOut) ?? 0;
  return nights > 0 && nights <= MAX_NIGHTS
    ? Array.from({ length: nights + 1 }, (_, offset) => addDays(checkIn, offset))
    : [checkIn];
}

export function rangePoint(date: string, { checkIn, checkOut }: StaySearch) {
  if (date === checkIn || date === checkOut) return "edge";
  if (date > checkIn && date < checkOut) return "night";
}

export function submitSearch(action: string, search: StaySearch) {
  storeSearch(search);
  window.location.assign(`${action}?${searchParams(search).toString()}`);
}
