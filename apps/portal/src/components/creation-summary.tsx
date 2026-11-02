import { useId, type ReactNode } from "react";
import { parseISO } from "date-fns";
import { CircleAlertIcon, ReceiptTextIcon, WifiOffIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { NightlyPriceDetail } from "@/components/nightly-price-detail";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreationPreview } from "@/lib/api";
import { readErrorKind } from "@/lib/api-error";
import { addDateLabelDays, format } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

type Billing = CreationPreview["billing"];

export type CreationSummaryError = { title: string; error: Error; onRetry: () => void };

export type CreationSummaryRoom = {
  key: string;
  typeName: string;
  roomNumber: string | null;
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
  error: CreationSummaryError | null;
  discount: ReactNode;
}) {
  const titleId = useId();
  const loading = !billing && message === null;
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
          {error ? (
            <ErrorState {...error} />
          ) : billing || loading ? (
            <>
              <ul className="flex flex-col gap-2">
                {rooms.map((room) => (
                  <li
                    key={room.key}
                    className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4"
                  >
                    <span className="wrap-anywhere">
                      {room.roomNumber
                        ? `${room.typeName} · Hab. ${room.roomNumber}`
                        : room.typeName}
                    </span>
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
                <AmountsSkeleton discount={discount} />
              )}
            </>
          ) : (
            <Empty role="status" className={noticeClass}>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ReceiptTextIcon />
                </EmptyMedia>
                <EmptyTitle>Aún no hay total</EmptyTitle>
                <EmptyDescription>{message}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

const noticeClass = "gap-3 border border-dashed p-5 md:p-5";

function ErrorState({ title, error, onRetry }: CreationSummaryError) {
  const offline = readErrorKind(error) === "offline";
  return (
    <Empty role="alert" className={cn(noticeClass, "border-destructive/50 bg-destructive/5")}>
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="bg-destructive/10 text-destructive dark:bg-destructive/20"
        >
          {offline ? <WifiOffIcon /> : <CircleAlertIcon />}
        </EmptyMedia>
        <EmptyTitle className="text-destructive">
          {offline ? "Sin conexión con el servidor" : title}
        </EmptyTitle>
        <EmptyDescription className="text-destructive/90">
          {offline ? "Revisa tu conexión a internet e inténtalo de nuevo." : error.message}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function AmountsSkeleton({ discount }: { discount: ReactNode }) {
  return (
    <>
      {discount}
      <div aria-busy className="flex flex-col gap-3">
        <p role="status" className="sr-only">
          Calculando…
        </p>
        <div aria-hidden className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm font-medium">Total</span>
            <TextSkeleton className="text-xl" width="w-16" />
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">Pago inicial requerido</span>
            <TextSkeleton width="w-10" />
          </div>
        </div>
        <div aria-hidden className="flex flex-col gap-0.5">
          <TextSkeleton width="w-44" />
          <TextSkeleton width="w-52" />
        </div>
      </div>
    </>
  );
}

function TextSkeleton({ className, width }: { className?: string; width: string }) {
  return (
    <span className={className}>
      <Skeleton className={`inline-block h-lh align-top ${width}`} />
    </span>
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
  if (billing.totalCents === 0) return ["Cancelación / No se presentó", "Sin cargo"];
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
  if (days === null && totalBasis) return ["Tarifa no reembolsable", `Cargo ${basis}: ${charge}`];
  return ["Cancelación / No se presentó", `Cargo ${basis}: ${charge}`];
}
