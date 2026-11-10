import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { DiscardChanges } from "@/components/discard-changes";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PageTitle } from "@/components/page-title";
import { ReservationOverviewSkeleton } from "@/components/reservation-overview-skeleton";
import { PageError, StaleDataNotice } from "@/components/page-error";
import { useReservation } from "@/lib/queries";
import { useReservationCommands } from "@/lib/reservation-commands";
import { ReservationOverview } from "@/components/reservation-overview";
import {
  ReservationPageEditor,
  type ReservationEditorTarget,
} from "@/components/reservation-page-editors";
import type { ReservationDetail } from "@/lib/api";
import type { CalendarSearch, ReservationsSearch } from "@/lib/route-search";

export type ReservationBack =
  | { to: "/calendar"; search: CalendarSearch }
  | { to: "/reservations"; search: ReservationsSearch };
type PageProps = { id: string; back: ReservationBack; onBack: () => void };

export function ReservationPage(props: PageProps) {
  return <ReservationPageContent key={props.id} {...props} />;
}

function ReservationPageContent({ id, back, onBack }: PageProps) {
  const query = useReservation(id, { refetchOnReconnect: true });
  const { saving } = useReservationCommands(id);
  const dirty = useRef(false);
  const discountDraft = useRef(false);
  const [discountDirty, setDiscountDirty] = useState(false);
  const shouldProtectUnload = useCallback(
    () => saving || dirty.current || discountDraft.current,
    [saving],
  );
  const blocker = useBlocker({
    shouldBlockFn: shouldProtectUnload,
    withResolver: true,
  });
  const [editor, setEditor] = useState<{
    target: ReservationEditorTarget;
    detail: ReservationDetail;
  } | null>(null);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const onDiscountDraftChange = useCallback((value: boolean) => {
    discountDraft.current = value;
    setDiscountDirty(value);
  }, []);
  function closeEditor() {
    dirty.current = false;
    setEditor(null);
  }
  useEffect(() => {
    const protectUnload = (event: BeforeUnloadEvent) => {
      if (!shouldProtectUnload()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnload);
    return () => window.removeEventListener("beforeunload", protectUnload);
  }, [shouldProtectUnload]);
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <PageTitle>
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem>
              {back.to === "/calendar" ? (
                <BreadcrumbLink render={<Link to="/calendar" search={back.search} />}>
                  Calendario
                </BreadcrumbLink>
              ) : (
                <BreadcrumbLink render={<Link to="/reservations" search={back.search} />}>
                  Reservas
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium">Detalle</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageTitle>
      <div className="flex w-full flex-col gap-4 p-4 lg:p-6">
        {query.isPending && <ReservationOverviewSkeleton />}
        {query.error &&
          (query.data ? (
            <StaleDataNotice error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <PageError
              error={query.error}
              onRetry={() => void query.refetch()}
              notFound={{
                title: "No se encontró la reserva",
                description: "Esta reserva no existe o fue eliminada.",
                action: (
                  <Button variant="outline" onClick={onBack}>
                    <ArrowLeftIcon data-icon="inline-start" />
                    {back.to === "/calendar" ? "Volver al calendario" : "Volver a reservas"}
                  </Button>
                ),
              }}
            />
          ))}
        {query.data && (
          <ReservationOverview
            detail={query.data}
            disabled={saving}
            lifecycleBlocked={editor !== null || discountDirty}
            onDiscountDraftChange={onDiscountDraftChange}
            edit={(target) => {
              if (editor || saving) return;
              setEditor({ target, detail: query.data });
            }}
          />
        )}
      </div>
      {editor && (
        <ReservationPageEditor
          target={editor.target}
          detail={editor.detail}
          onClose={closeEditor}
          onDirtyChange={onDirtyChange}
        />
      )}
      {blocker.status === "blocked" && (
        <DiscardChanges
          saving={saving}
          onStay={blocker.reset}
          onLeave={() => {
            if (!saving) blocker.proceed();
          }}
        />
      )}
    </main>
  );
}
