import { useId, type ReactNode } from "react";
import { parseISO } from "date-fns";
import { ReceiptTextIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { NightlyPriceDetail } from "@/components/nightly-price-detail";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { CreationPreview } from "@/lib/api";
import { addDateLabelDays, format } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

type Billing = CreationPreview["billing"];

export type CreationSummaryRoom = {
  key: string;
  typeName: string;
  adults: number | null;
  children: number | null;
};

export function CreationSummary({
  stayLabel,
  rooms,
  billing,
  checkIn,
  today,
  message,
  error,
  discount,
}: {
  stayLabel: string | null;
  rooms: CreationSummaryRoom[];
  billing: Billing | null;
  checkIn: string;
  today: string;
  message: string | null;
  error?: ReactNode;
  discount: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h3 id={titleId}>Resumen de reserva</h3>
          </CardTitle>
          {stayLabel && <CardDescription>{stayLabel}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {billing || error ? (
            <>
              <ul className="flex flex-col gap-2">
                {rooms.map((room) => (
                  <li key={room.key} className="flex min-w-0 flex-col">
                    <span className="wrap-anywhere">{room.typeName}</span>
                    <span className="text-muted-foreground">{guestLine(room)}</span>
                  </li>
                ))}
              </ul>
              <Separator />
              {billing ? (
                <>
                  {discount}
                  <dl aria-label="Importes de la nueva reserva" className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-sm font-medium">Total</dt>
                      <dd className="text-xl font-medium tabular-nums">
                        {formatMoney(billing.totalCents, billing.currency)}
                      </dd>
                    </div>
                    <Amount
                      label="Pago inicial requerido"
                      cents={billing.requiredInitialPaymentCents}
                      currency={billing.currency}
                    />
                  </dl>
                  <div aria-label="Condiciones de cancelación" className="flex flex-col gap-0.5">
                    {cancellationTerms(billing, checkIn, today).map((line) => (
                      <p key={line} className="text-muted-foreground">
                        {line}
                      </p>
                    ))}
                  </div>
                  <NightlyPriceDetail
                    currency={billing.currency}
                    rooms={billing.rooms.map((room, index) => ({
                      key: rooms[index]?.key ?? String(index),
                      typeName: rooms[index]?.typeName ?? "",
                      nights: room.nights,
                    }))}
                  />
                </>
              ) : (
                error
              )}
            </>
          ) : (
            <Empty role="status" className="gap-3 border border-dashed p-5 md:p-5">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {message === null ? <Spinner /> : <ReceiptTextIcon />}
                </EmptyMedia>
                <EmptyTitle>{message === null ? "Calculando…" : "Aún no hay total"}</EmptyTitle>
                {message !== null && <EmptyDescription>{message}</EmptyDescription>}
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function guestLine(room: CreationSummaryRoom) {
  if (room.adults === null || room.children === null) return "Revisa el número de huéspedes";
  const adults = `${room.adults} ${room.adults === 1 ? "adulto" : "adultos"}`;
  return room.children > 0
    ? `${adults} · ${room.children} ${room.children === 1 ? "niño" : "niños"}`
    : adults;
}

function Amount({ label, cents, currency }: { label: string; cents: number; currency: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{formatMoney(cents, currency)}</dd>
    </div>
  );
}

export function cancellationTerms(billing: Billing, checkIn: string, today: string): string[] {
  const { chargeBasis, freeUntilDaysBeforeCheckIn: days } = billing.ratePlan.cancellationPolicy;
  if (billing.totalCents === 0) return ["Cancelación y no-show sin cargo"];
  const firstNights = billing.rooms.reduce((sum, room) => {
    const first = room.nights.toSorted((a, b) => a.date.localeCompare(b.date))[0];
    return sum + (first?.priceCents ?? 0);
  }, 0);
  const totalBasis = chargeBasis === "final_total";
  const charge = formatMoney(
    totalBasis ? billing.totalCents : Math.min(firstNights, billing.totalCents),
    billing.currency,
  );
  const basis = totalBasis ? "del total de la reserva" : "de la primera noche";
  const freeUntil = days === null ? null : addDateLabelDays(checkIn, -days);
  if (freeUntil !== null && today <= freeUntil)
    return [
      `Cancelación gratuita hasta el ${format(parseISO(freeUntil), "d MMM")}.`,
      `Después, cargo ${basis}: ${charge}`,
    ];
  if (days === null && totalBasis) return [`Tarifa no reembolsable · Cargo ${basis}: ${charge}`];
  return [`Cancelación o no-show: cargo ${basis}, ${charge}`];
}
