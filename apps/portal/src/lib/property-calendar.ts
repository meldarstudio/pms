import { translateError } from "./errors";
import { TZDate } from "react-day-picker";

let formatter: Intl.DateTimeFormat | undefined;
let timeZone: string | undefined;

// Loaded only from authenticated API metadata, before the router is mounted.
export function configurePropertyCalendar(value: unknown) {
  try {
    if (typeof value !== "string" || !/^(?:[A-Za-z_+-]+\/)+[A-Za-z_+\d-]+$|^UTC$/.test(value))
      throw new Error("missing named timezone");
    const next = new Intl.DateTimeFormat("en-US", {
      timeZone: value,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatter = next;
    timeZone = value;
  } catch {
    throw new Error(translateError("PROPERTY_TIME_ZONE must be a supported IANA timezone"));
  }
}

export function propertyTimeZone() {
  if (!timeZone)
    throw new Error(translateError("PROPERTY_TIME_ZONE must be a supported IANA timezone"));
  return timeZone;
}

export function propertyToday(instant: Date | number = Date.now()): string {
  propertyTimeZone();
  const parts = formatter!.formatToParts(instant);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Date objects at UI boundaries carry calendar components, never stored instants.
// UTC arithmetic elsewhere remains safe for date labels and night counts.
// UTC carriers can also represent labels skipped by the browser's local calendar.
export function dateOnlyCarrier(day: string, carrierTimeZone?: "UTC") {
  const [year, month, date] = day.split("-").map(Number);
  return carrierTimeZone
    ? new TZDate(`${day}T00:00:00Z`, carrierTimeZone)
    : new Date(year, month - 1, date);
}

export function nextPropertyDay(instant = Date.now()) {
  const today = propertyToday(instant);
  let low = instant;
  let high = instant + 48 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (propertyToday(middle) === today) low = middle;
    else high = middle;
  }
  return high;
}
