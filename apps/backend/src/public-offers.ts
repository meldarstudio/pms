import type { Db } from "./db";
import { loadRoomTypes, occupiedCounts, ratesBetween, roomCounts } from "./inventory";
import { chargeableCents, freeCancellationState, freeCancellationUntil } from "./lib/cancellation";
import { overridesFor, priceNights, totalCents, type PricedNight } from "./lib/pricing";
import type { RatePlanCode, RatePlanTerms } from "./lib/rate-plans";
import { quoteBill } from "./lib/reservation-bill";
import type { OnlineArrivalCalendar } from "./property-calendar";
import { currentRatePlans } from "./rate-plan-settings";
import { requireNewOnlineArrival, requireStay } from "./rules";

export type OfferSearch = { checkIn: string; checkOut: string };

export function publishedRoomTypeIds(setting: string | undefined): string[] {
  return [
    ...new Set(
      (setting ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

const PLAN_ORDER: RatePlanCode[] = ["flexible", "non_refundable"];

export async function searchOffers(
  db: Db,
  search: OfferSearch,
  context: OnlineArrivalCalendar & { published: string[] },
) {
  const dates = requireStay(search.checkIn, search.checkOut);
  requireNewOnlineArrival(search.checkIn, context);
  const loaded = await loadRoomTypes(db, context.published);
  const types = context.published.flatMap((id) => loaded.filter((type) => type.id === id));
  const [occupied, counts, rates, ratePlans] = await Promise.all([
    occupiedCounts(db, search.checkIn, search.checkOut),
    roomCounts(db),
    ratesBetween(
      db,
      types.map((type) => type.id),
      search.checkIn,
      search.checkOut,
    ),
    currentRatePlans(db),
  ]);
  return {
    checkIn: search.checkIn,
    checkOut: search.checkOut,
    nights: dates.length,
    roomTypes: types.map((type) => {
      const priced = (terms: RatePlanTerms) =>
        priceNights({
          dates,
          baseRateCents: type.baseRateCents,
          overrides: overridesFor(rates, type.id),
          terms,
        });
      return {
        id: type.id,
        maxAdults: type.maxAdults,
        maxChildren: type.maxChildren,
        remaining: Math.max(0, (counts.get(type.id) ?? 0) - (occupied.get(type.id) ?? 0)),
        offers: planOffers(
          search.checkIn,
          context.today,
          PLAN_ORDER.map((plan) => ({
            terms: ratePlans[plan],
            nights: priced(ratePlans[plan]),
          })),
        ),
      };
    }),
  };
}

function planOffers(
  checkIn: string,
  today: string,
  plans: { terms: RatePlanTerms; nights: PricedNight[] }[],
) {
  const flexible = plans.find(({ terms }) => terms.plan === "flexible");
  const flexibleCents = flexible ? totalCents(flexible.nights) : 0;
  return plans.map(({ terms, nights }) => {
    const amounts = offerAmounts({ checkIn, terms, rooms: [{ nights }] }, today);
    return {
      ratePlan: terms.plan,
      totalCents: amounts.totalCents,
      requiredInitialPaymentCents: amounts.requiredInitialPaymentCents,
      remainingScheduledCents: amounts.remainingScheduledCents,
      savingCents: Math.max(0, flexibleCents - amounts.totalCents),
      cancellation: amounts.cancellation,
    };
  });
}

export function offerAmounts(
  offer: { checkIn: string; terms: RatePlanTerms; rooms: { nights: PricedNight[] }[] },
  today: string,
) {
  const { terms, rooms } = offer;
  const bill = quoteBill({ rooms, terms });
  const freeUntil = freeCancellationUntil(terms.cancellationPolicy, offer.checkIn);
  return {
    totalCents: bill.totalCents,
    requiredInitialPaymentCents: bill.requiredInitialPaymentCents,
    remainingScheduledCents: bill.remainingScheduledCents,
    cancellation: {
      freeCancellation: freeCancellationState(freeUntil, today),
      freeUntil,
      chargeCents: chargeableCents(terms.cancellationPolicy, rooms, 0),
    },
  };
}

export type OfferSearchResult = Awaited<ReturnType<typeof searchOffers>>;
