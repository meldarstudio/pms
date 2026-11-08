import type { Lang } from "@/i18n/utils";

const locales: Record<Lang, string> = { es: "es-PE", en: "en-US" };
const PROPERTY_MONEY_LOCALE = "es-PE";

export function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(PROPERTY_MONEY_LOCALE, { style: "currency", currency }).format(
    cents / 100,
  );
}

export function formatDate(label: string, lang: Lang) {
  return new Intl.DateTimeFormat(locales[lang], {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${label}T00:00:00Z`));
}

export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
