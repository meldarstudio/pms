import type { Lang } from "@/i18n/utils";
import type { FreeCancellation } from "./offers";
import type { RatePlanCode } from "./search";

export type CheckoutSelection = {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  ratePlan: RatePlanCode;
};

export type BookingContact = { fullName: string; email: string; phone: string };

export type CheckoutView = CheckoutSelection & {
  nights: number;
  language: Lang;
  currency: string;
  quote: {
    id: string;
    expired: boolean;
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
  | { kind: "sold_out" }
  | { kind: "invalid"; error: string }
  | { kind: "denied" }
  | { kind: "throttled" }
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
  if (response.status === 429) return { kind: "throttled" };
  if (response.status === 401) return { kind: "denied" };
  const body: unknown = await response.json().catch(() => null);
  const error = (body as { error?: unknown } | null)?.error;
  if (response.status === 409 && error === "no availability") return { kind: "sold_out" };
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
  acceptance: { quoteId: string; language: Lang; contact: BookingContact },
) =>
  call(apiBase, "public/checkout/acceptances", {
    method: "POST",
    token,
    body: { ...acceptance, agreed: true },
  });

export function offerKey(view: CheckoutView) {
  const { quote } = view;
  return JSON.stringify([
    view.roomTypeId,
    view.checkIn,
    view.checkOut,
    view.adults,
    view.children,
    view.ratePlan,
    view.currency,
    quote.nights,
    quote.totalCents,
    quote.requiredInitialPaymentCents,
    quote.remainingScheduledCents,
    quote.cancellation,
  ]);
}
