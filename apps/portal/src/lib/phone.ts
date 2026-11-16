import {
  checkPhone,
  draftPhone,
  internationalPhone,
  isPhoneSyntax,
  phoneCharacters,
  phoneCountries as localizedPhoneCountries,
  phoneCountry as localizedPhoneCountry,
  phoneInputText as draftInputText,
  type CountryCode,
  type PhoneDraft,
  type PhoneProblem,
} from "@pms/shared/phone";

export type PhoneValue = PhoneDraft & { saved: string | null };

export const phoneCountries = localizedPhoneCountries("es");

export function phoneCountry(code: CountryCode) {
  return localizedPhoneCountry("es", code);
}

export function phoneDraft(saved: string | null | undefined): PhoneValue {
  return { ...draftPhone(saved ?? ""), saved: saved ?? null };
}

function unchanged(value: PhoneValue) {
  const initial = phoneDraft(value.saved);
  return value.country === initial.country && comparable(value.text) === comparable(initial.text);
}

function comparable(text: string) {
  return isPhoneSyntax(text) ? phoneCharacters(text) : text;
}

export function phoneInputText(value: PhoneValue): string {
  if (value.saved && unchanged(value) && !internationalPhone(value.saved)?.country)
    return value.saved;
  return draftInputText(value);
}

const problemMessages: Record<PhoneProblem, string> = {
  extension: "No se admiten extensiones telefónicas.",
  invalid: "Ingresa un teléfono válido para el país seleccionado.",
  tooShort: "El número está incompleto. Si es un teléfono fijo, incluye el código de área.",
  tooLong: "El número tiene demasiados dígitos para el país seleccionado.",
};

function normalize(value: PhoneValue): { phone: string } | { error: string } {
  const result = checkPhone(value.text, value.country);
  return "phone" in result ? result : { error: problemMessages[result.problem] };
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
  const parsed = internationalPhone(phone);
  return parsed
    ? { text: parsed.formatInternational(), href: `tel:${parsed.number}` }
    : { text: phone, href: `tel:${phone}` };
}
