import { useEffect, useMemo, useState } from "react"
import { useSelector } from "@tanstack/react-form"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import type { ReservationDetail, StayingGuest, WorkflowAction } from "@/lib/api"
import { serverFieldErrors } from "@/lib/api-error"
import { setServerErrors } from "@/lib/form-errors"
import {
  useReservationForm,
  blurThenChange,
  submitForm,
} from "@/lib/reservation-form"
import {
  guestSchema,
  guestDefaults,
  guestPayload,
  paymentSchema,
  paymentDefaults,
  paymentPayload,
  utcToday,
  type GuestValues,
  type PaymentValues,
} from "@/lib/reservation-form-schemas"
import { toast, toastError } from "@/lib/toast"

export const paymentMethods = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "yape", label: "Yape" },
  { value: "other", label: "Otro" },
]

export function GuestEntryForm({
  detail,
  guest,
  disabled,
  onSave,
  onDirtyChange,
  onDone,
  onCancel,
}: {
  detail: ReservationDetail
  guest?: StayingGuest
  disabled: boolean
  onSave: (guests: StayingGuest[]) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
  onDone?: () => void
  onCancel?: () => void
}) {
  const [defaults, setDefaults] = useState<GuestValues>(() =>
    guest
      ? guestDefaults(guest)
      : {
          id: crypto.randomUUID(),
          fullName: "",
          email: "",
          phone: "",
          documentType: "",
          documentNumber: "",
          reservationRoomId:
            detail.rooms.length === 1 ? detail.rooms[0].id : null,
        }
  )
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: guestSchema },
    onSubmit: async ({ value }) => {
      if (disabled) return
      try {
        const payload = guestPayload(value)
        await onSave(
          guest
            ? detail.stayingGuests.map((entry) =>
                entry.id === guest.id ? payload : entry
              )
            : [...detail.stayingGuests, payload]
        )
        const next = guest
          ? guestDefaults(payload)
          : { ...defaults, id: crypto.randomUUID() }
        setDefaults(next)
        form.reset(next)
        toast.add({
          title: guest ? "Huésped actualizado" : "Huésped agregado",
          type: "success",
        })
        onDone?.()
      } catch (cause) {
        const fields = serverFieldErrors(cause, "guest")
        if (fields) setServerErrors(form, fields)
        else toastError("No se pudo guardar el huésped", cause)
      }
    },
  })
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue)
  const submitting = useSelector(form.store, (state) => state.isSubmitting)
  useEffect(() => onDirtyChange(!unchanged), [unchanged, onDirtyChange])
  return (
    <form
      noValidate
      onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
    >
      <fieldset
        disabled={disabled || submitting}
        className="flex min-w-0 flex-col gap-3"
      >
        <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <form.AppField name="fullName">
            {(field) => <field.Text label="Nombre completo" />}
          </form.AppField>
          <form.AppField name="reservationRoomId">
            {(field) => (
              <field.Choice
                label="Hab. del huésped"
                nullable
                options={[
                  { value: "none", label: "Sin indicar" },
                  ...detail.rooms
                    .filter(
                      (room) =>
                        detail.status !== "cancelled" ||
                        room.id === defaults.reservationRoomId
                    )
                    .map((room, index) => ({
                      value: room.id,
                      label: room.roomNumber ?? `Sin asignar · ${index + 1}`,
                    })),
                ]}
              />
            )}
          </form.AppField>
          <form.AppField name="documentType">
            {(field) => (
              <field.Choice
                label="Documento"
                blank
                options={[
                  { value: "none", label: "Sin indicar" },
                  { value: "DNI", label: "DNI" },
                  { value: "Pasaporte", label: "Pasaporte" },
                  { value: "Otro", label: "Otro" },
                ]}
              />
            )}
          </form.AppField>
          <form.AppField name="documentNumber">
            {(field) => <field.Text label="Número de documento" />}
          </form.AppField>
          <form.AppField name="email">
            {(field) => <field.Text label="Email del huésped" type="email" />}
          </form.AppField>
          <form.AppField name="phone">
            {(field) => (
              <field.Text
                label="Teléfono del huésped"
                type="tel"
                placeholder="+51…"
              />
            )}
          </form.AppField>
        </FieldGroup>
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={
              disabled ||
              submitting ||
              (!guest && detail.stayingGuests.length >= 200)
            }
          >
            {!guest && <PlusIcon data-icon="inline-start" />}
            {submitting ? "Guardando…" : guest ? "Guardar" : "Agregar huésped"}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  )
}

export function PaymentForm({
  detail,
  disabled,
  onReady,
  onDirtyChange,
}: {
  detail: ReservationDetail
  disabled: boolean
  onReady: (title: string, actions: WorkflowAction[]) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
}) {
  const [savedDefaults, setSavedDefaults] = useState<PaymentValues | null>(null)
  const defaults = useMemo(
    () => savedDefaults ?? paymentDefaults(detail.balanceCents),
    [savedDefaults, detail.balanceCents]
  )
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: paymentSchema },
    onSubmit: async ({ value }) => {
      if (disabled) return
      try {
        await onReady("Pago registrado", [
          { type: "add-payment", payment: paymentPayload(value) },
        ])
        const next = { ...paymentDefaults(), date: value.date }
        setSavedDefaults(next)
        form.reset(next)
      } catch (cause) {
        const fields = serverFieldErrors(cause, "payment")
        if (fields) setServerErrors(form, fields)
        else toastError("No se pudo guardar el pago", cause)
      }
    },
  })
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue)
  const submitting = useSelector(form.store, (state) => state.isSubmitting)
  useEffect(() => onDirtyChange(!unchanged), [unchanged, onDirtyChange])
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
    >
      <fieldset
        disabled={disabled || submitting}
        className="flex min-w-0 flex-col gap-3"
      >
        <FieldGroup className="grid grid-cols-2 gap-3">
          <form.AppField name="amount">
            {(field) => <field.Text label="Importe S/" placeholder="0.00" />}
          </form.AppField>
          <form.AppField name="method">
            {(field) => (
              <field.Choice label="Método" options={paymentMethods} />
            )}
          </form.AppField>
          <form.AppField name="date">
            {(field) => (
              <field.Text label="Fecha del pago" type="date" max={utcToday()} />
            )}
          </form.AppField>
          <form.AppField name="reference">
            {(field) => (
              <field.Text
                label="Referencia · Opcional"
                placeholder="N.º de operación o comprobante"
              />
            )}
          </form.AppField>
        </FieldGroup>
        <Button
          type="submit"
          className="w-fit"
          disabled={disabled || submitting}
        >
          {submitting ? "Guardando…" : "Agregar pago"}
        </Button>
      </fieldset>
    </form>
  )
}
