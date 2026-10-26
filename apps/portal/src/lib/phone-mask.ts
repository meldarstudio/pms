import {
  isPhoneSyntax,
  phoneCharacters,
  phoneInputText,
  typePhone,
  type PhoneValue,
} from "@/lib/phone";

/** The phone input's rendered text and collapsed caret offset. */
export type MaskedText = { text: string; caret: number };

/**
 * The text and caret a browser edit left. `deletion` marks Backspace or Delete from a collapsed
 * caret, which may have removed only a visual separator.
 */
export type PhoneEdit = MaskedText & { deletion?: "backward" | "forward" };

/** Applies a browser edit, keeping the caret attached to the same significant characters. */
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

/** A deletion that removed only a separator removes the adjacent significant character instead. */
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

/** The offset in `formatted` after the significant characters that preceded the caret. */
function formattedCaret(text: string, caret: number, formatted: string) {
  // Count from the right so removing an international prefix doesn't move a mid-number caret.
  const following = phoneCharacters(text.slice(caret)).length;
  const preceding = Math.max(0, phoneCharacters(formatted).length - following);
  let offset = 0;
  for (let seen = 0; offset < formatted.length && seen < preceding; offset++) {
    if (phoneCharacters(formatted[offset])) seen++;
  }
  return offset;
}

/**
 * Clipboard text for a selection of the input: its significant characters, keeping `+`.
 * Undefined for an empty selection or unsupported text, which the browser copies as shown.
 */
export function phoneClipboardText(text: string, start: number, end: number) {
  const selected = text.slice(start, end);
  return selected && isPhoneSyntax(text) ? phoneCharacters(selected) : undefined;
}
