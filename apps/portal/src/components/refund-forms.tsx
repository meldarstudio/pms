import { useEffect, useId, useState, type ReactNode } from "react";
import { useSelector } from "@tanstack/react-form";
import { CheckIcon, CopyIcon } from "lucide-react";
import { parseISO } from "date-fns";
import type { ZodSafeParseResult } from "zod";
import { accountStatus } from "@/components/balance-status";
import { PageError } from "@/components/page-error";
import { outcomeSaveError } from "@/components/outcome-command-preview";
import { CommandRecovery } from "@/components/command-recovery";
import { paymentMethods } from "@/components/reservation-entry-forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import type {
  ReservationCoupon,
  ReservationDetail,
  ReservationRefund,
  WorkflowAction,
} from "@/lib/api";
import { copyCouponMessage } from "@/lib/coupon-message";
import { setServerErrors } from "@/lib/form-errors";
import { format, longDate } from "@/lib/dates";
import { formatMajor, formatMoney, parseMajorToCents } from "@/lib/money";
import { propertyToday } from "@/lib/property-calendar";
import { useReservation } from "@/lib/queries";
import {
  earlierAttemptSaved,
  useDebouncedReservationPreview,
  type ReservationCommandResult,
} from "@/lib/reservation-commands";
import { blurThenChange, submitForm, useReservationForm } from "@/lib/reservation-form";
import {
  cardRefundSchema,
  couponIssueSchema,
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
import { toast } from "@/lib/toast";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

type FormProps = {
  detail: ReservationDetail;
  disabled: boolean;
  onSave: (actions: WorkflowAction[], retryKey?: string) => Promise<ReservationCommandResult>;
  onDone: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
};

type ReturnSelection = { kind: string; source: string };
type ReturnChoice =
  | { kind: "coupon" | "manual"; maxCents: number }
  | { kind: "card"; paymentId: string; maxCents: number };

const returnKinds = [
  { value: "coupon", label: "Cupón" },
  { value: "money", label: "Dinero" },
];

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
  } else if (result.status === "failed") outcomeSaveError(result);
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
  const choice = ({ kind, source }: ReturnSelection): ReturnChoice | null => {
    if (kind === "coupon") return { kind: "coupon", maxCents: owedCents };
    if (kind !== "money") return null;
    if (source === manualRefundSource) return { kind: "manual", maxCents };
    const card = cards.find((card) => card.value === source);
    return card ? { kind: "card", paymentId: card.value, maxCents: card.maxCents } : null;
  };
  const limit = (selection: ReturnSelection) => choice(selection)?.maxCents ?? 0;
  const newest = firstRefundPayment(detail)?.method;
  const basis = { payments: detail.payments, refunds: detail.refunds };
  const couponIds = detail.coupons.map((coupon) => coupon.id);
  const source = cards[0]?.value ?? manualRefundSource;
  return {
    cards,
    sources: [...cards, { value: manualRefundSource, label: "En mano o por transferencia" }],
    limit,
    choice,
    basis,
    couponIds,
    retryKey: `refund\n${JSON.stringify({ ...basis, couponIds })}`,
    schema: (value: RefundValues) => {
      const selected = choice(value);
      if (selected?.kind === "coupon") return couponIssueSchema(selected.maxCents, detail.currency);
      if (selected?.kind === "card") return cardRefundSchema(selected.maxCents, detail.currency);
      return refundSchema(selected?.maxCents ?? 0, detail.currency);
    },
    defaults: refundDefaults(
      owedCents,
      refundMethods.find((method) => method === newest),
      source,
      "coupon",
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
  onCouponIssued,
}: FormProps & { onCouponIssued: (coupon: ReservationCoupon) => void }) {
  const { today } = usePropertyCalendar();
  const checkboxId = useId();
  const [setup] = useState(() => refundSetup(detail));
  const form = useReservationForm({
    defaultValues: setup.defaults,
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => fieldIssues(setup.schema(value).safeParse(value)),
    },
    onSubmit: async ({ value }) => {
      if (disabled) return;
      const selected = setup.choice(value);
      if (!selected) return;
      if (selected.kind === "coupon") return issueCoupon(value);
      if (selected.kind === "card") return returnToCard(value, selected.paymentId);
      const parsed = refundSchema(setup.limit(value), detail.currency).parse(value);
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
  async function issueCoupon(value: RefundValues) {
    if (!couponPreviewReady || !expiresOn) return;
    const parsed = couponIssueSchema(setup.limit(value), detail.currency).parse(value);
    const amountCents = parseMajorToCents(parsed.amount.trim())!;
    const result = await onSave(
      [
        {
          type: "issue-coupon",
          amountCents,
          guestAccepted: true,
        },
      ],
      setup.retryKey,
    );
    if (alreadyRecorded(result)) return;
    if (result.status === "failed") return outcomeSaveError(result);
    if (result.status === "rejected") return setServerErrors(form, result.fields);
    const coupons = result.reservation.coupons.filter(
      (entry) => !setup.couponIds.includes(entry.id) && entry.valueCents === amountCents,
    );
    if (coupons.length === 1) return onCouponIssued(coupons[0]);
    toast.add({ title: "Cupón emitido", type: "success" });
    onDone();
  }
  async function returnToCard(value: RefundValues, paymentId: string) {
    const parsed = cardRefundSchema(setup.limit(value), detail.currency).parse(value);
    const result = await onSave(
      [
        {
          type: "request-culqi-refund",
          paymentId,
          amountCents: parseMajorToCents(parsed.amount.trim())!,
          reason: parsed.reason,
        },
      ],
      setup.retryKey,
    );
    if (alreadyRecorded(result)) return;
    if (result.status === "failed") return outcomeSaveError(result);
    if (result.status === "rejected") return setServerErrors(form, result.fields);
    const candidates = result.reservation.refunds.filter(
      (refund) =>
        refund.paymentId === paymentId &&
        refund.culqiChargeId ===
          detail.payments.find((payment) => payment.id === paymentId)?.culqiChargeId &&
        refund.amountCents === parseMajorToCents(parsed.amount.trim()) &&
        refund.reason === parsed.reason &&
        !setup.basis.refunds.some((earlier) => earlier.id === refund.id),
    );
    const returned = candidates.length === 1 ? candidates[0] : undefined;
    toast.add(
      returned?.status === "requested"
        ? { title: "Reembolso solicitado", description: culqiPendingLine, priority: "high" }
        : returned?.status === "completed"
          ? { title: "Reembolso registrado", type: "success" }
          : {
              title: "Solicitud procesada",
              description: "Revisa el resultado en Movimientos.",
              priority: "high",
            },
    );
    onDone();
  }
  function alreadyRecorded(result: ReservationCommandResult) {
    if (result.status !== "failed" || result.code !== earlierAttemptSaved) return false;
    toast.add({
      title: "Los cambios ya se habían guardado",
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
  const kind = useSelector(form.store, (state) => state.values.kind);
  const amount = useSelector(form.store, (state) => state.values.amount);
  const selected = setup.choice({ kind, source });
  const coupon = selected?.kind === "coupon";
  const manual = selected?.kind === "manual";
  const maxCents = selected?.maxCents ?? 0;
  const previewAmount = parseMajorToCents(amount.trim()) ?? 0;
  const previewEnabled = coupon && previewAmount > 0 && previewAmount <= maxCents;
  const preview = useDebouncedReservationPreview(
    detail.id,
    [{ type: "issue-coupon", amountCents: previewAmount, guestAccepted: true }],
    previewEnabled,
    today,
  );
  const couponPreviewReady =
    previewEnabled &&
    preview.current &&
    preview.isSuccess &&
    !preview.isFetching &&
    !preview.data.validation.issues.length;
  const expiresOn = couponPreviewReady
    ? preview.data.billing.coupons.findLast((entry) => !setup.couponIds.includes(entry.id))
        ?.expiresOn
    : undefined;
  const saving = disabled || submitting;
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);
  useEffect(() => {
    if (form.state.fieldMeta.date?.errors.length) void form.validate("submit");
  }, [form, today]);
  function followLimit(previous: ReturnSelection, next: ReturnSelection) {
    const followed = setup.limit(previous);
    if (followed > 0 && form.getFieldValue("amount") === formatMajor(followed))
      form.setFieldValue("amount", formatMajor(setup.limit(next)));
  }
  return (
    <RefundFormLayout
      saving={saving}
      onSubmit={() => form.handleSubmit()}
      actions={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Cerrar
          </Button>
          <Button
            type="submit"
            disabled={saving || maxCents <= 0 || (coupon && (!couponPreviewReady || !expiresOn))}
          >
            {saving
              ? "Guardando…"
              : coupon
                ? "Emitir cupón"
                : !manual
                  ? "Devolver a la tarjeta"
                  : handedOver
                    ? "Registrar reembolso"
                    : "Solicitar reembolso"}
          </Button>
        </>
      }
    >
      <CommandRecovery
        reservationId={detail.id}
        retryKey={setup.retryKey}
        disabled={saving}
        onDone={onDone}
      />
      <form.AppField name="kind">
        {(field) => (
          <field.ChoiceCards
            label="Devolver como"
            optionsClassName="grid-cols-2"
            options={returnKinds}
            onValueChange={(next, previous) =>
              followLimit({ kind: previous, source }, { kind: next, source })
            }
          />
        )}
      </form.AppField>
      {!coupon && setup.cards.length > 0 && (
        <form.AppField name="source">
          {(field) => (
            <field.Radio
              label="Cómo se devuelve"
              options={setup.sources}
              onValueChange={(next, previous) =>
                followLimit({ kind, source: previous }, { kind, source: next })
              }
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
      {coupon && maxCents > 0 && (
        <>
          {expiresOn ? (
            <FieldDescription>
              Vence el {longDate(expiresOn)} · No canjeable por dinero
            </FieldDescription>
          ) : preview.current && preview.error && !preview.isFetching ? (
            <PageError error={preview.error} onRetry={() => void preview.refetch()} />
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Calculando…
            </p>
          )}
        </>
      )}
      {manual && (
        <form.AppField name="method">
          {(field) => <field.Choice label="Método" options={refundMethodOptions} />}
        </form.AppField>
      )}
      {!coupon && (
        <form.AppField name="reason">
          {(field) => <field.Text label="Motivo" type="textarea" max={2000} required />}
        </form.AppField>
      )}
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

export function CouponIssued({
  coupon: issued,
  reservationId,
  currency,
  onDone,
}: {
  coupon: ReservationCoupon;
  reservationId: string;
  currency: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const reservation = useReservation(reservationId);
  const coupon = reservation.data?.coupons.find((entry) => entry.id === issued.id) ?? issued;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <p className="font-mono text-3xl font-semibold tracking-widest break-all">{coupon.code}</p>
        <p className="text-sm text-muted-foreground">
          Saldo {formatMoney(coupon.balanceCents, currency)} · Vence el {longDate(coupon.expiresOn)}{" "}
          · No canjeable por dinero
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={async () => setCopied(await copyCouponMessage(coupon, currency))}
        >
          {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          <span aria-live="polite">{copied ? "Mensaje copiado" : "Copiar mensaje"}</span>
        </Button>
        <Button type="button" onClick={onDone}>
          Listo
        </Button>
      </div>
    </div>
  );
}
