export type OnlineArrivalCalendar = { today: string; firstNewArrival: string };

const ONLINE_SAME_DAY_CLOSE_HOUR = 23;

export function propertyClock(timeZone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)!.value;
  return {
    today: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
  };
}

export function onlineArrivalCalendar(timeZone: string, instant: Date): OnlineArrivalCalendar {
  const { today, hour } = propertyClock(timeZone, instant);
  if (hour < ONLINE_SAME_DAY_CLOSE_HOUR) return { today, firstNewArrival: today };
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return { today, firstNewArrival: tomorrow.toISOString().slice(0, 10) };
}
