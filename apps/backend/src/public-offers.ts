import type { Db } from "./db";
import { loadRoomTypes, occupiedCounts, ratesBetween, roomCounts } from "./inventory";
import { chargeableCents, freeCancellationUntil } from "./lib/cancellation";
import { overridesFor, priceNights, totalCents, type PricedNight } from "./lib/pricing";
import { ratePlans, type RatePlanCode, type RatePlanTerms } from "./lib/rate-plans";
import { quoteBill } from "./lib/reservation-bill";
import type { OnlineArrivalCalendar } from "./property-calendar";
import { requireNewOnlineArrival, requireStay } from "./rules";

export type OfferSearch = { checkIn: string; checkOut: string; adults: number; children: number };

export type RoomTypeAvailability = "available" | "sold_out" | "too_many_guests";

export type FreeCancellation = "available" | "ended" | "none";

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
  const [occupied, counts, rates] = await Promise.all([
    occupiedCounts(db, search.checkIn, search.checkOut),
    roomCounts(db),
    ratesBetween(
      db,
      types.map((type) => type.id),
      search.checkIn,
      search.checkOut,
    ),
  ]);
  return {
    checkIn: search.checkIn,
    checkOut: search.checkOut,
    nights: dates.length,
    adults: search.adults,
    children: search.children,
    roomTypes: types.map((type) => {
      const availability: RoomTypeAvailability =
        search.adults > type.maxAdults || search.children > type.maxChildren
          ? "too_many_guests"
          : (occupied.get(type.id) ?? 0) < (counts.get(type.id) ?? 0)
            ? "available"
            : "sold_out";
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
        availability,
        offers:
          availability === "available"
            ? planOffers(
                search.checkIn,
                context.today,
                PLAN_ORDER.map((plan) => ({
                  terms: ratePlans[plan],
                  nights: priced(ratePlans[plan]),
                })),
              )
            : [],
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
    const amounts = offerAmounts({ checkIn, terms, nights }, today);
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
  offer: { checkIn: string; terms: RatePlanTerms; nights: PricedNight[] },
  today: string,
) {
  const { terms, nights } = offer;
  const bill = quoteBill({ nights, terms });
  const freeUntil = freeCancellationUntil(terms.cancellationPolicy, offer.checkIn);
  const freeCancellation: FreeCancellation =
    freeUntil === null ? "none" : today <= freeUntil ? "available" : "ended";
  return {
    totalCents: bill.totalCents,
    requiredInitialPaymentCents: bill.requiredInitialPaymentCents,
    remainingScheduledCents: bill.remainingScheduledCents,
    cancellation: {
      freeCancellation,
      freeUntil,
      chargeCents: chargeableCents(terms.cancellationPolicy, [{ nights }], 0),
    },
  };
}

export type OfferSearchResult = Awaited<ReturnType<typeof searchOffers>>;
