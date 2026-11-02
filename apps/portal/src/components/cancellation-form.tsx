import { useEffect, useState } from "react";
import { useSelector } from "@tanstack/react-form";
import { OutcomeAccountPreview } from "@/components/outcome-account-preview";
import { CommandRecovery } from "@/components/command-recovery";
import { PageError } from "@/components/page-error";
import { outcomeSaveError } from "@/components/outcome-command-preview";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import type { ReservationDetail, WorkflowAction, WorkflowBilling } from "@/lib/api";
import { longDate } from "@/lib/dates";
import { formatMajor, formatMoney, parseMajorToCents } from "@/lib/money";
import {
  earlierAttemptSaved,
  useDebouncedReservationPreview,
  useReservationPreview,
  type ReservationCommandResult,
} from "@/lib/reservation-commands";
import { blurThenChange, submitForm, useReservationForm } from "@/lib/reservation-form";
import { cancellationOutcomeSchema } from "@/lib/reservation-form-schemas";
import { toast } from "@/lib/toast";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { useWaiverValidation } from "@/lib/use-waiver-validation";

function policyLine(bill: WorkflowBilling, today: string) {
  const cancellation = bill.cancellation;
  if (!cancellation) return null;
  const total = bill.ratePlan.cancellationPolicy.chargeBasis === "final_total";
  if (cancellation.outcome === "no_show")
    return total
      ? "Cargo por no presentarse · Total de la reserva"
      : "Cargo por no presentarse · Primera noche";
  if (cancellation.freeUntil && today <= cancellation.freeUntil)
    return `Cancelación gratuita hasta el ${longDate(cancellation.freeUntil)} · Sin cargo`;
  return total
    ? "Tarifa no reembolsable · Cargo del total de la reserva"
    : "Fuera del plazo de cancelación gratuita · Cargo de la primera noche";
}

export function CancellationForm({
  detail,
  outcome,
  disabled,
  onSave,
  onDone,
  onCancel,
  onDirtyChange,
}: {
  detail: ReservationDetail;
  outcome: "cancelled" | "no_show";
  disabled: boolean;
  onSave: (actions: WorkflowAction[], retryKey?: string) => Promise<ReservationCommandResult>;
  onDone: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { today } = usePropertyCalendar();
  const [waiving, setWaiving] = useState(false);
  const [retryKey] = useState(
    () => `cancellation\n${JSON.stringify([detail.status, detail.cancellations])}`,
  );
  const baseActions: WorkflowAction[] = [{ type: "set-status", status: outcome }];
  const policy = useReservationPreview(detail.id, baseActions, true, today);
  const charge =
    policy.data?.billing.cancellation?.policyChargeCents ?? policy.data?.billing.totalCents ?? 0;
  const schema = cancellationOutcomeSchema(waiving, charge, detail.currency);
  const validation = useWaiverValidation(schema);
  function actions(value: { reason: string; amount: string }): WorkflowAction[] {
    const reason = value.reason.trim();
    return [
      {
        type: "set-status",
        status: outcome,
        ...(outcome === "cancelled" && reason ? { reason } : {}),
      },
      ...(waiving
        ? [
            {
              type: "waive-cancellation-charge" as const,
              amountCents: parseMajorToCents(value.amount.trim())!,
              reason,
            },
          ]
        : []),
    ];
  }
  const form = useReservationForm({
    defaultValues: { reason: "", amount: "" },
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => validation.validate(value),
    },
    onSubmit: async ({ value }) => {
      if (disabled || !ready) return;
      const result = await onSave(actions(value), retryKey);
      if (result.status === "failed" && result.code === earlierAttemptSaved) {
        toast.add({ title: "Los cambios ya se habían guardado", type: "success" });
        onDone();
        return;
      }
      if (result.status === "saved") {
        const title = outcome === "cancelled" ? "Reserva cancelada" : "Marcada como no presentada";
        const due = result.reservation.refundDueCents;
        toast.add({
          title: due > 0 ? `${title} · Por devolver ${formatMoney(due, detail.currency)}` : title,
          type: "success",
        });
        onDone();
      } else if (result.status === "failed") outcomeSaveError(result);
      else validation.reject(form, value.amount, result.fields);
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const changed = !useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  useEffect(() => onDirtyChange(changed || waiving), [changed, waiving, onDirtyChange]);
  const saving = disabled || submitting;
  const valid = schema.safeParse(values).success;
  const waived = useDebouncedReservationPreview(
    detail.id,
    valid && waiving ? actions(values) : [],
    valid && waiving,
    today,
  );
  const preview = waiving ? waived : policy;
  const current = !waiving || waived.current;
  const ready =
    valid &&
    current &&
    preview.isSuccess &&
    !preview.isFetching &&
    !preview.data.validation.issues.length;
  const bill = ready ? preview.data.billing : null;
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
        <section aria-label="Cuenta resultante" className="flex flex-col gap-3 text-sm">
          {waiving && !valid ? (
            <p>Indica el importe y el motivo para revisar la cuenta resultante.</p>
          ) : !current || preview.isFetching || (!preview.data && !preview.error) ? (
            <p role="status">Calculando…</p>
          ) : preview.error ? (
            <PageError error={preview.error} onRetry={() => void preview.refetch()} />
          ) : bill ? (
            <>
              <p>{policyLine(bill, today)}</p>
              <p>
                {outcome === "cancelled" ? "Cargo por cancelación" : "Cargo por no presentarse"}{" "}
                {formatMoney(
                  bill.cancellation?.policyChargeCents ?? bill.totalCents,
                  detail.currency,
                )}
              </p>
              <OutcomeAccountPreview billing={bill} detail={detail} today={today} />
            </>
          ) : null}
        </section>
        <fieldset disabled={saving}>
          <FieldGroup>
            {charge > 0 && !waiving && policy.isSuccess && !policy.isFetching && (
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  form.setFieldValue("amount", formatMajor(charge));
                  setWaiving(true);
                }}
              >
                Perdonar cargo
              </Button>
            )}
            {waiving && (
              <form.AppField name="amount">
                {(field) => <field.Text label="Importe a perdonar" inputMode="decimal" required />}
              </form.AppField>
            )}
            {(outcome === "cancelled" || waiving) && (
              <form.AppField name="reason">
                {(field) => (
                  <field.Text
                    label={waiving ? "Motivo" : "Motivo · Opcional"}
                    required={waiving}
                    type="textarea"
                    max={2000}
                  />
                )}
              </form.AppField>
            )}
          </FieldGroup>
        </fieldset>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          Cerrar
        </Button>
        <Button type="submit" variant="destructive" disabled={saving || !ready}>
          {saving ? "Guardando…" : "Confirmar"}
        </Button>
      </div>
    </form>
  );
}
