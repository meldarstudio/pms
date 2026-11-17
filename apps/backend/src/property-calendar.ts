import { HttpError } from "./http";
import { addDays } from "./lib/dates";

export type PropertyCalendar = { timeZone: string; today: string };

const ONLINE_SAME_DAY_CLOSE_HOUR = 23;

function propertyClock(timeZone: string, instant: Date) {
  try {
    if (!timeZone || !/^(?:[A-Za-z_+-]+\/)+[A-Za-z_+\d-]+$|^UTC$/.test(timeZone))
      throw new Error("missing named timezone");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const part = (type: string) => parts.find((value) => value.type === type)!.value;
    return {
      today: `${part("year")}-${part("month")}-${part("day")}`,
      hour: Number(part("hour")),
    };
  } catch {
    throw new HttpError(503, "PROPERTY_TIME_ZONE must be a supported IANA timezone");
  }
}

export function propertyCalendar(timeZone: string, instant = new Date()): PropertyCalendar {
  return { timeZone, today: propertyClock(timeZone, instant).today };
}

export function onlineArrivalCalendar(timeZone: string, instant: Date) {
  const { today, hour } = propertyClock(timeZone, instant);
  return {
    today,
    firstNewArrival: hour < ONLINE_SAME_DAY_CLOSE_HOUR ? today : addDays(today, 1),
  };
}
