import { z } from "zod"
import type { InventoryNight } from "./api.ts"
import { formatMajor, parseMajorToCents } from "./money.ts"

export function sharedRatePrice(nights: InventoryNight[]) {
  const prices = new Set(nights.map((night) => night.priceCents))
  if (prices.size !== 1) return ""
  const [only] = prices
  return only === undefined ? "" : formatMajor(only)
}

export const inventoryRateSchema = z.object({
  price: z
    .string()
    .refine(
      (value) => parseMajorToCents(value.trim()) !== null,
      "Ingresa un precio como 310.00."
    ),
})

export type InventoryRateValues = z.input<typeof inventoryRateSchema>

export function ratePriceUnchanged(
  nights: InventoryNight[],
  price: string
): boolean {
  const cents = parseMajorToCents(price.trim())
  return (
    cents !== null &&
    nights.length > 0 &&
    nights.every((night) => night.priceCents === cents)
  )
}

export function rateApplyInput(
  target: { roomTypeId: string; dates: string[] },
  price: string
) {
  const cents = parseMajorToCents(price.trim())
  if (cents === null || target.dates.length === 0) return null
  return {
    id: target.roomTypeId,
    from: target.dates[0],
    to: target.dates[target.dates.length - 1],
    priceCents: cents,
  }
}

export function overrideClearDates(nights: InventoryNight[]) {
  return nights.filter((night) => night.override).map((night) => night.date)
}

export function rateFormError(cause: unknown): string {
  if (cause instanceof Error) {
    if (cause.message === "room type not found") {
      return "Este tipo de habitación ya no existe."
    }
    return cause.message
  }
  return "No se pudo guardar el precio."
}
