import type { ContactDraft } from "./checkout";
import { phoneKey, storedPhone } from "./phone";
import { firstOnlineArrival, readSearch, searchParams, type StaySearch } from "./search";

const CHECKOUTS_KEY = "hm.reservation.checkouts";
const CONTACT_KEY = "hm.reservation.contact";
const CARD_SOURCES_KEY = "hm.reservation.card-sources";
const SEARCH_KEY = "hm.reservation.search";
const MAX_STORED_CHECKOUTS = 10;

export type StoredCheckout = {
  token: string;
  agreedOffer: string | null;
  accepted: { quoteId: string; contact: string } | null;
  submitted?: string | null;
};

export const contactKey = (contact: ContactDraft) =>
  JSON.stringify([
    contact.fullName.trim(),
    contact.email.trim(),
    phoneKey(contact.phone),
    contact.notes.trim(),
  ]);

function read<T>(key: string): T | null {
  try {
    const value = sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

const storedCheckouts = () => read<Record<string, StoredCheckout>>(CHECKOUTS_KEY) ?? {};

export function storedCheckout(selection: string) {
  const stored = storedCheckouts()[selection];
  return typeof stored?.token === "string" ? stored : null;
}

export function storeCheckout(selection: string, checkout: StoredCheckout) {
  const others = storedCheckouts();
  delete others[selection];
  const kept = Object.entries(others).slice(1 - MAX_STORED_CHECKOUTS);
  write(CHECKOUTS_KEY, Object.fromEntries([...kept, [selection, checkout]]));
}

export function storedContact(): ContactDraft {
  const stored = read<Partial<ContactDraft>>(CONTACT_KEY);
  return {
    fullName: typeof stored?.fullName === "string" ? stored.fullName : "",
    email: typeof stored?.email === "string" ? stored.email : "",
    phone: storedPhone(stored?.phone),
    notes: typeof stored?.notes === "string" ? stored.notes : "",
  };
}

export const storeContact = (contact: ContactDraft) => write(CONTACT_KEY, contact);

export function clearContact() {
  try {
    sessionStorage.removeItem(CONTACT_KEY);
  } catch {
    return;
  }
}

const CARD_SOURCE = /^tkn_[\w-]{1,200}$/;

export type StoredCard = { sourceId: string; attemptId: string };

const ATTEMPT_ID = /^[0-9a-f-]{36}$/i;

export function isStoredCard(value: unknown): value is StoredCard {
  if (typeof value !== "object" || value === null) return false;
  const card = value as StoredCard;
  return CARD_SOURCE.test(card.sourceId) && ATTEMPT_ID.test(card.attemptId);
}

export function storedCard(selection: string) {
  const card = read<Record<string, unknown>>(CARD_SOURCES_KEY)?.[selection];
  return isStoredCard(card) ? card : null;
}

export function storeCard(selection: string, card: StoredCard) {
  if (!isStoredCard(card)) return;
  const sources = read<Record<string, StoredCard>>(CARD_SOURCES_KEY) ?? {};
  write(CARD_SOURCES_KEY, { ...sources, [selection]: card });
}

export function clearCardSource(selection: string) {
  const sources = read<Record<string, string>>(CARD_SOURCES_KEY) ?? {};
  delete sources[selection];
  write(CARD_SOURCES_KEY, sources);
}

export function storeSearch(search: StaySearch) {
  write(SEARCH_KEY, searchParams({ ...search, room: null, plan: null }).toString());
}

export function resumeSearch(params: URLSearchParams, roomIds: readonly string[]): StaySearch {
  const requested = readSearch(params, roomIds);
  const stored = read<unknown>(SEARCH_KEY);
  if ((requested.checkIn && requested.checkOut) || typeof stored !== "string") return requested;
  const kept = readSearch(new URLSearchParams(stored), []);
  const datesStillBookable = Boolean(kept.checkIn) && kept.checkIn >= firstOnlineArrival();
  return {
    ...kept,
    checkIn: datesStillBookable ? kept.checkIn : "",
    checkOut: datesStillBookable ? kept.checkOut : "",
    room: requested.room,
    plan: null,
  };
}
