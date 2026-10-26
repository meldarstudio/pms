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

/**
 * A contact phone being edited: the selected country, unformatted digits (or unsupported text),
 * and the value saved when the editor opened. Until the country or the text apart from separators
 * changes, the portal resubmits `saved` exactly; API parsing and validation still apply.
 */
export type PhoneValue = { country: CountryCode; text: string; saved: string | null };

const regionNames = new Intl.DisplayNames(["es"], { type: "region" });
const phoneSyntax = /^\+?[\d\s().-]+$/;

export const phoneCountries = getCountries()
  .map((code) => ({
    code,
    name: regionNames.of(code) ?? code,
    callingCode: `+${getCountryCallingCode(code)}`,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

export function phoneCountry(code: CountryCode) {
  return phoneCountries.find((country) => country.code === code) ?? phoneCountries[0];
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

/** The editor state for a saved phone. Unparseable legacy values appear exactly as stored. */
export function phoneDraft(saved: string | null | undefined): PhoneValue {
  const parsed = saved ? international(saved) : undefined;
  return parsed?.country
    ? { country: parsed.country, text: nationalCharacters(parsed), saved: saved ?? null }
    : { country: "PE", text: saved ?? "", saved: saved ?? null };
}

function unchanged(value: PhoneValue) {
  const initial = phoneDraft(value.saved);
  return value.country === initial.country && comparable(value.text) === comparable(initial.text);
}

/** Separators are presentation in supported phone syntax; other text must match exactly. */
function comparable(text: string) {
  return isPhoneSyntax(text) ? phoneCharacters(text) : text;
}

/** Typing an explicit international number selects its country. */
export function typePhone(value: PhoneValue, text: string): PhoneValue {
  const country = text.trim().startsWith("+") ? parsePhoneNumberFromString(text)?.country : null;
  const parsed = international(text);
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

/** Whether text uses supported phone syntax: digits, an optional `+`, and separators. */
export function isPhoneSyntax(text: string) {
  return phoneSyntax.test(text.trim());
}

/** Dialable characters, without presentation separators. Only use for supported phone syntax. */
export function phoneCharacters(text: string) {
  return text.replace(/[^\d+]/g, "");
}

function nationalCharacters(phone: PhoneNumber) {
  return phoneCharacters(phone.formatNational());
}

/** Country-aware visual grouping, independent of the draft's digits. Legacy text stays visible. */
export function phoneInputText(value: PhoneValue): string {
  if (value.saved && unchanged(value) && !international(value.saved)?.country) return value.saved;
  if (!isPhoneSyntax(value.text)) return value.text;
  return new AsYouType(value.country)
    .input(value.text)
    .replace(/[^\d+]+/g, " ")
    .trim();
}

/** Choosing a country keeps the national digits staff entered and reads them in that country. */
export function choosePhoneCountry(value: PhoneValue, country: CountryCode): PhoneValue {
  const parsed = parseInternational(value.text);
  return { ...value, country, text: parsed?.nationalNumber ?? value.text };
}

function normalize(value: PhoneValue): { phone: string } | { error: string } {
  const parsed = parsePhoneNumberFromString(value.text, value.country);
  if (parsed?.ext) return { error: "No se admiten extensiones telefónicas." };
  const invalid = { error: "Ingresa un teléfono válido para el país seleccionado." };
  if (!isPhoneSyntax(value.text)) return invalid;
  if (parsed?.isValid()) return { phone: parsed.number };
  const length = validatePhoneNumberLength(value.text, value.country);
  if (length === "TOO_SHORT")
    return {
      error: "El número está incompleto. Si es un teléfono fijo, incluye el código de área.",
    };
  if (length === "TOO_LONG")
    return { error: "El número tiene demasiados dígitos para el país seleccionado." };
  return invalid;
}

/** Portal validation for a new or changed phone. Blank and unchanged phones pass locally. */
export function phoneError(value: PhoneValue): string | undefined {
  if (unchanged(value) || !value.text.trim()) return undefined;
  const result = normalize(value);
  return "error" in result ? result.error : undefined;
}

/** The phone to submit: the saved value when unchanged, null when blank, otherwise `+51…`. */
export function phonePayload(value: PhoneValue): string | null {
  if (unchanged(value)) return value.saved;
  if (!value.text.trim()) return null;
  const result = normalize(value);
  if ("error" in result) throw new Error(result.error);
  return result.phone;
}

/** Format valid international phones; show unsupported or unparseable values as stored. */
export function phoneDisplay(phone: string) {
  const parsed = international(phone);
  return parsed
    ? { text: parsed.formatInternational(), href: `tel:${parsed.number}` }
    : { text: phone, href: `tel:${phone}` };
}
