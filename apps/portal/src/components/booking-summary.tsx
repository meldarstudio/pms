import { useId, type ReactNode } from "react";
import { cn } from "cn";
import { accountStatus } from "@/components/balance-status";
import { NightlyPriceDetail } from "@/components/nightly-price-detail";
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
  ratePlan,
  showNightlyPrices = false,
  message,
  error,
}: {
  rooms: BookingSummaryRoom[];
  cancelled: boolean;
  summary: WorkflowBilling | null;
  currency: string;
  stayLabel: string | null;
  ratePlan?: string;
  showNightlyPrices?: boolean;
  message: string | null;
  error?: ReactNode;
}) {
  const titleId = useId();
  const status = summary ? accountStatus(summary) : null;
  const feedback = error || (!summary ? message : null);
  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h3 id={titleId}>Resumen de reserva</h3>
          </CardTitle>
          {(stayLabel || ratePlan) && (
            <CardDescription className="flex flex-col">
              {stayLabel && <span>{stayLabel}</span>}
              {ratePlan && <span>Plan {ratePlan}</span>}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3">
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
            {!cancelled && (
              <SummaryRow
                label="Descuento"
                cents={summary ? -summary.discountCents : null}
                currency={currency}
              />
            )}
            <SummaryRow
              label="Total"
              cents={summary?.totalCents ?? null}
              currency={currency}
              emphasis
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
              <SummaryRow label="Reembolsado" cents={-summary.refundedCents} currency={currency} />
            )}
            {!!summary?.couponIssuedCents && (
              <SummaryRow
                label="Pasado a cupón"
                cents={-summary.couponIssuedCents}
                currency={currency}
              />
            )}
          </dl>
          {feedback && (
            <div role="status" className="text-muted-foreground">
              {feedback}
            </div>
          )}
        </CardContent>
        <CardFooter
          aria-label="Importes de la reserva"
          aria-live="polite"
          aria-atomic
          className={cn("shrink-0 flex-col items-stretch", status?.tone)}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium">
              {status && <status.Icon aria-hidden className="size-4 shrink-0" />}
              {status?.label ?? "Saldo"}
            </span>
            <output aria-label={status?.label ?? "Saldo"} className="font-medium tabular-nums">
              {status ? formatMoney(status.cents, currency) : "—"}
            </output>
          </span>
        </CardFooter>
      </Card>
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
      <p className="text-muted-foreground">
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
  emphasis = false,
}: {
  label: ReactNode;
  cents: number | null;
  currency: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-baseline gap-4",
        emphasis && "font-medium",
      )}
    >
      <dt className="min-w-0 wrap-anywhere">{label}</dt>
      <dd className="text-right tabular-nums">
        {cents === null ? (
          <span aria-label="No disponible">...</span>
        ) : (
          formatMoney(cents === 0 ? 0 : cents, currency)
        )}
      </dd>
    </div>
  );
}
