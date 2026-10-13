import { useEffect, useId, useRef, useState } from "react"
import { useSelector } from "@tanstack/react-form"
import { useReservationForm, blurThenChange } from "@/lib/reservation-form"
import { errorMessage } from "@/lib/form-errors"
import { discountSchema } from "@/lib/reservation-form-schemas"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Field, FieldError } from "@/components/ui/field"
import { toastError } from "@/lib/toast"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import type { ReservationDetail } from "@/lib/api"
import { formatMajor, formatMoney, parseMajorToCents } from "@/lib/money"

const amountColumn = "w-24 shrink-0 text-right tabular-nums"

export type BookingSummaryRoom = {
  key: string
  typeName: string
  adults: number | null
  children: number | null
  charges: Pick<
    ReservationDetail["rooms"][number],
    "subtotalCents" | "discountCents" | "totalCents"
  >
}

export function BookingSummary({
  rooms,
  cancelled,
  summary,
  paidCents,
  currency,
  stayLabel,
  showPayments,
  message,
  editableDiscountCents,
  discountDisabled = false,
  onDiscountSave,
  onDiscountDirtyChange,
}: {
  rooms: BookingSummaryRoom[]
  cancelled: boolean
  summary: Pick<
    ReservationDetail,
    "subtotalCents" | "discountCents" | "totalCents" | "balanceCents"
  > | null
  paidCents: number
  currency: string
  stayLabel: string | null
  showPayments: boolean
  message: string | null
  editableDiscountCents?: number
  discountDisabled?: boolean
  onDiscountSave?: (amountCents: number) => Promise<void>
  onDiscountDirtyChange?: (dirty: boolean) => void
}) {
  const titleId = useId()
  const credit = summary !== null && summary.balanceCents < 0

  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h3 id={titleId}>Resumen de reserva</h3>
          </CardTitle>
          {stayLabel && <CardDescription>{stayLabel}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-4">
            {(cancelled ? [] : rooms).map((room, index) => (
              <RoomSummary
                key={room.key}
                room={room}
                index={index}
                currency={currency}
              />
            ))}
          </div>
          <Separator />
          <dl className="flex flex-col gap-2">
            <SummaryRow
              label="Importe habitaciones"
              cents={summary?.subtotalCents ?? null}
              currency={currency}
            />
            {onDiscountSave ? (
              <DiscountInput
                amountCents={editableDiscountCents ?? 0}
                disabled={discountDisabled}
                onSave={onDiscountSave}
                onDirtyChange={onDiscountDirtyChange}
              />
            ) : !summary || summary.discountCents > 0 ? (
              <SummaryRow
                label="Descuentos"
                cents={summary ? -summary.discountCents : null}
                currency={currency}
              />
            ) : null}
          </dl>
          {showPayments ? (
            <dl className="flex flex-col gap-2">
              <SummaryRow
                label="Total de reserva"
                cents={summary?.totalCents ?? null}
                currency={currency}
              />
              <SummaryRow
                label="Pagado"
                cents={paidCents}
                currency={currency}
              />
            </dl>
          ) : null}
          {!summary && message ? (
            <p role="status" className="text-muted-foreground">
              {message}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <dl className="w-full text-sm font-semibold">
            <SummaryRow
              label={
                showPayments
                  ? credit
                    ? "Saldo a favor"
                    : "Saldo pendiente"
                  : "Total de reserva"
              }
              cents={
                summary
                  ? showPayments
                    ? Math.abs(summary.balanceCents)
                    : summary.totalCents
                  : null
              }
              currency={currency}
            />
          </dl>
        </CardFooter>
      </Card>
    </section>
  )
}

function discountDraft(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : formatMajor(cents)
}

function DiscountInput({
  amountCents,
  disabled,
  onSave,
  onDirtyChange,
}: {
  amountCents: number
  disabled: boolean
  onSave: (amountCents: number) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [defaults] = useState(() => ({ amount: discountDraft(amountCents) }))
  const focused = useRef(false)
  const errorId = useId()
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: discountSchema },
    onSubmit: async ({ value }) => {
      if (disabled) return
      const cents = parseMajorToCents(
        discountSchema.parse(value).amount.trim() || "0"
      )!
      if (cents === amountCents) {
        form.reset({ amount: discountDraft(cents) })
        return
      }
      try {
        await onSave(cents)
        form.reset({ amount: discountDraft(cents) })
      } catch (cause) {
        toastError("No se pudo guardar el descuento", cause)
      }
    },
  })
  const value = useSelector(form.store, (state) => state.values.amount)
  const saving = useSelector(form.store, (state) => state.isSubmitting)
  useEffect(() => {
    onDirtyChange?.(
      parseMajorToCents(value.trim() || "0") !== amountCents || saving
    )
  }, [value, amountCents, saving, onDirtyChange])
  useEffect(() => {
    if (
      !focused.current &&
      form.state.isDefaultValue &&
      !form.state.isSubmitting
    )
      form.reset({ amount: discountDraft(amountCents) })
  }, [amountCents, form])

  return (
    <form.Field name="amount">
      {(field) => {
        const error =
          field.state.meta.isBlurred || form.state.submissionAttempts
            ? errorMessage(field.state.meta.errors)
            : undefined
        return (
          <>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-center gap-4">
              <dt className="min-w-0 wrap-anywhere">Descuento</dt>
              <dd>
                <Field
                  className="w-24"
                  data-invalid={Boolean(error) || undefined}
                >
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>S/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      aria-label="Descuento en soles"
                      aria-invalid={Boolean(error) || undefined}
                      aria-describedby={error ? errorId : undefined}
                      autoComplete="off"
                      className="px-2 text-right tabular-nums"
                      inputMode="decimal"
                      value={value}
                      disabled={disabled || saving}
                      onFocus={() => {
                        focused.current = true
                      }}
                      onChange={(event) => {
                        field.handleChange(event.target.value)
                      }}
                      onBlur={() => {
                        focused.current = false
                        field.handleBlur()
                        void form.handleSubmit()
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          event.currentTarget.blur()
                        }
                      }}
                    />
                  </InputGroup>
                </Field>
              </dd>
            </div>
            {error ? (
              <FieldError id={errorId} className="col-span-2">
                {error}
              </FieldError>
            ) : null}
          </>
        )
      }}
    </form.Field>
  )
}

function RoomSummary({
  room,
  index,
  currency,
}: {
  room: BookingSummaryRoom
  index: number
  currency: string
}) {
  const guests =
    room.adults === null || room.children === null
      ? "Revisa el número de huéspedes"
      : `${room.adults} ${room.adults === 1 ? "adulto" : "adultos"}${room.children > 0 ? ` · ${room.children} ${room.children === 1 ? "niño" : "niños"}` : ""}`

  return (
    <section
      aria-label={`Habitación ${index + 1}: ${room.typeName}`}
      className="flex min-w-0 flex-col gap-1"
    >
      <dl>
        <SummaryRow
          label={room.typeName}
          cents={room.charges.totalCents}
          currency={currency}
        />
      </dl>
      <p className="text-xs text-muted-foreground">{guests}</p>
    </section>
  )
}

function SummaryRow({
  label,
  cents,
  currency,
}: {
  label: string
  cents: number | null
  currency: string
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-baseline gap-4">
      <dt className="min-w-0 wrap-anywhere">{label}</dt>
      <dd className={amountColumn}>
        {cents === null ? (
          <span aria-label="No disponible">...</span>
        ) : (
          formatMoney(cents === 0 ? 0 : cents, currency)
        )}
      </dd>
    </div>
  )
}
