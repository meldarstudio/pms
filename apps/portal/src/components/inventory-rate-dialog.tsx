import { defaultValidationLogic, useForm, useSelector } from "@tanstack/react-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { InventoryNight, RatePlanTerms } from "@/lib/api";
import {
  clearServerErrorsOnlyOnOwnChangeOrSubmit,
  fieldErrors,
  setServerErrors,
} from "@/lib/form-errors";
import {
  inventoryRateSchema,
  overrideClearDates,
  rateApplyInput,
  rateFormError,
  ratePriceUnchanged,
  sharedRatePrice,
} from "@/lib/inventory-rate-form";
import { useDeleteRoomTypeRates, usePutRoomTypeRates } from "@/lib/queries";
import { priceAdjustmentSentence, ratePlanLabels } from "@/lib/rate-plans";
import { contiguousRanges } from "@/lib/rate-ranges";

export type RateTarget = {
  roomTypeId: string;
  roomTypeName: string;
  label: string;
  dates: string[];
  nights: InventoryNight[];
  derivedPlans: RatePlanTerms[];
};

export function InventoryRateDialog({
  target,
  currency,
  onClose,
}: {
  target: RateTarget | null;
  currency: string;
  onClose: () => void;
}) {
  const put = usePutRoomTypeRates();
  const clear = useDeleteRoomTypeRates();
  const pending = put.isPending || clear.isPending;

  function finish() {
    put.reset();
    clear.reset();
    onClose();
  }

  function close() {
    if (pending) return;
    finish();
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        {target ? (
          <RateForm
            key={target.dates.join(",")}
            target={target}
            currency={currency}
            pending={pending}
            saving={put.isPending}
            onApply={async (input) => {
              await put.mutateAsync(input);
              finish();
            }}
            onClear={async (ranges) => {
              await clear.mutateAsync({ id: target.roomTypeId, ranges });
              finish();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RateForm({
  target,
  currency,
  pending,
  saving,
  onApply,
  onClear,
}: {
  target: RateTarget;
  currency: string;
  pending: boolean;
  saving: boolean;
  onApply: (input: { id: string; from: string; to: string; priceCents: number }) => Promise<void>;
  onClear: (ranges: { from: string; to: string }[]) => Promise<void>;
}) {
  const form = useForm({
    validationLogic: clearServerErrorsOnlyOnOwnChangeOrSubmit(defaultValidationLogic),
    defaultValues: {
      price: sharedRatePrice(target.nights),
    },
    validators: {
      onSubmit: inventoryRateSchema,
    },
    onSubmit: async ({ value }) => {
      const input = rateApplyInput(target, value.price);
      if (!input) return;
      form.setErrorMap({ onServer: undefined });
      try {
        await onApply(input);
      } catch (cause) {
        setServerErrors(form, { price: rateFormError(cause) });
      }
    },
  });
  const price = useSelector(form.store, (state) => state.values.price);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const unchanged = ratePriceUnchanged(target.nights, price);
  const canClear = target.nights.some((night) => night.override);
  const busy = pending || submitting;
  const range = target.dates.length > 1;

  return (
    <form
      id="inventory-rate-form"
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{target.roomTypeName}</DialogTitle>
        <DialogDescription>
          {target.label}. Las reservas existentes conservan sus precios.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <form.Field name="price">
          {(field) => {
            const showError =
              !!field.state.meta.errorMap.onServer ||
              ((field.state.meta.isTouched || field.form.state.submissionAttempts > 0) &&
                !field.state.meta.isValid);
            return (
              <Field data-invalid={showError || undefined} data-disabled={busy || undefined}>
                <FieldLabel htmlFor={field.name}>
                  Precio {ratePlanLabels.flexible} ({currency})
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={field.state.value ? undefined : "Varios precios"}
                  value={field.state.value}
                  disabled={busy}
                  aria-invalid={showError || undefined}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    if (field.state.meta.errorMap.onServer)
                      field.setMeta((meta) => ({
                        ...meta,
                        errorMap: { ...meta.errorMap, onServer: undefined },
                      }));
                    field.handleChange(event.target.value);
                  }}
                />
                {target.derivedPlans.map((terms) => (
                  <FieldDescription key={terms.plan}>
                    {ratePlanLabels[terms.plan]} se actualiza automáticamente:{" "}
                    {priceAdjustmentSentence(terms.priceAdjustmentPercent)}.
                  </FieldDescription>
                ))}
                {showError && <FieldError errors={fieldErrors(field.state.meta.errors)} />}
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>
      <DialogFooter>
        {canClear ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              form.setErrorMap({ onServer: undefined });
              const dates = overrideClearDates(target.nights);
              void onClear(contiguousRanges(dates)).catch((cause: unknown) => {
                setServerErrors(form, {
                  price:
                    cause instanceof Error
                      ? rateFormError(cause)
                      : "No se pudo restablecer el precio.",
                });
              });
            }}
          >
            {range ? "Restablecer tarifas" : "Usar tarifa base"}
          </Button>
        ) : null}
        <DialogClose disabled={busy} render={<Button variant="outline" type="button" />}>
          Cancelar
        </DialogClose>
        <Button type="submit" form="inventory-rate-form" disabled={unchanged || busy}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}
