import { useId, type ComponentProps, type FormEvent } from "react";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import { TextField, ChoiceField, PhoneField } from "@/components/workflow-fields";
import type { PhoneValue } from "./phone";
import { errorMessage } from "./form-errors";
import { Button } from "@/components/ui/button";
import { Undo2Icon } from "lucide-react";
export { blurThenChange } from "./reservation-form-state";

const { fieldContext, formContext, useFieldContext } = createFormHookContexts();

function useFormControl<T>(live = false) {
  const field = useFieldContext<T>();
  const id = useId();
  const reveal =
    live ||
    field.state.meta.isBlurred ||
    field.form.state.submissionAttempts > 0 ||
    !!field.state.meta.errorMap.onServer;
  return {
    id,
    name: field.name,
    value: field.state.value,
    error: reveal ? errorMessage(field.state.meta.errors) : undefined,
    onBlur: field.handleBlur,
    onChange: (value: T) => {
      if (field.state.meta.errorMap.onServer)
        field.setMeta((meta) => ({
          ...meta,
          errorMap: { ...meta.errorMap, onServer: undefined },
        }));
      field.handleChange(value);
    },
  };
}

function FormText({
  live = false,
  ...props
}: Omit<ComponentProps<typeof TextField>, "value" | "onChange" | "error"> & {
  live?: boolean;
}) {
  const control = useFormControl<string>(live);
  return <TextField {...props} {...control} />;
}

function FormChoice(
  props: Omit<ComponentProps<typeof ChoiceField>, "value" | "onChange" | "error"> & {
    onValueChange?: (value: string) => void;
    nullable?: boolean;
    blank?: boolean;
  },
) {
  const { value, onChange, ...control } = useFormControl<string | null>();
  const { onValueChange, nullable, blank, ...rest } = props;
  return (
    <ChoiceField
      {...rest}
      {...control}
      value={(blank ? value || "none" : value) ?? "none"}
      onChange={(value) => {
        onChange(nullable && value === "none" ? null : blank && value === "none" ? "" : value);
        onValueChange?.(value);
      }}
    />
  );
}

function FormNightlyPrice() {
  const control = useFormControl<string | undefined>();
  const field = useFieldContext<string | undefined>();
  if (control.value === undefined)
    return (
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="max-md:w-full"
        onClick={() => control.onChange("")}
      >
        Cambiar precio por noche
      </Button>
    );
  return (
    <div className="flex min-w-0 items-start gap-1">
      <div className="min-w-0 max-w-56 flex-1">
        <TextField
          {...control}
          value={control.value}
          label="Precio por noche · S/"
          inputMode="decimal"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="mt-5"
        aria-label="Deshacer precio por noche"
        onClick={() => {
          control.onChange(undefined);
          field.setMeta((meta) => ({ ...meta, isBlurred: false, errorMap: {} }));
        }}
      >
        <Undo2Icon />
      </Button>
    </div>
  );
}

function FormPhone(
  props: Omit<ComponentProps<typeof PhoneField>, "value" | "onChange" | "error" | "label">,
) {
  const control = useFormControl<PhoneValue>();
  return <PhoneField {...props} {...control} label="Teléfono · Opcional" />;
}

export const { useAppForm: useReservationForm, withForm: withReservationForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    Text: FormText,
    Choice: FormChoice,
    Phone: FormPhone,
    NightlyPrice: FormNightlyPrice,
  },
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
