import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "@tanstack/react-form";
import { cn } from "cn";
import { BookingEditor, DiscardChanges } from "@/components/room-booking-dialog";
import { GuestEntryForm, paymentMethods } from "@/components/reservation-entry-forms";
import { WorkflowBill } from "@/components/workflow-bill";
import { ChoiceField } from "@/components/workflow-fields";
import { useDirtyRoomCheckIn } from "@/components/dirty-room-check-in";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FieldGroup, FieldDescription, FieldError } from "@/components/ui/field";
import type { ReservationDetail, WorkflowAction } from "@/lib/api";
import {
  useReservationCommands,
  useReservationPreview,
  type ReservationCommandResult,
} from "@/lib/reservation-commands";
import { guestValues } from "@/lib/reservation-editor";
import { useReservationForm, blurThenChange, submitForm } from "@/lib/reservation-form";
import {
  contactSchema,
  contactDefaults,
  contactPayload,
  notesSchema,
  paymentSchema,
  cancellationSchema,
  paymentDefaults,
  paymentPayload,
} from "@/lib/reservation-form-schemas";
import { setServerErrors } from "@/lib/form-errors";
import { formatMajor, formatMoney } from "@/lib/money";
import { reservationStatusLabel } from "@/lib/reservation-list";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { translateError } from "@/lib/errors";
import { toast, toastError } from "@/lib/toast";

export type ReservationEditorTarget =
  | { kind: "stay" }
  | { kind: "contact" | "notes" }
  | { kind: "guest"; id?: string }
  | { kind: "payment"; id?: string }
  | { kind: "delete-payment" | "delete-guest"; id: string }
  | { kind: "correct-status" }
  | { kind: "status"; status: Extract<WorkflowAction, { type: "set-status" }>["status"] };

function editorTitle(target: ReservationEditorTarget, detail: ReservationDetail) {
  switch (target.kind) {
    case "stay":
      return "Editar estadía";
    case "contact":
      return "Editar contacto";
    case "notes":
      return "Notas de la reserva";
    case "guest":
      return target.id ? "Editar huésped" : "Agregar huésped";
    case "payment":
      return target.id ? "Editar pago" : "Registrar pago";
    case "delete-payment":
      return "Eliminar registro de pago";
    case "delete-guest":
      return "Eliminar huésped";
    case "status":
      return target.status === "cancelled"
        ? "Cancelar reserva"
        : detail.status === "cancelled"
          ? "Restaurar reserva"
          : `Confirmar ${reservationStatusLabel(target.status)}`;
    case "correct-status":
      return "Corregir estado";
  }
}

export function ReservationPageEditor({
  target,
  detail,
  onClose,
  onDirtyChange,
  onSaved,
  description,
}: {
  target: ReservationEditorTarget;
  detail: ReservationDetail;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: (saved: ReservationDetail) => void;
  description?: string;
}) {
  const dirty = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const { send, saving } = useReservationCommands(detail.id);
  const handleDirty = useCallback(
    (value: boolean) => {
      dirty.current = value;
      onDirtyChange(value);
    },
    [onDirtyChange],
  );
  function close() {
    if (saving) return;
    if (dirty.current) setLeaving(true);
    else onClose();
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          closeDisabled={saving}
          className={cn(
            "max-h-[90svh] overflow-y-auto sm:max-w-lg",
            (target.kind === "stay" || target.kind === "contact") &&
              "top-0 left-0 flex h-svh max-h-svh w-full max-w-full translate-x-0 translate-y-0 flex-col overflow-hidden sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[90svh] sm:-translate-x-1/2 sm:-translate-y-1/2",
            target.kind === "stay" && "sm:max-w-2xl",
          )}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>{editorTitle(target, detail)}</DialogTitle>
            <DialogDescription>
              {description ??
                (target.kind === "stay"
                  ? "Revisa las fechas, habitaciones y el importe antes de guardar."
                  : "Los cambios se guardan al confirmar.")}
            </DialogDescription>
          </DialogHeader>
          {target.kind === "stay" ? (
            <BookingEditor
              detail={detail}
              stayOnly
              onCancel={close}
              onDirtyChange={handleDirty}
              onSaved={onClose}
            />
          ) : target.kind === "guest" ? (
            <GuestEntryForm
              detail={detail}
              guest={detail.stayingGuests.find((guest) => guest.id === target.id)}
              disabled={saving}
              onDirtyChange={handleDirty}
              onSave={(guests) => send([{ type: "set-guests", guests: guestValues(guests) }])}
              onDone={onClose}
              onCancel={close}
            />
          ) : (
            <ReservationActionForm
              target={target}
              detail={detail}
              disabled={saving}
              onDirtyChange={handleDirty}
              onSave={send}
              onSaved={onSaved ?? onClose}
              onCancel={close}
            />
          )}
        </DialogContent>
      </Dialog>
      {leaving && (
        <DiscardChanges
          saving={saving}
          onStay={() => setLeaving(false)}
          onLeave={() => {
            if (!saving) onClose();
          }}
        />
      )}
    </>
  );
}

function ReservationActionForm({
  target,
  detail,
  disabled,
  onSave,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  target: Exclude<ReservationEditorTarget, { kind: "guest" | "stay" }>;
  detail: ReservationDetail;
  disabled: boolean;
  onSave: (actions: WorkflowAction[]) => Promise<ReservationCommandResult>;
  onSaved: (saved: ReservationDetail) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { today } = usePropertyCalendar();
  const [selectedStatus, setSelectedStatus] = useState<
    Extract<WorkflowAction, { type: "set-status" }>["status"] | ""
  >(target.kind === "status" ? target.status : "");
  const [confirmCheckIn, checkInDialog] = useDirtyRoomCheckIn();
  const payment =
    "id" in target ? detail.payments.find((payment) => payment.id === target.id) : undefined;
  const [defaults] = useState(() => ({
    ...contactDefaults(detail),
    notes: detail.notes ?? "",
    ...paymentDefaults(detail.balanceCents),
    ...(payment
      ? {
          amount: formatMajor(payment.amountCents),
          method: payment.method,
          date: payment.paymentDate,
          reference: payment.reference ?? "",
          reason: payment.notes ?? "",
        }
      : {}),
  }));
  const schema =
    target.kind === "contact"
      ? contactSchema
      : target.kind === "notes"
        ? notesSchema
        : target.kind === "payment"
          ? paymentSchema
          : cancellationSchema;
  const rejectedContact = useRef<{ key: string; fields: Record<string, string> } | null>(null);
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => {
        const result = schema.safeParse(value);
        const fields = result.success
          ? {}
          : Object.fromEntries(
              result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
            );
        if (
          target.kind === "contact" &&
          rejectedContact.current?.key === JSON.stringify([value.email, value.phone])
        )
          Object.assign(fields, rejectedContact.current.fields);
        return Object.keys(fields).length ? { fields } : undefined;
      },
    },
    onSubmit: async ({ value }) => {
      if (disabled || (needsPreview && !previewReady)) return;
      if (statusEditor && (!selectedStatus || !(await confirmCheckIn(detail, selectedStatus))))
        return;
      let actions: WorkflowAction[];
      switch (target.kind) {
        case "contact": {
          actions = [{ type: "contact", contact: contactPayload(value) }];
          break;
        }
        case "notes":
          actions = [{ type: "notes", notes: value.notes }];
          break;
        case "payment":
          actions = [
            target.id
              ? { type: "edit-payment", paymentId: target.id, payment: paymentPayload(value) }
              : { type: "add-payment", payment: paymentPayload(value) },
          ];
          break;
        case "delete-payment":
          actions = [{ type: "delete-payment", paymentId: target.id }];
          break;
        case "delete-guest":
          actions = [
            {
              type: "set-guests",
              guests: guestValues(detail.stayingGuests.filter((guest) => guest.id !== target.id)),
            },
          ];
          break;
        case "correct-status":
        case "status":
          if (!selectedStatus) return;
          actions = [
            {
              type: "set-status",
              status: selectedStatus,
              ...(selectedStatus === "cancelled" && value.reason.trim()
                ? { reason: value.reason.trim() }
                : {}),
            },
          ];
          break;
        default:
          return;
      }
      const result = await onSave(actions);
      if (result.status === "saved") {
        toast.add({ title: "Cambios guardados", type: "success" });
        onSaved(result.reservation);
      } else if (result.status === "failed") toastError("No se pudo guardar", result.message);
      else if (target.kind === "contact") {
        const { fields } = result;
        rejectedContact.current = { key: JSON.stringify([value.email, value.phone]), fields };
        form.setErrorMap({ onDynamic: { fields } });
      } else setServerErrors(form, result.fields);
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const changed = !useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const saving = disabled || submitting;
  const statusEditor = target.kind === "status" || target.kind === "correct-status";
  const statusChanged = selectedStatus !== (target.kind === "status" ? target.status : "");
  useEffect(() => onDirtyChange(changed || statusChanged), [changed, statusChanged, onDirtyChange]);
  useEffect(() => {
    if (target.kind === "payment" && form.state.fieldMeta.date?.errors.length)
      void form.validate("submit");
  }, [today, form, target.kind]);
  const needsPreview = target.kind === "status";
  const status = target.kind === "status" ? selectedStatus : null;
  const previewActions = useMemo<WorkflowAction[]>(
    () => (status ? [{ type: "set-status", status }] : []),
    [status],
  );
  const valid = schema.safeParse(values).success;
  const preview = useReservationPreview(detail.id, previewActions, needsPreview && valid);
  const previewReady =
    valid &&
    preview.isSuccess &&
    !preview.isFetching &&
    preview.data.validation.issues.length === 0;
  const destructive =
    target.kind === "delete-payment" ||
    target.kind === "delete-guest" ||
    (target.kind === "status" && target.status === "cancelled");
  return (
    <form
      noValidate
      className={cn(
        "flex flex-col gap-6",
        target.kind === "contact" && "min-h-0 flex-1 overflow-hidden",
      )}
      onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
    >
      {checkInDialog}
      <fieldset
        disabled={saving}
        className={cn(target.kind === "contact" && "min-h-0 overflow-y-auto p-px")}
      >
        <FieldGroup>
          {target.kind === "contact" && (
            <>
              <FieldDescription>
                Corrige los datos del contacto principal. La lista de huéspedes no cambia.
              </FieldDescription>
              <form.AppField name="fullName">
                {(field) => <field.Text label="Nombre completo" required max={200} />}
              </form.AppField>
              <form.AppField name="email">
                {(field) => <field.Text label="Correo electrónico" type="email" max={320} />}
              </form.AppField>
              <form.AppField name="phone">{(field) => <field.Phone />}</form.AppField>
            </>
          )}
          {target.kind === "notes" && (
            <form.AppField name="notes">
              {(field) => <field.Text label="Notas para esta reserva" type="textarea" max={2000} />}
            </form.AppField>
          )}
          {target.kind === "payment" && (
            <>
              <form.AppField name="amount">
                {(field) => (
                  <field.Text label={`Importe (${detail.currency})`} placeholder="0.00" />
                )}
              </form.AppField>
              <form.AppField name="method">
                {(field) => <field.Choice label="Método de pago" options={paymentMethods} />}
              </form.AppField>
              <form.AppField name="date">
                {(field) => <field.Text label="Fecha del pago" type="date" max={today} required />}
              </form.AppField>
              <form.AppField name="reference">
                {(field) => <field.Text label="Referencia · Opcional" />}
              </form.AppField>
              <form.AppField name="reason">
                {(field) => <field.Text label="Nota del pago" type="textarea" max={2000} />}
              </form.AppField>
            </>
          )}
          {target.kind === "delete-payment" && (
            <FieldDescription>
              Se eliminará el registro de {formatMoney(payment?.amountCents ?? 0, detail.currency)}.
              Eliminar un registro no representa un reembolso.
            </FieldDescription>
          )}
          {target.kind === "delete-guest" && (
            <FieldDescription>
              Se eliminará a{" "}
              {detail.stayingGuests.find((guest) => guest.id === target.id)?.fullName} de la lista
              de huéspedes. La ocupación declarada de la habitación no cambia.
            </FieldDescription>
          )}
          {statusEditor && (
            <>
              {(target.kind === "correct-status" || detail.status === "cancelled") && (
                <ChoiceField
                  label="Estado"
                  value={selectedStatus}
                  disabled={saving}
                  options={(["confirmed", "checked_in", "checked_out"] as const)
                    .filter((status) => status !== detail.status)
                    .map((value) => ({ value, label: reservationStatusLabel(value) }))}
                  onChange={(value) => {
                    if (value === "confirmed" || value === "checked_in" || value === "checked_out")
                      setSelectedStatus(value);
                  }}
                />
              )}
              <FieldDescription>
                Cambiar el estado no modifica las fechas de la estadía. El saldo y las habitaciones
                sin asignar no impiden el check-in ni el check-out.
              </FieldDescription>
              {detail.status === "cancelled" && (
                <FieldDescription>
                  Se revisa la disponibilidad, las asignaciones y la capacidad antes de restaurar
                  como {reservationStatusLabel(selectedStatus || "confirmed")}.
                </FieldDescription>
              )}
              {selectedStatus === "cancelled" && (
                <>
                  <FieldDescription>
                    Se liberará el inventario y se aplicará el cargo según la política de la
                    reserva, sin registrar un reembolso. Revisa la cuenta resultante antes de
                    confirmar.
                  </FieldDescription>
                  <form.AppField name="reason">
                    {(field) => <field.Text label="Motivo · Opcional" type="textarea" max={2000} />}
                  </form.AppField>
                </>
              )}
            </>
          )}
        </FieldGroup>
      </fieldset>
      {needsPreview && (
        <section aria-label="Cuenta resultante" className="flex flex-col gap-3">
          {preview.isFetching || (!preview.data && !preview.error) ? (
            <p role="status" className="text-sm text-muted-foreground">
              Calculando…
            </p>
          ) : preview.error ? (
            <>
              <FieldError>{preview.error.message}</FieldError>
              <Button
                type="button"
                variant="outline"
                disabled={saving || !valid}
                onClick={() => void preview.refetch()}
              >
                Reintentar
              </Button>
            </>
          ) : (
            preview.data && (
              <>
                <WorkflowBill bill={preview.data.billing} />
                {preview.data.validation.issues.map((issue, index) => (
                  <FieldError key={index}>
                    Habitación {issue.roomIndex + 1}: {translateError(issue.code)}
                  </FieldError>
                ))}
              </>
            )
          )}
        </section>
      )}
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          {target.kind === "contact" ? "Cancelar" : "Cerrar"}
        </Button>
        <Button
          type="submit"
          variant={destructive ? "destructive" : "default"}
          disabled={saving || (statusEditor && !selectedStatus) || (needsPreview && !previewReady)}
        >
          {saving ? "Guardando…" : destructive ? "Confirmar" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
