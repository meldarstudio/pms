import { normalizePhone } from "@pms/shared";
import { inclusiveDates, isValidDate, nightsBetween } from "./lib/dates";
import { HttpError } from "./http";
import type { OnlineArrivalCalendar } from "./property-calendar";

export function requireStay(checkIn: string, checkOut: string): string[] {
  if (!isValidDate(checkIn) || !isValidDate(checkOut)) throw new HttpError(400, "invalid date");
  const length =
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000;
  if (length > 60) throw new HttpError(400, "stay cannot be longer than 60 nights");
  const nights = nightsBetween(checkIn, checkOut);
  if (nights.length < 1) throw new HttpError(400, "stay must be at least one night");
  if (nights.length > 60) throw new HttpError(400, "stay cannot be longer than 60 nights");
  return nights;
}

export function requireOnlineArrivalNotPast(checkIn: string, today: string) {
  if (checkIn < today)
    throw new HttpError(400, "online check-in must not be before today", "checkIn");
}

export function requireNewOnlineArrival(checkIn: string, calendar: OnlineArrivalCalendar) {
  requireOnlineArrivalNotPast(checkIn, calendar.today);
  if (checkIn < calendar.firstNewArrival)
    throw new HttpError(400, "online same-day arrival has closed", "checkIn");
}

export function requireInclusiveRange(from: string, to: string, maxDays: number): string[] {
  if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, "invalid date");
  const dates = inclusiveDates(from, to);
  if (dates.length < 1) throw new HttpError(400, "invalid date range");
  if (dates.length > maxDays)
    throw new HttpError(400, `range cannot be longer than ${maxDays} days`);
  return dates;
}

export function acceptPhone<T extends string | null | undefined>(
  submitted: T,
  stored?: string | null,
): T | string {
  if (submitted == null || submitted === stored) return submitted;
  const result = normalizePhone(submitted);
  if ("error" in result) throw new HttpError(400, result.error, "phone");
  return result.phone;
}
