import type { RatePlanTerms } from "./rate-plans";

export type PricedNight = {
  date: string;
  /** The final price; totals sum this. */
  priceCents: number;
  /** The final price minus the ordinary rate; zero under a flat rate. */
  adjustmentCents: number;
  /** A staff discount on the night; none is applied yet. */
  discountCents: number;
};

/**
 * Prices each night of a stay. The ordinary rate is the date's override, else the
 * base rate; the accepted plan's adjustment applies to it, rounded to the nearest
 * cent with exact half-cent ties upward. A staff flat rate is the final price, with
 * no plan adjustment.
 */
export function priceNights(stay: {
  dates: string[];
  baseRateCents: number;
  overrides: ReadonlyMap<string, number>;
  terms: Pick<RatePlanTerms, "priceAdjustmentPercent">;
  flatRateCents?: number;
}): PricedNight[] {
  return stay.dates.map((date) => {
    if (stay.flatRateCents !== undefined)
      return { date, priceCents: stay.flatRateCents, adjustmentCents: 0, discountCents: 0 };
    const ordinary = stay.overrides.get(date) ?? stay.baseRateCents;
    const priceCents = adjusted(ordinary, stay.terms.priceAdjustmentPercent);
    return { date, priceCents, adjustmentCents: priceCents - ordinary, discountCents: 0 };
  });
}

/** Integer arithmetic in hundredths of a cent, so ties round exactly. */
function adjusted(cents: number, percent: number): number {
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
