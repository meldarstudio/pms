import { Effect, Schema } from "effect";
import { HttpClientResponse, HttpIncomingMessage } from "effect/http";
import { errorMessage, pmsFailures, pmsGet, type PmsFailure } from "@/lib/pms-client";
import { ratePlanCodes, type StaySearch } from "./search";

export const RatePlan = Schema.Literals(ratePlanCodes);

export const FreeCancellation = Schema.Literals(["available", "ended", "none"]);
export type FreeCancellation = typeof FreeCancellation.Type;

export const Cancellation = Schema.Struct({
  freeCancellation: FreeCancellation,
  freeUntil: Schema.NullOr(Schema.String),
  chargeCents: Schema.Number,
});

const PlanOffer = Schema.Struct({
  ratePlan: RatePlan,
  totalCents: Schema.Number,
  requiredInitialPaymentCents: Schema.Number,
  remainingScheduledCents: Schema.Number,
  savingCents: Schema.Number,
  cancellation: Cancellation,
});
export type PlanOffer = typeof PlanOffer.Type;

const RoomTypeOffers = Schema.Struct({
  id: Schema.String,
  maxAdults: Schema.Number,
  maxChildren: Schema.Number,
  remaining: Schema.Number,
  offers: Schema.Array(PlanOffer),
});
export type RoomTypeOffers = typeof RoomTypeOffers.Type;

const OfferSearchResult = Schema.Struct({
  checkIn: Schema.String,
  checkOut: Schema.String,
  nights: Schema.Number,
  currency: Schema.String,
  roomTypes: Schema.Array(RoomTypeOffers),
});
export type OfferSearchResult = typeof OfferSearchResult.Type;

const decodeResult = HttpIncomingMessage.schemaBodyJson(OfferSearchResult);

export type SearchOutcome =
  | { kind: "found"; result: OfferSearchResult }
  | { kind: "invalid"; error: string }
  | { kind: "throttled" }
  | { kind: "unavailable" };

export const fetchOffers = (search: Pick<StaySearch, "checkIn" | "checkOut">) =>
  pmsGet("/public/offers", {
    urlParams: { checkIn: search.checkIn, checkOut: search.checkOut },
  }).pipe(
    Effect.flatMap(
      HttpClientResponse.matchStatus({
        "2xx": (response): Effect.Effect<SearchOutcome, PmsFailure> =>
          Effect.map(decodeResult(response), (result) => ({ kind: "found", result })),
        400: (response) =>
          Effect.map(errorMessage(response), (error): SearchOutcome => ({
            kind: "invalid",
            error: error ?? "",
          })),
        429: () => Effect.succeed<SearchOutcome>({ kind: "throttled" }),
        orElse: () => Effect.succeed<SearchOutcome>({ kind: "unavailable" }),
      }),
    ),
    Effect.catchTags(pmsFailures(() => Effect.succeed<SearchOutcome>({ kind: "unavailable" }))),
  );
