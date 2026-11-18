import {
  onlineArrivalCalendar as onlineArrivalCalendarIn,
  propertyClock,
  type OnlineArrivalCalendar,
} from "@pms/shared/online-arrival";
import { HttpError } from "./http";

export type { OnlineArrivalCalendar };

export type PropertyCalendar = { timeZone: string; today: string };

function inPropertyZone<T>(timeZone: string, read: () => T): T {
  try {
    if (!timeZone || !/^(?:[A-Za-z_+-]+\/)+[A-Za-z_+\d-]+$|^UTC$/.test(timeZone))
      throw new Error("missing named timezone");
    return read();
  } catch {
    throw new HttpError(503, "PROPERTY_TIME_ZONE must be a supported IANA timezone");
  }
}

export function propertyCalendar(timeZone: string, instant = new Date()): PropertyCalendar {
  return {
    timeZone,
    today: inPropertyZone(timeZone, () => propertyClock(timeZone, instant).today),
  };
}

export function onlineArrivalCalendar(timeZone: string, instant: Date): OnlineArrivalCalendar {
  return inPropertyZone(timeZone, () => onlineArrivalCalendarIn(timeZone, instant));
}
