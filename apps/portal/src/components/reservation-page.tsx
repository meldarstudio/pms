import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { DiscardChanges } from "@/components/room-booking-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldError } from "@/components/ui/field";
import { useReservation, useReservationSaving } from "@/lib/queries";
import { isReservationSaving } from "@/lib/workflow-query-cache";
import { ReservationOverview } from "@/components/reservation-overview";
import {
  ReservationPageEditor,
  type ReservationEditorTarget,
} from "@/components/reservation-page-editors";
import type { ReservationDetail } from "@/lib/api";

type PageProps = { id: string; onBack: () => void };

export function ReservationPage(props: PageProps) {
  return <ReservationPageContent key={props.id} {...props} />;
}

function ReservationPageContent({ id, onBack }: PageProps) {
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
  const [editor, setEditor] = useState<{
    target: ReservationEditorTarget;
    detail: ReservationDetail;
  } | null>(null);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
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
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-5 md:px-8 md:py-7">
        {!query.data && (
          <div className="flex items-center">
            <Button variant="ghost" size="sm" disabled={saving} onClick={onBack}>
              <ArrowLeftIcon data-icon="inline-start" />
              Volver a reservas
            </Button>
          </div>
        )}
        {query.isPending && <Skeleton className="h-80 w-full" />}
        {query.error && (
          <>
            <FieldError>{query.error.message}</FieldError>
            <Button variant="outline" className="w-fit" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          </>
        )}
        {query.data && (
          <ReservationOverview
            detail={query.data}
            disabled={saving}
            onBack={onBack}
            edit={(target) => {
              if (editor || isReservationSaving(client, id)) return;
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
            if (!isReservationSaving(client, id)) blocker.proceed();
          }}
        />
      )}
    </main>
  );
}
