import { useId, type ReactNode } from "react";
import { cn } from "cn";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { accountStatus } from "@/components/balance-status";
import { DiscountPopover } from "@/components/discount-popover";
import { NightlyPriceDetail } from "@/components/nightly-price-detail";
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
import type { ReservationDetail, WorkflowBilling } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { unsavedMessage, type ReservationCommandResult } from "@/lib/reservation-commands";
import { toastError } from "@/lib/toast";

export type BookingSummaryRoom = {
  key: string;
  typeName: string;
  adults: number | null;
  children: number | null;
  nights?: { date: string; priceCents: number }[];
  charges: Pick<
    ReservationDetail["rooms"][number],
    "subtotalCents" | "discountCents" | "totalCents"
  > | null;
};

export function BookingSummary({
  rooms,
  cancelled,
  summary,
  currency,
  stayLabel,
  showNightlyPrices = false,
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
  summary: WorkflowBilling | null;
  currency: string;
  stayLabel: string | null;
  showNightlyPrices?: boolean;
  message: string | null;
  error?: ReactNode;
  editableDiscountCents: number;
  discountDisabled?: boolean;
  onDiscountSave?: (amountCents: number) => Promise<ReservationCommandResult>;
  onDiscountDirtyChange?: (dirty: boolean) => void;
  provisional?: boolean;
  collapsible?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const titleId = useId();
  const panelId = useId();
  const balanceId = useId();
  const status = summary ? accountStatus(summary) : null;
  const feedback = error || (!summary ? message : null);
  const money = (cents: number) => formatMoney(cents, currency);
  async function applyDiscount(amountCents: number) {
    if (!onDiscountSave) return false;
    const result = await onDiscountSave(amountCents);
    if (result.status === "saved") return true;
    toastError("No se pudo guardar el descuento", unsavedMessage(result));
    return false;
  }
  const balance = (
    <span id={balanceId} className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          {status && <status.Icon aria-hidden className="size-4 shrink-0" />}
          {status?.label ?? "Saldo"}
          {provisional && <Badge variant="preview">Vista previa</Badge>}
        </span>
        <output aria-label={status?.label ?? "Saldo"} className="tabular-nums">
          {status ? money(status.cents) : "—"}
        </output>
      </span>
      {status?.state === "owing" && summary && summary.initialPaymentDueCents > 0 && (
        <span className="text-xs">Falta el depósito: {money(summary.initialPaymentDueCents)}</span>
      )}
    </span>
  );
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
            <CardTitle>
              <h3 id={titleId}>Resumen de reserva</h3>
            </CardTitle>
            {stayLabel && <CardDescription>{stayLabel}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-4">
              {(cancelled ? [] : rooms).map((room, index) => (
                <RoomSummary
                  key={room.key}
                  room={room}
                  index={index}
                  currency={currency}
                  showNightlyPrice={showNightlyPrices}
                />
              ))}
            </div>
            {showNightlyPrices && !cancelled && (
              <NightlyPriceDetail
                rooms={rooms.map((room) => ({ ...room, nights: room.nights ?? [] }))}
                currency={currency}
              />
            )}
            <Separator />
            <dl className="flex flex-col gap-2">
              {!!summary?.discountCents && (
                <SummaryRow label="Subtotal" cents={summary.subtotalCents} currency={currency} />
              )}
              {!cancelled &&
                (onDiscountSave ? (
                  <div>
                    <DiscountPopover
                      appliedCents={editableDiscountCents}
                      shownCents={summary?.discountCents ?? null}
                      currency={currency}
                      disabled={discountDisabled}
                      onApply={applyDiscount}
                      onBlockingChange={onDiscountDirtyChange}
                    />
                  </div>
                ) : (
                  <SummaryRow
                    label="Descuento"
                    cents={summary ? -summary.discountCents : null}
                    currency={currency}
                  />
                ))}
              <SummaryRow
                label={<span className="font-medium">Total</span>}
                cents={summary?.totalCents ?? null}
                currency={currency}
              />
              <SummaryRow label="Pagado" cents={summary?.paidCents ?? null} currency={currency} />
              {!!summary?.couponAppliedCents && (
                <SummaryRow
                  label="Pagado con cupón"
                  cents={summary.couponAppliedCents}
                  currency={currency}
                />
              )}
              {!!summary?.refundedCents && (
                <SummaryRow
                  label="Reembolsado"
                  cents={-summary.refundedCents}
                  currency={currency}
                />
              )}
              {!!summary?.couponIssuedCents && (
                <SummaryRow
                  label="Pasado a cupón"
                  cents={-summary.couponIssuedCents}
                  currency={currency}
                />
              )}
            </dl>
            {feedback && !collapsible && (
              <div role="status" className="text-muted-foreground">
                {feedback}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
        <CardFooter
          aria-label="Importes de la reserva"
          aria-live="polite"
          aria-atomic
          className={cn(
            "shrink-0 flex-col items-stretch",
            collapsible ? "gap-0 p-0" : status?.tone,
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
                <span className={cn("flex w-full items-center gap-3 px-2.5 py-1.5", status?.tone)}>
                  {balance}
                  {expanded ? (
                    <ChevronDownIcon aria-hidden data-icon="inline-end" />
                  ) : (
                    <ChevronUpIcon aria-hidden data-icon="inline-end" />
                  )}
                </span>
              </CollapsibleTrigger>
            </>
          ) : (
            balance
          )}
        </CardFooter>
      </Collapsible>
    </section>
  );
}

function RoomSummary({
  room,
  index,
  currency,
  showNightlyPrice,
}: {
  room: BookingSummaryRoom;
  index: number;
  currency: string;
  showNightlyPrice: boolean;
}) {
  const guests =
    room.adults === null || room.children === null
      ? "Revisa el número de huéspedes"
      : `${room.adults} ${room.adults === 1 ? "adulto" : "adultos"}${room.children > 0 ? ` · ${room.children} ${room.children === 1 ? "niño" : "niños"}` : ""}`;
  const nights = room.nights ?? [];
  const nightCount = `${nights.length} ${nights.length === 1 ? "noche" : "noches"}`;
  const nightlyPrice = !nights.length
    ? null
    : nights.some((night) => night.priceCents !== nights[0].priceCents)
      ? `${nightCount} · Precio variable`
      : `${nightCount} × ${formatMoney(nights[0].priceCents, currency)}`;
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
      <p className="text-xs text-muted-foreground">
        {showNightlyPrice && nightlyPrice ? `${nightlyPrice} · ` : ""}
        {guests}
      </p>
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
      <dd className="w-24 shrink-0 text-right tabular-nums">
        {cents === null ? (
          <span aria-label="No disponible">...</span>
        ) : (
          formatMoney(cents === 0 ? 0 : cents, currency)
        )}
      </dd>
    </div>
  );
}
