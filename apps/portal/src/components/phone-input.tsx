import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentProps,
} from "react";
import { Input } from "@/components/ui/input";
import { phoneInputText, type PhoneValue } from "@/lib/phone";
import { editPhone, phoneClipboardText, type PhoneEdit } from "@/lib/phone-mask";

const deletions: Partial<Record<string, PhoneEdit["deletion"]>> = {
  deleteContentBackward: "backward",
  deleteContentForward: "forward",
};

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
  // Refs rather than state: an input event can arrive before React renders the previous one.
  const composing = useRef(false);
  const selectedBeforeInput = useRef(false);
  const [composition, setComposition] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (selection.current !== null) {
      input.current?.setSelectionRange(selection.current, selection.current);
      selection.current = null;
    }
  });

  // React's onBeforeInput omits deletions, so read the selection from the native event.
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const recordSelection = () => {
      selectedBeforeInput.current = element.selectionStart !== element.selectionEnd;
    };
    element.addEventListener("beforeinput", recordSelection);
    return () => element.removeEventListener("beforeinput", recordSelection);
  }, []);

  function edit(element: HTMLInputElement, change: PhoneEdit) {
    const next = editPhone(value, change);
    selection.current = next.caret;
    onChange(next.value);
    // Separator-only edits may leave the form value unchanged and cause no render.
    element.value = next.text;
    element.setSelectionRange(next.caret, next.caret);
  }

  /** Puts the selection's digits on the clipboard; false leaves the browser's own copy. */
  function copyDigits(event: ClipboardEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const text = phoneClipboardText(
      element.value,
      element.selectionStart ?? 0,
      element.selectionEnd ?? 0,
    );
    if (text === undefined) return false;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    return true;
  }

  return (
    <Input
      {...props}
      ref={input}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={composition ?? phoneInputText(value)}
      onCompositionStart={(event) => {
        composing.current = true;
        setComposition(event.currentTarget.value);
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        setComposition(null);
        const element = event.currentTarget;
        edit(element, {
          text: element.value,
          caret: element.selectionStart ?? element.value.length,
        });
      }}
      onChange={(event) => {
        const element = event.currentTarget;
        const native = event.nativeEvent as InputEvent;
        const selected = selectedBeforeInput.current;
        selectedBeforeInput.current = false;
        if (native.isComposing || composing.current) {
          setComposition(element.value);
          return;
        }
        edit(element, {
          text: element.value,
          caret: element.selectionStart ?? element.value.length,
          deletion: selected ? undefined : deletions[native.inputType],
        });
      }}
      onCopy={copyDigits}
      onCut={(event) => {
        const element = event.currentTarget;
        const start = element.selectionStart ?? 0;
        const end = element.selectionEnd ?? start;
        if (props.disabled || props.readOnly || !copyDigits(event)) return;
        edit(element, {
          text: element.value.slice(0, start) + element.value.slice(end),
          caret: start,
        });
      }}
    />
  );
}
