import { useEffect, useId, useState } from "react";
import { LogInIcon, LogOutIcon, PencilIcon, PhoneIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { useIsMobile } from "@/hooks/use-mobile";
import { AccountStatusBanner, accountStatus, SummaryRow } from "@/components/balance-status";
import { useLifecycleAction } from "@/components/lifecycle-action";
import { StaleDataNotice } from "@/components/page-error";
import { ReservationStatusBadge } from "@/components/reservation-status-badge";
import { NationalityFlag } from "@/components/workflow-fields";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FieldError } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { ReservationDetail } from "@/lib/api";
import { stayRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { phoneDisplay } from "@/lib/phone";
import { useReservation } from "@/lib/queries";
import { useReservationCommands } from "@/lib/reservation-commands";

const surfaces = {
  sheet: {
    Root: Sheet,
    Content: SheetContent,
    Header: SheetHeader,
    Title: SheetTitle,
    Description: SheetDescription,
    Footer: SheetFooter,
    Close: SheetClose,
  },
  drawer: {
    Root: Drawer,
    Content: DrawerContent,
    Header: DrawerHeader,
    Title: DrawerTitle,
    Description: DrawerDescription,
    Footer: DrawerFooter,
    Close: DrawerClose,
  },
};
type SummarySurface = (typeof surfaces)[keyof typeof surfaces];

export function ReservationSummary({
  reservationId,
  onClose,
  onEdit,
}: {
  reservationId: string | null;
  onClose: () => void;
  onEdit: (reservationId: string) => void;
}) {
  const mobile = useIsMobile();
  const [opening, setOpening] = useState({ reservationId, mobile });
  if (opening.reservationId !== reservationId)
    setOpening({ reservationId, mobile: reservationId === null ? opening.mobile : mobile });
  const asDrawer = opening.mobile;
  const surface = asDrawer ? surfaces.drawer : surfaces.sheet;
  const { Root, Content } = surface;
  const { saving } = useReservationCommands(reservationId);
  useEffect(() => {
    if (!saving) return;
    const protectUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnload);
    return () => window.removeEventListener("beforeunload", protectUnload);
  }, [saving]);
  return (
    <Root
      {...(asDrawer ? { showSwipeHandle: true } : {})}
      open={reservationId !== null}
      onOpenChange={(open, details) => {
        if (saving) {
          details.cancel();
          return;
        }
        if (!open) onClose();
      }}
    >
      <Content
        {...(asDrawer ? {} : { showCloseButton: false })}
        className={cn(
          "overflow-hidden",
          asDrawer
            ? "data-[swipe-axis=y]:max-h-[85dvh] pb-[env(safe-area-inset-bottom)]"
            : "data-[side=right]:sm:max-w-md",
        )}
      >
        {reservationId && (
          <SummaryContent
            key={reservationId}
            reservationId={reservationId}
            onEdit={() => onEdit(reservationId)}
            surface={surface}
          />
        )}
      </Content>
    </Root>
  );
}

function SummaryContent({
  reservationId,
  onEdit,
  surface,
}: {
  reservationId: string;
  onEdit: () => void;
  surface: SummarySurface;
}) {
  const { Header, Title, Description, Footer, Close } = surface;
  const query = useReservation(reservationId);
  if (query.data)
    return (
      <LoadedSummary
        detail={query.data}
        refreshError={query.error}
        onRetry={() => void query.refetch()}
        onEdit={onEdit}
        surface={surface}
      />
    );
  return (
    <>
      <Header className="shrink-0 border-b pb-4">
        <Title>Reserva</Title>
        <Description className="sr-only">Resumen de la reserva.</Description>
      </Header>
      {query.error ? (
        <div className="flex min-h-0 flex-col items-start gap-2 overflow-y-auto p-4">
          <FieldError>{query.error.message}</FieldError>
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div
          role="region"
          aria-label="Cargando reserva"
          aria-busy
          className="flex flex-col gap-3 p-4"
        >
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16" />
          <Skeleton className="h-10" />
        </div>
      )}
      <Footer className="shrink-0 border-t pt-4">
        <Close render={<Button type="button" variant="outline" />}>Cerrar</Close>
      </Footer>
    </>
  );
}

function LoadedSummary({
  detail,
  refreshError,
  onRetry,
  onEdit,
  surface,
}: {
  detail: ReservationDetail;
  refreshError: Error | null;
  onRetry: () => void;
  onEdit: () => void;
  surface: SummarySurface;
}) {
  const { Header, Title, Description, Footer, Close } = surface;
  const { saving } = useReservationCommands(detail.id);
  const lifecycle = useLifecycleAction(detail, refreshError !== null);
  const status = accountStatus(detail);
  const scopeId = useId();
  const roomCount = detail.rooms.length;
  const phone = detail.guest.phone ? phoneDisplay(detail.guest.phone) : null;
  const notes = detail.notes?.trim();
  return (
    <>
      {lifecycle.dialogs}
      <Header className="relative shrink-0 gap-3 border-b p-5 pr-12 group-data-[swipe-axis=y]/drawer-popup:text-left">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="font-mono text-xs wrap-anywhere text-muted-foreground">
            Reserva #{detail.code}
          </p>
          <ReservationStatusBadge status={detail.status} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <NationalityFlag nationality={detail.guest.nationality} className="mt-1 h-4 w-6" />
            <Title className="min-w-0 wrap-anywhere">
              <span className="block text-xl/tight font-semibold tracking-tight">
                {detail.guest.fullName.trim()}
              </span>
            </Title>
          </div>
          <section aria-label="Contacto principal" className="flex items-center gap-1.5">
            <PhoneIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            {phone ? (
              <a
                href={phone.href}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                <span className="sr-only">Llamar al </span>
                {phone.text}
              </a>
            ) : (
              <span className="text-muted-foreground">Sin teléfono</span>
            )}
          </section>
        </div>
        <Description className="sr-only">Resumen de la reserva.</Description>
        <Close
          disabled={saving}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3"
            />
          }
          aria-label="Cerrar"
        >
          <XIcon />
        </Close>
      </Header>
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain p-5">
        {refreshError && <StaleDataNotice error={refreshError} onRetry={onRetry} />}
        <section aria-labelledby={`${scopeId}-stay`} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <h3 id={`${scopeId}-stay`} className="font-medium">
              Estadía
            </h3>
            <p className="text-sm font-medium">{stayRange(detail.checkIn, detail.checkOut)}</p>
          </div>
          <h4 id={`${scopeId}-rooms`} className="text-muted-foreground">
            {roomCount === 1 ? "Habitación reservada" : `${roomCount} habitaciones reservadas`}
          </h4>
          <ul aria-labelledby={`${scopeId}-rooms`} className="flex flex-col gap-3">
            {detail.rooms.map((room) => (
              <li key={room.id} className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className="font-medium wrap-anywhere">
                    {room.roomNumber ? `Hab. ${room.roomNumber}` : "Sin asignar"}
                  </span>
                  <span className="wrap-anywhere text-muted-foreground">
                    {room.roomTypeName || "Habitación"}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {room.adults} {room.adults === 1 ? "adulto" : "adultos"}
                  {room.children > 0 &&
                    ` · ${room.children} ${room.children === 1 ? "niño" : "niños"}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <Separator />
        <section aria-labelledby={`${scopeId}-account`} className="flex flex-col gap-3">
          <h3 id={`${scopeId}-account`} className="font-medium">
            Cuenta
          </h3>
          <section aria-label="Saldo de la reserva" className="text-base">
            <AccountStatusBanner
              status={status}
              showIcon={false}
              amount={formatMoney(status.cents, detail.currency)}
            />
          </section>
          <dl className="flex flex-col gap-2 text-muted-foreground">
            {detail.discountCents > 0 && (
              <>
                <SummaryRow
                  label="Subtotal"
                  value={formatMoney(detail.subtotalCents, detail.currency)}
                />
                <SummaryRow
                  label="Descuento"
                  value={formatMoney(-detail.discountCents, detail.currency)}
                />
              </>
            )}
            <SummaryRow label="Total" value={formatMoney(detail.totalCents, detail.currency)} />
            <SummaryRow label="Pagado" value={formatMoney(detail.paidCents, detail.currency)} />
            {detail.couponAppliedCents > 0 && (
              <SummaryRow
                label="Pagado con cupón"
                value={formatMoney(detail.couponAppliedCents, detail.currency)}
              />
            )}
            {detail.refundedCents > 0 && (
              <SummaryRow
                label="Reembolsado"
                value={formatMoney(-detail.refundedCents, detail.currency)}
              />
            )}
            {detail.couponIssuedCents > 0 && (
              <SummaryRow
                label="Pasado a cupón"
                value={formatMoney(-detail.couponIssuedCents, detail.currency)}
              />
            )}
          </dl>
        </section>
        {notes && (
          <section aria-labelledby={`${scopeId}-notes`} className="flex min-w-0 flex-col gap-2">
            <h3 id={`${scopeId}-notes`} className="font-medium">
              Notas de la reserva
            </h3>
            <p className="leading-relaxed whitespace-pre-wrap wrap-anywhere text-muted-foreground">
              {notes}
            </p>
          </section>
        )}
      </div>
      <Footer className="shrink-0 flex-row flex-wrap border-t p-5 [&>button]:flex-1">
        {lifecycle.running && (
          <p role="status" className="w-full text-muted-foreground">
            Guardando estado…
          </p>
        )}
        <Button
          type="button"
          variant={lifecycle.step?.due ? "outline" : "default"}
          disabled={saving}
          onClick={onEdit}
        >
          <PencilIcon data-icon="inline-start" />
          Editar reserva
        </Button>
        {lifecycle.step && (
          <Button
            type="button"
            variant={lifecycle.step.due ? "default" : "outline"}
            disabled={saving || lifecycle.running || refreshError !== null}
            onClick={() => void lifecycle.run()}
          >
            {lifecycle.running ? (
              <Spinner data-icon="inline-start" />
            ) : lifecycle.step.status === "checked_in" ? (
              <LogInIcon data-icon="inline-start" />
            ) : (
              <LogOutIcon data-icon="inline-start" />
            )}
            {lifecycle.step.label}
          </Button>
        )}
      </Footer>
    </>
  );
}
