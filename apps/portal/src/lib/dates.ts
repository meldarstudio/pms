import { differenceInCalendarDays, format as formatDate, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export function format(date: Date | number | string, pattern: string) {
  return formatDate(date, pattern, { locale: es });
}

export function nightsBetween(start: string, end: string) {
  return differenceInCalendarDays(parseISO(end), parseISO(start));
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

export const nightsLabel = (count: number) => `${count} ${count === 1 ? "noche" : "noches"}`;
