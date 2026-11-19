import { useEffect } from "react";
import { LogInIcon, LogOutIcon, PencilIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { ReservedRooms } from "@/components/assigned-rooms";
import { SummaryRow, accountStatus } from "@/components/balance-status";
import { useLifecycleAction } from "@/components/lifecycle-action";
import { StaleDataNotice } from "@/components/page-error";
import { balanceTone } from "@/components/reservation-account";
import { ContactLine, NotesLine } from "@/components/reservation-overview";
import { ReservationStatusBadge } from "@/components/reservation-status-badge";
import { NationalityFlag } from "@/components/workflow-fields";
import { Button } from "@/components/ui/button";
import { useResponsivePanel, type PanelSurface } from "@/components/responsive-panel";
import { FieldError } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { ReservationDetail } from "@/lib/api";
import { stayRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { useReservation } from "@/lib/queries";
import { useReservationCommands } from "@/lib/reservation-commands";

export function ReservationSummary({
  reservationId,
  onClose,
  onEdit,
}: {
  reservationId: string | null;
  onClose: () => void;
  onEdit: (reservationId: string) => void;
}) {
  const { asDrawer, surface } = useResponsivePanel(reservationId);
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
  surface: PanelSurface;
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
  surface: PanelSurface;
}) {
  const { Header, Title, Description, Footer, Close } = surface;
  const { saving } = useReservationCommands(detail.id);
  const lifecycle = useLifecycleAction(detail, refreshError !== null);
  const money = (cents: number) => formatMoney(cents, detail.currency);
  const status = accountStatus(detail);
  return (
    <>
      {lifecycle.dialogs}
      <Header className="relative shrink-0 gap-2 border-b p-5 pr-12 group-data-[swipe-axis=y]/drawer-popup:text-left">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="font-mono text-xs tracking-widest wrap-anywhere text-muted-foreground uppercase">
            Reserva #{detail.code}
          </p>
          <ReservationStatusBadge status={detail.status} />
        </div>
        <div className="flex min-w-0 items-start gap-2.5">
          <NationalityFlag nationality={detail.guest.nationality} className="mt-1.5 h-4 w-6" />
          <Title className="min-w-0 text-xl/tight font-semibold tracking-tight wrap-anywhere">
            {detail.guest.fullName.trim()}
          </Title>
        </div>
        <ContactLine detail={detail} className="mt-0 md:mt-0" />
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
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain p-5">
        {refreshError && <StaleDataNotice error={refreshError} onRetry={onRetry} />}
        <section role="region" aria-label="Estadía" className="flex flex-col gap-3">
          <p className="text-sm font-medium">{stayRange(detail.checkIn, detail.checkOut)}</p>
          <ReservedRooms detail={detail} />
        </section>
        <NotesLine detail={detail} />
        <Separator />
        <section role="region" aria-label="Cuenta" className="flex flex-col gap-2 text-xs">
          <p className="flex items-center justify-between gap-3">
            <span
              className={cn("flex items-center gap-1.5 font-medium", balanceTone[status.state])}
            >
              <status.Icon aria-hidden className="size-3.5" />
              {status.label}
            </span>
            <span className="text-base font-semibold tabular-nums">{money(status.cents)}</span>
          </p>
          <dl
            aria-label="Resumen de la cuenta"
            className="flex flex-col gap-1.5 text-muted-foreground"
          >
            {detail.discountCents > 0 && (
              <>
                <SummaryRow label="Subtotal" value={money(detail.subtotalCents)} />
                <SummaryRow label="Descuento" value={money(-detail.discountCents)} />
              </>
            )}
            <SummaryRow label="Total" value={money(detail.totalCents)} />
            <SummaryRow label="Pagado" value={money(detail.paidCents)} />
            {detail.couponAppliedCents > 0 && (
              <SummaryRow label="Pagado con cupón" value={money(detail.couponAppliedCents)} />
            )}
            {detail.refundedCents > 0 && (
              <SummaryRow label="Reembolsado" value={money(-detail.refundedCents)} />
            )}
            {detail.couponIssuedCents > 0 && (
              <SummaryRow label="Pasado a cupón" value={money(-detail.couponIssuedCents)} />
            )}
          </dl>
        </section>
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
