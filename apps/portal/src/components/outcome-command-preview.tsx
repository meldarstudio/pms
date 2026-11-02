import { useEffect } from "react";
import { OutcomeAccountPreview } from "@/components/outcome-account-preview";
import { PageError } from "@/components/page-error";
import { FieldError } from "@/components/ui/field";
import type { ReservationDetail } from "@/lib/api";
import { knownErrorMessage } from "@/lib/errors";
import type { ReservationCommandResult, useReservationPreview } from "@/lib/reservation-commands";
import { toastError } from "@/lib/toast";

export function outcomeSaveError(result: Extract<ReservationCommandResult, { status: "failed" }>) {
  const known = result.code ? knownErrorMessage(result.code) : null;
  const offline = result.message === "No se pudo conectar con el servidor. Inténtalo de nuevo.";
  if (!known && !offline) console.error(result);
  toastError(
    "No se pudo guardar",
    known ?? (offline ? result.message : "No se pudieron guardar los cambios."),
  );
}

export function OutcomeCommandPreview({
  preview,
  detail,
  today,
  pending = false,
}: {
  preview: ReturnType<typeof useReservationPreview>;
  detail: ReservationDetail;
  today: string;
  pending?: boolean;
}) {
  const issues = preview.data?.validation.issues;
  useEffect(() => {
    if (!pending && !preview.isFetching && !preview.error)
      for (const issue of issues ?? []) if (!knownErrorMessage(issue.code)) console.error(issue);
  }, [issues, pending, preview.isFetching, preview.error]);
  return (
    <section
      aria-label="Cuenta resultante"
      aria-busy={pending || preview.isFetching}
      className="flex flex-col gap-3 text-sm"
    >
      {pending || preview.isFetching || (!preview.data && !preview.error) ? (
        <p role="status">Calculando…</p>
      ) : preview.error ? (
        <PageError error={preview.error} onRetry={() => void preview.refetch()} />
      ) : issues?.length ? (
        issues.map((issue, index) => (
          <FieldError key={index}>
            Habitación {issue.roomIndex + 1}:{" "}
            {knownErrorMessage(issue.code) ??
              "No se pudo comprobar la disponibilidad. Inténtalo de nuevo."}
          </FieldError>
        ))
      ) : preview.data ? (
        <OutcomeAccountPreview billing={preview.data.billing} detail={detail} today={today} />
      ) : null}
    </section>
  );
}
