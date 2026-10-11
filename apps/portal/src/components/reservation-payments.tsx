import { useId, useRef, useState, type FormEvent } from "react"
import { isValid, parseISO } from "date-fns"
import { format } from "@/lib/dates"

import { DateField } from "@/components/date-field"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type {
  PaymentMethod,
  RecordPaymentInput,
  ReservationDetail,
} from "@/lib/api"
import { CURRENCY, formatMoney, parseMajorToCents } from "@/lib/money"
import { useFieldValidation } from "@/lib/use-field-validation"

const methods: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia / Depósito" },
  { value: "yape", label: "Yape" },
  { value: "other", label: "Otro" },
]

function localNow() {
  return format(new Date(), "yyyy-MM-dd")
}

export function ReservationPayments({
  formId,
  reservation,
  pending,
  onError,
  onRecord,
}: {
  formId: string
  reservation: ReservationDetail
  pending: boolean
  onError: (error: string | null) => void
  onRecord: (body: RecordPaymentInput) => Promise<ReservationDetail>
}) {
  const historyId = useId()
  const summaryId = useId()
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [paidAt, setPaidAt] = useState(localNow)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [recorded, setRecorded] = useState(false)
  const submitting = useRef(false)
  const amountCents = parseMajorToCents(amount.trim())
  const invalidAmount =
    amountCents === null || amountCents <= 0
      ? "Ingresa un importe mayor que cero con hasta dos decimales."
      : null
  const paidAtDate = parseISO(paidAt)
  const invalidDate =
    !isValid(paidAtDate) || format(paidAtDate, "yyyy-MM-dd") !== paidAt
      ? "Ingresa una fecha de pago válida."
      : null
  const credit = reservation.balanceCents < 0
  const validation = useFieldValidation({
    [`${formId}-amount`]: invalidAmount,
    [`${formId}-paid-at`]: invalidDate,
  })
  const amountError = validation.errorFor(`${formId}-amount`)
  const dateError = validation.errorFor(`${formId}-paid-at`)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || submitting.current) return
    onError(null)
    setRecorded(false)
    if (!validation.validate(event.currentTarget)) return
    submitting.current = true
    try {
      await onRecord({
        amountCents: amountCents!,
        method,
        paidAt,
        ...(reference.trim()
          ? { reference: reference.trim().toUpperCase() }
          : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
      setAmount("")
      setReference("")
      setNotes("")
      setPaidAt(localNow())
      validation.reset()
      setRecorded(true)
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "No se pudo registrar el pago."
      )
    } finally {
      submitting.current = false
    }
  }

  return (
    <div className="grid gap-6 py-5 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <form id={formId} onSubmit={submit} noValidate aria-busy={pending}>
          <FieldSet>
            <FieldLegend>Registrar pago</FieldLegend>
            <FieldGroup className="gap-3">
              <FieldGroup className="grid grid-cols-2 gap-3">
                <Field data-invalid={Boolean(amountError) || undefined}>
                  <FieldLabel htmlFor={`${formId}-amount`}>Importe</FieldLabel>
                  <Input
                    id={`${formId}-amount`}
                    inputMode="decimal"
                    required
                    value={amount}
                    disabled={pending}
                    aria-invalid={Boolean(amountError) || undefined}
                    aria-describedby={
                      amountError ? `${formId}-amount-error` : undefined
                    }
                    onBlur={() => validation.touch(`${formId}-amount`)}
                    onChange={(event) => {
                      setAmount(event.target.value)
                      setRecorded(false)
                    }}
                  />
                  {amountError ? (
                    <FieldError id={`${formId}-amount-error`}>
                      {amountError}
                    </FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-method`}>Método</FieldLabel>
                  <Select
                    items={methods}
                    value={method}
                    disabled={pending}
                    onValueChange={(value) => {
                      if (methods.some((item) => item.value === value))
                        setMethod(value as PaymentMethod)
                    }}
                  >
                    <SelectTrigger id={`${formId}-method`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {methods.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <FieldGroup className="grid gap-3 @sm/field-group:grid-cols-2">
                <DateField
                  id={`${formId}-paid-at`}
                  label="Fecha"
                  value={isValid(paidAtDate) ? paidAtDate : null}
                  timeZone={timeZone}
                  locked={pending}
                  error={dateError}
                  onBlur={() => validation.touch(`${formId}-paid-at`)}
                  onChange={(date) => setPaidAt(format(date, "yyyy-MM-dd"))}
                />
                <Field>
                  <FieldLabel htmlFor={`${formId}-reference`}>
                    Referencia
                  </FieldLabel>
                  <Input
                    id={`${formId}-reference`}
                    maxLength={200}
                    placeholder="Opcional"
                    value={reference}
                    disabled={pending}
                    onChange={(event) =>
                      setReference(event.target.value.toUpperCase())
                    }
                  />
                </Field>
              </FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${formId}-notes`}>
                  Notas del pago
                </FieldLabel>
                <Textarea
                  id={`${formId}-notes`}
                  maxLength={2000}
                  placeholder="Opcional"
                  value={notes}
                  disabled={pending}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
              {recorded ? <p role="status">Pago registrado.</p> : null}
            </FieldGroup>
          </FieldSet>
        </form>

        <section
          aria-labelledby={historyId}
          className="flex min-w-0 flex-col gap-3"
        >
          <h3 id={historyId} className="text-sm font-medium">
            Historial de pagos
          </h3>
          {reservation.payments.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No hay pagos registrados</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {[...reservation.payments].reverse().map((payment) => (
                <li key={payment.id} className="flex flex-col gap-1 border p-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">
                      {payment.amountCents < 0 ? "Reembolso · " : ""}
                      {methods.find((item) => item.value === payment.method)
                        ?.label ?? payment.method}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(payment.amountCents, CURRENCY)}
                    </span>
                  </div>
                  <time
                    dateTime={payment.paidAt}
                    className="text-muted-foreground"
                  >
                    {format(new Date(payment.paidAt), "d MMM yyyy · HH:mm")}
                  </time>
                  {payment.reference ? (
                    <p className="wrap-anywhere text-muted-foreground">
                      Referencia: {payment.reference.toUpperCase()}
                    </p>
                  ) : null}
                  {payment.notes ? (
                    <p className="wrap-anywhere whitespace-pre-wrap">
                      {payment.notes}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby={summaryId} className="min-w-0">
        <Card size="sm">
          <CardHeader>
            <CardTitle>
              <h3 id={summaryId}>Resumen de pagos</h3>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-4">
                <dt>Total de reserva</dt>
                <dd className="tabular-nums">
                  {formatMoney(reservation.totalCents, CURRENCY)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt>Pagado</dt>
                <dd className="tabular-nums">
                  {formatMoney(reservation.paidCents, CURRENCY)}
                </dd>
              </div>
            </dl>
          </CardContent>
          <CardFooter>
            <dl className="w-full text-sm font-semibold">
              <div className="flex items-baseline justify-between gap-4">
                <dt>{credit ? "Saldo a favor" : "Saldo pendiente"}</dt>
                <dd className="tabular-nums">
                  {formatMoney(Math.abs(reservation.balanceCents), CURRENCY)}
                </dd>
              </div>
            </dl>
          </CardFooter>
        </Card>
      </section>
    </div>
  )
}
