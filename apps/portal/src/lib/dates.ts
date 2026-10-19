import { format as formatDate } from "date-fns";
import { es } from "date-fns/locale";

export function format(date: Date | number | string, pattern: string) {
  return formatDate(date, pattern, { locale: es });
}

// Business dates are labels, even when the browser timezone skipped a day.
export function addDateLabelDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
