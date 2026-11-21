import { Effect, Schema } from "effect";
import { HttpClientResponse, HttpIncomingMessage } from "effect/http";
import {
  errorMessage,
  pmsFailures,
  type PmsClient,
  type PmsFailure,
  pmsGet,
  pmsPost,
} from "@/lib/pms-client";

const paymentStates = [
  "submitted",
  "authentication_required",
  "declined",
  "processing",
  "paid_awaiting_reservation",
  "unfulfilled",
  "confirmed",
  "reservation_changed",
] as const;
export type PaymentState = (typeof paymentStates)[number];

export type PaymentOutcome =
  | { kind: "payment"; payment: GuestPayment | null; created: boolean }
  | { kind: "paused" }
  | { kind: "throttled" }
  | { kind: "security_failed" }
  | { kind: "security_unavailable" }
  | { kind: "expired" }
  | { kind: "replaced" }
  | { kind: "sold_out" }
  | { kind: "invalid"; error: string }
  | { kind: "denied" }
  | { kind: "unavailable" };

export const allowsNewPayment = (payment: GuestPayment | null) =>
  !payment || payment.state === "declined";

const REPLACED_QUOTE = new Set([
  "quote was replaced by a newer quote",
  "quote has not been accepted",
  "quote not found",
]);

const SECURITY_UNAVAILABLE = new Set([
  "payment security check is unavailable",
  "payment security check is required",
]);

const GuestPayment = Schema.Struct({
  attemptId: Schema.String,
  state: Schema.Literals(paymentStates),
  declineReason: Schema.optionalKey(Schema.Literal("authentication_expired")),
  amountCents: Schema.Number,
  currency: Schema.String,
  delayed: Schema.Boolean,
  reservation: Schema.NullOr(
    Schema.Struct({
      code: Schema.String,
      paidCents: Schema.Number,
      outstandingCents: Schema.Number,
      refundDueCents: Schema.Number,
    }),
  ),
});
export type GuestPayment = typeof GuestPayment.Type;

const decodePaymentBody = HttpIncomingMessage.schemaBodyJson(
  Schema.Struct({ payment: Schema.NullOr(GuestPayment) }),
);

const refusal = (status: number, error: string | null): PaymentOutcome => {
  if (status === 429) return { kind: "throttled" };
  if (error === null) return { kind: "unavailable" };
  if (error === "online payments are paused") return { kind: "paused" };
  if (error === "payment security check failed") return { kind: "security_failed" };
  if (SECURITY_UNAVAILABLE.has(error)) return { kind: "security_unavailable" };
  if (error === "quote has expired") return { kind: "expired" };
  if (REPLACED_QUOTE.has(error)) return { kind: "replaced" };
  if (status === 409 && error === "no availability") return { kind: "sold_out" };
  if (status === 400) return { kind: "invalid", error };
  return { kind: "unavailable" };
};

const paymentOutcome = (
  exchange: Effect.Effect<HttpClientResponse.HttpClientResponse, PmsFailure, PmsClient>,
): Effect.Effect<PaymentOutcome, never, PmsClient> =>
  exchange.pipe(
    Effect.flatMap(
      HttpClientResponse.matchStatus({
        401: () => Effect.succeed<PaymentOutcome>({ kind: "denied" }),
        "2xx": (response): Effect.Effect<PaymentOutcome, PmsFailure> =>
          Effect.map(decodePaymentBody(response), ({ payment }) => ({
            kind: "payment",
            payment,
            created: response.status === 201,
          })),
        orElse: (response) =>
          Effect.map(errorMessage(response), (error) => refusal(response.status, error)),
      }),
    ),
    Effect.catchTags(pmsFailures(() => Effect.succeed<PaymentOutcome>({ kind: "unavailable" }))),
  );

export const readPayment = (token: string) =>
  paymentOutcome(pmsGet("/public/checkout/payment", { token }));

export const startPayment = (
  token: string,
  payment: {
    quoteId: string;
    sourceId: string;
    turnstileToken: string;
    deviceFingerprint?: string;
  },
) =>
  paymentOutcome(
    pmsPost("/public/checkout/payments", {
      token,
      body: {
        quoteId: payment.quoteId,
        sourceId: payment.sourceId,
        turnstileToken: payment.turnstileToken,
        ...(payment.deviceFingerprint ? { deviceFingerprint: payment.deviceFingerprint } : {}),
      },
    }),
  );

export const continuePayment = (
  token: string,
  authentication: {
    attemptId: string;
    eci: string;
    xid?: string;
    cavv: string;
    protocolVersion: string;
    directoryServerTransactionId: string;
  },
) =>
  paymentOutcome(
    pmsPost("/public/checkout/payment/authentication", { token, body: authentication }),
  );

export const reportAuthenticationFailure = (token: string, attemptId: string) =>
  paymentOutcome(
    pmsPost("/public/checkout/payment/authentication/failure", { token, body: { attemptId } }),
  );
