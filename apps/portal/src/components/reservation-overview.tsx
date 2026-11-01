import { Fragment, type ReactNode } from "react";
import {
  BedDoubleIcon,
  CalendarDaysIcon,
  CalendarCheckIcon,
  ClockIcon,
  CircleAlertIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  UserRoundIcon,
  TagIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
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
import { StayingGuestList } from "@/components/reservation-records";
import { AccountCard } from "@/components/reservation-account";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLifecycleAction } from "@/components/lifecycle-action";
import { ReservationStatusMenu } from "@/components/reservation-status-menu";
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import type { ReservationDetail } from "@/lib/api";
import { occupantsLabel } from "@/lib/reservation-list";
import { phoneDisplay } from "@/lib/phone";
import { ratePlanLabels } from "@/lib/rate-plans";
import { format } from "@/lib/dates";
import { propertyToday } from "@/lib/property-calendar";
import { parseISO } from "date-fns";

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
  lifecycleBlocked = false,
  onDiscountDraftChange,
}: Model & {
  disabled: boolean;
  lifecycleBlocked?: boolean;
  onDiscountDraftChange?: (changed: boolean) => void;
}) {
  const lifecycle = useLifecycleAction(detail, lifecycleBlocked || disabled);
  const nights = Math.round((Date.parse(detail.checkOut) - Date.parse(detail.checkIn)) / 86400000);
  return (
    <fieldset disabled={disabled} aria-busy={disabled} className="flex min-w-0 flex-col gap-6">
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:gap-x-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="font-mono text-xs tracking-widest wrap-anywhere text-muted-foreground uppercase">
              <span className="max-sm:sr-only">Reserva </span>#{detail.code}
            </p>
            <ReservationStatusBadge status={detail.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">
              {detail.guest.fullName}
            </h1>
          </div>
        </div>
        <div className="col-start-2 row-start-1 md:col-start-3">
          <ReservationStatusMenu
            detail={detail}
            disabled={disabled || lifecycleBlocked || lifecycle.running}
            edit={edit}
          />
        </div>
        {lifecycle.step && (
          <Button
            className="col-span-full w-full md:col-span-1 md:col-start-2 md:row-start-1 md:w-auto"
            variant={lifecycle.step.due ? "default" : "outline"}
            disabled={disabled || lifecycleBlocked || lifecycle.running}
            onClick={() => void lifecycle.run()}
          >
            {lifecycle.step.label}
          </Button>
        )}
      </header>
      {lifecycle.dialogs}
      <StayOutcomeAlert detail={detail} />
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <ContactSummary detail={detail} edit={edit} />
          <GuestsSummary detail={detail} edit={edit} />
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
                <ReservationDatum icon={TagIcon} label="Plan tarifario">
                  {ratePlanLabels[detail.ratePlan.plan]}
                </ReservationDatum>
              </dl>
              <AssignedRooms detail={detail} />
            </CardContent>
          </Card>
        </div>
      </div>
      <AccountCard detail={detail} edit={edit} onDiscountDraftChange={onDiscountDraftChange} />
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

function GuestsSummary({ detail, edit }: Model) {
  return (
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
  );
}

function StayOutcomeAlert({ detail }: { detail: ReservationDetail }) {
  if (detail.status === "unfulfilled")
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Reserva cancelada</AlertTitle>
        <AlertDescription>
          No había disponibilidad cuando se completó el pago en línea.
        </AlertDescription>
      </Alert>
    );
  if (detail.status !== "cancelled" && detail.status !== "no_show") return null;
  const at = detail.cancellation?.recordedAt ?? detail.cancelledAt;
  const date = at ? ` · ${format(parseISO(propertyToday(new Date(at))), "d MMM yyyy")}` : "";
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>
        {detail.status === "no_show" ? "No se presentó" : "Reserva cancelada"}
        {date}
      </AlertTitle>
      {detail.cancellationReason && (
        <AlertDescription className="whitespace-pre-wrap">
          {detail.cancellationReason}
        </AlertDescription>
      )}
    </Alert>
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

function ContactPhone({ phone }: { phone: string | null }) {
  if (!phone) return "Sin teléfono";
  const display = phoneDisplay(phone);
  return <a href={display.href}>{display.text}</a>;
}
