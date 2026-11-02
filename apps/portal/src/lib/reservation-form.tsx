import { useId, type ComponentProps, type FormEvent } from "react";
import { createFormHook, createFormHookContexts, useSelector } from "@tanstack/react-form";
import {
  TextField,
  ChoiceCardField,
  ChoiceField,
  PhoneField,
  RadioField,
} from "@/components/workflow-fields";
import type { PhoneValue } from "./phone";
import { errorMessage } from "./form-errors";
import { Button } from "@/components/ui/button";
import { Undo2Icon } from "lucide-react";
export { blurThenChange } from "./reservation-form-state";

const { fieldContext, formContext, useFieldContext } = createFormHookContexts();

function useFormControl<T>(live = false) {
  const field = useFieldContext<T>();
  const id = useId();
  const attempted = useSelector(field.form.store, (state) => state.submissionAttempts > 0);
  const reveal =
    live ||
    (field.state.meta.isBlurred && field.state.meta.isDirty) ||
    attempted ||
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

function FormRadio(
  props: Omit<ComponentProps<typeof RadioField>, "value" | "onChange" | "error"> & {
    onValueChange?: (value: string, previous: string) => void;
  },
) {
  const { value, onChange, onBlur: _blur, ...control } = useFormControl<string>();
  const { onValueChange, ...rest } = props;
  return (
    <RadioField
      {...rest}
      {...control}
      value={value}
      onChange={(next) => {
        onChange(next);
        onValueChange?.(next, value);
      }}
    />
  );
}

function FormChoiceCards(
  props: Omit<ComponentProps<typeof ChoiceCardField>, "value" | "onChange" | "error">,
) {
  const { onBlur: _blur, ...control } = useFormControl<string>();
  return <ChoiceCardField {...props} {...control} />;
}

function FormNightlyPrice({ onUndo }: { onUndo?: () => void }) {
  const control = useFormControl<string | undefined>();
  const field = useFieldContext<string | undefined>();
  if (control.value === undefined) return null;
  return (
    <div className="min-w-0 md:max-w-64">
      <TextField
        {...control}
        value={control.value}
        label="Precio por noche · S/"
        inputMode="decimal"
        action={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Deshacer precio por noche"
            title="Deshacer precio por noche"
            onClick={() => {
              control.onChange(undefined);
              field.setMeta((meta) => ({ ...meta, isBlurred: false, errorMap: {} }));
              onUndo?.();
            }}
          >
            <Undo2Icon />
          </Button>
        }
      />
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
    Radio: FormRadio,
    ChoiceCards: FormChoiceCards,
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
