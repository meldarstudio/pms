import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  useReportEditorState,
  type ConfigurationEditorEvents,
} from "@/components/configuration-draft";
import { PageError, StaleDataNotice } from "@/components/page-error";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, NetworkError } from "@/lib/api-error";
import { knownErrorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { useRatePlans, useUpdateNonRefundablePriceAdjustment } from "@/lib/queries";
import { priceAdjustmentBadge, ratePlanLabels } from "@/lib/rate-plans";

export const ratePlanSettingsFormId = "rate-plan-settings-form";
const reductionFieldId = "non-refundable-reduction";
const exampleFlexibleCents = 20_000;
const invalidReduction = "Ingresa un porcentaje entero del 1 al 99.";

function saveErrorMessage(cause: unknown) {
  if (cause instanceof NetworkError) return cause.message;
  return (
    (cause instanceof ApiError && knownErrorMessage(cause.code)) ||
    "No se pudo guardar el ajuste. Inténtalo de nuevo."
  );
}

export function RatePlanSettings(events: ConfigurationEditorEvents) {
  const plans = useRatePlans();
  const save = useUpdateNonRefundablePriceAdjustment();
  const saving = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string>();
  const plan = plans.data?.find(({ plan }) => plan === "non_refundable");
  const current = plan ? -plan.priceAdjustmentPercent : null;
  const value = draft ?? String(current ?? "");
  const next = Number(value);
  const valid = /^\d{1,2}$/.test(value) && next >= 1;
  const changed = draft !== null && (!valid || next !== current);
  const canSave = changed && valid && !plans.isError;
  const invalid = value !== "" && !valid;

  useReportEditorState(events, changed, save.isPending);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    if (!canSave) {
      events.onSubmitFinished();
      return;
    }
    saving.current = true;
    setSaveError(undefined);
    try {
      await save.mutateAsync({ reductionPercent: next });
      setDraft(null);
      events.onSaved();
      toast.success("Ajuste de tarifa guardado.");
    } catch (cause) {
      setSaveError(saveErrorMessage(cause));
    } finally {
      saving.current = false;
      events.onSubmitFinished();
    }
  }

  if (plans.isPending)
    return <Skeleton className="h-52 w-full max-w-md" aria-label="Cargando planes tarifarios" />;
  if (!plan) return <PageError error={plans.error} onRetry={() => void plans.refetch()} />;

  return (
    <section
      className="flex max-w-md flex-col gap-4 border-y py-4"
      aria-labelledby="rate-plan-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="rate-plan-title" className="text-sm font-medium">
          {ratePlanLabels[plan.plan]}{" "}
          <span className="ml-2 tabular-nums">
            {priceAdjustmentBadge(plan.priceAdjustmentPercent)}
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          El ajuste se aplica a todas las habitaciones y fechas, en la web y en recepción.
        </p>
        <p className="text-xs text-muted-foreground">
          Las reservas existentes no cambian. Las cotizaciones vigentes mantienen su precio hasta
          que vencen.
        </p>
      </div>
      {plans.isError && (
        <StaleDataNotice error={plans.error} onRetry={() => void plans.refetch()} />
      )}
      <form id={ratePlanSettingsFormId} className="flex flex-col gap-4" onSubmit={submit}>
        <FieldGroup>
          <Field data-disabled={save.isPending} data-invalid={invalid}>
            <FieldLabel htmlFor={reductionFieldId}>Porcentaje de reducción</FieldLabel>
            <Input
              name="reductionPercent"
              id={reductionFieldId}
              inputMode="numeric"
              className="max-w-24"
              value={value}
              disabled={save.isPending}
              aria-invalid={invalid}
              aria-describedby={`${reductionFieldId}-help`}
              onChange={(event) => {
                setSaveError(undefined);
                setDraft(event.target.value);
              }}
            />
            <div id={`${reductionFieldId}-help`}>
              {invalid ? (
                <FieldError>{invalidReduction}</FieldError>
              ) : (
                <FieldDescription>Del 1% al 99% sobre la tarifa Flexible.</FieldDescription>
              )}
            </div>
          </Field>
        </FieldGroup>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Ejemplo por noche: {formatMoney(exampleFlexibleCents)} Flexible →{" "}
          {valid ? formatMoney((exampleFlexibleCents * (100 - next)) / 100) : "—"} No reembolsable.
        </p>
        {saveError && <FieldError>{saveError}</FieldError>}
        <div>
          <Button type="submit" disabled={!canSave || save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" />}
            Guardar
          </Button>
        </div>
      </form>
    </section>
  );
}
