import {
  checkPhone,
  DEFAULT_PHONE_COUNTRY,
  draftPhone,
  isPhoneCountry,
  phoneCharacters,
  type PhoneDraft,
  type PhoneProblem as CheckedPhoneProblem,
} from "@pms/shared/phone";

export type PhoneProblem = "required" | CheckedPhoneProblem;

export const emptyPhone: PhoneDraft = { country: DEFAULT_PHONE_COUNTRY, text: "" };

export function storedPhone(stored: unknown): PhoneDraft {
  if (typeof stored === "string") return draftPhone(stored);
  const value = stored as Partial<PhoneDraft> | null;
  return typeof value?.text === "string" && isPhoneCountry(value.country)
    ? { country: value.country, text: value.text }
    : emptyPhone;
}

export function phoneResult(value: PhoneDraft): { phone: string } | { problem: PhoneProblem } {
  if (!value.text.trim()) return { problem: "required" };
  return checkPhone(value.text, value.country);
}

export function phoneKey(value: PhoneDraft) {
  const result = phoneResult(value);
  return "phone" in result ? result.phone : `${value.country}:${phoneCharacters(value.text)}`;
}
