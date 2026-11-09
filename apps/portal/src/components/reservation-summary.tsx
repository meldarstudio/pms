import { useEffect, useId, useState } from "react";
import { LogInIcon, LogOutIcon, PencilIcon, PhoneIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { useIsMobile } from "@/hooks/use-mobile";
import { AccountStatusBanner, accountStatus } from "@/components/balance-status";
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
  return (
    <>
      {lifecycle.dialogs}
      <Header className="relative shrink-0 border-b pr-12 pb-4 group-data-[swipe-axis=y]/drawer-popup:text-left">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="font-mono text-xs tracking-widest wrap-anywhere text-muted-foreground uppercase">
            Reserva #{detail.code}
          </p>
          <ReservationStatusBadge status={detail.status} />
        </div>
        <div className="flex min-w-0 items-start gap-2.5">
          <NationalityFlag nationality={detail.guest.nationality} className="mt-1.5 h-4 w-6" />
          <Title className="min-w-0 wrap-anywhere">{detail.guest.fullName.trim()}</Title>
        </div>
        <Description>{stayRange(detail.checkIn, detail.checkOut)}</Description>
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
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
        {refreshError && <StaleDataNotice error={refreshError} onRetry={onRetry} />}
        <section aria-label="Contacto principal" className="flex items-center gap-1.5">
          <PhoneIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          {phone ? (
            <a href={phone.href} className="hover:underline">
              <span className="sr-only">Llamar al </span>
              {phone.text}
            </a>
          ) : (
            <span className="text-muted-foreground">Sin teléfono</span>
          )}
        </section>
        <section aria-labelledby={`${scopeId}-rooms`} className="flex flex-col gap-1.5">
          <h3 id={`${scopeId}-rooms`} className="text-xs font-medium text-muted-foreground">
            {roomCount === 1 ? "Habitación reservada" : `${roomCount} habitaciones reservadas`}
          </h3>
          <ul className="flex flex-col divide-y border-y">
            {detail.rooms.map((room) => (
              <li key={room.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 wrap-anywhere">{room.roomTypeName || "Habitación"}</span>
                {room.roomNumber ? (
                  <span className="shrink-0 font-medium">Hab. {room.roomNumber}</span>
                ) : (
                  <span className="shrink-0 text-muted-foreground">Sin asignar</span>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Saldo de la reserva">
          <AccountStatusBanner
            status={status}
            amount={formatMoney(status.cents, detail.currency)}
          />
        </section>
        {lifecycle.step && roomCount > 1 && (
          <p id={`${scopeId}-scope`} className="text-muted-foreground">
            {lifecycle.step.status === "checked_in" ? "El check-in" : "El check-out"} se aplica a
            las {roomCount} habitaciones de la reserva.
          </p>
        )}
      </div>
      <Footer className="shrink-0 border-t pt-4">
        {lifecycle.running && (
          <p role="status" className="mr-auto self-center text-muted-foreground">
            Guardando estado…
          </p>
        )}
        <Close disabled={saving} render={<Button type="button" variant="outline" />}>
          Cerrar
        </Close>
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
            aria-describedby={roomCount > 1 ? `${scopeId}-scope` : undefined}
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
