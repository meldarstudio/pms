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
  id: providedId,
  name,
  onBlur,
  groupErrorId,
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
  id?: string
  name?: string
  onBlur?: () => void
  groupErrorId?: string
}) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  if (type === "date") {
    return (
      <DateField
        id={id}
        label={label}
        value={value ? parseISO(String(value)) : null}
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        locked={disabled}
        error={error}
        onBlur={onBlur}
        disabled={[
          ...(min ? [{ before: parseISO(String(min)) }] : []),
          ...(max ? [{ after: parseISO(String(max)) }] : []),
        ]}
        onChange={(date) => onChange(format(date, "yyyy-MM-dd"))}
      />
    )
  }
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
            [error ? `${id}-error` : undefined, groupErrorId]
              .filter(Boolean)
              .join(" ") || undefined
          }
          maxLength={typeof max === "number" ? max : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          name={name}
          onBlur={onBlur}
          type={type}
          value={value}
          min={min}
          max={max}
          required={required}
          placeholder={placeholder}
          aria-invalid={!!error || !!groupErrorId}
          aria-describedby={
            [error ? `${id}-error` : undefined, groupErrorId]
              .filter(Boolean)
              .join(" ") || undefined
          }
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
  error,
  id: providedId,
  name,
  onBlur,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; disabled?: boolean }[]
  disabled?: boolean
  hideLabel?: boolean
  error?: string
  id?: string
  name?: string
  onBlur?: () => void
}) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  return (
    <Field data-disabled={disabled} data-invalid={!!error}>
      <FieldLabel htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </FieldLabel>
      <Select
        items={options}
        name={name}
        value={value}
        onValueChange={(v) => v !== null && onChange(v)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        >
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
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
