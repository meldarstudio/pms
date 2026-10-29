import { Fragment, type ReactNode } from "react";
import {
  BedDoubleIcon,
  CalendarDaysIcon,
  CalendarCheckIcon,
  ClockIcon,
  CreditCardIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { ReservationStatusBadge } from "@/components/reservation-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { PaymentList, StayingGuestList } from "@/components/reservation-records";
import { ReservationLifecycle } from "@/components/reservation-lifecycle";
import { balanceStatus } from "@/components/balance-status";
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import type { ReservationDetail } from "@/lib/api";
import { occupantsLabel } from "@/lib/reservation-list";
import { formatMoney } from "@/lib/money";
import { ratePlanLabels } from "@/lib/rate-plans";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { phoneDisplay } from "@/lib/phone";

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
}: Model & {
  disabled: boolean;
}) {
  const { today, timeZone } = usePropertyCalendar();
  const nights = Math.round((Date.parse(detail.checkOut) - Date.parse(detail.checkIn)) / 86400000);
  return (
    <fieldset disabled={disabled} aria-busy={disabled} className="flex min-w-0 flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="font-mono text-xs tracking-widest wrap-anywhere text-muted-foreground uppercase">
              Reserva #{detail.code}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">
                {detail.guest.fullName}
              </h1>
              <ReservationStatusBadge status={detail.status} />
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
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <ReservationLifecycle
              detail={detail}
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
        <div className="flex min-w-0 flex-col gap-5">
          <ContactSummary detail={detail} edit={edit} />
          <PaymentSummary detail={detail} edit={edit} />
          <NotesSummary detail={detail} edit={edit} />
        </div>
        <div className="relative min-w-0">
          <Card className="min-w-0 md:absolute md:inset-0">
            <CardHeader>
              <CardTitle>
                <h2>Estadía y habitaciones</h2>
              </CardTitle>
              <CardAction>
                <Button variant="outline" size="sm" onClick={() => edit({ kind: "stay" })}>
                  <PencilIcon data-icon="inline-start" />
                  Editar estadía
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
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
                <ReservationDatum icon={UsersIcon} label="Ocupantes">
                  {detail.rooms.reduce((total, room) => total + room.adults + room.children, 0)}
                </ReservationDatum>
              </dl>
              <AssignedRooms detail={detail} />
            </CardContent>
          </Card>
        </div>
      </div>
      <ReservationRecords detail={detail} edit={edit} />
    </fieldset>
  );
}

function AssignedRooms({ detail }: { detail: ReservationDetail }) {
  const rooms = detail.rooms.toSorted((a, b) =>
    a.roomNumber === null || b.roomNumber === null
      ? Number(a.roomNumber === null) - Number(b.roomNumber === null)
      : a.roomNumber.localeCompare(b.roomNumber, "es", { numeric: true }),
  );
  return (
    <section
      aria-label="Habitaciones asignadas"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Habitaciones asignadas</h3>
        <p className="text-xs text-muted-foreground">
          {rooms.length} {rooms.length === 1 ? "habitación" : "habitaciones"}
        </p>
      </div>
      <div className="min-h-0 overflow-y-auto border">
        <ItemGroup className="gap-0 has-data-[size=xs]:gap-0">
          {rooms.map((room, index) => (
            <Fragment key={room.id}>
              {index > 0 && <ItemSeparator className="my-0" />}
              <Item role="listitem" size="xs" className="flex-nowrap">
                <ItemMedia variant="icon">
                  <BedDoubleIcon aria-hidden="true" />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="wrap-anywhere">
                    {room.roomNumber ?? "Sin asignar"} · {room.roomTypeName || "Habitación"}
                  </ItemTitle>
                </ItemContent>
                <p className="shrink-0 text-muted-foreground">{occupantsLabel([room])}</p>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      </div>
    </section>
  );
}

function ReservationRecords({ detail, edit }: Model) {
  return (
    <div className="grid min-w-0 gap-5 md:grid-cols-2">
      <Card className="min-w-0" role="region" aria-label="Huéspedes">
        <CardHeader>
          <CardTitle>
            <h2>Huéspedes</h2>
          </CardTitle>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => edit({ kind: "guest" })}>
              <PlusIcon data-icon="inline-start" />
              Agregar huésped
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <StayingGuestList
            detail={detail}
            disabled={false}
            framed
            onEdit={(guest) => edit({ kind: "guest", id: guest.id })}
            onDelete={(guest) => edit({ kind: "delete-guest", id: guest.id })}
          />
        </CardContent>
      </Card>
      <Card className="min-w-0" role="region" aria-label="Pagos">
        <CardHeader>
          <CardTitle>
            <h2>Pagos</h2>
          </CardTitle>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => edit({ kind: "payment" })}>
              <CreditCardIcon data-icon="inline-start" />
              Registrar pago
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <PaymentList
            detail={detail}
            disabled={false}
            framed
            hideReferenceOnPhones
            onEdit={(entry) => edit({ kind: "payment", id: entry.id })}
            onDelete={(entry) => edit({ kind: "delete-payment", id: entry.id })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function NotesSummary({ detail, edit }: Model) {
  return (
    <Card className="min-w-0" role="region" aria-label="Notas de la reserva">
      <CardHeader>
        <CardTitle>
          <h2>Notas</h2>
        </CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => edit({ kind: "notes" })}>
            <PencilIcon data-icon="inline-start" />
            {detail.notes ? "Editar notas" : "Agregar notas"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {detail.notes ? (
          <p className="whitespace-pre-wrap wrap-anywhere">{detail.notes}</p>
        ) : (
          <p className="text-muted-foreground">
            Sin notas. Anota lo que el equipo debe saber sobre esta reserva.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ContactSummary({ detail, edit }: Model) {
  const contact = detail.guest;
  return (
    <Card className="min-w-0" role="region" aria-label="Contacto principal">
      <CardHeader>
        <CardTitle>
          <h2>Contacto principal</h2>
        </CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => edit({ kind: "contact" })}>
            <PencilIcon data-icon="inline-start" />
            Editar contacto
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col">
          <ReservationDatum icon={UserRoundIcon} label="Nombre completo">
            {contact.fullName}
          </ReservationDatum>
          <ReservationDatum icon={PhoneIcon} label="Teléfono">
            <ContactPhone phone={contact.phone} />
          </ReservationDatum>
          <ReservationDatum icon={MailIcon} label="Correo electrónico">
            {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : "Sin correo"}
          </ReservationDatum>
        </dl>
      </CardContent>
    </Card>
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
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Pago y cuenta</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="flex flex-col gap-2">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Plan tarifario</dt>
            <dd className="ml-auto font-semibold">{ratePlanLabels[detail.ratePlan.plan]}</dd>
          </div>
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
            <dt className="text-muted-foreground">Pago inicial requerido</dt>
            <dd className="ml-auto font-semibold tabular-nums">
              {money(detail, detail.requiredInitialPaymentCents)}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Pago restante programado</dt>
            <dd className="ml-auto font-semibold tabular-nums">
              {money(detail, detail.remainingScheduledCents)}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Pagado</dt>
            <dd className="ml-auto font-semibold tabular-nums">
              {money(detail, detail.paidCents)}
            </dd>
          </div>
        </dl>
        <div className={cn("flex flex-wrap items-center justify-between gap-2 p-3 text-sm", tone)}>
          <p className="flex items-center gap-2 font-medium">
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {label}
          </p>
          <p className="ml-auto text-right font-semibold wrap-anywhere tabular-nums">
            {money(detail, Math.abs(detail.balanceCents))}
          </p>
        </div>
        <Button className="w-full" onClick={() => edit({ kind: "payment" })}>
          <CreditCardIcon data-icon="inline-start" />
          Registrar pago
        </Button>
      </CardContent>
    </Card>
  );
}

function ContactPhone({ phone }: { phone: string | null }) {
  if (!phone) return "Sin teléfono";
  const display = phoneDisplay(phone);
  return <a href={display.href}>{display.text}</a>;
}
