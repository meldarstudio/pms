import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
  type PhoneNumber,
} from "libphonenumber-js/max";

export type { CountryCode };

export type PhoneDraft = { country: CountryCode; text: string };

export type PhoneCountry = { code: CountryCode; name: string; callingCode: string };

export const DEFAULT_PHONE_COUNTRY: CountryCode = "PE";

export const phoneErrors = {
  invalid: "invalid phone number",
  tooShort: "phone number is too short",
  tooLong: "phone number is too long",
  extension: "phone extensions are not supported",
} as const;

export type PhoneProblem = keyof typeof phoneErrors;

const phoneSyntax = /^\+?[\d\s().-]+$/;
const supportedCountries = new Set<string>(getCountries());
const countryLists = new Map<string, PhoneCountry[]>();

export function phoneCountries(locale: string): PhoneCountry[] {
  let list = countryLists.get(locale);
  if (!list) {
    const regionNames = new Intl.DisplayNames([locale], { type: "region" });
    list = getCountries()
      .map((code) => ({
        code,
        name: regionNames.of(code) ?? code,
        callingCode: `+${getCountryCallingCode(code)}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
    countryLists.set(locale, list);
  }
  return list;
}

export function phoneCountry(locale: string, code: CountryCode): PhoneCountry {
  const list = phoneCountries(locale);
  return list.find((country) => country.code === code) ?? list[0]!;
}

export function isPhoneCountry(code: unknown): code is CountryCode {
  return typeof code === "string" && supportedCountries.has(code);
}

function parseInternational(phone: string) {
  const text = phone.trim();
  return text.startsWith("+") && phoneSyntax.test(text)
    ? parsePhoneNumberFromString(text, { extract: false })
    : undefined;
}

export function internationalPhone(phone: string): PhoneNumber | undefined {
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

export function draftPhone(phone: string): PhoneDraft {
  const parsed = internationalPhone(phone);
  return parsed?.country
    ? { country: parsed.country, text: nationalCharacters(parsed) }
    : { country: DEFAULT_PHONE_COUNTRY, text: phone };
}

export function typePhone<V extends PhoneDraft>(value: V, text: string): V {
  const country = text.trim().startsWith("+") ? parsePhoneNumberFromString(text)?.country : null;
  const parsed = internationalPhone(text);
  return {
    ...value,
    text: parsed?.country
      ? nationalCharacters(parsed)
      : isPhoneSyntax(text)
        ? phoneCharacters(text)
        : text,
    country: country ?? value.country,
  };
}

export function phoneInputText(value: PhoneDraft): string {
  if (!isPhoneSyntax(value.text)) return value.text;
  return new AsYouType(value.country)
    .input(value.text)
    .replace(/[^\d+]+/g, " ")
    .trim();
}

export function choosePhoneCountry<V extends PhoneDraft>(value: V, country: CountryCode): V {
  const parsed = parseInternational(value.text);
  return { ...value, country, text: parsed?.nationalNumber ?? value.text };
}

export function checkPhone(
  text: string,
  country: CountryCode,
): { phone: string } | { problem: PhoneProblem } {
  const parsed = parsePhoneNumberFromString(text, country);
  if (parsed?.ext) return { problem: "extension" };
  if (!isPhoneSyntax(text)) return { problem: "invalid" };
  if (parsed?.isValid()) return { phone: parsed.number };
  const length = validatePhoneNumberLength(text, country);
  if (length === "TOO_SHORT") return { problem: "tooShort" };
  if (length === "TOO_LONG") return { problem: "tooLong" };
  return { problem: "invalid" };
}

export function normalizePhone(
  input: string,
  country: CountryCode = DEFAULT_PHONE_COUNTRY,
): { phone: string } | { error: (typeof phoneErrors)[PhoneProblem] } {
  const result = checkPhone(input, country);
  return "phone" in result ? result : { error: phoneErrors[result.problem] };
}

export type MaskedText = { text: string; caret: number };

export type PhoneEdit = MaskedText & { deletion?: "backward" | "forward" };

export function editPhone<V extends PhoneDraft>(
  value: V,
  edit: PhoneEdit,
  inputText: (value: V) => string,
): MaskedText & { value: V } {
  const { text, caret } = deleteBesideSeparator(inputText(value), edit);
  const next = typePhone(value, text);
  const formatted = inputText(next);
  return {
    value: next,
    text: formatted,
    caret: formatted === text ? caret : formattedCaret(text, caret, formatted),
  };
}

function deleteBesideSeparator(previous: string, edit: PhoneEdit): MaskedText {
  const { text, caret, deletion } = edit;
  if (
    !deletion ||
    !isPhoneSyntax(previous) ||
    previous === text ||
    phoneCharacters(previous) !== phoneCharacters(text)
  )
    return edit;
  const significant = phoneCharacters(text);
  const caretIndex = phoneCharacters(text.slice(0, caret)).length;
  const removed = deletion === "backward" ? caretIndex - 1 : caretIndex;
  if (removed < 0 || removed >= significant.length) return edit;
  return { text: significant.slice(0, removed) + significant.slice(removed + 1), caret: removed };
}

function formattedCaret(text: string, caret: number, formatted: string) {
  const following = phoneCharacters(text.slice(caret)).length;
  const preceding = Math.max(0, phoneCharacters(formatted).length - following);
  let offset = 0;
  for (let seen = 0; offset < formatted.length && seen < preceding; offset++) {
    if (phoneCharacters(formatted[offset])) seen++;
  }
  return offset;
}

export function phoneClipboardText(text: string, start: number, end: number) {
  const selected = text.slice(start, end);
  return selected && isPhoneSyntax(text) ? phoneCharacters(selected) : undefined;
}
