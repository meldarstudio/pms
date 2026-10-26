import {
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from "libphonenumber-js/max";

export const phoneErrors = {
  invalid: "invalid phone number",
  tooShort: "phone number is too short",
  tooLong: "phone number is too long",
  extension: "phone extensions are not supported",
} as const;

/**
 * Validates a newly entered contact phone and returns it in international form, such as
 * `+51987654321`. Numbers without a leading `+` are read as Peruvian. Accepts mobiles and
 * landlines, spaces, parentheses, dots, and hyphens; rejects extensions instead of dropping them.
 */
export function normalizePhone(
  input: string,
  country: CountryCode = "PE",
): { phone: string } | { error: (typeof phoneErrors)[keyof typeof phoneErrors] } {
  const parsed = parsePhoneNumberFromString(input, country);
  if (parsed?.ext) return { error: phoneErrors.extension };
  if (!/^\+?[\d\s().-]+$/.test(input.trim())) return { error: phoneErrors.invalid };
  if (parsed?.isValid()) return { phone: parsed.number };
  const length = validatePhoneNumberLength(input, country);
  if (length === "TOO_SHORT") return { error: phoneErrors.tooShort };
  if (length === "TOO_LONG") return { error: phoneErrors.tooLong };
  return { error: phoneErrors.invalid };
}
