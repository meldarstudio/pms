import { useEffect, useId, useState, type ReactNode } from "react";
import { useSelector } from "@tanstack/react-form";
import { parseISO } from "date-fns";
import type { ZodSafeParseResult } from "zod";
import { accountStatus } from "@/components/balance-status";
import { paymentMethods } from "@/components/reservation-entry-forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { ReservationDetail, ReservationRefund, WorkflowAction } from "@/lib/api";
import { setServerErrors } from "@/lib/form-errors";
import { format } from "@/lib/dates";
import { formatMajor, formatMoney, parseMajorToCents } from "@/lib/money";
import { propertyToday } from "@/lib/property-calendar";
import { earlierAttemptSaved, type ReservationCommandResult } from "@/lib/reservation-commands";
import { blurThenChange, submitForm, useReservationForm } from "@/lib/reservation-form";
import {
  cardRefundSchema,
  manualRefundSource,
  refundCompletionSchema,
  refundDefaults,
  refundFailureSchema,
  refundMethods,
  refundSchema,
  type RefundValues,
} from "@/lib/reservation-form-schemas";
import {
  cardRefundPayments,
  firstRefundPayment,
  refundCapacityCents,
  splitRefund,
} from "@/lib/refund-split";
import { toast, toastError } from "@/lib/toast";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

type FormProps = {
  detail: ReservationDetail;
  disabled: boolean;
  onSave: (actions: WorkflowAction[], retryKey?: string) => Promise<ReservationCommandResult>;
  onDone: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
};

const refundMethodOptions = paymentMethods.filter((method) => method.value !== "card");

function fieldIssues(result: ZodSafeParseResult<unknown>) {
  return result.success
    ? undefined
    : {
        fields: Object.fromEntries(
          result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
        ),
      };
}

async function finish(
  result: ReservationCommandResult,
  title: string,
  form: Parameters<typeof setServerErrors>[0],
  onDone: () => void,
) {
  if (result.status === "saved") {
    toast.add({ title, type: "success" });
    onDone();
  } else if (result.status === "failed") toastError("No se pudo guardar", result.message);
  else setServerErrors(form, result.fields);
}

function RefundFormLayout({
  saving,
  children,
  actions,
  onSubmit,
}: {
  saving: boolean;
  children: ReactNode;
  actions: ReactNode;
  onSubmit: () => Promise<void>;
}) {
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden"
      onSubmit={(event) => void submitForm(event, onSubmit)}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-px">
        <fieldset disabled={saving}>
          <FieldGroup>{children}</FieldGroup>
        </fieldset>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>
    </form>
  );
}

export const culqiPendingLine =
  "Comprueba el resultado en Culqi antes de confirmarlo o marcarlo como fallido.";

function refundSetup(detail: ReservationDetail) {
  const status = accountStatus(detail);
  const owedCents = status.state === "owed-back" ? status.cents : 0;
  const maxCents = Math.min(owedCents, refundCapacityCents(detail));
  const cards = cardRefundPayments(detail).map(({ payment, leftCents }) => ({
    value: payment.id,
    label: `A la tarjeta · Pago en línea del ${format(parseISO(payment.paymentDate), "d MMM yyyy")}`,
    maxCents: Math.min(owedCents, leftCents),
  }));
  const limit = (source: string) =>
    cards.find((card) => card.value === source)?.maxCents ?? maxCents;
  const newest = firstRefundPayment(detail)?.method;
  const basis = { payments: detail.payments, refunds: detail.refunds };
  const source = cards[0]?.value ?? manualRefundSource;
  return {
    cards,
    sources: [...cards, { value: manualRefundSource, label: "En mano o por transferencia" }],
    limit,
    basis,
    retryKey: `refund\n${JSON.stringify(basis)}`,
    schema: (source: string) =>
      source === manualRefundSource
        ? refundSchema(maxCents, detail.currency)
        : cardRefundSchema(limit(source), detail.currency),
    defaults: refundDefaults(
      limit(source),
      refundMethods.find((method) => method === newest),
      source,
    ),
  };
}

export function RefundForm({
  detail,
  disabled,
  onSave,
  onDone,
  onCancel,
  onDirtyChange,
}: FormProps) {
  const { today } = usePropertyCalendar();
  const checkboxId = useId();
  const [setup] = useState(() => refundSetup(detail));
  const form = useReservationForm({
    defaultValues: setup.defaults,
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => fieldIssues(setup.schema(value.source).safeParse(value)),
    },
    onSubmit: async ({ value }) => {
      if (disabled) return;
      if (value.source !== manualRefundSource) return returnToCard(value);
      const parsed = refundSchema(setup.limit(manualRefundSource), detail.currency).parse(value);
      const reference = parsed.reference.toUpperCase();
      const completed = parsed.handedOver
        ? { refundDate: parsed.date, ...(reference ? { reference } : {}) }
        : undefined;
      const amountCents = parseMajorToCents(parsed.amount.trim())!;
      const parts = splitRefund(setup.basis, amountCents);
      if (!parts.length || parts.reduce((sum, part) => sum + part.amountCents, 0) !== amountCents)
        return setServerErrors(form, {
          amount: "Los pagos recibidos no alcanzan para devolver este importe.",
        });
      const actions = parts.map((part): WorkflowAction => ({
        type: "request-refund",
        ...part,
        method: parsed.method,
        reason: parsed.reason,
        ...(completed ? { completed } : {}),
      }));
      const result = await onSave(actions, setup.retryKey);
      if (alreadyRecorded(result)) return;
      await finish(
        result,
        completed ? "Reembolso registrado" : "Reembolso solicitado",
        form,
        onDone,
      );
    },
  });
  async function returnToCard(value: RefundValues) {
    const parsed = cardRefundSchema(setup.limit(value.source), detail.currency).parse(value);
    const result = await onSave(
      [
        {
          type: "request-culqi-refund",
          paymentId: parsed.source,
          amountCents: parseMajorToCents(parsed.amount.trim())!,
          reason: parsed.reason,
        },
      ],
      setup.retryKey,
    );
    if (alreadyRecorded(result)) return;
    if (result.status === "failed") return toastError("No se pudo guardar", result.message);
    if (result.status === "rejected") return setServerErrors(form, result.fields);
    const requested = result.reservation.refunds.find(
      (refund) =>
        refund.paymentId === parsed.source &&
        refund.status === "requested" &&
        !setup.basis.refunds.some((earlier) => earlier.id === refund.id),
    );
    toast.add(
      requested
        ? { title: "Reembolso solicitado", description: culqiPendingLine, priority: "high" }
        : { title: "Reembolso registrado", type: "success" },
    );
    onDone();
  }
  function alreadyRecorded(result: ReservationCommandResult) {
    if (result.status !== "failed" || result.code !== earlierAttemptSaved) return false;
    toast.add({
      title: "Este reembolso ya se había registrado",
      description: "Se guardó con los datos del primer intento. Revísalo en Movimientos.",
      priority: "high",
      timeout: 7000,
    });
    onDone();
    return true;
  }
  const changed = !useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const handedOver = useSelector(form.store, (state) => state.values.handedOver);
  const source = useSelector(form.store, (state) => state.values.source);
  const manual = source === manualRefundSource;
  const maxCents = setup.limit(source);
  const saving = disabled || submitting;
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);
  useEffect(() => {
    if (form.state.fieldMeta.date?.errors.length) void form.validate("submit");
  }, [form, today]);
  return (
    <RefundFormLayout
      saving={saving}
      onSubmit={() => form.handleSubmit()}
      actions={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Cerrar
          </Button>
          <Button type="submit" disabled={saving || maxCents <= 0}>
            {saving
              ? "Guardando…"
              : !manual
                ? "Devolver a la tarjeta"
                : handedOver
                  ? "Registrar reembolso"
                  : "Solicitar reembolso"}
          </Button>
        </>
      }
    >
      {setup.cards.length > 0 && (
        <form.AppField name="source">
          {(field) => (
            <field.Radio
              label="Cómo se devuelve"
              options={setup.sources}
              onValueChange={(next, previous) => {
                const amount = form.getFieldValue("amount");
                const followed = setup.limit(previous);
                if (followed > 0 && amount === formatMajor(followed))
                  form.setFieldValue("amount", formatMajor(setup.limit(next)));
              }}
            />
          )}
        </form.AppField>
      )}
      {maxCents <= 0 && (
        <FieldDescription>No queda importe de pagos recibidos para devolver.</FieldDescription>
      )}
      <form.AppField name="amount">
        {(field) => <field.Text label={`Importe (${detail.currency})`} placeholder="0.00" />}
      </form.AppField>
      {manual && (
        <form.AppField name="method">
          {(field) => <field.Choice label="Método" options={refundMethodOptions} />}
        </form.AppField>
      )}
      <form.AppField name="reason">
        {(field) => <field.Text label="Motivo" type="textarea" max={2000} required />}
      </form.AppField>
      {manual && (
        <form.AppField name="handedOver">
          {(field) => (
            <Field orientation="horizontal">
              <Checkbox
                id={checkboxId}
                name={field.name}
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
              <FieldLabel htmlFor={checkboxId}>Ya se entregó el dinero</FieldLabel>
            </Field>
          )}
        </form.AppField>
      )}
      {manual &&
        (handedOver ? (
          <>
            <form.AppField name="date">
              {(field) => <field.Text label="Fecha" type="date" max={today} required />}
            </form.AppField>
            <form.AppField name="reference">
              {(field) => <field.Text label="Referencia · Opcional" />}
            </form.AppField>
          </>
        ) : (
          <FieldDescription>
            Quedará como reembolso solicitado hasta que lo confirmes en Movimientos.
          </FieldDescription>
        ))}
    </RefundFormLayout>
  );
}

export function ResolveRefundForm({
  detail,
  refund,
  disabled,
  onSave,
  onDone,
  onCancel,
  onDirtyChange,
  failing,
}: FormProps & { refund: ReservationRefund; failing: boolean }) {
  const { today } = usePropertyCalendar();
  const form = useReservationForm({
    defaultValues: { date: propertyToday(), reference: "", reason: "" },
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) =>
        fieldIssues((failing ? refundFailureSchema : refundCompletionSchema).safeParse(value)),
    },
    onSubmit: async ({ value }) => {
      if (disabled) return;
      if (failing) {
        const { reason } = refundFailureSchema.parse(value);
        await finish(
          await onSave([{ type: "fail-refund", refundId: refund.id, reason }]),
          "Reembolso marcado como fallido",
          form,
          onDone,
        );
        return;
      }
      const parsed = refundCompletionSchema.parse(value);
      const reference = parsed.reference.toUpperCase();
      await finish(
        await onSave([
          {
            type: "complete-refund",
            refundId: refund.id,
            refundDate: parsed.date,
            ...(reference ? { reference } : {}),
          },
        ]),
        "Reembolso confirmado",
        form,
        onDone,
      );
    },
  });
  const changed = !useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const saving = disabled || submitting;
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);
  useEffect(() => {
    if (form.state.fieldMeta.date?.errors.length) void form.validate("submit");
  }, [form, today]);
  const method = paymentMethods.find((entry) => entry.value === refund.method)?.label;
  return (
    <RefundFormLayout
      saving={saving}
      onSubmit={() => form.handleSubmit()}
      actions={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Cerrar
          </Button>
          <Button type="submit" variant={failing ? "destructive" : "default"} disabled={saving}>
            {saving ? "Guardando…" : failing ? "Marcar como fallido" : "Confirmar reembolso"}
          </Button>
        </>
      }
    >
      <FieldDescription>
        {formatMoney(refund.amountCents, detail.currency)}
        {method ? ` · ${method}` : ""}
        {refund.reason ? ` · ${refund.reason}` : ""}
      </FieldDescription>
      {refund.culqiChargeId && <FieldDescription>{culqiPendingLine}</FieldDescription>}
      {failing ? (
        <form.AppField name="reason">
          {(field) => <field.Text label="Motivo" type="textarea" max={2000} required />}
        </form.AppField>
      ) : (
        <>
          <form.AppField name="date">
            {(field) => <field.Text label="Fecha" type="date" max={today} required />}
          </form.AppField>
          <form.AppField name="reference">
            {(field) => <field.Text label="Referencia · Opcional" />}
          </form.AppField>
        </>
      )}
    </RefundFormLayout>
  );
}
