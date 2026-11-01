import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useSelector } from "@tanstack/react-form";
import type { ZodSafeParseResult } from "zod";
import { accountStatus } from "@/components/balance-status";
import { paymentMethods } from "@/components/reservation-entry-forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { ReservationDetail, ReservationRefund, WorkflowAction } from "@/lib/api";
import { setServerErrors } from "@/lib/form-errors";
import { formatMoney, parseMajorToCents } from "@/lib/money";
import { propertyToday } from "@/lib/property-calendar";
import type { ReservationCommandResult } from "@/lib/reservation-commands";
import { blurThenChange, submitForm, useReservationForm } from "@/lib/reservation-form";
import {
  refundCompletionSchema,
  refundDefaults,
  refundFailureSchema,
  refundMethods,
  refundSchema,
} from "@/lib/reservation-form-schemas";
import { firstRefundPayment, refundCapacityCents, splitRefund } from "@/lib/refund-split";
import { toast, toastError } from "@/lib/toast";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

type FormProps = {
  detail: ReservationDetail;
  disabled: boolean;
  onSave: (actions: WorkflowAction[]) => Promise<ReservationCommandResult>;
  onSaved: (saved: ReservationDetail) => void;
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
  onSaved: (saved: ReservationDetail) => void,
) {
  if (result.status === "saved") {
    toast.add({ title, type: "success" });
    onSaved(result.reservation);
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

export function RefundForm({
  detail,
  disabled,
  onSave,
  onSaved,
  onCancel,
  onDirtyChange,
}: FormProps) {
  const { today } = usePropertyCalendar();
  const checkboxId = useId();
  const [setup] = useState(() => {
    const status = accountStatus(detail);
    const maxCents = Math.min(
      status.state === "owed-back" ? status.cents : 0,
      refundCapacityCents(detail),
    );
    const newest = firstRefundPayment(detail)?.method;
    return {
      maxCents,
      schema: refundSchema(maxCents, detail.currency),
      defaults: refundDefaults(
        maxCents,
        refundMethods.find((method) => method === newest),
      ),
    };
  });
  const form = useReservationForm({
    defaultValues: setup.defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: ({ value }) => fieldIssues(setup.schema.safeParse(value)) },
    onSubmit: async ({ value }) => {
      if (disabled) return;
      const parsed = setup.schema.parse(value);
      const reference = parsed.reference.toUpperCase();
      const completed = parsed.handedOver
        ? { refundDate: parsed.date, ...(reference ? { reference } : {}) }
        : undefined;
      const actions = splitRefund(detail, parseMajorToCents(parsed.amount.trim())!).map(
        (part): WorkflowAction => ({
          type: "request-refund",
          ...part,
          method: parsed.method,
          reason: parsed.reason,
          ...(completed ? { completed } : {}),
        }),
      );
      await finish(
        await onSave(actions),
        completed ? "Reembolso registrado" : "Reembolso solicitado",
        form,
        onSaved,
      );
    },
  });
  const changed = !useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const handedOver = useSelector(form.store, (state) => state.values.handedOver);
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
          <Button type="submit" disabled={saving || setup.maxCents <= 0}>
            {saving ? "Guardando…" : handedOver ? "Registrar reembolso" : "Solicitar reembolso"}
          </Button>
        </>
      }
    >
      {setup.maxCents <= 0 && (
        <FieldDescription>No queda importe de pagos recibidos para devolver.</FieldDescription>
      )}
      <form.AppField name="amount">
        {(field) => <field.Text label={`Importe (${detail.currency})`} placeholder="0.00" />}
      </form.AppField>
      <form.AppField name="method">
        {(field) => <field.Choice label="Método" options={refundMethodOptions} />}
      </form.AppField>
      <form.AppField name="reason">
        {(field) => <field.Text label="Motivo" type="textarea" max={2000} required />}
      </form.AppField>
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
      {handedOver ? (
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
      )}
    </RefundFormLayout>
  );
}

export function ResolveRefundForm({
  detail,
  refund,
  disabled,
  onSave,
  onSaved,
  onCancel,
  onDirtyChange,
}: FormProps & { refund: ReservationRefund }) {
  const { today } = usePropertyCalendar();
  const [failing, setFailing] = useState(false);
  const failingRef = useRef(false);
  function chooseFailing(next: boolean) {
    failingRef.current = next;
    setFailing(next);
  }
  const form = useReservationForm({
    defaultValues: { date: propertyToday(), reference: "", reason: "" },
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) =>
        fieldIssues(
          (failingRef.current ? refundFailureSchema : refundCompletionSchema).safeParse(value),
        ),
    },
    onSubmit: async ({ value }) => {
      if (disabled) return;
      if (failingRef.current) {
        const { reason } = refundFailureSchema.parse(value);
        await finish(
          await onSave([{ type: "fail-refund", refundId: refund.id, reason }]),
          "Reembolso marcado como fallido",
          form,
          onSaved,
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
        onSaved,
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
        failing ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => chooseFailing(false)}
            >
              Volver
            </Button>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving ? "Guardando…" : "Marcar como fallido"}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
              disabled={saving}
              onClick={() => chooseFailing(true)}
            >
              Marcar como fallido
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
              Cerrar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Confirmar reembolso"}
            </Button>
          </>
        )
      }
    >
      <FieldDescription>
        {formatMoney(refund.amountCents, detail.currency)}
        {method ? ` · ${method}` : ""}
        {refund.requestedBy ? ` · Solicitó ${refund.requestedBy}` : ""}
        {refund.reason ? ` · ${refund.reason}` : ""}
      </FieldDescription>
      {refund.culqiChargeId && (
        <FieldDescription>
          Comprueba el resultado en Culqi antes de confirmarlo o marcarlo como fallido.
        </FieldDescription>
      )}
      {failing ? (
        <>
          <FieldDescription>
            El reembolso queda registrado como fallido y el dinero sigue por devolver.
          </FieldDescription>
          <form.AppField name="reason">
            {(field) => <field.Text label="Motivo" type="textarea" max={2000} required />}
          </form.AppField>
        </>
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
