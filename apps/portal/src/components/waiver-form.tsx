import { useEffect, useState } from "react";
import { useSelector } from "@tanstack/react-form";
import { OutcomeCommandPreview, outcomeSaveError } from "@/components/outcome-command-preview";
import { CommandRecovery } from "@/components/command-recovery";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import type { ReservationDetail, WorkflowAction } from "@/lib/api";
import { formatMajor, formatMoney, parseMajorToCents } from "@/lib/money";
import {
  earlierAttemptSaved,
  useDebouncedReservationPreview,
  type ReservationCommandResult,
} from "@/lib/reservation-commands";
import { blurThenChange, submitForm, useReservationForm } from "@/lib/reservation-form";
import { cancellationOutcomeSchema } from "@/lib/reservation-form-schemas";
import { toast } from "@/lib/toast";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { useWaiverValidation } from "@/lib/use-waiver-validation";

export function WaiverForm({
  detail,
  disabled,
  onSave,
  onDone,
  onCancel,
  onDirtyChange,
}: {
  detail: ReservationDetail;
  disabled: boolean;
  onSave: (actions: WorkflowAction[], retryKey?: string) => Promise<ReservationCommandResult>;
  onDone: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { today } = usePropertyCalendar();
  const [opening] = useState(detail);
  const remaining = opening.cancellation?.finalChargeCents ?? 0;
  const retryKey = `waiver\n${JSON.stringify([opening.status, opening.cancellations])}`;
  const schema = cancellationOutcomeSchema(true, remaining, detail.currency);
  const validation = useWaiverValidation(schema);
  const actions = (value: { amount: string; reason: string }): WorkflowAction[] => [
    {
      type: "waive-cancellation-charge",
      amountCents: parseMajorToCents(value.amount.trim())!,
      reason: value.reason.trim(),
    },
  ];
  const form = useReservationForm({
    defaultValues: { amount: formatMajor(remaining), reason: "" },
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => validation.validate(value),
    },
    onSubmit: async ({ value }) => {
      if (disabled || !ready) return;
      const result = await onSave(actions(value), retryKey);
      if (result.status === "saved") {
        const due = result.reservation.refundDueCents;
        toast.add({
          title:
            due > 0
              ? `Cargo perdonado · Por devolver ${formatMoney(due, detail.currency)}`
              : "Cargo perdonado",
          type: "success",
        });
        onDone();
      } else if (result.status === "failed" && result.code === earlierAttemptSaved) {
        toast.add({ title: "Los cambios ya se habían guardado", type: "success" });
        onDone();
      } else if (result.status === "failed") outcomeSaveError(result);
      else validation.reject(form, value.amount, result.fields);
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const changed = !useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);
  const valid = schema.safeParse(values).success;
  const preview = useDebouncedReservationPreview(
    detail.id,
    valid ? actions(values) : [],
    valid,
    today,
  );
  const ready =
    valid &&
    preview.current &&
    preview.isSuccess &&
    !preview.isFetching &&
    !preview.data.validation.issues.length;
  const saving = disabled || submitting;
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden"
      onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-px">
        <CommandRecovery
          reservationId={detail.id}
          retryKey={retryKey}
          disabled={saving}
          onDone={onDone}
        />
        <fieldset disabled={saving}>
          <FieldGroup>
            <form.AppField name="amount">
              {(field) => <field.Text label="Importe a perdonar" inputMode="decimal" required />}
            </form.AppField>
            <form.AppField name="reason">
              {(field) => <field.Text label="Motivo" type="textarea" max={2000} required />}
            </form.AppField>
          </FieldGroup>
        </fieldset>
        {valid ? (
          <OutcomeCommandPreview
            preview={preview}
            pending={!preview.current}
            detail={opening}
            today={today}
          />
        ) : (
          <p className="text-sm">
            Indica el importe y el motivo para revisar la cuenta resultante.
          </p>
        )}
        <Alert variant="warning">
          <AlertTitle>No se puede deshacer.</AlertTitle>
        </Alert>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          Cerrar
        </Button>
        <Button type="submit" disabled={saving || !ready}>
          {saving ? "Guardando…" : "Perdonar cargo"}
        </Button>
      </div>
    </form>
  );
}
