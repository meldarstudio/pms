import { addDays } from "../../src/lib/reservation/search.ts";

export const WEBSITE_URL = "http://127.0.0.1:43987";
export const LOCAL_API_URL = "http://127.0.0.1:43988";

export const PUBLISHED_ROOM_TYPE_IDS = ["type-suite-matrimonial", "type-doble-premium"];

export function propertyToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export const daysFromToday = (days: number) => addDays(propertyToday(), days);

export const openStay = () => ({ checkIn: daysFromToday(120), checkOut: daysFromToday(122) });

export const doubleSoldOutStay = () => ({
  checkIn: daysFromToday(130),
  checkOut: daysFromToday(132),
});

export const allSoldOutStay = () => ({ checkIn: daysFromToday(140), checkOut: daysFromToday(141) });
