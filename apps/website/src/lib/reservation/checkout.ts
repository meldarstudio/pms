import type { Lang } from "@/i18n/utils";
import type { FreeCancellation } from "./offers";
import type { PhoneValue } from "./phone";
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
  phone: PhoneValue;
  notes: string;
};

export type CheckoutView = CheckoutSelection & {
  nights: number;
  language: Lang;
  currency: string;
  quote: {
    id: string;
    expired: boolean;
    expiresAt: string;
    nights: { date: string; priceCents: number }[];
    totalCents: number;
    requiredInitialPaymentCents: number;
    remainingScheduledCents: number;
    cancellation: {
      freeCancellation: FreeCancellation;
      freeUntil: string | null;
      chargeCents: number;
    };
  };
  acceptance: { quoteId: string; acceptedAt: string } | null;
};

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

function isView(value: unknown): value is CheckoutView {
  if (typeof value !== "object" || value === null) return false;
  const view = value as Partial<CheckoutView>;
  return typeof view.currency === "string" && typeof view.quote?.id === "string";
}

async function call(
  apiBase: string,
  path: string,
  init: { method: "GET" | "POST"; token?: string; body?: unknown },
): Promise<CheckoutOutcome> {
  const url = new URL(path, apiBase.endsWith("/") ? apiBase : `${apiBase}/`);
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        accept: "application/json",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    return { kind: "unavailable" };
  }
  if (response.status === 401) return { kind: "denied" };
  const body: unknown = await response.json().catch(() => null);
  const error = (body as { error?: unknown } | null)?.error;
  if (response.status === 429)
    return { kind: error === "too many acceptances for this checkout" ? "limited" : "throttled" };
  if (response.status === 409 && error === "quote was replaced by a newer quote")
    return { kind: "replaced" };
  if (response.status === 409 && error === "no availability") return { kind: "sold_out" };
  if (response.status === 409 && error === "checkout already has a payment")
    return { kind: "has_payment" };
  if (error === "quote has expired" || error === "quote not found") return { kind: "expired" };
  if (response.status === 400 || response.status === 404)
    return { kind: "invalid", error: typeof error === "string" ? error : "" };
  if (!response.ok || !isView(body)) return { kind: "unavailable" };
  const { token, ...view } = body as CheckoutView & { token?: string };
  return { kind: "ready", view, token: token ?? init.token ?? "" };
}

export const startCheckout = (apiBase: string, selection: CheckoutSelection, language: Lang) =>
  call(apiBase, "public/checkouts", { method: "POST", body: { ...selection, language } });

export const readCheckout = (apiBase: string, token: string) =>
  call(apiBase, "public/checkout", { method: "GET", token });

export const refreshQuote = (apiBase: string, token: string) =>
  call(apiBase, "public/checkout/quotes", { method: "POST", token });

export const acceptQuote = (
  apiBase: string,
  token: string,
  acceptance: { quoteId: string; language: Lang; contact: BookingContact; notes?: string },
) =>
  call(apiBase, "public/checkout/acceptances", {
    method: "POST",
    token,
    body: { ...acceptance, agreed: true },
  });

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
