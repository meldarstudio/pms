export type PaymentState =
  | "authentication_required"
  | "authentication_expired"
  | "declined"
  | "processing"
  | "paid_awaiting_reservation"
  | "unfulfilled"
  | "confirmed";

export type GuestPayment = {
  state: PaymentState;
  amountCents: number;
  currency: string;
  delayed: boolean;
  reservation: {
    code: string;
    paidCents: number;
    outstandingCents: number;
    refundDueCents: number;
  } | null;
};

export type PaymentOutcome =
  | { kind: "payment"; payment: GuestPayment | null }
  | { kind: "paused" }
  | { kind: "throttled" }
  | { kind: "security_failed" }
  | { kind: "security_unavailable" }
  | { kind: "stale" }
  | { kind: "sold_out" }
  | { kind: "invalid"; error: string }
  | { kind: "denied" }
  | { kind: "unavailable" };

const NEW_PAYMENT_ALLOWED: readonly PaymentState[] = ["declined", "authentication_expired"];

export const allowsNewPayment = (payment: GuestPayment | null) =>
  !payment || NEW_PAYMENT_ALLOWED.includes(payment.state);

const STALE_QUOTE = new Set([
  "quote has expired",
  "quote was replaced by a newer quote",
  "quote has not been accepted",
  "quote not found",
]);

const SECURITY_UNAVAILABLE = new Set([
  "payment security check is unavailable",
  "payment security check is required",
]);

function isPaymentBody(value: unknown): value is { payment: GuestPayment | null } {
  if (typeof value !== "object" || value === null || !("payment" in value)) return false;
  const { payment } = value as { payment: unknown };
  return (
    payment === null ||
    (typeof payment === "object" && typeof (payment as GuestPayment).state === "string")
  );
}

async function call(
  apiBase: string,
  path: string,
  init: { method: "GET" | "POST"; token: string; body?: unknown },
): Promise<PaymentOutcome> {
  const url = new URL(path, apiBase.endsWith("/") ? apiBase : `${apiBase}/`);
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${init.token}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    return { kind: "unavailable" };
  }
  if (response.status === 401) return { kind: "denied" };
  const body: unknown = await response.json().catch(() => null);
  const error = (body as { error?: unknown } | null)?.error;
  if (response.ok && isPaymentBody(body)) return { kind: "payment", payment: body.payment };
  if (response.status === 429) return { kind: "throttled" };
  if (typeof error !== "string") return { kind: "unavailable" };
  if (error === "online payments are paused") return { kind: "paused" };
  if (error === "payment security check failed") return { kind: "security_failed" };
  if (SECURITY_UNAVAILABLE.has(error)) return { kind: "security_unavailable" };
  if (STALE_QUOTE.has(error)) return { kind: "stale" };
  if (response.status === 409 && error === "no availability") return { kind: "sold_out" };
  if (response.status === 400) return { kind: "invalid", error };
  return { kind: "unavailable" };
}

export const readPayment = (apiBase: string, token: string) =>
  call(apiBase, "public/checkout/payment", { method: "GET", token });

export const startPayment = (
  apiBase: string,
  token: string,
  payment: { quoteId: string; sourceId: string; turnstileToken: string },
) => call(apiBase, "public/checkout/payments", { method: "POST", token, body: payment });
