import { fill } from "@/lib/reservation/format";
import { nightsBetween } from "@/lib/reservation/search";
import type { Phase } from "./room-view";
import type { RoomsBookingText } from "./text";

type Searched = Extract<Phase, { kind: "found" | "loading" }>;

export const rateLayout =
  "grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-10";
export const summaryLayout =
  "flex flex-col border border-stone-200 bg-white lg:sticky lg:top-36 lg:col-start-2 lg:row-span-2 lg:row-start-1";
export const policyHeading =
  "flex min-h-12 items-center justify-between gap-4 py-3 font-medium text-stone-900";

export const policyTitles = [
  "cancelTitle",
  "checkInTitle",
  "breakfast",
  "petsTitle",
  "paymentTitle",
] as const;

export function nightsOf(phase: Searched, text: RoomsBookingText) {
  const nights = nightsBetween(phase.search.checkIn, phase.search.checkOut) ?? 0;
  return fill(text[`reservation.nights.${nights === 1 ? "one" : "other"}`], { count: nights });
}

export function totalLine(phase: Searched, text: RoomsBookingText) {
  return fill(text["reservation.rate.total"], { nights: nightsOf(phase, text) });
}
