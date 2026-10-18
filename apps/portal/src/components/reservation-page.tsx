import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { BookingEditor, DiscardChanges, ReservationStatus } from "@/components/room-booking-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldError } from "@/components/ui/field";
import { useReservation, useReservationSaving } from "@/lib/queries";
import { isReservationSaving } from "@/lib/workflow-query-cache";

export function ReservationPage({ id, onBack }: { id: string; onBack: () => void }) {
  const client = useQueryClient();
  const query = useReservation(id);
  const saving = useReservationSaving(id);
  const dirty = useRef(false);
  const shouldProtectUnload = useCallback(
    () => isReservationSaving(client, id) || dirty.current,
    [client, id],
  );
  const blocker = useBlocker({
    shouldBlockFn: shouldProtectUnload,
    withResolver: true,
  });
  const [tab, setTab] = useState("details");
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-8">
      <header className="flex flex-col items-start gap-4">
        <Button variant="ghost" disabled={saving} onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver a reservas
        </Button>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">Reserva {query.data?.code ?? ""}</h1>
            {query.data && <ReservationStatus detail={query.data} />}
          </div>
          <p className="mt-1 text-muted-foreground">
            Información completa de la reserva y sus estancias.
          </p>
        </div>
      </header>
      {query.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : query.error ? (
        <>
          <FieldError>{query.error.message}</FieldError>
          <Button variant="outline" className="w-fit" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </>
      ) : (
        query.data && (
          <BookingEditor
            key={id}
            detail={query.data}
            full
            initialTab={tab}
            onTabChange={setTab}
            onDirtyChange={(value) => {
              dirty.current = value;
              if (!value && !isReservationSaving(client, id) && blocker.status === "blocked")
                blocker.reset();
            }}
            onRefresh={() => void query.refetch()}
          />
        )
      )}
      {blocker.status === "blocked" && (
        <DiscardChanges
          saving={saving}
          onStay={blocker.reset}
          onLeave={() => {
            if (!isReservationSaving(client, id)) blocker.proceed();
          }}
        />
      )}
    </main>
  );
}
