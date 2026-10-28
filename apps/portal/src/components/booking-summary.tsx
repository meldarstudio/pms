import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { useSelector } from "@tanstack/react-form";
import { cn } from "cn";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useReservationForm, blurThenChange } from "@/lib/reservation-form";
import { errorMessage } from "@/lib/form-errors";
import { discountSchema } from "@/lib/reservation-form-schemas";

import { BalanceLabel, balanceStatus } from "@/components/balance-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Field, FieldError } from "@/components/ui/field";
import { unsavedMessage, type ReservationCommandResult } from "@/lib/reservation-commands";
import { toastError } from "@/lib/toast";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import type { RatePlanCode, ReservationDetail } from "@/lib/api";
import { formatMajor, formatMoney, parseMajorToCents } from "@/lib/money";
import { ratePlanLabels } from "@/lib/rate-plans";

const amountColumn = "w-24 shrink-0 text-right tabular-nums";

export type BookingSummaryRoom = {
  key: string;
  typeName: string;
  adults: number | null;
  children: number | null;
  charges: Pick<
    ReservationDetail["rooms"][number],
    "subtotalCents" | "discountCents" | "totalCents"
  > | null;
};

export function BookingSummary({
  rooms,
  cancelled,
  summary,
  paidCents,
  schedule,
  currency,
  stayLabel,
  showPayments,
  message,
  error,
  editableDiscountCents,
  discountDisabled = false,
  onDiscountSave,
  onDiscountDirtyChange,
  provisional = false,
  collapsible = false,
  expanded = false,
  onExpandedChange,
}: {
  rooms: BookingSummaryRoom[];
  cancelled: boolean;
  summary: Pick<
    ReservationDetail,
    "subtotalCents" | "discountCents" | "totalCents" | "balanceCents"
  > | null;
  paidCents: number;
  /** The accepted rate plan and, when priced, its scheduled payments. */
  schedule?: {
    plan: RatePlanCode;
    amounts: Pick<
      ReservationDetail,
      "requiredInitialPaymentCents" | "remainingScheduledCents"
    > | null;
  };
  currency: string;
  stayLabel: string | null;
  showPayments: boolean;
  message: string | null;
  error?: ReactNode;
  editableDiscountCents?: number;
  discountDisabled?: boolean;
  onDiscountSave?: (amountCents: number) => Promise<DiscountSaveResult>;
  onDiscountDirtyChange?: (dirty: boolean) => void;
  provisional?: boolean;
  collapsible?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const titleId = useId();
  const panelId = useId();
  const balanceId = useId();
  const balance = showPayments && summary ? summary.balanceCents : null;
  const feedback = error || (!summary ? message : null);
  const discountDiffers =
    summary !== null &&
    editableDiscountCents !== undefined &&
    editableDiscountCents !== summary.discountCents;

  return (
    <section
      aria-labelledby={titleId}
      className={cn("min-w-0", collapsible && "flex min-h-0 flex-col")}
    >
      <Collapsible
        open={!collapsible || expanded}
        onOpenChange={onExpandedChange}
        render={<Card size="sm" className={cn(collapsible && "min-h-0 gap-0 py-0")} />}
      >
        <CollapsibleContent
          id={panelId}
          keepMounted
          className={cn(
            "flex min-h-0 flex-col gap-(--card-spacing) [&[hidden]]:hidden",
            collapsible &&
              "max-h-[min(22rem,calc(var(--reservation-viewport-height,100dvh)*0.45))] overflow-y-auto overscroll-contain py-3",
          )}
        >
          <CardHeader>
            <CardTitle className={cn(provisional && "flex items-center gap-2")}>
              <h3 id={titleId}>Resumen de reserva</h3>
              {provisional && !collapsible && <Badge variant="preview">Vista previa</Badge>}
            </CardTitle>
            {stayLabel && <CardDescription>{stayLabel}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-4">
              {(cancelled ? [] : rooms).map((room, index) => (
                <RoomSummary key={room.key} room={room} index={index} currency={currency} />
              ))}
            </div>
            <Separator />
            <dl className="flex flex-col gap-2">
              <SummaryRow
                label="Importe habitaciones"
                cents={summary?.subtotalCents ?? null}
                currency={currency}
              />
              {onDiscountSave ? (
                <>
                  <DiscountInput
                    label={discountDiffers ? "Descuento guardado" : "Descuento"}
                    amountCents={editableDiscountCents ?? 0}
                    disabled={discountDisabled}
                    onSave={onDiscountSave}
                    onDirtyChange={onDiscountDirtyChange}
                  />
                  {discountDiffers && (
                    <SummaryRow
                      label="Descuento aplicado"
                      cents={-summary.discountCents}
                      currency={currency}
                    />
                  )}
                </>
              ) : !summary || summary.discountCents > 0 ? (
                <SummaryRow
                  label="Descuentos"
                  cents={summary ? -summary.discountCents : null}
                  currency={currency}
                />
              ) : null}
            </dl>
            {showPayments ? (
              <dl className="flex flex-col gap-2">
                <SummaryRow
                  label="Total de reserva"
                  cents={summary?.totalCents ?? null}
                  currency={currency}
                />
                {schedule && (
                  <>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
                      <dt className="min-w-0 wrap-anywhere">Plan tarifario</dt>
                      <dd className="text-right">{ratePlanLabels[schedule.plan]}</dd>
                    </div>
                    <SummaryRow
                      label="Pago inicial requerido"
                      cents={schedule.amounts?.requiredInitialPaymentCents ?? null}
                      currency={currency}
                    />
                    <SummaryRow
                      label="Pago restante programado"
                      cents={schedule.amounts?.remainingScheduledCents ?? null}
                      currency={currency}
                    />
                  </>
                )}
                <SummaryRow label="Pagado" cents={paidCents} currency={currency} />
              </dl>
            ) : null}
            {feedback && !collapsible ? (
              <div role="status" className="text-muted-foreground">
                {feedback}
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
        <CardFooter
          aria-label={collapsible ? "Importes de la reserva" : undefined}
          aria-live={collapsible ? "polite" : undefined}
          aria-atomic={collapsible || undefined}
          className={cn(
            "shrink-0 flex-col items-stretch gap-3",
            collapsible ? "p-0" : balance !== null && balanceStatus(balance).tone,
            collapsible && !expanded && "border-t-0",
          )}
        >
          {collapsible ? (
            <>
              {feedback && (
                <div role="status" className="p-3">
                  {feedback}
                </div>
              )}
              <CollapsibleTrigger
                aria-label={expanded ? "Ocultar desglose" : "Ver desglose"}
                aria-describedby={balanceId}
                aria-controls={panelId}
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full border-0 p-0 text-left whitespace-normal focus-visible:ring-2 focus-visible:ring-inset has-data-[icon=inline-end]:pr-0"
                  />
                }
              >
                <span
                  className={cn(
                    "flex w-full items-center gap-3 px-2.5 py-1.5",
                    balance !== null && balanceStatus(balance).tone,
                  )}
                >
                  <span
                    id={balanceId}
                    className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      {balance !== null ? <BalanceLabel balanceCents={balance} /> : "Saldo"}
                      {provisional && <Badge variant="preview">Vista previa</Badge>}
                    </span>
                    <span className="tabular-nums">
                      {balance !== null ? formatMoney(Math.abs(balance), currency) : "—"}
                    </span>
                  </span>
                  {expanded ? (
                    <ChevronDownIcon aria-hidden data-icon="inline-end" />
                  ) : (
                    <ChevronUpIcon aria-hidden data-icon="inline-end" />
                  )}
                </span>
              </CollapsibleTrigger>
            </>
          ) : (
            <dl className="w-full text-sm font-semibold">
              <SummaryRow
                label={
                  balance !== null ? (
                    <BalanceLabel balanceCents={balance} />
                  ) : showPayments ? (
                    "Saldo pendiente"
                  ) : (
                    "Total de reserva"
                  )
                }
                cents={
                  summary
                    ? showPayments
                      ? Math.abs(summary.balanceCents)
                      : summary.totalCents
                    : null
                }
                currency={currency}
              />
            </dl>
          )}
        </CardFooter>
      </Collapsible>
    </section>
  );
}

/** A Reservation save's result, or `{ status: "saved" }` from a draft that keeps the value. */
type DiscountSaveResult =
  | { status: "saved" }
  | Exclude<ReservationCommandResult, { status: "saved" }>;

function discountDraft(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : formatMajor(cents);
}

function DiscountInput({
  label,
  amountCents,
  disabled,
  onSave,
  onDirtyChange,
}: {
  label: string;
  amountCents: number;
  disabled: boolean;
  onSave: (amountCents: number) => Promise<DiscountSaveResult>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const defaults = useMemo(() => ({ amount: discountDraft(amountCents) }), [amountCents]);
  const focused = useRef(false);
  const errorId = useId();
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: discountSchema },
    onSubmit: async ({ value }) => {
      if (disabled) return;
      const cents = parseMajorToCents(discountSchema.parse(value).amount.trim() || "0")!;
      const next = { amount: discountDraft(cents) };
      if (cents === amountCents) {
        form.reset(next);
        return;
      }
      const result = await onSave(cents);
      // A failed save keeps the draft so staff can retry it.
      if (result.status === "saved") form.reset(next);
      else toastError("No se pudo guardar el descuento", unsavedMessage(result));
    },
  });
  const value = useSelector(form.store, (state) => state.values.amount);
  const saving = useSelector(form.store, (state) => state.isSubmitting);
  useEffect(() => {
    onDirtyChange?.(parseMajorToCents(value.trim() || "0") !== amountCents);
  }, [value, amountCents, onDirtyChange]);
  useEffect(() => {
    if (!focused.current && form.state.isDefaultValue && !form.state.isSubmitting) {
      form.reset(defaults);
    }
  }, [form, defaults]);

  return (
    <form.Field name="amount">
      {(field) => {
        const error =
          field.state.meta.isBlurred || form.state.submissionAttempts
            ? errorMessage(field.state.meta.errors)
            : undefined;
        return (
          <>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-center gap-4">
              <dt className="min-w-0 wrap-anywhere">{label}</dt>
              <dd>
                <Field className="w-24" data-invalid={Boolean(error) || undefined}>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>S/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      aria-label="Descuento en soles"
                      aria-invalid={Boolean(error) || undefined}
                      aria-describedby={error ? errorId : undefined}
                      autoComplete="off"
                      className="px-2 text-right tabular-nums"
                      inputMode="decimal"
                      value={value}
                      disabled={disabled || saving}
                      onFocus={() => {
                        focused.current = true;
                      }}
                      onChange={(event) => {
                        field.handleChange(event.target.value);
                      }}
                      onBlur={() => {
                        focused.current = false;
                        field.handleBlur();
                        void form.handleSubmit();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </InputGroup>
                </Field>
              </dd>
            </div>
            {error ? (
              <FieldError id={errorId} className="col-span-2">
                {error}
              </FieldError>
            ) : null}
          </>
        );
      }}
    </form.Field>
  );
}

function RoomSummary({
  room,
  index,
  currency,
}: {
  room: BookingSummaryRoom;
  index: number;
  currency: string;
}) {
  const guests =
    room.adults === null || room.children === null
      ? "Revisa el número de huéspedes"
      : `${room.adults} ${room.adults === 1 ? "adulto" : "adultos"}${room.children > 0 ? ` · ${room.children} ${room.children === 1 ? "niño" : "niños"}` : ""}`;

  return (
    <section
      aria-label={`Habitación ${index + 1}: ${room.typeName}`}
      className="flex min-w-0 flex-col gap-1"
    >
      <dl>
        <SummaryRow
          label={room.typeName}
          cents={room.charges?.totalCents ?? null}
          currency={currency}
        />
      </dl>
      <p className="text-xs text-muted-foreground">{guests}</p>
    </section>
  );
}

function SummaryRow({
  label,
  cents,
  currency,
}: {
  label: ReactNode;
  cents: number | null;
  currency: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-baseline gap-4">
      <dt className="min-w-0 wrap-anywhere">{label}</dt>
      <dd className={amountColumn}>
        {cents === null ? (
          <span aria-label="No disponible">...</span>
        ) : (
          formatMoney(cents === 0 ? 0 : cents, currency)
        )}
      </dd>
    </div>
  );
}
