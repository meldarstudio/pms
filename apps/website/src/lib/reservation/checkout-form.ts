import type { BookingContact, ContactDraft } from "./checkout";
import { phoneResult } from "./phone";

export const contactFields = ["fullName", "email", "phone", "notes"] as const;
export type ContactField = (typeof contactFields)[number];

export const reviewFields = [...contactFields, "agree"] as const;
export type ReviewField = (typeof reviewFields)[number];

export type FieldErrors = Record<ReviewField, string | null>;

export const noFieldErrors: FieldErrors = {
  fullName: null,
  email: null,
  phone: null,
  notes: null,
  agree: null,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const trimmedContact = (contact: ContactDraft): BookingContact => ({
  fullName: contact.fullName.trim(),
  email: contact.email.trim(),
  phone: normalizedPhone(contact),
});

function normalizedPhone(contact: ContactDraft) {
  const result = phoneResult(contact.phone);
  return "phone" in result ? result.phone : contact.phone.text.trim();
}

const phoneProblems = {
  required: "reservation.review.error.phone",
  invalid: "reservation.review.error.phoneInvalid",
  tooShort: "reservation.review.error.phoneTooShort",
  tooLong: "reservation.review.error.phoneTooLong",
  extension: "reservation.review.error.phoneExtension",
};

export function reviewProblems(
  contact: ContactDraft,
  agreed: boolean,
): { errors: FieldErrors; firstInvalid: ReviewField | null } {
  const trimmed = trimmedContact(contact);
  const phone = phoneResult(contact.phone);
  const errors: FieldErrors = {
    fullName: trimmed.fullName ? null : "reservation.review.error.fullName",
    email: EMAIL.test(trimmed.email) ? null : "reservation.review.error.email",
    phone: "problem" in phone ? phoneProblems[phone.problem] : null,
    notes: contact.notes.trim().length > 2000 ? "reservation.review.error.notesTooLong" : null,
    agree: agreed ? null : "reservation.review.error.agree",
  };
  return { errors, firstInvalid: reviewFields.find((field) => errors[field]) ?? null };
}
