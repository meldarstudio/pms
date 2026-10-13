import { useEffect, useId, useRef, useState } from "react"

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
  const [value, setValue] = useState(() => discountDraft(amountCents))
  const [error, setError] = useState("")
  const focused = useRef(false)
  const saving = useRef(false)
  useEffect(() => {
    if (!focused.current) setValue(discountDraft(amountCents))
  }, [amountCents])

  async function save() {
    focused.current = false
    const cents = parseMajorToCents(value.trim() || "0")
    if (cents === null) {
      setError("Ingresa un importe válido con hasta dos decimales.")
      onDirtyChange?.(true)
      return
    }
    setError("")
    onDirtyChange?.(false)
    if (cents === amountCents || saving.current) return
    saving.current = true
    try {
      await onSave(cents)
      setValue(discountDraft(cents))
    } catch (cause) {
      toastError("No se pudo guardar el descuento", cause)
      onDirtyChange?.(true)
    } finally {
      saving.current = false
    }
  }

  return (
    <>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-center gap-4">
        <dt className="min-w-0 wrap-anywhere">Descuento</dt>
        <dd>
          <Field className="w-24" data-invalid={Boolean(error) || undefined}>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>S/</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Descuento en soles"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "discount-input-error" : undefined}
                autoComplete="off"
                className="px-2 text-right tabular-nums"
                inputMode="decimal"
                value={value}
                disabled={disabled}
                onFocus={() => {
                  focused.current = true
                }}
                onChange={(event) => {
                  setValue(event.target.value)
                  setError("")
                  const cents = parseMajorToCents(
                    event.target.value.trim() || "0"
                  )
                  onDirtyChange?.(cents !== amountCents)
                }}
                onBlur={() => void save()}
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
        <FieldError id="discount-input-error" className="col-span-2">
          {error}
        </FieldError>
      ) : null}
    </>
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
