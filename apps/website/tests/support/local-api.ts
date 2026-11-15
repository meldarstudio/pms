import { addDays } from "../../src/lib/reservation/search.ts";

export const WEBSITE_URL = "http://127.0.0.1:43987";
export const LOCAL_API_URL = "http://127.0.0.1:43988";
export const FAKE_PAYMENT_SERVICES_URL = "http://127.0.0.1:43989";
export const CULQI_TEST_PUBLIC_KEY = "pk_test_website_local";
export const TURNSTILE_TEST_SITE_KEY = "website-local-site-key";

export const PUBLISHED_ROOM_TYPE_IDS = [
  "935c7f23-8acc-4c78-b456-9bc588cccc2d",
  "a50f22a2-c02c-4cb1-ab98-e9da48f0228d",
];

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
