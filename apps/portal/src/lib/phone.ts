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

function comparable(text: string) {
  return isPhoneSyntax(text) ? phoneCharacters(text) : text;
}

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

export function isPhoneSyntax(text: string) {
  return phoneSyntax.test(text.trim());
}

export function phoneCharacters(text: string) {
  return text.replace(/[^\d+]/g, "");
}

function nationalCharacters(phone: PhoneNumber) {
  return phoneCharacters(phone.formatNational());
}

export function phoneInputText(value: PhoneValue): string {
  if (value.saved && unchanged(value) && !international(value.saved)?.country) return value.saved;
  if (!isPhoneSyntax(value.text)) return value.text;
  return new AsYouType(value.country)
    .input(value.text)
    .replace(/[^\d+]+/g, " ")
    .trim();
}

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

export function phoneError(value: PhoneValue): string | undefined {
  if (unchanged(value) || !value.text.trim()) return undefined;
  const result = normalize(value);
  return "error" in result ? result.error : undefined;
}

export function phonePayload(value: PhoneValue): string | null {
  if (unchanged(value)) return value.saved;
  if (!value.text.trim()) return null;
  const result = normalize(value);
  if ("error" in result) throw new Error(result.error);
  return result.phone;
}

export function phoneDisplay(phone: string) {
  const parsed = international(phone);
  return parsed
    ? { text: parsed.formatInternational(), href: `tel:${parsed.number}` }
    : { text: phone, href: `tel:${phone}` };
}
