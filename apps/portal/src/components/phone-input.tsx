import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { editPhone, phoneInputText, type PhoneValue } from "@/lib/phone";

/** A phone mask with digit-anchored editing and an unformatted clipboard. */
export function PhoneInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef<number | null>(null);
  const [composition, setComposition] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (selection.current !== null) {
      input.current?.setSelectionRange(selection.current, selection.current);
      selection.current = null;
    }
  });

  function edit(element: HTMLInputElement, text: string, caret: number, inputType?: string) {
    const next = editPhone(value, text, caret, inputType);
    selection.current = next.caret;
    onChange(next.value);
    // Separator-only edits may leave the form value unchanged and cause no render.
    element.value = next.text;
    element.setSelectionRange(next.caret, next.caret);
  }

  return (
    <Input
      {...props}
      ref={input}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={composition ?? phoneInputText(value)}
      onCompositionStart={(event) => setComposition(event.currentTarget.value)}
      onCompositionEnd={(event) => {
        setComposition(null);
        edit(
          event.currentTarget,
          event.currentTarget.value,
          event.currentTarget.selectionStart ?? event.currentTarget.value.length,
        );
      }}
      onChange={(event) => {
        const element = event.currentTarget;
        const native = event.nativeEvent as InputEvent;
        if (native.isComposing || composition !== null) {
          setComposition(element.value);
          return;
        }
        edit(
          element,
          element.value,
          element.selectionStart ?? element.value.length,
          native.inputType,
        );
      }}
      onCopy={(event) => {
        const element = event.currentTarget;
        if (!/^\+?[\d\s().-]+$/.test(element.value)) return;
        const selected = element.value.slice(
          element.selectionStart ?? 0,
          element.selectionEnd ?? 0,
        );
        if (!selected) return;
        event.clipboardData.setData("text/plain", selected.replace(/\D/g, ""));
        event.preventDefault();
      }}
      onCut={(event) => {
        const element = event.currentTarget;
        if (props.disabled || props.readOnly || !/^\+?[\d\s().-]+$/.test(element.value)) return;
        const start = element.selectionStart ?? 0;
        const end = element.selectionEnd ?? start;
        if (start === end) return;
        event.clipboardData.setData(
          "text/plain",
          element.value.slice(start, end).replace(/\D/g, ""),
        );
        event.preventDefault();
        edit(
          element,
          element.value.slice(0, start) + element.value.slice(end),
          start,
          "deleteByCut",
        );
      }}
    />
  );
}
