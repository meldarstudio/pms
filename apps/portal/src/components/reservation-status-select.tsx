import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  commonStatus,
  planBulkStatus,
  statusOptions,
  type RoomStatus,
  type StatusRoom,
} from "@/lib/reservation-status"

export function ReservationStatusSelect({
  id,
  rooms,
  choice,
  disabled,
  onChange,
}: {
  id: string
  rooms: StatusRoom[]
  choice: RoomStatus | null
  disabled: boolean
  onChange: (status: RoomStatus | null) => void
}) {
  const baseline = commonStatus(rooms)
  const value = choice ?? baseline
  const items =
    baseline === "mixed"
      ? [{ value: "mixed", label: "Estados mixtos" }, ...statusOptions]
      : statusOptions
  const plans = Object.fromEntries(
    statusOptions.map((option) => [
      option.value,
      planBulkStatus(rooms, option.value),
    ])
  ) as Record<RoomStatus, ReturnType<typeof planBulkStatus>>
  const plan = choice ? plans[choice] : null
  const invalid = plan !== null && !plan.ok

  return (
    <Field data-invalid={plan && !plan.ok ? true : undefined}>
      <FieldLabel htmlFor={id}>Estado de la reserva</FieldLabel>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          const status = statusOptions.find((item) => item.value === next)
          if (!status) return
          onChange(status.value === baseline ? null : status.value)
        }}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-describedby={invalid ? `${id}-error` : undefined}
          aria-invalid={plan && !plan.ok ? true : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => {
              const known = statusOptions.find(
                (option) => option.value === item.value
              )
              const itemPlan = known ? plans[known.value] : null
              const unavailable =
                !known ||
                (known.value !== baseline && itemPlan !== null && !itemPlan.ok)
              return (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  disabled={unavailable}
                >
                  {item.label}
                </SelectItem>
              )
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
      {plan && !plan.ok ? (
        <FieldError id={`${id}-error`}>{plan.reason}</FieldError>
      ) : null}
    </Field>
  )
}
