import { differenceInCalendarDays, format as formatDate, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export function format(date: Date | number | string, pattern: string) {
  return formatDate(date, pattern, { locale: es });
}

export function nightsBetween(start: string, end: string) {
  return differenceInCalendarDays(parseISO(end), parseISO(start));
}

export function stayRange(checkIn: string, checkOut: string) {
  const day = (value: string, pattern: string) => {
    const date = parseISO(value);
    return isValid(date) ? format(date, pattern) : "—";
  };
  const range = `${day(checkIn, "d MMM")} – ${day(checkOut, "d MMM yyyy")}`;
  const nights = nightsBetween(checkIn, checkOut);
  return nights >= 1 ? `${range} · ${nights} ${nights === 1 ? "noche" : "noches"}` : range;
}

export function addDateLabelDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const longDate = (day: string) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
