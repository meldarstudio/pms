import type { BookingContact, CheckoutSelection } from "./checkout";

const CHECKOUT_KEY = "hm.reservation.checkout";
const CONTACT_KEY = "hm.reservation.contact";

export type StoredCheckout = {
  selection: string;
  token: string;
  agreedOffer: string | null;
  accepted: { quoteId: string; contact: string } | null;
};

export const selectionKey = (selection: CheckoutSelection) =>
  JSON.stringify([
    selection.roomTypeId,
    selection.checkIn,
    selection.checkOut,
    selection.adults,
    selection.children,
    selection.ratePlan,
  ]);

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
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function storedCheckout(selection: string) {
  const stored = read<StoredCheckout>(CHECKOUT_KEY);
  return stored?.selection === selection && typeof stored.token === "string" ? stored : null;
}

export const storeCheckout = (checkout: StoredCheckout | null) => write(CHECKOUT_KEY, checkout);

export function storedContact(): BookingContact {
  const stored = read<Partial<BookingContact>>(CONTACT_KEY);
  return {
    fullName: typeof stored?.fullName === "string" ? stored.fullName : "",
    email: typeof stored?.email === "string" ? stored.email : "",
    phone: typeof stored?.phone === "string" ? stored.phone : "",
  };
}

export const storeContact = (contact: BookingContact) => write(CONTACT_KEY, contact);
