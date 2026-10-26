import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-form";
import { cn } from "cn";
import { BookingEditor, DiscardChanges } from "@/components/room-booking-dialog";
import { GuestEntryForm, paymentMethods } from "@/components/reservation-entry-forms";
import { WorkflowBill } from "@/components/workflow-bill";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FieldGroup, FieldDescription, FieldError } from "@/components/ui/field";
import { previewWorkflow, type ReservationDetail, type WorkflowAction } from "@/lib/api";
import { useReservationSaving, useWorkflowCommand } from "@/lib/queries";
import { createWorkflowSaver } from "@/lib/workflow-save";
import { isReservationSaving } from "@/lib/workflow-query-cache";
import { guestValues } from "@/lib/reservation-editor";
import { useReservationForm, blurThenChange, submitForm } from "@/lib/reservation-form";
import {
  contactSchema,
  contactDefaults,
  contactPayload,
  notesSchema,
  discountSchema,
  paymentSchema,
  cancellationSchema,
  paymentDefaults,
  paymentPayload,
} from "@/lib/reservation-form-schemas";
import { serverFieldErrors } from "@/lib/api-error";
import { setServerErrors } from "@/lib/form-errors";
import { formatMajor, formatMoney, parseMajorToCents } from "@/lib/money";
import { reservationStatusLabel } from "@/lib/reservation-list";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { translateError } from "@/lib/errors";
import { toast, toastError } from "@/lib/toast";

export type ReservationEditorTarget =
  | { kind: "stay" }
  | { kind: "contact" | "notes" | "discount" }
  | { kind: "guest"; id?: string }
  | { kind: "payment"; id?: string }
  | { kind: "delete-payment" | "delete-guest"; id: string }
  | { kind: "status"; status: Extract<WorkflowAction, { type: "set-status" }>["status"] };

function editorTitle(target: ReservationEditorTarget, detail: ReservationDetail) {
  switch (target.kind) {
    case "stay":
      return "Editar estadía";
    case "contact":
      return "Editar contacto";
    case "notes":
      return "Notas de la reserva";
    case "discount":
      return "Editar descuento";
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
  }
}

// The page supplies a snapshot captured when the editor opens. Background reads
// may refresh the overview, but must never replace an in-progress form draft.
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
  const client = useQueryClient();
  const dirty = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const saving = useReservationSaving(detail.id);
  const mutation = useWorkflowCommand(detail.id);
  const [saveWorkflow] = useState(createWorkflowSaver);
  const handleDirty = useCallback(
    (value: boolean) => {
      dirty.current = value;
      onDirtyChange(value);
    },
    [onDirtyChange],
  );
  function close() {
    if (isReservationSaving(client, detail.id)) return;
    if (dirty.current) setLeaving(true);
    else onClose();
  }
  async function save(actions: WorkflowAction[]) {
    if (isReservationSaving(client, detail.id))
      throw new Error("Espera a que termine el guardado.");
    return saveWorkflow(actions, (command) => mutation.mutateAsync({ id: detail.id, command }));
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
              onSave={async (guests) => {
                await save([{ type: "set-guests", guests: guestValues(guests) }]);
              }}
              onDone={onClose}
              onCancel={close}
            />
          ) : (
            <ReservationActionForm
              target={target}
              detail={detail}
              disabled={saving}
              onDirtyChange={handleDirty}
              onSave={save}
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
            if (!isReservationSaving(client, detail.id)) onClose();
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
  onSave: (actions: WorkflowAction[]) => Promise<ReservationDetail>;
  onSaved: (saved: ReservationDetail) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { today } = usePropertyCalendar();
  const payment =
    "id" in target ? detail.payments.find((payment) => payment.id === target.id) : undefined;
  const [defaults] = useState(() => ({
    ...contactDefaults(detail),
    notes: detail.notes ?? "",
    ...paymentDefaults(detail.balanceCents),
    ...(target.kind === "discount" ? { amount: formatMajor(detail.savedDiscountCents) } : {}),
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
        : target.kind === "discount"
          ? discountSchema
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
        // submitForm focuses invalid fields; the resulting blur must not erase
        // a server rejection until the contact value actually changes.
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
      let actions: WorkflowAction[];
      switch (target.kind) {
        case "contact": {
          actions = [{ type: "contact", contact: contactPayload(value) }];
          break;
        }
        case "notes":
          actions = [{ type: "notes", notes: value.notes }];
          break;
        case "discount":
          actions = [
            { type: "set-discount", amountCents: parseMajorToCents(value.amount.trim() || "0")! },
          ];
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
        case "status":
          actions = [
            {
              type: "set-status",
              status: target.status,
              ...(target.status === "cancelled" && value.reason.trim()
                ? { reason: value.reason.trim() }
                : {}),
            },
          ];
          break;
        default:
          return;
      }
      try {
        const saved = await onSave(actions);
        toast.add({ title: "Cambios guardados", type: "success" });
        onSaved(saved);
      } catch (cause) {
        const fields = serverFieldErrors(
          cause,
          target.kind === "payment" ? "payment" : target.kind === "contact" ? "guest" : "details",
        );
        if (fields && target.kind === "contact") {
          rejectedContact.current = { key: JSON.stringify([value.email, value.phone]), fields };
          form.setErrorMap({ onDynamic: { fields } });
        } else if (fields) setServerErrors(form, fields);
        else toastError("No se pudo guardar", cause);
      }
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const changed = !useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const saving = disabled || submitting;
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);
  useEffect(() => {
    if (target.kind === "payment" && form.state.fieldMeta.date?.errors.length)
      void form.validate("submit");
  }, [today, form, target.kind]);
  const needsPreview = target.kind === "status" || target.kind === "discount";
  const actionsKey = JSON.stringify(
    target.kind === "status"
      ? [{ type: "set-status", status: target.status }]
      : target.kind === "discount"
        ? [{ type: "set-discount", amountCents: parseMajorToCents(values.amount.trim() || "0") }]
        : [],
  );
  const command = useMemo(
    () => ({ requestId: crypto.randomUUID(), actions: JSON.parse(actionsKey) as WorkflowAction[] }),
    [actionsKey],
  );
  const [previewCommand, setPreviewCommand] = useState(command);
  useEffect(() => {
    const timer = setTimeout(
      () => setPreviewCommand(command),
      target.kind === "discount" ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [command, target.kind]);
  const valid = schema.safeParse(values).success;
  const current = previewCommand === command;
  const preview = useQuery({
    queryKey: ["reservation-action-preview", detail.id, previewCommand],
    queryFn: () => previewWorkflow(detail.id, previewCommand),
    enabled: needsPreview && current && valid,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const previewReady =
    current &&
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
          {target.kind === "discount" && (
            <>
              <form.AppField name="amount">
                {(field) => <field.Text label={`Descuento fijo (${detail.currency})`} />}
              </form.AppField>
              <FieldDescription>
                Se aplica a la reserva completa, limitado al subtotal. No es un pago.
              </FieldDescription>
            </>
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
          {target.kind === "status" && (
            <>
              <FieldDescription>
                Cambiar el estado no modifica las fechas de la estadía. El saldo y las habitaciones
                sin asignar no impiden el check-in ni el check-out.
              </FieldDescription>
              {detail.status === "cancelled" && (
                <FieldDescription>
                  Se revisa la disponibilidad, las asignaciones y la capacidad antes de restaurar
                  como {reservationStatusLabel(target.status)}.
                </FieldDescription>
              )}
              {target.status === "cancelled" && (
                <>
                  <FieldDescription>
                    Se liberará el inventario y la cuenta quedará en cero. Los pagos se conservarán
                    como saldo a favor, sin registrar un reembolso.
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
          {!current || preview.isFetching || (!preview.data && !preview.error) ? (
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
          disabled={saving || (needsPreview && !previewReady)}
        >
          {saving ? "Guardando…" : destructive ? "Confirmar" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
