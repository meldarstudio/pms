import type { ContactDraft } from "./checkout";
import { phoneKey, storedPhone } from "./phone";
import { readSession, writeSession } from "./session-storage";

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

export const contactKey = (contact: ContactDraft) =>
  JSON.stringify([
    contact.fullName.trim(),
    contact.email.trim(),
    phoneKey(contact.phone),
    contact.notes.trim(),
  ]);

const storedCheckouts = () => readSession<Record<string, StoredCheckout>>(CHECKOUTS_KEY) ?? {};

export function storedCheckout(selection: string) {
  const stored = storedCheckouts()[selection];
  return typeof stored?.token === "string" ? stored : null;
}

export function storeCheckout(selection: string, checkout: StoredCheckout) {
  const others = storedCheckouts();
  delete others[selection];
  const kept = Object.entries(others).slice(1 - MAX_STORED_CHECKOUTS);
  writeSession(CHECKOUTS_KEY, Object.fromEntries([...kept, [selection, checkout]]));
}

export function storedContact(): ContactDraft {
  const stored = readSession<Partial<ContactDraft>>(CONTACT_KEY);
  return {
    fullName: typeof stored?.fullName === "string" ? stored.fullName : "",
    email: typeof stored?.email === "string" ? stored.email : "",
    phone: storedPhone(stored?.phone),
    notes: typeof stored?.notes === "string" ? stored.notes : "",
  };
}

export const storeContact = (contact: ContactDraft) => writeSession(CONTACT_KEY, contact);

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
  const card = readSession<Record<string, unknown>>(CARD_SOURCES_KEY)?.[selection];
  return isStoredCard(card) ? card : null;
}

export function storeCard(selection: string, card: StoredCard) {
  if (!isStoredCard(card)) return;
  const sources = readSession<Record<string, StoredCard>>(CARD_SOURCES_KEY) ?? {};
  writeSession(CARD_SOURCES_KEY, { ...sources, [selection]: card });
}

export function clearCardSource(selection: string) {
  const sources = readSession<Record<string, string>>(CARD_SOURCES_KEY) ?? {};
  delete sources[selection];
  writeSession(CARD_SOURCES_KEY, sources);
}
