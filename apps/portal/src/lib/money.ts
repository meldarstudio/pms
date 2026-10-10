export const CURRENCY = "PEN"

export function parseMajorToCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const whole = Number(match[1])
  const frac = (match[2] ?? "").padEnd(2, "0")
  if (!Number.isSafeInteger(whole) || whole > 100_000_000) return null
  return whole * 100 + Number(frac)
}

export function formatMajor(cents: number) {
  const whole = Math.trunc(cents / 100)
  const frac = Math.abs(cents % 100)
  return `${whole}.${String(frac).padStart(2, "0")}`
}

export function formatMoney(cents: number, currency = CURRENCY) {
  const hasCents = cents % 100 !== 0
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(cents / 100)
}
