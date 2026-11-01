import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { useSelector } from "@tanstack/react-form";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldError } from "@/components/ui/field";
import type { ReservationDetail, StayingGuest, WorkflowAction } from "@/lib/api";
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
import { useCoupon } from "@/lib/queries";
import { translateError } from "@/lib/errors";
import { formatMajor, formatMoney, parseMajorToCents } from "@/lib/money";

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

export function GuestEntryForm({
  detail,
  guest,
  disabled,
  onSave,
  onDirtyChange,
  onDone,
  onCancel,
  scrollable = false,
}: {
  detail: ReservationDetail;
  guest?: StayingGuest;
  disabled: boolean;
  onSave: (guests: StayingGuest[]) => Promise<ReservationCommandResult>;
  onDirtyChange: (dirty: boolean) => void;
  onDone?: () => void;
  onCancel?: () => void;
  scrollable?: boolean;
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
        <div className="flex shrink-0 items-center gap-2">
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
  scrollable = false,
  onCancel,
  onSaved,
}: {
  detail: ReservationDetail;
  suggestedAmountCents?: number;
  disabled: boolean;
  onReady: (title: string, actions: WorkflowAction[]) => Promise<ReservationCommandResult>;
  onDirtyChange: (dirty: boolean) => void;
  scrollable?: boolean;
  onCancel?: () => void;
  onSaved?: (detail: ReservationDetail) => void;
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
  const [lookupCode, setLookupCode] = useState("");
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
        const redemption: WorkflowAction[] = [
          { type: "redeem-coupon", code: normalizeCouponCode(value.code), amountCents: cents },
        ];
        const replay = canReplay(redemption);
        if (
          !replay &&
          (!currentCoupon ||
            normalizeCouponCode(value.code) !== lookupCode ||
            lookup.isFetching ||
            lookup.isError ||
            couponProblem)
        )
          return;
        if (
          !replay &&
          currentCoupon &&
          cents > Math.min(currentCoupon.balanceCents, detail.balanceCents)
        ) {
          setServerErrors(form, {
            amount: translateError(
              cents > currentCoupon.balanceCents
                ? "coupon redemption exceeds its balance"
                : "coupon redemption exceeds the balance owed",
            ),
          });
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
  useEffect(() => {
    const timer = setTimeout(() => setLookupCode(normalizedCode), 250);
    return () => clearTimeout(timer);
  }, [normalizedCode]);
  const lookup = useCoupon(lookupCode, method === "coupon" && normalizedCode === lookupCode);
  const currentCoupon =
    method === "coupon" && normalizedCode === lookupCode ? lookup.data : undefined;
  const couponProblem =
    currentCoupon &&
    (currentCoupon.expiresOn < today
      ? "coupon has expired"
      : detail.checkIn > currentCoupon.expiresOn
        ? "stay starts after the coupon expires"
        : currentCoupon.balanceCents <= 0
          ? "coupon redemption exceeds its balance"
          : currentCoupon.sourceReservationId === detail.id
            ? "coupon cannot be redeemed on the reservation that issued it"
            : appliedCode && appliedCode !== currentCoupon.code
              ? "reservation already uses another coupon"
              : !["confirmed", "checked_in", "checked_out"].includes(detail.status)
                ? "coupon requires an active reservation"
                : null);
  const prefilledCode = useRef("");
  useEffect(() => {
    if (method !== "coupon") {
      prefilledCode.current = "";
      return;
    }
    if (
      !currentCoupon ||
      couponProblem ||
      lookup.isFetching ||
      lookup.isError ||
      prefilledCode.current === currentCoupon.code
    )
      return;
    form.setFieldValue(
      "amount",
      formatMajor(Math.min(detail.balanceCents, currentCoupon.balanceCents)),
    );
    prefilledCode.current = currentCoupon.code;
  }, [
    method,
    currentCoupon,
    couponProblem,
    detail.balanceCents,
    form,
    lookup.isFetching,
    lookup.isError,
  ]);
  const amountProblem =
    !replaying &&
    currentCoupon &&
    amountCents !== null &&
    amountCents > 0 &&
    (amountCents > currentCoupon.balanceCents
      ? "coupon redemption exceeds its balance"
      : amountCents > detail.balanceCents
        ? "coupon redemption exceeds the balance owed"
        : null);
  const lookupError =
    !replaying && normalizedCode === lookupCode
      ? couponProblem
        ? translateError(couponProblem)
        : lookup.error?.message
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
              ) : currentCoupon ? (
                <p className="text-xs text-muted-foreground">
                  Saldo {formatMoney(currentCoupon.balanceCents, detail.currency)} · Vence el{" "}
                  {currentCoupon.expiresOn} · No canjeable por dinero
                </p>
              ) : normalizedCode ? (
                <p role="status" className="text-xs text-muted-foreground">
                  Buscando cupón…
                </p>
              ) : null}
              {lookup.isError && normalizedCode === lookupCode && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  onClick={() => void lookup.refetch()}
                >
                  Reintentar
                </Button>
              )}
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
                <form.AppField name="reason">
                  {(field) => <field.Text label="Nota del pago" type="textarea" max={2000} />}
                </form.AppField>
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
          <Button
            type="submit"
            className="w-fit"
            disabled={
              disabled ||
              submitting ||
              (method === "coupon" &&
                !replaying &&
                (!currentCoupon || lookup.isFetching || !!lookupError || !!amountProblem))
            }
          >
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
