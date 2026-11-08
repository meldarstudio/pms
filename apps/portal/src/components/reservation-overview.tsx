import {
  CircleAlertIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  PrinterIcon,
} from "lucide-react";
import { parseISO } from "date-fns";
import { ReservationStatusBadge } from "@/components/reservation-status-badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GuestLine, NoStayingGuests, RowActions } from "@/components/reservation-records";
import { AccountPanel, MovementsSection } from "@/components/reservation-account";
import { SectionHeading } from "@/components/reservation-section";
import { StaySection } from "@/components/reservation-stay";
import { useLifecycleAction } from "@/components/lifecycle-action";
import { ReservationStatusMenu } from "@/components/reservation-status-menu";
import { ReservationSummarySheet } from "@/components/reservation-summary-sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import type { ReservationDetail } from "@/lib/api";
import { phoneDisplay } from "@/lib/phone";
import { NationalityFlag } from "@/components/workflow-fields";
import { format } from "@/lib/dates";
import { propertyToday } from "@/lib/property-calendar";

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
  const phone = useIsMobile();
  return (
    <fieldset disabled={disabled} aria-busy={disabled} className="min-w-0">
      <div className="grid min-w-0 gap-6 xl:-my-6 xl:-mr-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-6 xl:pt-6">
          <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:gap-x-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="font-mono text-xs tracking-widest wrap-anywhere text-muted-foreground uppercase">
                  <span className="max-sm:sr-only">Reserva </span>#{detail.code}
                </p>
                <ReservationStatusBadge status={detail.status} />
              </div>
              <div className="flex min-w-0 items-start gap-2.5">
                <NationalityFlag nationality={detail.guest.nationality} className="mt-2 h-4 w-6" />
                <h1 className="min-w-0 text-2xl font-semibold tracking-tight wrap-anywhere">
                  {detail.guest.fullName}
                </h1>
              </div>
            </div>
            <div className="col-start-2 row-start-1 flex items-center gap-2 md:col-start-3">
              {!phone && (
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <PrinterIcon data-icon="inline-start" />
                  Imprimir
                </Button>
              )}
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
          <ContactLine detail={detail} edit={edit} />
          <StayOutcomeAlert detail={detail} />
          <NotesLine detail={detail} edit={edit} />
        </div>
        <aside
          aria-label="Cuenta y huéspedes"
          className="contents xl:sticky xl:top-0 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:flex xl:h-[calc(100svh-3rem-1px)] xl:min-w-0 xl:flex-col xl:overflow-y-auto xl:border-l xl:bg-muted/40"
        >
          <div className="-mx-4 min-w-0 bg-muted/40 xl:mx-0 xl:bg-transparent">
            <AccountPanel
              detail={detail}
              edit={edit}
              onDiscountDraftChange={onDiscountDraftChange}
            />
          </div>
          <GuestsPanel detail={detail} edit={edit} />
        </aside>
        <div className="flex min-w-0 flex-col gap-10 xl:pb-6">
          <StaySection detail={detail} edit={edit} />
          <MovementsSection detail={detail} edit={edit} />
        </div>
      </div>
      <ReservationSummarySheet detail={detail} />
    </fieldset>
  );
}

function ContactLine({ detail, edit }: Model) {
  const { phone, email } = detail.guest;
  const shown = phone ? phoneDisplay(phone) : null;
  return (
    <section
      role="region"
      aria-label="Contacto principal"
      className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      <span className="inline-flex items-center gap-1.5">
        <PhoneIcon aria-label="Teléfono" className="size-3.5" />
        {shown ? (
          <a
            className="relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5 text-foreground"
            href={shown.href}
          >
            {shown.text}
          </a>
        ) : (
          "Sin teléfono"
        )}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <MailIcon aria-label="Correo electrónico" className="size-3.5" />
        {email ? (
          <a
            className="relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5 wrap-anywhere text-foreground"
            href={`mailto:${email}`}
          >
            {email}
          </a>
        ) : (
          "Sin correo"
        )}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="-ml-2 max-md:hidden"
        aria-label="Editar contacto"
        title="Editar contacto"
        onClick={() => edit({ kind: "contact" })}
      >
        <PencilIcon />
      </Button>
    </section>
  );
}

function NotesLine({ detail, edit }: Model) {
  const notes = detail.notes;
  return (
    <section role="region" aria-label="Notas de la reserva" className="flex">
      {notes ? (
        <div className="flex min-w-0 flex-1 items-start gap-2 border-l-2 border-warning-foreground/50 bg-warning py-2 pr-2 pl-3 text-xs text-warning-foreground">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-2xs font-semibold tracking-widest uppercase opacity-80">
              Notas
            </span>
            <p className="whitespace-pre-wrap wrap-anywhere">{notes}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Editar notas"
            title="Editar notas"
            onClick={() => edit({ kind: "notes" })}
          >
            <PencilIcon />
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          className="-ml-1.5"
          onClick={() => edit({ kind: "notes" })}
        >
          <PlusIcon data-icon="inline-start" />
          Agregar notas para el equipo
        </Button>
      )}
    </section>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

function GuestsPanel({ detail, edit }: Model) {
  return (
    <section
      role="region"
      aria-label="Huéspedes"
      className="-mx-4 flex flex-col gap-3 px-4 max-xl:order-last xl:mx-0 xl:border-t xl:py-4"
    >
      <SectionHeading
        title="Huéspedes"
        action={
          <Button variant="ghost" size="xs" onClick={() => edit({ kind: "guest" })}>
            <PlusIcon data-icon="inline-start" />
            Agregar huésped
          </Button>
        }
      />
      {detail.stayingGuests.length === 0 ? (
        <NoStayingGuests framed />
      ) : (
        <ul aria-label="Huéspedes registrados" className="flex flex-col">
          {detail.stayingGuests.map((guest) => (
            <li
              key={guest.id}
              className="flex items-center gap-2.5 border-b py-2 text-xs last:border-0"
            >
              <span
                aria-hidden
                className="flex size-(--control-h-sm) shrink-0 items-center justify-center rounded-full bg-background text-2xs font-medium ring-1 ring-border"
              >
                {initials(guest.fullName)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{guest.fullName}</span>
                <GuestLine guest={guest} />
              </div>
              <RowActions
                label={`Acciones de ${guest.fullName}`}
                disabled={false}
                onEdit={() => edit({ kind: "guest", id: guest.id })}
                onDelete={() => edit({ kind: "delete-guest", id: guest.id })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
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
