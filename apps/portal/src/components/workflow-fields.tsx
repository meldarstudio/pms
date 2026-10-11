import { useId } from "react"
import { format, parseISO } from "date-fns"
import { DateField } from "@/components/date-field"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  disabled?: boolean
  min?: number | string
  max?: number | string
  required?: boolean
  placeholder?: string
  error?: string
}) {
  const id = useId()
  if (type === "date") {
    return (
      <DateField
        id={id}
        label={label}
        value={value ? parseISO(String(value)) : null}
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        locked={disabled}
        error={error}
        disabled={[
          ...(min ? [{ before: parseISO(String(min)) }] : []),
          ...(max ? [{ after: parseISO(String(max)) }] : []),
        ]}
        onChange={(date) => onChange(format(date, "yyyy-MM-dd"))}
      />
    )
  }
  return (
    <Field data-disabled={disabled} data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {type === "textarea" ? (
        <Textarea
          id={id}
          value={value}
          required={required}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          maxLength={typeof max === "number" ? max : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          min={min}
          max={max}
          required={required}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
export function ChoiceField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  hideLabel = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; disabled?: boolean }[]
  disabled?: boolean
  hideLabel?: boolean
}) {
  const id = useId()
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </FieldLabel>
      <Select
        items={options}
        value={value}
        onValueChange={(v) => v !== null && onChange(v)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
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
    </Field>
  )
}
