import type { ReactNode } from "react";
import {
  ArrowLeftIcon,
  BedDoubleIcon,
  CalendarDaysIcon,
  CalendarCheckIcon,
  CircleCheckIcon,
  ClockIcon,
  CreditCardIcon,
  PencilIcon,
  PhoneIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ReservationLifecycle } from "@/components/reservation-lifecycle";
import { balanceStatus } from "@/components/balance-status";
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import type { ReservationDetail } from "@/lib/api";
import { reservationStatusLabel } from "@/lib/reservation-list";
import { formatMoney } from "@/lib/money";
import { usePropertyCalendar } from "@/lib/use-property-calendar";

const money = (detail: ReservationDetail, cents: number) => formatMoney(cents, detail.currency);
const fullDate = (value: string) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
type Model = { detail: ReservationDetail; edit: (target: ReservationEditorTarget) => void };

export function ReservationOverview({
  detail,
  edit,
  disabled,
  onBack,
}: Model & {
  disabled: boolean;
  onBack: () => void;
}) {
  const { today, timeZone } = usePropertyCalendar();
  const nights = Math.round((Date.parse(detail.checkOut) - Date.parse(detail.checkIn)) / 86400000);
  return (
    <fieldset disabled={disabled} aria-busy={disabled} className="flex min-w-0 flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-5">
        <nav
          aria-label="Ruta de reserva"
          className="flex min-w-0 flex-wrap items-center gap-2 text-sm"
        >
          <Button variant="ghost" size="sm" aria-label="Volver a reservas" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" />
            Reservas
          </Button>
        </nav>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold wrap-anywhere">{detail.guest.fullName}</h1>
              <Badge variant={detail.status === "cancelled" ? "destructive" : "secondary"}>
                <CircleCheckIcon data-icon="inline-start" />
                {reservationStatusLabel(detail.status)}
              </Badge>
              {detail.checkIn === today && detail.status === "confirmed" && (
                <Badge variant="preview">
                  <ClockIcon data-icon="inline-start" />
                  Llegada hoy
                </Badge>
              )}
              {detail.checkOut === today && detail.status === "checked_in" && (
                <Badge variant="preview">
                  <ClockIcon data-icon="inline-start" />
                  Salida hoy{detail.balanceCents > 0 ? " · saldo pendiente" : ""}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <p className="wrap-anywhere">Reserva #{detail.code}</p>
              {detail.guest.phone && (
                <a
                  href={`tel:${detail.guest.phone}`}
                  className="flex items-center gap-2 break-all hover:underline"
                >
                  <PhoneIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  {detail.guest.phone}
                </a>
              )}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => edit({ kind: "stay" })}>
              <PencilIcon data-icon="inline-start" />
              Editar reserva
            </Button>
            <ReservationLifecycle
              detail={detail}
              showStatusMenu={false}
              onConfirm={(status) => edit({ kind: "status", status })}
            />
          </div>
        </div>
      </header>
      {detail.status === "cancelled" ? (
        <section
          aria-label="Cancelación"
          className="flex flex-col gap-2 border-l-2 border-destructive py-2 pl-4 text-sm"
        >
          <p className="font-medium">
            Reserva cancelada
            {detail.cancelledAt
              ? ` · ${new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(detail.cancelledAt))}`
              : ""}
          </p>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {detail.cancellationReason || "Sin motivo registrado."} Los pagos permanecen como saldo
            a favor; no representan un reembolso.
          </p>
        </section>
      ) : null}
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2>Datos de la reserva</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col">
              <ReservationDatum icon={CalendarDaysIcon} label="Fecha de ingreso">
                {fullDate(detail.checkIn)}
              </ReservationDatum>
              <ReservationDatum icon={CalendarCheckIcon} label="Fecha de egreso">
                {fullDate(detail.checkOut)}
              </ReservationDatum>
              <ReservationDatum icon={ClockIcon} label="Duración">
                {nights} {nights === 1 ? "noche" : "noches"}
              </ReservationDatum>
              <ReservationDatum
                icon={BedDoubleIcon}
                label={detail.rooms.length === 1 ? "Habitación" : "Habitaciones"}
              >
                <ul className="flex flex-col gap-2">
                  {detail.rooms.map((room) => (
                    <li key={room.id}>
                      {room.roomNumber ?? "Sin asignar"} · {room.roomTypeName || "Habitación"}
                    </li>
                  ))}
                </ul>
              </ReservationDatum>
            </dl>
          </CardContent>
        </Card>
        <PaymentSummary detail={detail} edit={edit} />
      </div>
    </fieldset>
  );
}

function ReservationDatum({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label}
      </dt>
      <dd className="ml-auto max-w-full min-w-0 text-right text-xs font-medium wrap-anywhere">
        {children}
      </dd>
    </div>
  );
}

function PaymentSummary({ detail, edit }: Model) {
  const { label, Icon, tone } = balanceStatus(detail.balanceCents);
  return (
    <Card className="min-w-0 self-start">
      <CardHeader>
        <CardTitle>
          <h2>Pago y cuenta</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="flex flex-col gap-2">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="ml-auto font-semibold tabular-nums">
              {money(detail, detail.subtotalCents)}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-muted-foreground">
              Descuento
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Editar descuento"
                onClick={() => edit({ kind: "discount" })}
              >
                <PencilIcon />
              </Button>
            </dt>
            <dd className="ml-auto font-semibold tabular-nums">
              {money(detail, detail.discountCents)}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="ml-auto font-semibold tabular-nums">
              {money(detail, detail.totalCents)}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Pagado</dt>
            <dd className="ml-auto font-semibold tabular-nums">
              {money(detail, detail.paidCents)}
            </dd>
          </div>
        </dl>
        <div className={cn("flex flex-wrap items-center justify-between gap-2 p-3", tone)}>
          <p className="flex items-center gap-2 font-medium">
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {label}
          </p>
          <p className="ml-auto text-right text-xl font-semibold wrap-anywhere tabular-nums">
            {money(detail, Math.abs(detail.balanceCents))}
          </p>
        </div>
        <Button className="w-full" onClick={() => edit({ kind: "payment" })}>
          <CreditCardIcon data-icon="inline-start" />
          Registrar pago
        </Button>
        {detail.balanceCents < 0 && (
          <p className="text-xs text-muted-foreground">
            Crédito conservado en esta reserva; no representa un reembolso.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
