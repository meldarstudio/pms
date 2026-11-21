import { Effect, Schema } from "effect";
import { HttpClientResponse, HttpIncomingMessage } from "effect/http";
import { type PmsClient, type PmsFailure, pmsGet } from "@/lib/pms-client";
import { FreeCancellation } from "./offers";

const TOKEN = /^[\w-]{43}$/;

const BusinessDate = Schema.String.check(
  Schema.makeFilter(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)),
  ),
);

const GuestReservationSummary = Schema.Struct({
  status: Schema.String,
  code: Schema.String,
  checkIn: BusinessDate,
  checkOut: BusinessDate,
  nights: Schema.Finite,
  currency: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/)),
  fullName: Schema.String,
  rooms: Schema.Array(
    Schema.Struct({
      roomTypeId: Schema.String,
      name: Schema.String,
      adults: Schema.Finite,
      children: Schema.Finite,
      nights: Schema.Array(Schema.Struct({ date: BusinessDate, priceCents: Schema.Finite })),
    }),
  ),
  ratePlan: Schema.String,
  cancellation: Schema.optionalKey(
    Schema.Struct({
      freeCancellation: Schema.optionalKey(FreeCancellation),
      freeUntil: Schema.NullOr(BusinessDate),
      chargeCents: Schema.Finite,
    }),
  ),
  totalCents: Schema.Finite,
  paidCents: Schema.Finite,
  outstandingCents: Schema.Finite,
  refundDueCents: Schema.Finite,
  refundedCents: Schema.Finite,
});
export type GuestReservationSummary = typeof GuestReservationSummary.Type;

const CheckoutAccess = Schema.Struct({
  token: Schema.String.check(Schema.isPattern(TOKEN)),
  expiresOn: Schema.String,
});
export type CheckoutAccess = typeof CheckoutAccess.Type;

const decodeSummary = HttpIncomingMessage.schemaBodyJson(GuestReservationSummary);
const decodeAccess = HttpIncomingMessage.schemaBodyJson(CheckoutAccess);

export type SummaryOutcome =
  | { kind: "found"; summary: GuestReservationSummary }
  | { kind: "invalid" }
  | { kind: "unavailable" };

export const readReservationSummary = (
  token: string,
): Effect.Effect<SummaryOutcome, never, PmsClient> =>
  TOKEN.test(token)
    ? pmsGet("/public/reservation", { token }).pipe(
        Effect.flatMap(
          HttpClientResponse.matchStatus({
            "2xx": (response): Effect.Effect<SummaryOutcome, PmsFailure> =>
              Effect.map(decodeSummary(response), (summary) => ({ kind: "found", summary })),
            401: () => Effect.succeed<SummaryOutcome>({ kind: "invalid" }),
            orElse: () => Effect.succeed<SummaryOutcome>({ kind: "unavailable" }),
          }),
        ),
        Effect.catchTags({
          HttpClientError: () => Effect.succeed<SummaryOutcome>({ kind: "unavailable" }),
          SchemaError: () => Effect.succeed<SummaryOutcome>({ kind: "unavailable" }),
        }),
      )
    : Effect.succeed({ kind: "invalid" });

export const readCheckoutAccess = (token: string) =>
  pmsGet("/public/checkout/access", { token }).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(decodeAccess),
    Effect.catchTags({
      HttpClientError: () => Effect.succeed(null),
      SchemaError: () => Effect.succeed(null),
    }),
  );

export function summaryLink(path: string, token: string) {
  const url = new URL(path, window.location.origin);
  url.search = "";
  url.hash = token;
  return url.href;
}
