import { Effect, Schema } from "effect";
import { type HttpClientResponse, HttpIncomingMessage } from "effect/http";
import type { Lang } from "@/i18n/utils";
import {
  errorMessage,
  failingRoom,
  pmsFailures,
  isSuccess,
  type PmsClient,
  type PmsFailure,
  pmsGet,
  pmsPost,
} from "@/lib/pms-client";
import { Cancellation, RatePlan } from "./offers";
import type { PhoneDraft } from "@pms/shared/phone";
import type { RatePlanCode } from "./search";

export type CheckoutRoom = { roomTypeId: string; adults: number; children: number };

export type CheckoutSelection = {
  checkIn: string;
  checkOut: string;
  ratePlan: RatePlanCode;
  rooms: readonly CheckoutRoom[];
};

export type BookingContact = { fullName: string; email: string; phone: string };

export type ContactDraft = {
  fullName: string;
  email: string;
  phone: PhoneDraft;
  notes: string;
};

const PricedNight = Schema.Struct({ date: Schema.String, priceCents: Schema.Number });

const CheckoutView = Schema.Struct({
  checkIn: Schema.String,
  checkOut: Schema.String,
  rooms: Schema.Array(
    Schema.Struct({
      roomTypeId: Schema.String,
      adults: Schema.Number,
      children: Schema.Number,
      nights: Schema.Array(PricedNight),
    }),
  ),
  ratePlan: RatePlan,
  nights: Schema.Number,
  language: Schema.Literals(["es", "en"] satisfies Lang[]),
  currency: Schema.String,
  quote: Schema.Struct({
    id: Schema.String,
    expired: Schema.Boolean,
    expiresAt: Schema.String,
    totalCents: Schema.Number,
    requiredInitialPaymentCents: Schema.Number,
    remainingScheduledCents: Schema.Number,
    cancellation: Cancellation,
  }),
  acceptance: Schema.NullOr(Schema.Struct({ quoteId: Schema.String, acceptedAt: Schema.String })),
});
export type CheckoutView = typeof CheckoutView.Type;

const decodeCheckout = HttpIncomingMessage.schemaBodyJson(
  Schema.Struct({ ...CheckoutView.fields, token: Schema.optionalKey(Schema.String) }),
);

export type CheckoutOutcome =
  | { kind: "ready"; view: CheckoutView; token: string }
  | { kind: "expired" }
  | { kind: "replaced" }
  | { kind: "sold_out"; room?: number }
  | { kind: "invalid"; error: string; room?: number }
  | { kind: "denied" }
  | { kind: "throttled" }
  | { kind: "limited" }
  | { kind: "has_payment" }
  | { kind: "unavailable" };

const refusal = (status: number, error: string | null, room?: number): CheckoutOutcome => {
  if (status === 401) return { kind: "denied" };
  if (status === 429)
    return { kind: error === "too many acceptances for this checkout" ? "limited" : "throttled" };
  if (status === 409 && error === "quote was replaced by a newer quote")
    return { kind: "replaced" };
  if (status === 409 && error === "no availability") return { kind: "sold_out", room };
  if (status === 409 && error === "checkout already has a payment") return { kind: "has_payment" };
  if (error === "quote has expired" || error === "quote not found") return { kind: "expired" };
  if (status === 400 || status === 404) return { kind: "invalid", error: error ?? "", room };
  return { kind: "unavailable" };
};

const checkoutOutcome = (
  exchange: Effect.Effect<HttpClientResponse.HttpClientResponse, PmsFailure, PmsClient>,
  sentToken?: string,
): Effect.Effect<CheckoutOutcome, never, PmsClient> =>
  exchange.pipe(
    Effect.flatMap((response) =>
      isSuccess(response)
        ? Effect.map(decodeCheckout(response), ({ token, ...view }): CheckoutOutcome => ({
            kind: "ready",
            view,
            token: token ?? sentToken ?? "",
          }))
        : Effect.map(errorMessage(response), (error) =>
            refusal(response.status, error, failingRoom(response)),
          ),
    ),
    Effect.catchTags(pmsFailures(() => Effect.succeed<CheckoutOutcome>({ kind: "unavailable" }))),
  );

export const startCheckout = (selection: CheckoutSelection, language: Lang) =>
  checkoutOutcome(pmsPost("/public/checkouts", { body: { ...selection, language } }));

export const readCheckout = (token: string) =>
  checkoutOutcome(pmsGet("/public/checkout", { token }), token);

export const refreshQuote = (token: string) =>
  checkoutOutcome(pmsPost("/public/checkout/quotes", { token }), token);

export const acceptQuote = (
  token: string,
  acceptance: { quoteId: string; language: Lang; contact: BookingContact; notes?: string },
) =>
  checkoutOutcome(
    pmsPost("/public/checkout/acceptances", { token, body: { ...acceptance, agreed: true } }),
    token,
  );

export const selectionKey = (selection: CheckoutSelection) =>
  JSON.stringify([
    selection.checkIn,
    selection.checkOut,
    selection.ratePlan,
    selection.rooms.map((room) => [room.roomTypeId, room.adults, room.children]),
  ]);

export const offerKey = (view: CheckoutView) =>
  JSON.stringify([
    selectionKey(view),
    view.currency,
    view.rooms.map((room) => room.nights),
    view.quote.totalCents,
    view.quote.requiredInitialPaymentCents,
    view.quote.remainingScheduledCents,
    view.quote.cancellation,
  ]);

export const quoteStillValid = (view: CheckoutView, now = Date.now()) =>
  !view.quote.expired && Date.parse(view.quote.expiresAt) > now;
