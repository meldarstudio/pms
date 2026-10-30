import { Fragment, type ReactNode } from "react";
import {
  BanIcon,
  BedDoubleIcon,
  CalendarDaysIcon,
  CalendarCheckIcon,
  ChevronDownIcon,
  CircleCheckBigIcon,
  ClockIcon,
  CreditCardIcon,
  EllipsisIcon,
  HandCoinsIcon,
  LockIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  TicketIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { ReservationStatusBadge } from "@/components/reservation-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
            {detail.cancellationReason || "Sin motivo registrado."}
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
  const status = moneyStatus(detail);
  const notes = moneyNotes(detail);
  const released = detail.status === "cancelled" || detail.status === "no_show";
  return (
    <Card className="min-w-0" role="region" aria-label="Pago y cuenta">
      <CardHeader>
        <CardTitle>
          <h2>Pago y cuenta</h2>
        </CardTitle>
        {!released && (
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Más acciones" />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => edit({ kind: "discount" })}>
                    Editar descuento
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className={cn("flex flex-col gap-1 p-4", status.tone)}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <status.Icon aria-hidden="true" className="size-4 shrink-0" />
            {status.label}
          </p>
          {status.cents > 0 && (
            <p className="text-3xl font-semibold tracking-tight wrap-anywhere tabular-nums">
              {money(detail, status.cents)}
            </p>
          )}
          <p className="text-xs opacity-80">{status.note}</p>
        </div>
        {status.collect && (
          <Button className="w-full" onClick={() => edit({ kind: "payment" })}>
            <CreditCardIcon data-icon="inline-start" />
            Registrar pago
          </Button>
        )}
        {notes.length > 0 && (
          <ul aria-label="Condiciones de la cuenta" className="flex flex-col gap-2 text-xs">
            {notes.map(({ Icon, text, detail: line }) => (
              <li key={text} className="flex gap-2">
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 wrap-anywhere">
                  {text}
                  {line && <span className="block text-muted-foreground">{line}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="group w-full justify-between px-0 text-muted-foreground"
              />
            }
          >
            Ver detalle de la cuenta
            <ChevronDownIcon className="transition-transform group-data-panel-open:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <dl className="flex flex-col gap-1.5 text-xs tabular-nums">
              {accountLines(detail).map(([label, cents]) => (
                <div key={label} className="flex flex-wrap justify-between gap-x-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="ml-auto">{money(detail, cents)}</dd>
                </div>
              ))}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function moneyStatus(detail: ReservationDetail) {
  const owed = { tone: "bg-destructive/10 text-destructive dark:bg-destructive/20", collect: true };
  if (detail.balanceCents < 0)
    return {
      label: "A devolver al huésped",
      cents: -detail.balanceCents,
      tone: "bg-credit text-credit-foreground",
      Icon: HandCoinsIcon,
      collect: false,
      note:
        detail.pendingRefundCents > 0
          ? `${money(detail, detail.pendingRefundCents)} solicitado, falta confirmar que se devolvió.`
          : "Pagó más de lo que debe.",
    };
  if (detail.status === "confirmed" && detail.initialPaymentDueCents > 0)
    return {
      ...owed,
      label: "Falta el depósito",
      cents: detail.initialPaymentDueCents,
      Icon: CreditCardIcon,
      note: `Saldo total ${money(detail, detail.balanceCents)}. El resto se cobra al llegar.`,
    };
  if (detail.balanceCents > 0)
    return {
      ...owed,
      label: "Por cobrar",
      cents: detail.balanceCents,
      Icon: CreditCardIcon,
      note:
        detail.couponAppliedCents > 0
          ? `Ya cubierto: ${money(detail, detail.couponAppliedCents)} con cupón.`
          : detail.paidCents > 0
            ? `Pagó ${money(detail, detail.paidCents)} de ${money(detail, detail.totalCents)}.`
            : detail.status === "no_show"
              ? "Cargo por no presentarse, sin pagar."
              : "Cobra antes de la salida.",
    };
  return {
    label: "Cuenta saldada",
    cents: 0,
    tone: "bg-booking text-booking-foreground",
    Icon: CircleCheckBigIcon,
    collect: false,
    note:
      detail.paidCents > 0
        ? `Pagó ${money(detail, detail.paidCents)}. Nada pendiente.`
        : "Nada pendiente.",
  };
}

function moneyNotes(detail: ReservationDetail) {
  const notes: { Icon: LucideIcon; text: string; detail?: string }[] = [];
  const cancellation = detail.cancellation;
  if (cancellation)
    notes.push({
      Icon: BanIcon,
      text: `${cancellationLabel(cancellation.outcome)}: ${money(detail, cancellation.finalChargeCents)}`,
      detail: [
        detail.ratePlan.cancellationPolicy.chargeBasis === "first_night"
          ? "Primera noche"
          : "Total de la estadía",
        cancellation.freeUntil && `gratis hasta el ${fullDate(cancellation.freeUntil)}`,
        cancellation.waivedCents > 0 &&
          `exonerado ${money(detail, cancellation.waivedCents)}: ${cancellation.waivers.map((waiver) => waiver.reason).join("; ")}`,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  for (const movement of detail.couponMovements) {
    const amount = money(detail, movement.amountCents);
    const coupon = detail.coupons.find((entry) => entry.id === movement.couponId);
    notes.push(
      movement.kind === "issue"
        ? {
            Icon: TicketIcon,
            text: `Cupón ${movement.code} emitido: ${amount}`,
            detail: [coupon && `Vence el ${fullDate(coupon.expiresOn)}`, "no se cambia por dinero"]
              .filter(Boolean)
              .join(" · "),
          }
        : {
            Icon: TicketIcon,
            text:
              movement.kind === "redeem"
                ? `Cupón ${movement.code} aplicado: ${amount}`
                : `Cupón ${movement.code}: ${amount} regresó al cupón`,
          },
    );
  }
  if (detail.ratePlan.plan === "non_refundable")
    notes.push({ Icon: LockIcon, text: `Tarifa ${ratePlanLabels.non_refundable.toLowerCase()}` });
  return notes;
}

const cancellationLabel = (outcome: "cancelled" | "no_show") =>
  outcome === "no_show" ? "Cargo por no presentarse" : "Cargo por cancelación";

function accountLines(detail: ReservationDetail): [string, number][] {
  const lines: [string, number][] = [
    [
      detail.cancellation ? cancellationLabel(detail.cancellation.outcome) : "Habitaciones",
      detail.subtotalCents,
    ],
    ["Descuento", -detail.discountCents],
    ["Total", detail.totalCents],
    ["Pagado", detail.paidCents],
    ["Reembolsado", -detail.refundedCents],
    ["Pagado con cupón", detail.couponAppliedCents],
    ["Pasado a cupón", -detail.couponIssuedCents],
  ];
  return lines.filter(([label, cents]) => cents !== 0 || label === "Total" || label === "Pagado");
}

function ContactPhone({ phone }: { phone: string | null }) {
  if (!phone) return "Sin teléfono";
  const display = phoneDisplay(phone);
  return <a href={display.href}>{display.text}</a>;
}
