export type FieldErrors = Record<string, string | null>;

export function focusFirstError(form: HTMLFormElement, errors: FieldErrors) {
  requestAnimationFrame(() => {
    if (!form.isConnected) return;
    const control = Array.from(form.querySelectorAll<HTMLElement>("[id]")).find(
      (element) => errors[element.id] && !element.matches(":disabled"),
    );
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({ block: "nearest" });
  });
}
