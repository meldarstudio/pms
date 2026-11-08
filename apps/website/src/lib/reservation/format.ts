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

export function formatList(items: string[], lang: Lang) {
  return new Intl.ListFormat(lang, { type: "conjunction" }).format(items);
}

export function dateElement(label: string, lang: Lang) {
  const time = document.createElement("time");
  time.dateTime = label;
  time.textContent = formatDate(label, lang);
  return time;
}

export function fillNodes(template: string, values: Record<string, string | Node>) {
  return template
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1];
      return key !== undefined && key in values ? values[key]! : part;
    });
}

export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
