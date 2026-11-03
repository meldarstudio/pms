import { useEffect, useId, useMemo, useState } from "react";
import { cn } from "cn";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { useSelector } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldError } from "@/components/ui/field";
import {
  getCoupon,
  type CouponLookup,
  type ReservationDetail,
  type StayingGuest,
  type WorkflowAction,
} from "@/lib/api";
import { setServerErrors } from "@/lib/form-errors";
import { useReservationCommands, type ReservationCommandResult } from "@/lib/reservation-commands";
import { useReservationForm, blurThenChange, submitForm } from "@/lib/reservation-form";
import {
  guestSchema,
  guestDefaults,
  guestPayload,
  paymentSchema,
  paymentDefaults,
  paymentPayload,
  couponRedemptionSchema,
  type GuestValues,
  type PaymentValues,
} from "@/lib/reservation-form-schemas";
import { toast, toastError } from "@/lib/toast";
import { phoneDraft } from "@/lib/phone";
import { translateError } from "@/lib/errors";
import { formatMoney, parseMajorToCents } from "@/lib/money";
import { holdsInventory } from "@/lib/reservation-statuses";

export const paymentMethods = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "yape", label: "Yape" },
  { value: "plin", label: "Plin" },
  { value: "other", label: "Otro" },
];

const normalizeCouponCode = (code: string) => code.replace(/[\s-]/g, "").toUpperCase();
type PaymentEntryValues = Omit<PaymentValues, "method"> & {
  method: PaymentValues["method"] | "coupon";
  code: string;
};

type CouponCheck = { code: string; coupon?: CouponLookup; error?: string };

function couponProblem(coupon: CouponLookup, detail: ReservationDetail, today: string) {
  const appliedCode = detail.couponMovements.find((movement) => movement.kind === "redeem")?.code;
  return coupon.expiresOn < today
    ? "coupon has expired"
    : detail.checkIn > coupon.expiresOn
      ? "stay starts after the coupon expires"
      : coupon.balanceCents <= 0
        ? "coupon redemption exceeds its balance"
        : coupon.sourceReservationId === detail.id
          ? "coupon cannot be redeemed on the reservation that issued it"
          : appliedCode && appliedCode !== coupon.code
            ? "reservation already uses another coupon"
            : !holdsInventory(detail.status)
              ? "coupon requires an active reservation"
              : null;
}

function couponAmountProblem(coupon: CouponLookup, amountCents: number, detail: ReservationDetail) {
  return amountCents > coupon.balanceCents
    ? "coupon redemption exceeds its balance"
    : amountCents > detail.balanceCents
      ? "coupon redemption exceeds the balance owed"
      : null;
}

export function GuestEntryForm({
  detail,
  guest,
  disabled,
  onSave,
  onDirtyChange,
  onDone,
  onCancel,
  scrollable = false,
  undoable = false,
}: {
  detail: ReservationDetail;
  guest?: StayingGuest;
  disabled: boolean;
  onSave: (guests: StayingGuest[]) => Promise<ReservationCommandResult>;
  onDirtyChange: (dirty: boolean) => void;
  onDone?: () => void;
  onCancel?: () => void;
  scrollable?: boolean;
  undoable?: boolean;
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
        },
  );
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: guestSchema },
    onSubmit: async ({ value }) => {
      if (disabled) return;
      const payload = guestPayload(value);
      const result = await onSave(
        guest
          ? detail.stayingGuests.map((entry) => (entry.id === guest.id ? payload : entry))
          : [...detail.stayingGuests, payload],
      );
      if (result.status === "rejected") return setServerErrors(form, result.fields);
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
    <form
      noValidate
      className={cn(scrollable && "flex min-h-0 flex-1 flex-col overflow-hidden")}
      onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
    >
      <fieldset
        disabled={disabled || submitting}
        className={cn(
          "flex min-w-0 flex-col gap-3",
          scrollable && "min-h-0 flex-1 overflow-hidden",
        )}
      >
        <FieldGroup
          className={cn(
            "gap-3",
            scrollable && "min-h-0 flex-1 overflow-y-auto overscroll-contain p-px",
          )}
        >
          <form.AppField name="fullName">
            {(field) => <field.Text label="Nombre completo" />}
          </form.AppField>
          <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form.AppField name="email">
              {(field) => <field.Text label="Correo · Opcional" type="email" />}
            </form.AppField>
            <form.AppField name="phone">{(field) => <field.Phone />}</form.AppField>
          </FieldGroup>
          <FieldGroup className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-2">
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
        <div className={cn("flex shrink-0 items-center gap-2", onCancel && "justify-end")}>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          {undoable && <UndoChanges disabled={unchanged} onClick={() => form.reset(defaults)} />}
          <Button
            type="submit"
            disabled={disabled || submitting || (!guest && detail.stayingGuests.length >= 200)}
          >
            {submitting ? "Guardando…" : guest ? "Guardar" : "Agregar huésped"}
          </Button>
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
  scrollable = false,
  onCancel,
  onSaved,
  undoable = false,
}: {
  detail: ReservationDetail;
  suggestedAmountCents?: number;
  disabled: boolean;
  onReady: (title: string, actions: WorkflowAction[]) => Promise<ReservationCommandResult>;
  onDirtyChange: (dirty: boolean) => void;
  scrollable?: boolean;
  onCancel?: () => void;
  onSaved?: (detail: ReservationDetail) => void;
  undoable?: boolean;
}) {
  const { today } = usePropertyCalendar();
  const { canReplay } = useReservationCommands(detail.id);
  const appliedCode =
    detail.couponMovements.find((movement) => movement.kind === "redeem")?.code ?? "";
  const [savedDefaults, setSavedDefaults] = useState<PaymentValues | null>(null);
  const defaults = useMemo<PaymentEntryValues>(
    () => ({
      ...(savedDefaults ?? paymentDefaults(suggestedAmountCents ?? detail.balanceCents)),
      code: appliedCode,
    }),
    [savedDefaults, suggestedAmountCents, detail.balanceCents, appliedCode],
  );
  const [couponCheck, setCouponCheck] = useState<CouponCheck | null>(null);
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => {
        const result =
          value.method === "coupon"
            ? couponRedemptionSchema.safeParse(value)
            : paymentSchema.safeParse(value);
        return result.success
          ? undefined
          : {
              fields: Object.fromEntries(
                result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
              ),
            };
      },
    },
    onSubmit: async ({ value }): Promise<void> => {
      if (disabled) return;
      let actions: WorkflowAction[];
      if (value.method === "coupon") {
        const cents = parseMajorToCents(value.amount.trim());
        if (!cents) return;
        const code = normalizeCouponCode(value.code);
        const redemption: WorkflowAction[] = [{ type: "redeem-coupon", code, amountCents: cents }];
        if (!canReplay(redemption)) {
          let coupon: CouponLookup;
          try {
            coupon = await getCoupon(code);
          } catch (error) {
            if (!(error instanceof Error)) throw error;
            return setCouponCheck({ code, error: error.message });
          }
          setCouponCheck({ code, coupon });
          if (couponProblem(coupon, detail, today) || couponAmountProblem(coupon, cents, detail))
            return;
        }
        actions = redemption;
      } else {
        actions = [{ type: "add-payment", payment: paymentPayload(paymentSchema.parse(value)) }];
      }
      const result = await onReady(
        value.method === "coupon" ? "Cupón aplicado" : "Pago registrado",
        actions,
      );
      if (result.status === "rejected") return setServerErrors(form, result.fields);
      if (result.status === "failed")
        return toastError("No se pudo guardar el pago", result.message);
      const next = { ...paymentDefaults(), date: value.date };
      setSavedDefaults(next);
      setCouponCheck(null);
      form.reset({
        ...next,
        code:
          result.reservation.couponMovements.find((movement) => movement.kind === "redeem")?.code ??
          "",
      });
      onSaved?.(result.reservation);
    },
  });
  useEffect(() => {
    if (form.state.fieldMeta.date?.errors.length) void form.validate("submit");
  }, [form, today]);
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const method = useSelector(form.store, (state) => state.values.method);
  const code = useSelector(form.store, (state) => state.values.code);
  const amount = useSelector(form.store, (state) => state.values.amount);
  const normalizedCode = normalizeCouponCode(code);
  const amountCents = parseMajorToCents(amount.trim());
  const replaying =
    method === "coupon" &&
    amountCents !== null &&
    canReplay([{ type: "redeem-coupon", code: normalizedCode, amountCents }]);
  const checked =
    method === "coupon" && !replaying && couponCheck?.code === normalizedCode ? couponCheck : null;
  const checkedCoupon = checked?.coupon;
  const codeProblem = checkedCoupon && couponProblem(checkedCoupon, detail, today);
  const lookupError = checked?.error ?? (codeProblem ? translateError(codeProblem) : null);
  const amountProblem =
    checkedCoupon && !codeProblem && amountCents
      ? couponAmountProblem(checkedCoupon, amountCents, detail)
      : null;
  const amountErrorId = useId();
  const lookupErrorId = useId();
  useEffect(() => onDirtyChange(!unchanged), [unchanged, onDirtyChange]);
  return (
    <form
      noValidate
      className={cn("flex min-w-0 flex-col gap-3", scrollable && "min-h-0 flex-1 overflow-hidden")}
      onSubmit={(event) =>
        void submitForm(event, async () => {
          await form.validate("submit");
          await form.handleSubmit();
        })
      }
    >
      <fieldset
        disabled={disabled || submitting}
        className={cn(
          "flex min-w-0 flex-col gap-3",
          scrollable && "min-h-0 flex-1 overflow-hidden",
        )}
      >
        <FieldGroup
          className={cn(
            "grid grid-cols-2 gap-3",
            scrollable && "min-h-0 flex-1 overflow-y-auto overscroll-contain p-px",
          )}
        >
          <FieldGroup className="gap-2">
            <form.AppField name="amount">
              {(field) => (
                <field.Text
                  label="Importe S/"
                  placeholder="0.00"
                  groupErrorId={amountProblem ? amountErrorId : undefined}
                />
              )}
            </form.AppField>
            {amountProblem && (
              <FieldError id={amountErrorId}>{translateError(amountProblem)}</FieldError>
            )}
          </FieldGroup>
          <form.AppField name="method">
            {(field) => (
              <field.Choice
                label="Método"
                options={[...paymentMethods, { value: "coupon", label: "Cupón" }]}
              />
            )}
          </form.AppField>
          {method === "coupon" ? (
            <FieldGroup className="col-span-2 gap-2">
              <form.AppField name="code">
                {(field) => (
                  <field.Text
                    label="Código del cupón"
                    groupErrorId={lookupError ? lookupErrorId : undefined}
                  />
                )}
              </form.AppField>
              {replaying && (
                <p role="status" className="text-xs text-muted-foreground">
                  El intento anterior pudo guardarse. Reintenta para confirmar sin duplicar el
                  canje.
                </p>
              )}
              {lookupError ? (
                <FieldError id={lookupErrorId}>{lookupError}</FieldError>
              ) : checkedCoupon ? (
                <p className="text-xs text-muted-foreground">
                  Saldo {formatMoney(checkedCoupon.balanceCents, detail.currency)} · Vence el{" "}
                  {checkedCoupon.expiresOn} · No canjeable por dinero
                </p>
              ) : null}
            </FieldGroup>
          ) : (
            <>
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
              {scrollable && (
                <div className="col-span-2">
                  <form.AppField name="reason">
                    {(field) => <field.Text label="Nota del pago" type="textarea" max={2000} />}
                  </form.AppField>
                </div>
              )}
            </>
          )}
        </FieldGroup>
        <div className={cn("flex shrink-0 gap-2", scrollable && "justify-end")}>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || submitting}
              onClick={onCancel}
            >
              Cerrar
            </Button>
          )}
          {undoable && (
            <UndoChanges
              disabled={unchanged}
              onClick={() => {
                form.reset(defaults);
                setCouponCheck(null);
              }}
            />
          )}
          <Button type="submit" className="w-fit" disabled={disabled || submitting}>
            {submitting
              ? "Guardando…"
              : method === "coupon"
                ? "Aplicar cupón"
                : scrollable
                  ? "Guardar cambios"
                  : "Agregar pago"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function UndoChanges({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" disabled={disabled} onClick={onClick}>
      Deshacer cambios
    </Button>
  );
}
