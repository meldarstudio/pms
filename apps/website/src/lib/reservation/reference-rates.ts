import { Effect, Schema } from "effect";
import { HttpClientResponse, HttpIncomingMessage } from "effect/http";
import { pmsFailures, pmsGet, type PmsFailure } from "@/lib/pms-client";

const ReferenceRate = Schema.Struct({
  id: Schema.String,
  baseRateCents: Schema.Number,
});

const ReferenceRateResult = Schema.Struct({
  currency: Schema.String,
  roomTypes: Schema.Array(ReferenceRate),
});
export type ReferenceRateResult = typeof ReferenceRateResult.Type;

const decodeResult = HttpIncomingMessage.schemaBodyJson(ReferenceRateResult);

export type ReferenceRateRead =
  | { kind: "found"; result: ReferenceRateResult }
  | { kind: "unavailable" };

export const fetchReferenceRates = () =>
  pmsGet("/public/reference-rates").pipe(
    Effect.flatMap(
      HttpClientResponse.matchStatus({
        "2xx": (response): Effect.Effect<ReferenceRateRead, PmsFailure> =>
          Effect.map(decodeResult(response), (result) => ({ kind: "found", result })),
        orElse: () => Effect.succeed<ReferenceRateRead>({ kind: "unavailable" }),
      }),
    ),
    Effect.catchTags(pmsFailures(() => Effect.succeed<ReferenceRateRead>({ kind: "unavailable" }))),
  );
