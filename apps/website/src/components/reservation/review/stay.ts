import type { Lang } from "@/i18n/utils";
import type { CheckoutView } from "@/lib/reservation/checkout";
import { formatDate, formatMoney } from "@/lib/reservation/format";
import type { Say } from "./text";

export function stayLabels(view: CheckoutView, say: Say, lang: Lang) {
  const count = (key: string, amount: number) =>
    say(`${key}.${amount === 1 ? "one" : "other"}`, { count: amount });
  const nights = count("reservation.nights", view.nights);
  const adults = count("reservation.adults", view.adults);
  const dateRange = (options?: { includeWeekday: boolean }) =>
    `${formatDate(view.checkIn, lang, options)} – ${formatDate(view.checkOut, lang, options)}`;
  return {
    nights,
    compact: `${dateRange({ includeWeekday: false })} · ${nights}`,
    checkIn: formatDate(view.checkIn, lang),
    checkOut: formatDate(view.checkOut, lang),
    guests: view.children ? `${adults}, ${count("reservation.children", view.children)}` : adults,
    plan: say(`reservation.plan.${view.ratePlan}`),
    money: (cents: number) => formatMoney(cents, view.currency),
  };
}

export type StayLabels = ReturnType<typeof stayLabels>;
