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

function isDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isSummary(value: unknown): value is GuestReservationSummary {
  if (typeof value !== "object" || value === null) return false;
  const row = value as GuestReservationSummary;
  return (
    [row.code, row.status, row.fullName, row.ratePlan].every(
      (value) => typeof value === "string",
    ) &&
    [row.checkIn, row.checkOut].every(isDate) &&
    typeof row.currency === "string" &&
    /^[A-Z]{3}$/.test(row.currency) &&
    [
      row.nights,
      row.totalCents,
      row.paidCents,
      row.outstandingCents,
      row.refundDueCents,
      row.refundedCents,
    ].every(Number.isFinite) &&
    Array.isArray(row.rooms) &&
    row.rooms.every(
      (room) =>
        room &&
        typeof room.roomTypeId === "string" &&
        typeof room.name === "string" &&
        Number.isFinite(room.adults) &&
        Number.isFinite(room.children) &&
        Array.isArray(room.nights) &&
        room.nights.every(
          (night) => night && isDate(night.date) && Number.isFinite(night.priceCents),
        ),
    ) &&
    (row.cancellation === undefined ||
      Boolean(
        row.cancellation &&
        Number.isFinite(row.cancellation.chargeCents) &&
        (row.cancellation.freeUntil === null || isDate(row.cancellation.freeUntil)) &&
        (row.cancellation.freeCancellation === undefined ||
          ["available", "ended", "none"].includes(row.cancellation.freeCancellation)),
      ))
  );
}

export type SummaryOutcome =
  | { kind: "found"; summary: GuestReservationSummary }
  | { kind: "invalid" }
  | { kind: "unavailable" };

export async function readReservationSummary(
  apiBase: string,
  token: string,
): Promise<SummaryOutcome> {
  if (!TOKEN.test(token)) return { kind: "invalid" };
  const response = await guestGet(apiBase, "public/reservation", token);
  if (response?.status === 401) return { kind: "invalid" };
  if (!response?.ok) return { kind: "unavailable" };
  const body: unknown = await response.json().catch(() => null);
  return isSummary(body) ? { kind: "found", summary: body } : { kind: "unavailable" };
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
