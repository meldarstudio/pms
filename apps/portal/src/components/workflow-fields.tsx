import { useId, useRef, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { DateField } from "@/components/date-field";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { choosePhoneCountry, phoneCountries, phoneCountry, type PhoneValue } from "@/lib/phone";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
  min,
  max,
  required = false,
  placeholder,
  error,
  id: providedId,
  name,
  onBlur,
  groupErrorId,
  inputMode,
  action,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  min?: number | string;
  max?: number | string;
  required?: boolean;
  placeholder?: string;
  error?: string;
  id?: string;
  name?: string;
  onBlur?: () => void;
  groupErrorId?: string;
  inputMode?: "decimal";
  action?: ReactNode;
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  if (type === "date") {
    return (
      <DateField
        id={id}
        label={label}
        value={value ? parseISO(String(value)) : null}
        locked={disabled}
        error={error}
        onBlur={onBlur}
        disabled={[
          ...(min ? [{ before: parseISO(String(min)) }] : []),
          ...(max ? [{ after: parseISO(String(max)) }] : []),
        ]}
        onChange={(date) => onChange(format(date, "yyyy-MM-dd"))}
      />
    );
  }
  const input = (
    <Input
      id={id}
      name={name}
      onBlur={onBlur}
      type={type}
      inputMode={inputMode}
      value={value}
      min={min}
      max={max}
      required={required}
      placeholder={placeholder}
      aria-invalid={!!error || !!groupErrorId}
      aria-describedby={
        [error ? `${id}-error` : undefined, groupErrorId].filter(Boolean).join(" ") || undefined
      }
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  return (
    <Field data-disabled={disabled} data-invalid={!!error || !!groupErrorId}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {type === "textarea" ? (
        <Textarea
          id={id}
          name={name}
          onBlur={onBlur}
          value={value}
          required={required}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={!!error || !!groupErrorId}
          aria-describedby={
            [error ? `${id}-error` : undefined, groupErrorId].filter(Boolean).join(" ") || undefined
          }
          maxLength={typeof max === "number" ? max : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : action ? (
        <div className="flex min-w-0 items-center gap-2">
          {input}
          {action}
        </div>
      ) : (
        input
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}
export function ChoiceField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  hideLabel = false,
  error,
  id: providedId,
  name,
  onBlur,
  groupErrorId,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
  hideLabel?: boolean;
  error?: string;
  id?: string;
  name?: string;
  onBlur?: () => void;
  groupErrorId?: string;
  placeholder?: string;
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const menuOpen = useRef(false);
  return (
    <Field data-disabled={disabled} data-invalid={!!error || !!groupErrorId}>
      <FieldLabel htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </FieldLabel>
      <Select
        items={options}
        name={name}
        value={value || null}
        onValueChange={(v) => v !== null && onChange(v)}
        onOpenChange={(open) => {
          menuOpen.current = open;
          if (!open) onBlur?.();
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          onBlur={() => {
            if (!menuOpen.current) onBlur?.();
          }}
          aria-invalid={!!error || !!groupErrorId}
          aria-describedby={groupErrorId ?? (error ? `${id}-error` : undefined)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error && !groupErrorId && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}

export function RadioField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  error,
  id: providedId,
  name,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  error?: string;
  id?: string;
  name?: string;
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <FieldSet data-disabled={disabled} data-invalid={!!error}>
      <FieldLegend variant="label">{label}</FieldLegend>
      <RadioGroup
        name={name}
        value={value}
        disabled={disabled}
        onValueChange={(next) => typeof next === "string" && onChange(next)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {options.map((option, index) => (
          <Field key={option.value} orientation="horizontal">
            <RadioGroupItem id={`${id}-${index}`} value={option.value} />
            <FieldLabel htmlFor={`${id}-${index}`}>{option.label}</FieldLabel>
          </Field>
        ))}
      </RadioGroup>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </FieldSet>
  );
}

export function ChoiceCardField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  error,
  id: providedId,
  name,
  className,
  optionsClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string }[];
  className?: string;
  optionsClassName?: string;
  disabled?: boolean;
  error?: string;
  id?: string;
  name?: string;
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <FieldSet data-disabled={disabled} data-invalid={!!error} className={className}>
      <FieldLegend variant="label">{label}</FieldLegend>
      <RadioGroup
        className={optionsClassName}
        name={name}
        value={value}
        disabled={disabled}
        onValueChange={(next) => typeof next === "string" && onChange(next)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {options.map((option, index) => (
          <FieldLabel key={option.value} htmlFor={`${id}-${index}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{option.label}</FieldTitle>
                {option.description && <FieldDescription>{option.description}</FieldDescription>}
              </FieldContent>
              <RadioGroupItem id={`${id}-${index}`} value={option.value} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </FieldSet>
  );
}

export function ChoiceCardsSkeleton({
  label,
  loadingLabel,
  cards,
  className,
  optionsClassName,
}: {
  label: string;
  loadingLabel: string;
  cards: { title: string; lines: string[] }[];
  className?: string;
  optionsClassName?: string;
}) {
  return (
    <FieldSet aria-busy className={className}>
      <FieldLegend variant="label">{label}</FieldLegend>
      <p role="status" className="sr-only">
        {loadingLabel}
      </p>
      <div aria-hidden className={cn("grid w-full gap-2", optionsClassName)}>
        {cards.map((card, index) => (
          <FieldLabel key={index}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>
                  <Skeleton className={cn("inline-block h-lh align-top", card.title)} />
                </FieldTitle>
                <FieldDescription>
                  {card.lines.map((line, lineIndex) => (
                    <Skeleton key={lineIndex} className={cn("h-lh align-top", line)} />
                  ))}
                </FieldDescription>
              </FieldContent>
              <Skeleton className="size-4 shrink-0 rounded-full" />
            </Field>
          </FieldLabel>
        ))}
      </div>
    </FieldSet>
  );
}

type PhoneCountry = (typeof phoneCountries)[number];

export function PhoneField({
  label,
  value,
  onChange,
  disabled = false,
  error,
  id: providedId,
  name,
  onBlur,
}: {
  label: string;
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  disabled?: boolean;
  error?: string;
  id?: string;
  name?: string;
  onBlur?: () => void;
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const country = phoneCountry(value.country);
  return (
    <Field data-disabled={disabled} data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <ButtonGroup className="w-full">
        <Combobox<PhoneCountry>
          items={phoneCountries}
          value={country}
          onValueChange={(next) => {
            if (next) onChange(choosePhoneCountry(value, next.code));
          }}
          onOpenChange={(open) => {
            if (!open) onBlur?.();
          }}
          itemToStringLabel={(item) => `${item.name} ${item.callingCode}`}
          isItemEqualToValue={(item, selected) => item.code === selected.code}
          disabled={disabled}
        >
          <ComboboxTrigger
            render={<Button type="button" variant="outline" />}
            aria-label={`País del teléfono: ${country.name} ${country.callingCode}`}
          >
            {country.code} {country.callingCode}
          </ComboboxTrigger>
          <ComboboxContent className="w-64">
            <ComboboxInput showTrigger={false} placeholder="Buscar país" aria-label="Buscar país" />
            <ComboboxEmpty>No se encontró el país.</ComboboxEmpty>
            <ComboboxList>
              {(item: PhoneCountry) => (
                <ComboboxItem key={item.code} value={item}>
                  {item.name} {item.callingCode}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <PhoneInput
          id={id}
          name={name}
          value={value}
          disabled={disabled}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={onChange}
        />
      </ButtonGroup>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}
