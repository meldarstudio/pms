export type PaymentState =
  | "submitted"
  | "authentication_required"
  | "declined"
  | "processing"
  | "paid_awaiting_reservation"
  | "unfulfilled"
  | "confirmed"
  | "reservation_changed";

export type GuestPayment = {
  attemptId: string;
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
  if (response.ok && isPaymentBody(body))
    return { kind: "payment", payment: body.payment, created: response.status === 201 };
  if (response.status === 429) return { kind: "throttled" };
  if (typeof error !== "string") return { kind: "unavailable" };
  if (error === "online payments are paused") return { kind: "paused" };
  if (error === "payment security check failed") return { kind: "security_failed" };
  if (SECURITY_UNAVAILABLE.has(error)) return { kind: "security_unavailable" };
  if (error === "quote has expired") return { kind: "expired" };
  if (REPLACED_QUOTE.has(error)) return { kind: "replaced" };
  if (response.status === 409 && error === "no availability") return { kind: "sold_out" };
  if (response.status === 400) return { kind: "invalid", error };
  return { kind: "unavailable" };
}

export const readPayment = (apiBase: string, token: string) =>
  call(apiBase, "public/checkout/payment", { method: "GET", token });

export const startPayment = (
  apiBase: string,
  token: string,
  payment: {
    quoteId: string;
    sourceId: string;
    turnstileToken: string;
    deviceFingerprint?: string;
  },
) =>
  call(apiBase, "public/checkout/payments", {
    method: "POST",
    token,
    body: {
      quoteId: payment.quoteId,
      sourceId: payment.sourceId,
      turnstileToken: payment.turnstileToken,
      ...(payment.deviceFingerprint ? { deviceFingerprint: payment.deviceFingerprint } : {}),
    },
  });

export const continuePayment = (
  apiBase: string,
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
  call(apiBase, "public/checkout/payment/authentication", {
    method: "POST",
    token,
    body: authentication,
  });
