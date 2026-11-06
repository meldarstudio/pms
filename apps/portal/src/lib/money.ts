export const CURRENCY = "PEN";

export function parseMajorToCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = (match[2] ?? "").padEnd(2, "0");
  if (!Number.isSafeInteger(whole) || whole > 100_000_000) return null;
  return whole * 100 + Number(frac);
}

export function formatMajor(cents: number) {
  const whole = Math.trunc(cents / 100);
  const frac = Math.abs(cents % 100);
  return `${whole}.${String(frac).padStart(2, "0")}`;
}

function centDigits(cents: number) {
  const digits = cents % 100 !== 0 ? 2 : 0;
  return { minimumFractionDigits: digits, maximumFractionDigits: digits };
}

export function formatMoney(cents: number, currency = CURRENCY) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    ...centDigits(cents),
  }).format(cents / 100);
}

export function formatAmount(cents: number) {
  return new Intl.NumberFormat("es-PE", centDigits(cents)).format(cents / 100);
}
