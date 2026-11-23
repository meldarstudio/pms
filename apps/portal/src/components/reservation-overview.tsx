import { useState } from "react";
import { cn } from "cn";
import { MailIcon, PencilIcon, PhoneIcon, PlusIcon, CircleAlertIcon } from "lucide-react";
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
import type { ReservationEditorTarget } from "@/components/reservation-page-editors";
import type { ReservationDetail } from "@/lib/api";
import { phoneDisplay } from "@/lib/phone";
import { reservationChannelLabels } from "@/lib/reservation-list";
import { NationalityFlag } from "@/components/workflow-fields";
import { format } from "@/lib/dates";
import { propertyToday } from "@/lib/property-calendar";
import { useReservationLayout } from "@/components/reservation-layout";
import { Separator } from "@/components/ui/separator";

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
  const { stacked, tablet } = useReservationLayout();
  const [accountHeight, setAccountHeight] = useState(0);
  return (
    <fieldset disabled={disabled} aria-busy={disabled} className="min-w-0">
      <div className="grid min-w-0 gap-6 md:gap-8 group-data-[layout=columns]/reservation:-my-6 group-data-[layout=columns]/reservation:-mr-6 group-data-[layout=columns]/reservation:grid-cols-[minmax(0,1fr)_24rem] group-data-[layout=columns]/reservation:grid-rows-[auto_1fr] group-data-tablet/reservation:group-data-[layout=columns]/reservation:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="@container/overview-main flex min-w-0 flex-col gap-6 md:gap-4 group-data-[layout=columns]/reservation:pt-6">
          <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:gap-x-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="font-mono text-xs tracking-widest wrap-anywhere text-muted-foreground uppercase">
                  <span className="max-sm:sr-only">Reserva </span>#{detail.code}
                </p>
                <ReservationStatusBadge status={detail.status} />
                <span className="text-xs text-muted-foreground">
                  <span className="sr-only">Canal: </span>
                  {reservationChannelLabels[detail.channel]}
                </span>
              </div>
              <div className="flex min-w-0 items-start gap-2.5">
                <NationalityFlag nationality={detail.guest.nationality} className="mt-2 h-4 w-6" />
                <h1 className="min-w-0 text-2xl font-semibold tracking-tight wrap-anywhere">
                  {detail.guest.fullName}
                </h1>
              </div>
            </div>
            {detail.status !== "unfulfilled" && (
              <div className={cn("col-start-2 row-start-1", !stacked && "md:col-start-3")}>
                <ReservationStatusMenu
                  detail={detail}
                  mobile={stacked || tablet}
                  disabled={disabled || lifecycleBlocked || lifecycle.running}
                  edit={edit}
                />
              </div>
            )}
            {!stacked && lifecycle.step && (
              <Button
                size={tablet ? "lg" : "default"}
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
          <NotesLine detail={detail} />
          <Separator className={cn("order-last", !stacked && "hidden")} />
        </div>
        <aside
          aria-label="Cuenta y huéspedes"
          className="contents group-data-[layout=columns]/reservation:sticky group-data-[layout=columns]/reservation:top-0 group-data-[layout=columns]/reservation:col-start-2 group-data-[layout=columns]/reservation:row-span-2 group-data-[layout=columns]/reservation:row-start-1 group-data-[layout=columns]/reservation:flex group-data-[layout=columns]/reservation:h-[calc(100svh-3rem-1px)] group-data-[layout=columns]/reservation:min-w-0 group-data-[layout=columns]/reservation:flex-col group-data-[layout=columns]/reservation:overflow-y-auto group-data-[layout=columns]/reservation:border-l group-data-[layout=columns]/reservation:bg-muted/40"
        >
          <div className={cn("min-w-0", stacked ? "contents" : "bg-transparent")}>
            <AccountPanel
              detail={detail}
              edit={edit}
              stacked={stacked}
              disabled={disabled}
              lifecycle={lifecycle}
              lifecycleBlocked={lifecycleBlocked}
              onHeightChange={setAccountHeight}
              onDiscountDraftChange={onDiscountDraftChange}
            />
          </div>
          <GuestsPanel detail={detail} edit={edit} />
        </aside>
        <div className="flex min-w-0 flex-col gap-8 group-data-[layout=columns]/reservation:pb-6">
          <StaySection detail={detail} edit={edit} />
          <MovementsSection detail={detail} edit={edit} />
        </div>
      </div>
      <div aria-hidden className={cn(!stacked && "hidden")} style={{ height: accountHeight }} />
    </fieldset>
  );
}

function ContactLine({
  detail,
  edit,
  className,
}: {
  detail: ReservationDetail;
  edit?: Model["edit"];
  className?: string;
}) {
  const { phone, email } = detail.guest;
  const shown = phone ? phoneDisplay(phone) : null;
  const editLabel =
    detail.channel === "online" ? "Editar contacto y notas" : "Editar contacto, canal y notas";
  return (
    <section
      role="region"
      aria-label="Contacto principal"
      className={cn(
        "-mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground @max-lg/overview-main:grid @max-lg/overview-main:grid-cols-[minmax(0,1fr)_auto] @max-lg/overview-main:gap-2 md:-mt-2",
        className,
      )}
    >
      <div className="contents @max-lg/overview-main:flex @max-lg/overview-main:min-w-0 @max-lg/overview-main:flex-wrap @max-lg/overview-main:items-center @max-lg/overview-main:gap-x-4">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <PhoneIcon aria-label="Teléfono" className="size-3.5 shrink-0" />
          {shown ? (
            <a
              className="relative min-w-0 wrap-anywhere pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5 text-foreground pointer-coarse:py-1.5"
              href={shown.href}
            >
              {shown.text}
            </a>
          ) : (
            "Sin teléfono"
          )}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MailIcon aria-label="Correo electrónico" className="size-3.5 shrink-0" />
          {email ? (
            <a
              className="relative min-w-0 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5 wrap-anywhere text-foreground pointer-coarse:py-1.5"
              href={`mailto:${email}`}
            >
              {email}
            </a>
          ) : (
            "Sin correo"
          )}
        </span>
      </div>
      {edit && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="-ml-2 pointer-coarse:size-(--control-h-lg) @max-lg/overview-main:ml-0"
          aria-label={editLabel}
          title={editLabel}
          onClick={() => edit({ kind: "contact" })}
        >
          <PencilIcon />
        </Button>
      )}
    </section>
  );
}

function NotesLine({ detail }: { detail: ReservationDetail }) {
  const notes = detail.notes;
  if (!notes) return null;
  return (
    <section role="region" aria-label="Notas de la reserva" className="flex">
      <div className="flex min-w-0 flex-1 items-start gap-2 border-l-2 pl-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">Notas para el equipo</span>
          <p className="text-sm whitespace-pre-wrap wrap-anywhere">{notes}</p>
        </div>
      </div>
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
      className="-mx-4 flex min-w-0 flex-col gap-3 px-4 group-data-[layout=stacked]/reservation:order-last group-data-[layout=columns]/reservation:mx-0 group-data-[layout=columns]/reservation:border-t group-data-[layout=columns]/reservation:px-6 group-data-[layout=columns]/reservation:py-5"
    >
      <SectionHeading
        title="Huéspedes"
        action={
          <Button
            variant="ghost"
            size="xs"
            className="pointer-coarse:min-h-(--control-h-lg)"
            onClick={() => edit({ kind: "guest" })}
          >
            <PlusIcon data-icon="inline-start" />
            Agregar huésped
          </Button>
        }
      />
      {detail.stayingGuests.length === 0 ? (
        <NoStayingGuests
          framed
          className="group-data-tablet/reservation:group-data-[layout=columns]/reservation:p-4"
        />
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
      <Alert variant="destructive" className="@max-lg/overview-main:order-last">
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
    <Alert variant="destructive" className="@max-lg/overview-main:order-last">
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
