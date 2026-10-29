import { HttpError } from "./http";

export type PropertyCalendar = { timeZone: string; today: string };

export function propertyCalendar(timeZone: string, instant = new Date()): PropertyCalendar {
  try {
    if (!timeZone || !/^(?:[A-Za-z_+-]+\/)+[A-Za-z_+\d-]+$|^UTC$/.test(timeZone))
      throw new Error("missing named timezone");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const part = (type: string) => parts.find((value) => value.type === type)!.value;
    return { timeZone, today: `${part("year")}-${part("month")}-${part("day")}` };
  } catch {
    throw new HttpError(503, "PROPERTY_TIME_ZONE must be a supported IANA timezone");
  }
}
