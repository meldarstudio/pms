<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import {
    editPhone,
    phoneClipboardText,
    phoneInputText,
    type PhoneDraft,
    type PhoneEdit,
  } from "@pms/shared/phone";

  let {
    value,
    onEdit,
    ...props
  }: Omit<HTMLInputAttributes, "value" | "type"> & {
    value: PhoneDraft;
    onEdit: (value: PhoneDraft) => void;
  } = $props();

  const deletions: Partial<Record<string, PhoneEdit["deletion"]>> = {
    deleteContentBackward: "backward",
    deleteContentForward: "forward",
  };
  let composing = false;
  let selectedBeforeInput = false;
  let composition = $state<string | null>(null);

  function edit(element: HTMLInputElement, change: PhoneEdit) {
    const next = editPhone(value, change, phoneInputText);
    onEdit(next.value);
    element.value = next.text;
    element.setSelectionRange(next.caret, next.caret);
  }

  function copyDigits(event: ClipboardEvent & { currentTarget: HTMLInputElement }) {
    const element = event.currentTarget;
    const text = phoneClipboardText(
      element.value,
      element.selectionStart ?? 0,
      element.selectionEnd ?? 0,
    );
    if (text === undefined || !event.clipboardData) return false;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    return true;
  }
</script>

<input
  {...props}
  type="tel"
  inputmode="tel"
  autocomplete="tel"
  value={composition ?? phoneInputText(value)}
  onbeforeinput={(event) => {
    selectedBeforeInput = event.currentTarget.selectionStart !== event.currentTarget.selectionEnd;
  }}
  oncompositionstart={(event) => {
    composing = true;
    composition = event.currentTarget.value;
  }}
  oncompositionend={(event) => {
    composing = false;
    composition = null;
    const element = event.currentTarget;
    edit(element, { text: element.value, caret: element.selectionStart ?? element.value.length });
  }}
  oninput={(event) => {
    const element = event.currentTarget;
    const selected = selectedBeforeInput;
    selectedBeforeInput = false;
    if ((event instanceof InputEvent && event.isComposing) || composing) {
      composition = element.value;
      return;
    }
    edit(element, {
      text: element.value,
      caret: element.selectionStart ?? element.value.length,
      deletion: !selected && event instanceof InputEvent ? deletions[event.inputType] : undefined,
    });
  }}
  oncopy={copyDigits}
  oncut={(event) => {
    const element = event.currentTarget;
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? start;
    if (props.disabled || props.readonly || !copyDigits(event)) return;
    edit(element, { text: element.value.slice(0, start) + element.value.slice(end), caret: start });
  }}
/>
