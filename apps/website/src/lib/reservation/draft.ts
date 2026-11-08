import type { BookingContact } from "./checkout";

const CHECKOUTS_KEY = "hm.reservation.checkouts";
const CONTACT_KEY = "hm.reservation.contact";
const MAX_STORED_CHECKOUTS = 10;

export type StoredCheckout = {
  token: string;
  agreedOffer: string | null;
  accepted: { quoteId: string; contact: string } | null;
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
