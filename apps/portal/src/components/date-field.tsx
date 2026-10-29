import { useState, type ComponentProps } from "react";
import { format } from "@/lib/dates";
import { CalendarIcon } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { PropertyDatePicker } from "@/components/property-date-picker";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PickerTodayFooter } from "@/components/picker-today-footer";

export function DateField({
  id,
  label,
  hideLabel = false,
  value,
  disabled,
  locked,
  error,
  onBlur,
  onChange,
  onToday,
}: {
  id: string;
  label: string;
  hideLabel?: boolean;
  value: Date | null;
  disabled?: ComponentProps<typeof PropertyDatePicker>["disabled"];
  locked?: boolean;
  error?: string | null;
  onBlur?: () => void;
  onChange: (date: Date) => void;
  onToday?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Field data-invalid={Boolean(error) || undefined} data-disabled={locked || undefined}>
      <FieldLabel htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </FieldLabel>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onBlur?.();
        }}
      >
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              className="w-full justify-between font-normal"
              disabled={locked}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onBlur={() => {
                if (!open) onBlur?.();
              }}
            />
          }
        >
          {value ? format(value, "d MMM yyyy") : "Seleccionar fecha"}
          <CalendarIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent className="w-auto gap-0 p-0" align="start">
          <PropertyDatePicker
            mode="single"
            selected={value ?? undefined}
            defaultMonth={value ?? undefined}
            disabled={disabled}
            onSelect={(date) => {
              if (!date) return;
              onChange(date);
              setOpen(false);
              onBlur?.();
            }}
          />
          {onToday ? (
            <PickerTodayFooter
              onToday={() => {
                onToday();
                setOpen(false);
                onBlur?.();
              }}
            />
          ) : null}
        </PopoverContent>
      </Popover>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}
