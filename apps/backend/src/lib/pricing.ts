import type { RatePlanTerms } from "./rate-plans";

export type PricedNight = {
  date: string;
  priceCents: number;
  adjustmentCents: number;
  discountCents: number;
};

export function priceNights(stay: {
  dates: string[];
  baseRateCents: number;
  overrides: ReadonlyMap<string, number>;
  terms: Pick<RatePlanTerms, "priceAdjustmentPercent">;
}): PricedNight[] {
  return stay.dates.map((date) => {
    const ordinary = stay.overrides.get(date) ?? stay.baseRateCents;
    const priceCents = adjustedPriceCents(ordinary, stay.terms.priceAdjustmentPercent);
    return { date, priceCents, adjustmentCents: priceCents - ordinary, discountCents: 0 };
  });
}

export function adjustedPriceCents(cents: number, percent: number): number {
  return Math.floor((cents * (100 + percent) + 50) / 100);
}

export function totalCents(nights: { priceCents: number }[]): number {
  return nights.reduce((sum, night) => sum + night.priceCents, 0);
}

export function overridesFor(
  rates: { roomTypeId: string; date: string; priceCents: number }[],
  roomTypeId: string,
): Map<string, number> {
  return new Map(
    rates
      .filter((rate) => rate.roomTypeId === roomTypeId)
      .map((rate) => [rate.date, rate.priceCents]),
  );
}
