import { useEffect, useMemo, useState } from "react";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { useSelector } from "@tanstack/react-form";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldGroup } from "@/components/ui/field";
import type { ReservationDetail, StayingGuest, WorkflowAction } from "@/lib/api";
import { setServerErrors } from "@/lib/form-errors";
import type { ReservationCommandResult } from "@/lib/reservation-commands";
import { useReservationForm, blurThenChange, submitForm } from "@/lib/reservation-form";
import {
  guestSchema,
  guestDefaults,
  guestPayload,
  paymentSchema,
  paymentDefaults,
  paymentPayload,
  type GuestValues,
  type PaymentValues,
} from "@/lib/reservation-form-schemas";
import { toast, toastError } from "@/lib/toast";
import { phoneDraft } from "@/lib/phone";

export const paymentMethods = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "yape", label: "Yape" },
  { value: "plin", label: "Plin" },
  { value: "other", label: "Otro" },
];

export function GuestEntryForm({
  detail,
  guest,
  disabled,
  onSave,
  onDirtyChange,
  onDone,
  onCancel,
}: {
  detail: ReservationDetail;
  guest?: StayingGuest;
  disabled: boolean;
  onSave: (guests: StayingGuest[]) => Promise<ReservationCommandResult>;
  onDirtyChange: (dirty: boolean) => void;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [defaults, setDefaults] = useState<GuestValues>(() =>
    guest
      ? guestDefaults(guest)
      : {
          id: crypto.randomUUID(),
          fullName: "",
          email: "",
          phone: phoneDraft(null),
          documentType: "",
          documentNumber: "",
          reservationRoomId: null,
        },
  );
  const [formError, setFormError] = useState<string | null>(null);
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: guestSchema },
    onSubmit: async ({ value }) => {
      if (disabled) return;
      setFormError(null);
      const payload = guestPayload({
        ...value,
        reservationRoomId: guest
          ? value.reservationRoomId
          : detail.rooms.length === 1
            ? detail.rooms[0].id
            : null,
      });
      const result = await onSave(
        guest
          ? detail.stayingGuests.map((entry) => (entry.id === guest.id ? payload : entry))
          : [...detail.stayingGuests, payload],
      );
      if (result.status === "rejected") return setServerErrors(form, result.fields);
      if (
        result.status === "failed" &&
        result.code === "guest room must belong to this reservation"
      )
        return setFormError(result.message);
      if (result.status === "failed")
        return toastError("No se pudo guardar el huésped", result.message);
      const next = guest ? guestDefaults(payload) : { ...defaults, id: crypto.randomUUID() };
      setDefaults(next);
      form.reset(next);
      toast.add({
        title: guest ? "Huésped actualizado" : "Huésped agregado",
        type: "success",
      });
      onDone?.();
    },
  });
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  useEffect(() => onDirtyChange(!unchanged), [unchanged, onDirtyChange]);
  return (
    <form noValidate onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}>
      <fieldset disabled={disabled || submitting} className="flex min-w-0 flex-col gap-3">
        <FieldGroup className="gap-3">
          <form.AppField name="fullName">
            {(field) => <field.Text label="Nombre completo" />}
          </form.AppField>
          <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form.AppField name="email">
              {(field) => <field.Text label="Correo · Opcional" type="email" />}
            </form.AppField>
            <form.AppField name="phone">{(field) => <field.Phone />}</form.AppField>
          </FieldGroup>
          <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </FieldGroup>
        </FieldGroup>
        {formError && <FieldError>{formError}</FieldError>}
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={disabled || submitting || (!guest && detail.stayingGuests.length >= 200)}
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
  );
}

export function PaymentForm({
  detail,
  suggestedAmountCents,
  disabled,
  onReady,
  onDirtyChange,
}: {
  detail: ReservationDetail;
  suggestedAmountCents?: number;
  disabled: boolean;
  onReady: (title: string, actions: WorkflowAction[]) => Promise<ReservationCommandResult>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { today } = usePropertyCalendar();
  const [savedDefaults, setSavedDefaults] = useState<PaymentValues | null>(null);
  const defaults = useMemo(
    () => savedDefaults ?? paymentDefaults(suggestedAmountCents ?? detail.balanceCents),
    [savedDefaults, suggestedAmountCents, detail.balanceCents],
  );
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: paymentSchema },
    onSubmit: async ({ value }) => {
      if (disabled) return;
      const result = await onReady("Pago registrado", [
        { type: "add-payment", payment: paymentPayload(value) },
      ]);
      if (result.status === "rejected") return setServerErrors(form, result.fields);
      if (result.status === "failed")
        return toastError("No se pudo guardar el pago", result.message);
      const next = { ...paymentDefaults(), date: value.date };
      setSavedDefaults(next);
      form.reset(next);
    },
  });
  useEffect(() => {
    if (form.state.fieldMeta.date?.errors.length) void form.validate("submit");
  }, [form, today]);
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  useEffect(() => onDirtyChange(!unchanged), [unchanged, onDirtyChange]);
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
    >
      <fieldset disabled={disabled || submitting} className="flex min-w-0 flex-col gap-3">
        <FieldGroup className="grid grid-cols-2 gap-3">
          <form.AppField name="amount">
            {(field) => <field.Text label="Importe S/" placeholder="0.00" />}
          </form.AppField>
          <form.AppField name="method">
            {(field) => <field.Choice label="Método" options={paymentMethods} />}
          </form.AppField>
          <form.AppField name="date">
            {(field) => <field.Text label="Fecha del pago" type="date" max={today} />}
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
        <Button type="submit" className="w-fit" disabled={disabled || submitting}>
          {submitting ? "Guardando…" : "Agregar pago"}
        </Button>
      </fieldset>
    </form>
  );
}
