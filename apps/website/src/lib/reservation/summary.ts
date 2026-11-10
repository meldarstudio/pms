import type { PlanOffer } from "./offers";

const TOKEN = /^[\w-]{43}$/;

export type GuestReservationSummary = {
  status: string;
  code: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  fullName: string;
  rooms: {
    roomTypeId: string;
    name: string;
    adults: number;
    children: number;
    nights: { date: string; priceCents: number }[];
  }[];
  ratePlan: string;
  cancellation?: Omit<PlanOffer["cancellation"], "freeCancellation"> & {
    freeCancellation?: PlanOffer["cancellation"]["freeCancellation"];
  };
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  refundDueCents: number;
  refundedCents: number;
};

export type CheckoutAccess = { token: string; expiresOn: string };

async function guestGet(apiBase: string, path: string, token: string) {
  const url = new URL(path, apiBase.endsWith("/") ? apiBase : `${apiBase}/`);
  try {
    return await fetch(url, {
      method: "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
}

function isSummary(value: unknown): value is GuestReservationSummary {
  if (typeof value !== "object" || value === null) return false;
  const row = value as GuestReservationSummary;
  return (
    typeof row.code === "string" &&
    typeof row.status === "string" &&
    typeof row.paidCents === "number" &&
    typeof row.currency === "string" &&
    Array.isArray(row.rooms)
  );
}

export async function readReservationSummary(apiBase: string, token: string) {
  if (!TOKEN.test(token)) return null;
  const response = await guestGet(apiBase, "public/reservation", token);
  if (!response?.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  return isSummary(body) ? body : null;
}

export async function readCheckoutAccess(apiBase: string, token: string) {
  const response = await guestGet(apiBase, "public/checkout/access", token);
  if (!response?.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("token" in body)) return null;
  const access = body as CheckoutAccess;
  return TOKEN.test(access.token) ? access : null;
}

export function summaryLink(path: string, token: string) {
  const url = new URL(path, window.location.origin);
  url.search = "";
  url.hash = token;
  return url.href;
}
