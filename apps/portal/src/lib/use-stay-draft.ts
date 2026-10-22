import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "@tanstack/react-form";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  previewWorkflow,
  type ReservationDetail,
  type WorkflowAction,
  type WorkflowBilling,
  type WorkflowCommand,
} from "./api.ts";
import { serverFieldErrors } from "./api-error.ts";
import { setServerErrors } from "./form-errors.ts";
import { useRoomTypes } from "./queries.ts";
import {
  billingPreviewKey,
  changeCheckIn,
  hasBillingChanges,
  minimumCheckOut,
  previewFieldErrors,
  roomEdits,
  validationPreviewActions,
} from "./reservation-editor.ts";
import { blurThenChange, useReservationForm } from "./reservation-form.tsx";
import {
  detailsDefaults,
  detailsSchema,
  detailsSummaryRooms,
  schemaErrors,
  workflowDrafts,
  type DetailsValues,
} from "./reservation-form-schemas.ts";

function useDraftCommand(actionsKey: string) {
  return useMemo<WorkflowCommand>(
    () => ({
      requestId: crypto.randomUUID(),
      actions: JSON.parse(actionsKey) as WorkflowAction[],
    }),
    [actionsKey],
  );
}

// The opening values belong to the draft; refreshed saved details can update
// validation and prices without replacing those values. Writes stay with callers.
export function useStayDraft({
  detail,
  onSubmit,
}: {
  detail: ReservationDetail;
  onSubmit: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const roomTypes = useRoomTypes();
  const [defaults, setDefaults] = useState(() => detailsDefaults(detail));
  const schema = useMemo(
    () => detailsSchema(roomTypes.data ?? [], { saved: detail }),
    [roomTypes.data, detail],
  );
  const pricingSchema = useMemo(
    () => detailsSchema(roomTypes.data ?? [], { validateOperations: false }),
    [roomTypes.data],
  );
  const rejectedFields = useRef<{ values: DetailsValues; fields: Record<string, string> } | null>(
    null,
  );
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => {
        const fields = schemaErrors(schema.safeParse(value));
        // Submit-driven focus can blur a date picker. Keep server feedback until
        // the rejected value is corrected, rather than clearing it on that blur.
        for (const name of ["checkOut"] as const) {
          if (
            rejectedFields.current?.fields[name] &&
            value[name] === rejectedFields.current.values[name]
          )
            fields[name] = rejectedFields.current.fields[name];
        }
        return Object.keys(fields).length ? { fields } : undefined;
      },
    },
    onSubmit: async () => onSubmit(),
  });
  const values = useSelector(form.store, (state) => state.values);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue);
  const drafts = workflowDrafts(values);
  const stay = { checkIn: values.checkIn, checkOut: values.checkOut };
  const validation = schema.safeParse(values);
  const localErrors = schemaErrors(validation);
  const countsValid = validation.success && !!roomTypes.data;
  const pricingValid = pricingSchema.safeParse(values).success && !!roomTypes.data;
  const changes = roomEdits(detail, drafts);
  if (stay.checkIn !== detail.checkIn || stay.checkOut !== detail.checkOut)
    changes.unshift({ type: "dates", ...stay });
  if (values.notes !== (detail.notes ?? "")) changes.push({ type: "notes", notes: values.notes });
  const dirty = changes.length > 0 || (!validation.success && !unchanged);
  const previewActions = validationPreviewActions(changes);
  const validationNeeded = previewActions.length > 0;
  const billingDirty = hasBillingChanges(detail, changes);
  const editCommand = useDraftCommand(JSON.stringify(changes));
  const validationCommand = useDraftCommand(JSON.stringify(previewActions));
  const [previewCommand, setPreviewCommand] = useState(validationCommand);
  const pricingKey = billingPreviewKey(detail, previewActions);
  const requestPricingKey = billingPreviewKey(detail, previewCommand.actions);
  // Assignment/occupancy validation can change while its price remains reusable.
  // Only workflow responses publish quotes; this query just subscribes to them.
  const quote = useQuery<WorkflowBilling>({
    queryKey: ["workflow-billing-preview", detail.id, pricingKey],
    queryFn: skipToken,
  });
  useEffect(() => {
    const timer = setTimeout(() => setPreviewCommand(validationCommand), 300);
    return () => clearTimeout(timer);
  }, [validationCommand]);
  const editPreview = useQuery({
    queryKey: ["workflow-edit-preview", detail.id, previewCommand, requestPricingKey],
    queryFn: async () => {
      const result = await previewWorkflow(detail.id, previewCommand);
      queryClient.setQueryData(
        ["workflow-billing-preview", detail.id, requestPricingKey],
        result.billing,
      );
      return result;
    },
    enabled:
      validationNeeded &&
      previewCommand.actions.length > 0 &&
      previewCommand === validationCommand &&
      pricingValid,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const previewCurrent = previewCommand === validationCommand;
  const previewLoaded = previewCurrent && editPreview.isSuccess && !editPreview.isFetching;
  const previewReady =
    !validationNeeded || (previewLoaded && editPreview.data.validation.issues.length === 0);
  const previewFields = useMemo(
    () =>
      validationNeeded && previewCurrent && !editPreview.isFetching
        ? editPreview.data && editPreview.isSuccess
          ? previewFieldErrors(editPreview.data.validation.issues, values.rooms)
          : serverFieldErrors(editPreview.error, "details")
        : null,
    [
      editPreview.error,
      editPreview.data,
      editPreview.isSuccess,
      editPreview.isFetching,
      validationNeeded,
      previewCurrent,
      values.rooms,
    ],
  );
  useEffect(() => {
    if (previewFields) setServerErrors(form, previewFields);
    else form.setErrorMap({ onServer: undefined });
  }, [form, previewFields]);
  const billing = billingDirty ? (pricingValid ? quote.data : undefined) : detail;

  function reset(saved: ReservationDetail) {
    rejectedFields.current = null;
    const next = detailsDefaults(saved);
    setDefaults(next);
    form.reset(next);
  }

  function rejectSave(cause: unknown) {
    const fields = serverFieldErrors(cause, "details");
    if (!fields) return false;
    rejectedFields.current = { values, fields };
    form.setErrorMap({ onDynamic: { fields } });
    return true;
  }

  return {
    form,
    values,
    drafts,
    stay,
    roomTypes,
    dirty,
    submitting,
    errors: { ...localErrors, ...previewFields },
    minimumCheckOut: minimumCheckOut(stay.checkIn),
    changeCheckIn(checkIn: string) {
      const next = changeCheckIn({ checkIn, checkOut: form.getFieldValue("checkOut") }, checkIn);
      form.setFieldValue("checkOut", next.checkOut);
    },
    submission: {
      command: editCommand,
      allowed: countsValid && dirty && previewReady,
      // Invalid values must still be submittable to reveal field errors. This is
      // deliberately different from permission to write the current draft.
      disabled:
        !dirty || roomTypes.isPending || roomTypes.isError || (pricingValid && !previewReady),
    },
    summary: {
      billing,
      rooms: detailsSummaryRooms(values, billing?.rooms),
      provisional: billingDirty,
      calculating:
        billingDirty &&
        pricingValid &&
        !billing &&
        (!editPreview.error || !previewCurrent || editPreview.isFetching),
      error:
        validationNeeded &&
        pricingValid &&
        previewCurrent &&
        !editPreview.isFetching &&
        !previewFields
          ? editPreview.error
          : null,
      retry: editPreview.refetch,
    },
    reset,
    discard: () => form.reset(defaults),
    rejectSave,
  };
}
