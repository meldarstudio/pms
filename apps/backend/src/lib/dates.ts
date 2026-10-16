const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value: string): boolean {
  const match = datePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function addDays(value: string, days: number): string {
  const match = datePattern.exec(value);
  if (!match) throw new Error("invalid date");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekday(value: string): number {
  const match = datePattern.exec(value);
  if (!match) throw new Error("invalid date");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

export function nightsBetween(checkIn: string, checkOut: string): string[] {
  if (!isValidDate(checkIn) || !isValidDate(checkOut) || checkOut <= checkIn) return [];
  const nights: string[] = [];
  let cursor = checkIn;
  while (cursor < checkOut) {
    nights.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return nights;
}

export function inclusiveDates(from: string, to: string): string[] {
  if (!isValidDate(from) || !isValidDate(to) || to < from) return [];
  return nightsBetween(from, addDays(to, 1));
}

export function rangesOverlap(
  checkIn: string,
  checkOut: string,
  otherIn: string,
  otherOut: string,
): boolean {
  return checkIn < otherOut && checkOut > otherIn;
}

export function filterWeekdays(dates: string[], weekdays?: number[]): string[] {
  if (!weekdays) return dates;
  const allowed = new Set(weekdays);
  return dates.filter((date) => allowed.has(weekday(date)));
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
