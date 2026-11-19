import { useEffect } from "react";
import { LogInIcon, LogOutIcon, PencilIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { ReservedRooms } from "@/components/assigned-rooms";
import { SummaryRow, accountStatus } from "@/components/balance-status";
import { useLifecycleAction } from "@/components/lifecycle-action";
import { StaleDataNotice } from "@/components/page-error";
import { BalanceToggle, balanceTone } from "@/components/reservation-account";
import { ContactLine, NotesLine } from "@/components/reservation-overview";
import { ReservationSection } from "@/components/reservation-section";
import { StayDates } from "@/components/reservation-stay";
import { ReservationStatusBadge } from "@/components/reservation-status-badge";
import { NationalityFlag } from "@/components/workflow-fields";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useResponsivePanel, type PanelSurface } from "@/components/responsive-panel";
import { FieldError } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ReservationDetail } from "@/lib/api";
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
            asDrawer={asDrawer}
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
  asDrawer,
}: {
  reservationId: string;
  onEdit: () => void;
  surface: PanelSurface;
  asDrawer: boolean;
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
        asDrawer={asDrawer}
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
  asDrawer,
}: {
  detail: ReservationDetail;
  refreshError: Error | null;
  onRetry: () => void;
  onEdit: () => void;
  surface: PanelSurface;
  asDrawer: boolean;
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
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain p-5">
        {refreshError && <StaleDataNotice error={refreshError} onRetry={onRetry} />}
        <NotesLine detail={detail} />
        <ReservationSection title="Estadía">
          <StayDates detail={detail} />
          <ReservedRooms detail={detail} />
        </ReservationSection>
        {!asDrawer && (
          <ReservationSection title="Cuenta" className="text-xs">
            <div className="flex flex-col gap-0.5">
              <p className={cn("flex items-center gap-1.5 font-medium", balanceTone[status.state])}>
                <status.Icon aria-hidden className="size-3.5" />
                {status.label}
              </p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {money(status.cents)}
              </p>
            </div>
            <BillLines detail={detail} />
          </ReservationSection>
        )}
      </div>
      <Footer
        className={cn(
          "shrink-0 border-t",
          asDrawer ? "gap-3 px-5 pt-2 pb-5" : "flex-row flex-wrap p-5 [&>button]:flex-1",
        )}
      >
        {lifecycle.running && (
          <p role="status" className="w-full text-muted-foreground">
            Guardando estado…
          </p>
        )}
        {asDrawer && (
          <section role="region" aria-label="Cuenta">
            <Collapsible>
              <CollapsibleContent
                keepMounted
                className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-200 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
              >
                <div className="max-h-[min(35dvh,20rem)] overflow-y-auto overscroll-contain pt-2 pb-3 text-xs">
                  <BillLines detail={detail} />
                </div>
                <Separator />
              </CollapsibleContent>
              <BalanceToggle detail={detail} />
            </Collapsible>
          </section>
        )}
        <div className={cn("flex gap-2 [&>button]:flex-1", !asDrawer && "contents")}>
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
        </div>
      </Footer>
    </>
  );
}

function BillLines({ detail }: { detail: ReservationDetail }) {
  const money = (cents: number) => formatMoney(cents, detail.currency);
  return (
    <dl aria-label="Resumen de la cuenta" className="flex flex-col gap-1.5">
      {detail.discountCents > 0 && (
        <>
          <SummaryRow label="Subtotal" value={money(detail.subtotalCents)} />
          <SummaryRow label="Descuento" value={money(-detail.discountCents)} />
        </>
      )}
      <SummaryRow className="font-medium" label="Total" value={money(detail.totalCents)} />
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
  );
}
