import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
  type PhoneNumber,
} from "libphonenumber-js/max";
import type { Lang } from "@/i18n/utils";

export type { CountryCode };

export type PhoneValue = { country: CountryCode; text: string };

export type PhoneProblem = "required" | "invalid" | "tooShort" | "tooLong" | "extension";

export type PhoneCountry = { code: CountryCode; name: string; callingCode: string };

export const DEFAULT_PHONE_COUNTRY: CountryCode = "PE";

export const emptyPhone: PhoneValue = { country: DEFAULT_PHONE_COUNTRY, text: "" };

const phoneSyntax = /^\+?[\d\s().-]+$/;
const supportedCountries = new Set<string>(getCountries());
const countryLists = new Map<Lang, PhoneCountry[]>();

export function phoneCountries(lang: Lang): PhoneCountry[] {
  let list = countryLists.get(lang);
  if (!list) {
    const regionNames = new Intl.DisplayNames([lang], { type: "region" });
    list = getCountries()
      .map((code) => ({
        code,
        name: regionNames.of(code) ?? code,
        callingCode: `+${getCountryCallingCode(code)}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, lang));
    countryLists.set(lang, list);
  }
  return list;
}

export function phoneCountry(lang: Lang, code: CountryCode): PhoneCountry {
  const list = phoneCountries(lang);
  return list.find((country) => country.code === code) ?? list[0]!;
}

function parseInternational(phone: string) {
  const text = phone.trim();
  return text.startsWith("+") && phoneSyntax.test(text)
    ? parsePhoneNumberFromString(text, { extract: false })
    : undefined;
}

function international(phone: string) {
  const parsed = parseInternational(phone);
  return parsed?.isValid() && !parsed.ext ? parsed : undefined;
}

export function isPhoneSyntax(text: string) {
  return phoneSyntax.test(text.trim());
}

export function phoneCharacters(text: string) {
  return text.replace(/[^\d+]/g, "");
}

function nationalCharacters(phone: PhoneNumber) {
  return phoneCharacters(phone.formatNational());
}

export function storedPhone(stored: unknown): PhoneValue {
  if (typeof stored === "string") {
    const parsed = international(stored);
    return parsed?.country
      ? { country: parsed.country, text: nationalCharacters(parsed) }
      : { country: DEFAULT_PHONE_COUNTRY, text: stored };
  }
  const value = stored as Partial<PhoneValue> | null;
  return typeof value?.text === "string" &&
    typeof value.country === "string" &&
    supportedCountries.has(value.country)
    ? { country: value.country, text: value.text }
    : emptyPhone;
}

export function typePhone(value: PhoneValue, text: string): PhoneValue {
  const country = text.trim().startsWith("+") ? parsePhoneNumberFromString(text)?.country : null;
  const parsed = international(text);
  return {
    text: parsed?.country
      ? nationalCharacters(parsed)
      : isPhoneSyntax(text)
        ? phoneCharacters(text)
        : text,
    country: country ?? value.country,
  };
}

export function phoneInputText(value: PhoneValue): string {
  if (!isPhoneSyntax(value.text)) return value.text;
  return new AsYouType(value.country)
    .input(value.text)
    .replace(/[^\d+]+/g, " ")
    .trim();
}

export function choosePhoneCountry(value: PhoneValue, country: CountryCode): PhoneValue {
  const parsed = parseInternational(value.text);
  return { country, text: parsed?.nationalNumber ?? value.text };
}

export function phoneResult(value: PhoneValue): { phone: string } | { problem: PhoneProblem } {
  if (!value.text.trim()) return { problem: "required" };
  const parsed = parsePhoneNumberFromString(value.text, value.country);
  if (parsed?.ext) return { problem: "extension" };
  if (!isPhoneSyntax(value.text)) return { problem: "invalid" };
  if (parsed?.isValid()) return { phone: parsed.number };
  const length = validatePhoneNumberLength(value.text, value.country);
  if (length === "TOO_SHORT") return { problem: "tooShort" };
  if (length === "TOO_LONG") return { problem: "tooLong" };
  return { problem: "invalid" };
}

export function phoneKey(value: PhoneValue) {
  const result = phoneResult(value);
  return "phone" in result ? result.phone : `${value.country}:${phoneCharacters(value.text)}`;
}
