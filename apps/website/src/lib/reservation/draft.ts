import type { BookingContact } from "./checkout";

const CHECKOUTS_KEY = "hm.reservation.checkouts";
const CONTACT_KEY = "hm.reservation.contact";
const CARD_SOURCES_KEY = "hm.reservation.card-sources";
const MAX_STORED_CHECKOUTS = 10;

export type StoredCheckout = {
  token: string;
  agreedOffer: string | null;
  accepted: { quoteId: string; contact: string } | null;
  submitted?: string | null;
};

export const contactKey = (contact: BookingContact) =>
  JSON.stringify([contact.fullName.trim(), contact.email.trim(), contact.phone.trim()]);

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

export function storedContact(): BookingContact {
  const stored = read<Partial<BookingContact>>(CONTACT_KEY);
  return {
    fullName: typeof stored?.fullName === "string" ? stored.fullName : "",
    email: typeof stored?.email === "string" ? stored.email : "",
    phone: typeof stored?.phone === "string" ? stored.phone : "",
  };
}

export const storeContact = (contact: BookingContact) => write(CONTACT_KEY, contact);

const CARD_SOURCE = /^tkn_[\w-]{1,200}$/;

export function storedCardSource(selection: string) {
  const source = read<Record<string, string>>(CARD_SOURCES_KEY)?.[selection];
  return typeof source === "string" && CARD_SOURCE.test(source) ? source : null;
}

export function storeCardSource(selection: string, sourceId: string) {
  if (!CARD_SOURCE.test(sourceId)) return;
  const sources = read<Record<string, string>>(CARD_SOURCES_KEY) ?? {};
  write(CARD_SOURCES_KEY, { ...sources, [selection]: sourceId });
}

export function clearCardSource(selection: string) {
  const sources = read<Record<string, string>>(CARD_SOURCES_KEY) ?? {};
  delete sources[selection];
  write(CARD_SOURCES_KEY, sources);
}
