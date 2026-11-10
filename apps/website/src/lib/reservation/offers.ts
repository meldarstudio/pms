import type { RatePlanCode, StaySearch } from "./search";

export type FreeCancellation = "available" | "ended" | "none";

export type PlanOffer = {
  ratePlan: RatePlanCode;
  totalCents: number;
  requiredInitialPaymentCents: number;
  remainingScheduledCents: number;
  savingCents: number;
  cancellation: {
    freeCancellation: FreeCancellation;
    freeUntil: string | null;
    chargeCents: number;
  };
};

export type RoomTypeOffers = {
  id: string;
  maxAdults: number;
  maxChildren: number;
  availability: "available" | "sold_out" | "too_many_guests";
  offers: PlanOffer[];
};

export type OfferSearchResult = {
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  currency: string;
  roomTypes: RoomTypeOffers[];
};

export type SearchOutcome =
  | { kind: "found"; result: OfferSearchResult }
  | { kind: "invalid"; error: string }
  | { kind: "throttled" }
  | { kind: "unavailable" };

function isResult(value: unknown): value is OfferSearchResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<OfferSearchResult>;
  return typeof result.currency === "string" && Array.isArray(result.roomTypes);
}

export async function fetchOffers(
  apiBase: string,
  search: StaySearch,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const url = new URL("public/offers", apiBase.endsWith("/") ? apiBase : `${apiBase}/`);
  url.search = new URLSearchParams({
    checkIn: search.checkIn,
    checkOut: search.checkOut,
    adults: String(search.adults),
    children: String(search.children),
  }).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      credentials: "omit",
      headers: { accept: "application/json" },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { kind: "unavailable" };
  }
  if (response.status === 429) return { kind: "throttled" };
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 400) {
    const error = (body as { error?: unknown } | null)?.error;
    return { kind: "invalid", error: typeof error === "string" ? error : "" };
  }
  if (!response.ok || !isResult(body)) return { kind: "unavailable" };
  return { kind: "found", result: body };
}
