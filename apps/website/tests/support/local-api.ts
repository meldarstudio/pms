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

export function daysFromToday(days: number, today = propertyToday()) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const openStay = () => ({ checkIn: daysFromToday(120), checkOut: daysFromToday(122) });

export const doubleSoldOutStay = () => ({
  checkIn: daysFromToday(130),
  checkOut: daysFromToday(132),
});

export const allSoldOutStay = () => ({ checkIn: daysFromToday(140), checkOut: daysFromToday(141) });
