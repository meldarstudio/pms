import { expect, it } from "vite-plus/test";
import type { PlanOffer, RoomTypeOffers } from "./offers";
import { ratesOpen, readSearch } from "./search";
import { settleRooms, type OffersFor } from "./stay-draft";

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

it("returns a restored stay to the first room that no longer has availability", () => {
  const draft = link(
    "checkIn=2026-10-20&checkOut=2026-10-22&adults=2,1&types=king,king&plan=flexible",
  );
  const oneKingLeft: OffersFor = (room) => {
    const type = offersFor(room);
    return type && { ...type, remaining: 1 };
  };

  const restored = settleRooms(draft, oneKingLeft);

  expect(ratesOpen(restored)).toBe(false);
  expect(restored.at).toBe(1);
  expect(restored.requests.map((request) => request.room)).toEqual(["king", null]);
  expect(restored.plan).toBe("flexible");
});
