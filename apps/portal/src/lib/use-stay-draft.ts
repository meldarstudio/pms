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
import { reservationPreviewKey } from "./reservation-commands.ts";
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

export function emptyRoomDraft(): DetailsValues["rooms"][number] {
  return {
    id: crypto.randomUUID(),
    room: { roomTypeId: "", roomId: null, adults: "1", children: "0" },
    removed: false,
  };
}

export function useStayDraft({
  detail,
  onSubmit,
  roomsOnly = false,
  previewEnabled = true,
}: {
  detail: ReservationDetail;
  onSubmit: () => Promise<void>;
  roomsOnly?: boolean;
  previewEnabled?: boolean;
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
  const pricingValid = roomsOnly
    ? countsValid
    : pricingSchema.safeParse(values).success && !!roomTypes.data;
  const reservationChanged =
    roomsOnly && JSON.stringify(defaults) !== JSON.stringify(detailsDefaults(detail));
  const changes = roomEdits(detail, drafts);
  if (!roomsOnly && (stay.checkIn !== detail.checkIn || stay.checkOut !== detail.checkOut))
    changes.unshift({ type: "dates", ...stay });
  const dirty = roomsOnly ? !unchanged : changes.length > 0 || (!validation.success && !unchanged);
  const previewActions = validationPreviewActions(changes);
  const validationNeeded = previewActions.length > 0;
  const billingDirty = hasBillingChanges(detail, changes);
  const editCommand = useDraftCommand(JSON.stringify(changes));
  const validationCommand = useDraftCommand(JSON.stringify(previewActions));
  const [previewCommand, setPreviewCommand] = useState(validationCommand);
  const pricingKey = billingPreviewKey(detail, previewActions);
  const requestPricingKey = billingPreviewKey(detail, previewCommand.actions);
  const quote = useQuery<WorkflowBilling>({
    queryKey: reservationPreviewKey(detail.id, "billing", pricingKey),
    queryFn: skipToken,
  });
  useEffect(() => {
    const timer = setTimeout(() => setPreviewCommand(validationCommand), 300);
    return () => clearTimeout(timer);
  }, [validationCommand]);
  const editPreview = useQuery({
    queryKey: reservationPreviewKey(detail.id, "edit", previewCommand, requestPricingKey),
    queryFn: async () => {
      const result = await previewWorkflow(detail.id, previewCommand);
      queryClient.setQueryData(
        reservationPreviewKey(detail.id, "billing", requestPricingKey),
        result.billing,
      );
      return result;
    },
    enabled:
      previewEnabled &&
      !reservationChanged &&
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
    setServerErrors(form, previewFields ?? {});
  }, [form, previewFields]);
  const billing = roomsOnly
    ? previewEnabled && !reservationChanged && pricingValid && previewLoaded && previewReady
      ? editPreview.data.billing
      : undefined
    : billingDirty
      ? pricingValid
        ? quote.data
        : undefined
      : detail;

  function reset(saved: ReservationDetail) {
    rejectedFields.current = null;
    const next = detailsDefaults(saved);
    setDefaults(next);
    form.reset(next);
  }

  function rejectSave(fields: Record<string, string>) {
    rejectedFields.current = { values, fields };
    form.setErrorMap({ onDynamic: { fields } });
  }

  return {
    form,
    values,
    drafts,
    reservationChanged,
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
      valid: countsValid,
      allowed: countsValid && dirty && previewReady,
      disabled:
        !dirty || roomTypes.isPending || roomTypes.isError || (pricingValid && !previewReady),
    },
    summary: {
      billing,
      rooms: detailsSummaryRooms(values, billing?.rooms),
      billingChanged: billingDirty,
      calculating:
        (roomsOnly ? validationNeeded : billingDirty) &&
        pricingValid &&
        !billing &&
        (!roomsOnly || !previewLoaded) &&
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
    rejectSave,
  };
}
