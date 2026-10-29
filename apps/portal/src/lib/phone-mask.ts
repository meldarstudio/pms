import {
  isPhoneSyntax,
  phoneCharacters,
  phoneInputText,
  typePhone,
  type PhoneValue,
} from "@/lib/phone";

export type MaskedText = { text: string; caret: number };

export type PhoneEdit = MaskedText & { deletion?: "backward" | "forward" };

export function editPhone(value: PhoneValue, edit: PhoneEdit): MaskedText & { value: PhoneValue } {
  const { text, caret } = deleteBesideSeparator(phoneInputText(value), edit);
  const next = typePhone(value, text);
  const formatted = phoneInputText(next);
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
