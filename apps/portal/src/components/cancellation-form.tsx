import { useEffect, useState } from "react";
import { revalidateLogic, useSelector } from "@tanstack/react-form";
import { cn } from "cn";
import { accountStatus } from "@/components/balance-status";
import { CouponReturns } from "@/components/outcome-account-preview";
import { CommandRecovery } from "@/components/command-recovery";
import { PageError } from "@/components/page-error";
import { outcomeSaveError } from "@/components/outcome-command-preview";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { ChoiceCardField } from "@/components/workflow-fields";
import type { ReservationDetail, WorkflowAction, WorkflowBilling } from "@/lib/api";
import { longDate } from "@/lib/dates";
import { formatMajor, formatMoney, parseMajorToCents } from "@/lib/money";
import {
  earlierAttemptSaved,
  useDebouncedReservationPreview,
  useReservationPreview,
  type ReservationCommandResult,
} from "@/lib/reservation-commands";
import { submitForm, useReservationForm } from "@/lib/reservation-form";
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
  const [choice, setChoice] = useState<ChargeChoice>("policy");
  const waiving = choice !== "policy";
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
    validationLogic: revalidateLogic({ mode: "change" }),
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
      else {
        if (choice === "all" && result.fields.amount) setChoice("part");
        validation.reject(form, value.amount, result.fields);
      }
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const changed = !useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  useEffect(() => onDirtyChange(changed || waiving), [changed, waiving, onDirtyChange]);
  const saving = disabled || submitting;
  const valid = schema.safeParse(values).success;
  const amountValid = !waiving || schema.shape.amount.safeParse(values.amount).success;
  const previewActions = (value: { amount: string }): WorkflowAction[] => [
    ...baseActions,
    {
      type: "waive-cancellation-charge",
      amountCents: parseMajorToCents(value.amount.trim()) ?? 0,
      reason: previewReason,
    },
  ];
  const waived = useDebouncedReservationPreview(
    detail.id,
    amountValid && waiving ? previewActions(values) : [],
    amountValid && waiving,
    today,
  );
  const preview = waiving && amountValid ? waived : policy;
  const current = preview !== waived || waived.current;
  const previewed =
    current && preview.isSuccess && !preview.isFetching && !preview.data.validation.issues.length;
  const ready = valid && previewed;
  const bill = previewed ? preview.data.billing : null;
  const status = bill ? accountStatus(bill) : null;
  const money = (cents: number) => formatMoney(cents, detail.currency);
  const policyBill = policy.isSuccess ? policy.data.billing : null;
  const chargeLabel =
    outcome === "cancelled" ? "Cargo por cancelación" : "Cargo por no presentarse";
  function choose(next: string) {
    const value = next as ChargeChoice;
    const amount = value === "all" ? formatMajor(charge) : "";
    setChoice(value);
    form.setFieldValue("amount", amount);
    if (value === "all") waived.settleNow(previewActions({ amount }));
  }
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden"
      onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
    >
      <CommandRecovery
        reservationId={detail.id}
        retryKey={retryKey}
        disabled={saving}
        onDone={onDone}
      />
      <section aria-label="Cuenta resultante" className="flex shrink-0 flex-col gap-2">
        {preview.error ? (
          <PageError error={preview.error} onRetry={() => void preview.refetch()} />
        ) : (
          <div
            className={cn(
              "flex flex-col gap-1 p-4",
              status?.tone ?? "bg-muted text-muted-foreground",
            )}
          >
            <p className="flex items-center gap-2 font-medium" role={status ? undefined : "status"}>
              {status && <status.Icon aria-hidden className="size-4 shrink-0" />}
              {status?.label ?? "Calculando…"}
            </p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {status ? money(status.cents) : "—"}
            </p>
            {bill && (
              <p className="opacity-80">
                {`Cargo ${money(bill.totalCents)} · Pagado ${money(bill.paidCents)}`}
              </p>
            )}
          </div>
        )}
        {bill && <CouponReturns billing={bill} detail={detail} today={today} />}
      </section>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-px">
        <fieldset disabled={saving}>
          <FieldGroup>
            {policyBill && charge > 0 ? (
              <ChoiceCardField
                label={chargeLabel}
                value={choice}
                onChange={choose}
                disabled={saving}
                options={[
                  {
                    value: "policy",
                    label: `Cobrar ${money(charge)}`,
                    description: policyLine(policyBill, today) ?? undefined,
                  },
                  {
                    value: "all",
                    label: "Perdonar todo el cargo",
                    description: `Se cobrará ${money(0)}`,
                  },
                  {
                    value: "part",
                    label: "Perdonar una parte",
                    description: "Indica cuánto perdonas",
                  },
                ]}
              />
            ) : (
              policyBill && <p className="text-muted-foreground">{policyLine(policyBill, today)}</p>
            )}
            {choice === "part" && (
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

type ChargeChoice = "policy" | "all" | "part";

const previewReason = "Vista previa";
