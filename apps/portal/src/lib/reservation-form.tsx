import { useId, type ComponentProps, type FormEvent } from "react";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import { TextField, ChoiceField, PhoneField } from "@/components/workflow-fields";
import type { PhoneValue } from "./phone";
import { errorMessage } from "./form-errors";
export { blurThenChange } from "./reservation-form-state";

const { fieldContext, formContext, useFieldContext } = createFormHookContexts();

function FormText({
  live = false,
  ...props
}: Omit<ComponentProps<typeof TextField>, "value" | "onChange" | "error"> & {
  live?: boolean;
}) {
  const field = useFieldContext<string>();
  const id = useId();
  const reveal =
    live ||
    field.state.meta.isBlurred ||
    field.form.state.submissionAttempts > 0 ||
    !!field.state.meta.errorMap.onServer;
  return (
    <TextField
      {...props}
      id={id}
      name={field.name}
      value={field.state.value}
      error={reveal ? errorMessage(field.state.meta.errors) : undefined}
      onBlur={field.handleBlur}
      onChange={(value) => {
        if (field.state.meta.errorMap.onServer)
          field.setMeta((meta) => ({
            ...meta,
            errorMap: { ...meta.errorMap, onServer: undefined },
          }));
        field.handleChange(value);
      }}
    />
  );
}

function FormChoice(
  props: Omit<ComponentProps<typeof ChoiceField>, "value" | "onChange" | "error"> & {
    onValueChange?: (value: string) => void;
    nullable?: boolean;
    blank?: boolean;
  },
) {
  const field = useFieldContext<string | null>();
  const id = useId();
  const { onValueChange, nullable, blank, ...rest } = props;
  const reveal =
    field.state.meta.isBlurred ||
    field.form.state.submissionAttempts > 0 ||
    !!field.state.meta.errorMap.onServer;
  return (
    <ChoiceField
      {...rest}
      id={id}
      name={field.name}
      value={(blank ? field.state.value || "none" : field.state.value) ?? "none"}
      error={reveal ? errorMessage(field.state.meta.errors) : undefined}
      onBlur={field.handleBlur}
      onChange={(value) => {
        if (field.state.meta.errorMap.onServer)
          field.setMeta((meta) => ({
            ...meta,
            errorMap: { ...meta.errorMap, onServer: undefined },
          }));
        field.handleChange(
          nullable && value === "none" ? null : blank && value === "none" ? "" : value,
        );
        onValueChange?.(value);
      }}
    />
  );
}

function FormPhone(
  props: Omit<ComponentProps<typeof PhoneField>, "value" | "onChange" | "error" | "label">,
) {
  const field = useFieldContext<PhoneValue>();
  const id = useId();
  const reveal =
    field.state.meta.isBlurred ||
    field.form.state.submissionAttempts > 0 ||
    !!field.state.meta.errorMap.onServer;
  return (
    <PhoneField
      {...props}
      label="Teléfono · Opcional"
      id={id}
      name={field.name}
      value={field.state.value}
      error={reveal ? errorMessage(field.state.meta.errors) : undefined}
      onBlur={field.handleBlur}
      onChange={(value) => {
        if (field.state.meta.errorMap.onServer)
          field.setMeta((meta) => ({
            ...meta,
            errorMap: { ...meta.errorMap, onServer: undefined },
          }));
        field.handleChange(value);
      }}
    />
  );
}

export const { useAppForm: useReservationForm, withForm: withReservationForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { Text: FormText, Choice: FormChoice, Phone: FormPhone },
  formComponents: {},
});
export async function submitForm(event: FormEvent<HTMLFormElement>, submit: () => Promise<void>) {
  event.preventDefault();
  event.stopPropagation();
  const element = event.currentTarget;
  await submit();
  requestAnimationFrame(() => {
    if (!element.isConnected) return;
    const control = element.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)');
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({ block: "nearest" });
  });
}
