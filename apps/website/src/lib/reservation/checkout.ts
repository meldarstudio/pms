import { Effect, Schema } from "effect";
import { type HttpClientResponse, HttpIncomingMessage } from "effect/http";
import type { Lang } from "@/i18n/utils";
import {
  errorMessage,
  isSuccess,
  type PmsClient,
  type PmsFailure,
  pmsGet,
  pmsPost,
} from "@/lib/pms-client";
import { Cancellation, RatePlan } from "./offers";
import type { PhoneDraft } from "@pms/shared/phone";
import type { RatePlanCode } from "./search";

export type CheckoutSelection = {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  ratePlan: RatePlanCode;
};

const selectionFields = [
  "roomTypeId",
  "checkIn",
  "checkOut",
  "adults",
  "children",
  "ratePlan",
] as const satisfies readonly (keyof CheckoutSelection)[];

export type BookingContact = { fullName: string; email: string; phone: string };

export type ContactDraft = {
  fullName: string;
  email: string;
  phone: PhoneDraft;
  notes: string;
};

const CheckoutView = Schema.Struct({
  roomTypeId: Schema.String,
  checkIn: Schema.String,
  checkOut: Schema.String,
  adults: Schema.Number,
  children: Schema.Number,
  ratePlan: RatePlan,
  nights: Schema.Number,
  language: Schema.Literals(["es", "en"] satisfies Lang[]),
  currency: Schema.String,
  quote: Schema.Struct({
    id: Schema.String,
    expired: Schema.Boolean,
    expiresAt: Schema.String,
    nights: Schema.Array(Schema.Struct({ date: Schema.String, priceCents: Schema.Number })),
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
  | { kind: "sold_out" }
  | { kind: "invalid"; error: string }
  | { kind: "denied" }
  | { kind: "throttled" }
  | { kind: "limited" }
  | { kind: "has_payment" }
  | { kind: "unavailable" };

const refusal = (status: number, error: string | null): CheckoutOutcome => {
  if (status === 401) return { kind: "denied" };
  if (status === 429)
    return { kind: error === "too many acceptances for this checkout" ? "limited" : "throttled" };
  if (status === 409 && error === "quote was replaced by a newer quote")
    return { kind: "replaced" };
  if (status === 409 && error === "no availability") return { kind: "sold_out" };
  if (status === 409 && error === "checkout already has a payment") return { kind: "has_payment" };
  if (error === "quote has expired" || error === "quote not found") return { kind: "expired" };
  if (status === 400 || status === 404) return { kind: "invalid", error: error ?? "" };
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
        : Effect.map(errorMessage(response), (error) => refusal(response.status, error)),
    ),
    Effect.catchTags({
      HttpClientError: () => Effect.succeed<CheckoutOutcome>({ kind: "unavailable" }),
      SchemaError: () => Effect.succeed<CheckoutOutcome>({ kind: "unavailable" }),
    }),
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
  JSON.stringify(selectionFields.map((field) => selection[field]));

export const offerKey = (view: CheckoutView) =>
  JSON.stringify([
    selectionKey(view),
    view.currency,
    view.quote.nights,
    view.quote.totalCents,
    view.quote.requiredInitialPaymentCents,
    view.quote.remainingScheduledCents,
    view.quote.cancellation,
  ]);

export const quoteStillValid = (view: CheckoutView, now = Date.now()) =>
  !view.quote.expired && Date.parse(view.quote.expiresAt) > now;
