import type { RoomId } from "@/lib/rooms";
import type { PlanOffer, RoomTypeOffers } from "./offers";
import {
  firstOpenRequest,
  ratePlanCodes,
  ratesOpen,
  type RatePlanCode,
  type RoomRequest,
  type StaySearch,
} from "./search";

export type OffersFor = (room: RoomId) => RoomTypeOffers | undefined;

export type RoomChoice = "choosable" | "sold_out" | "too_many_guests" | "offline";

const fits = (offers: RoomTypeOffers, request: Pick<RoomRequest, "adults" | "children">) =>
  request.adults <= offers.maxAdults && request.children <= offers.maxChildren;

function choiceFor(
  request: RoomRequest | undefined,
  offers: RoomTypeOffers | undefined,
  takenByDraft: number,
): RoomChoice {
  if (!offers || !offers.offers.length || !request) return "offline";
  if (!fits(offers, request)) return "too_many_guests";
  return offers.remaining > takenByDraft ? "choosable" : "sold_out";
}

export function roomChoice(
  search: StaySearch,
  index: number,
  room: RoomId,
  offersFor: OffersFor,
): RoomChoice {
  const takenByOthers = search.requests.filter(
    (other, position) => position !== index && !other.failed && other.room === room,
  ).length;
  return choiceFor(search.requests[index], offersFor(room), takenByOthers);
}

export function stayRates(search: StaySearch, offersFor: OffersFor): PlanOffer[] {
  const rooms = search.requests.map((request) =>
    request.room ? offersFor(request.room) : undefined,
  );
  if (!rooms.length || rooms.some((offers) => !offers)) return [];
  const planOffers = ratePlanCodes.map((plan) => {
    const parts = rooms.map((offers) => offers!.offers.find((offer) => offer.ratePlan === plan));
    return parts.every((part) => part !== undefined) ? parts : null;
  });
  const sum = (parts: PlanOffer[], pick: (offer: PlanOffer) => number) =>
    parts.reduce((total, offer) => total + pick(offer), 0);
  const flexible = planOffers[ratePlanCodes.indexOf("flexible")];
  const flexibleCents = flexible ? sum(flexible, (offer) => offer.totalCents) : 0;
  return planOffers.flatMap((parts) => {
    if (!parts) return [];
    const [first] = parts;
    const totalCents = sum(parts, (offer) => offer.totalCents);
    return [
      {
        ratePlan: first!.ratePlan,
        totalCents,
        requiredInitialPaymentCents: sum(parts, (offer) => offer.requiredInitialPaymentCents),
        remainingScheduledCents: sum(parts, (offer) => offer.remainingScheduledCents),
        savingCents: Math.max(0, flexibleCents - totalCents),
        cancellation: {
          ...first!.cancellation,
          chargeCents: sum(parts, (offer) => offer.cancellation.chargeCents),
        },
      },
    ];
  });
}

const cheapestPlan = (rates: PlanOffer[]): RatePlanCode | null =>
  rates.reduce<PlanOffer | undefined>(
    (lowest, offer) => (!lowest || offer.totalCents < lowest.totalCents ? offer : lowest),
    undefined,
  )?.ratePlan ?? null;

function moveTo(search: StaySearch, at: number, offersFor: OffersFor): StaySearch {
  const next = { ...search, at };
  if (at < search.requests.length) return next;
  const rates = stayRates(next, offersFor);
  const plan = rates.some((offer) => offer.ratePlan === search.plan)
    ? search.plan
    : cheapestPlan(rates);
  return { ...next, plan };
}

export function chooseRoom(search: StaySearch, room: RoomId, offersFor: OffersFor): StaySearch {
  const { at } = search;
  if (roomChoice(search, at, room, offersFor) !== "choosable") return search;
  const requests = search.requests.map((request, index) =>
    index === at ? { ...request, room, failed: false } : request,
  );
  return moveTo({ ...search, requests }, at + 1, offersFor);
}

export function continueFromRoom(search: StaySearch, offersFor: OffersFor): StaySearch {
  const current = search.requests[search.at];
  if (!current?.room || current.failed) return search;
  return moveTo(search, search.at + 1, offersFor);
}

export function settleRooms(search: StaySearch, offersFor: OffersFor): StaySearch {
  const keptByType = new Map<RoomId, number>();
  const requests = search.requests.map((request) => {
    const { room, failed } = request;
    if (!room) return request;
    const kept = keptByType.get(room) ?? 0;
    const choice = choiceFor(request, offersFor(room), kept);
    if (choice !== "choosable" && !(failed && choice === "sold_out"))
      return { ...request, room: null };
    if (!failed) keptByType.set(room, kept + 1);
    return request;
  });
  const plan = requests.some((request) => request.room) ? search.plan : null;
  const at = Math.min(search.at, firstOpenRequest(requests));
  const settled = { ...search, requests, plan, at };
  return at === requests.length ? moveTo(settled, at, offersFor) : settled;
}

export function editParty(previous: StaySearch, next: StaySearch): StaySearch {
  const { requests } = next;
  const added = requests.length > previous.requests.length;
  const wanted = added
    ? previous.requests.length
    : ratesOpen(previous)
      ? requests.length
      : previous.at;
  return {
    ...next,
    at: Math.min(wanted, firstOpenRequest(requests)),
    plan: requests.some((request) => request.room) ? previous.plan : null,
    featured: previous.featured,
  };
}
