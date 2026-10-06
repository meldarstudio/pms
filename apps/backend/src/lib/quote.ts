export type NightPrice = {
  date: string
  priceCents: number
}

export function quoteNights(
  dates: string[],
  baseRateCents: number,
  overrides: ReadonlyMap<string, number>,
  flatRateCents?: number,
): NightPrice[] {
  return dates.map((date) => ({
    date,
    priceCents: flatRateCents ?? overrides.get(date) ?? baseRateCents,
  }))
}

export function totalCents(nights: { priceCents: number }[]): number {
  return nights.reduce((sum, night) => sum + night.priceCents, 0)
}

export function overridesFor(
  rates: { roomTypeId: string; date: string; priceCents: number }[],
  roomTypeId: string,
): Map<string, number> {
  return new Map(
    rates.filter((rate) => rate.roomTypeId === roomTypeId).map((rate) => [rate.date, rate.priceCents]),
  )
}
