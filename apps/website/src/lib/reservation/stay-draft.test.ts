import { expect, it } from "vite-plus/test";
import type { RoomId } from "@/lib/rooms";
import type { PlanOffer, RoomTypeOffers } from "./offers";
import { ratesOpen, readSearch } from "./search";
import { chooseRoom, type OffersFor } from "./stay-draft";

const roomIds = ["king", "double", "family"];

const plan = (ratePlan: PlanOffer["ratePlan"], totalCents: number): PlanOffer => ({
  ratePlan,
  totalCents,
  requiredInitialPaymentCents: totalCents,
  remainingScheduledCents: 0,
  savingCents: 0,
  cancellation: { freeCancellation: "none", freeUntil: null, chargeCents: totalCents },
});

const offers: Record<string, RoomTypeOffers> = {
  king: {
    id: "type-king",
    maxAdults: 2,
    maxChildren: 2,
    remaining: 3,
    offers: [plan("flexible", 20000), plan("non_refundable", 18000)],
  },
};
const offersFor: OffersFor = (room) => offers[room];

const link = (query: string) => readSearch(new URLSearchParams(query), roomIds);

it("opens Rate only once every room request has a type", () => {
  const draft = link("checkIn=2026-10-20&checkOut=2026-10-22&adults=2,1&children=0,0");

  const first = chooseRoom(draft, "king" as RoomId, offersFor);
  const second = chooseRoom(first, "king" as RoomId, offersFor);

  expect(ratesOpen(first)).toBe(false);
  expect(first.at).toBe(1);
  expect(ratesOpen(second)).toBe(true);
  expect(second.requests.map((request) => request.room)).toEqual(["king", "king"]);
});

it("reads a link with one party as one room request", () => {
  const oneParty = link("checkIn=2026-10-20&checkOut=2026-10-22&adults=2&children=1");

  expect(oneParty.requests).toEqual([{ adults: 2, children: 1, room: null, failed: false }]);
});
