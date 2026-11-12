import type { BookingContact } from "./checkout";

export const contactFields = ["fullName", "email", "phone"] as const;
export type ContactField = (typeof contactFields)[number];

export const reviewFields = [...contactFields, "agree"] as const;
export type ReviewField = (typeof reviewFields)[number];

export type FieldErrors = Record<ReviewField, string | null>;

export const noFieldErrors: FieldErrors = {
  fullName: null,
  email: null,
  phone: null,
  agree: null,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const trimmedContact = (contact: BookingContact): BookingContact => ({
  fullName: contact.fullName.trim(),
  email: contact.email.trim(),
  phone: contact.phone.trim(),
});

export function reviewProblems(
  contact: BookingContact,
  agreed: boolean,
): { errors: FieldErrors; firstInvalid: ReviewField | null } {
  const trimmed = trimmedContact(contact);
  const errors: FieldErrors = {
    fullName: trimmed.fullName ? null : "reservation.review.error.fullName",
    email: EMAIL.test(trimmed.email) ? null : "reservation.review.error.email",
    phone: trimmed.phone ? null : "reservation.review.error.phone",
    agree: agreed ? null : "reservation.review.error.agree",
  };
  return { errors, firstInvalid: reviewFields.find((field) => errors[field]) ?? null };
}
