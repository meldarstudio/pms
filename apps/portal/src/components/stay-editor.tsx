import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { useSelector } from "@tanstack/react-form";
import { PlusIcon } from "lucide-react";
import { overlappingRoomIds, availableRoomTypeIds } from "@/lib/reservation-editor";
import { holdsInventory } from "@/lib/reservation-statuses";
import { useStayDraft } from "@/lib/use-stay-draft";
import { ReservationRoomRow } from "@/components/reservation-room-rows";
import { BookingSummary } from "@/components/booking-summary";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DialogFooter } from "@/components/ui/dialog";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ReservationDetail } from "@/lib/api";
import { useAvailability, useRooms, useRoomTypes } from "@/lib/queries";
import { useReservationCommands } from "@/lib/reservation-commands";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import { withReservationForm, submitForm } from "@/lib/reservation-form";
import { emptyDetails } from "@/lib/reservation-form-schemas";
import { ratePlanLabels } from "@/lib/rate-plans";
import { stayRange } from "@/lib/dates";

export function StayEditor({
  detail,
  onDirtyChange,
  onCancel,
  onSaved,
}: {
  detail: ReservationDetail;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const stayDraft = useStayDraft({ detail, onSubmit: saveChanges });
  const {
    form,
    values,
    drafts,
    stay: common,
    roomTypes,
    dirty,
    submitting,
    errors,
    summary,
    reset: resetDetails,
  } = stayDraft;
  const rooms = useRooms();
  const availability = useRoomAssignmentOptions(common, detail.id);
  const availableTypes = availableRoomTypeIds(availability.types, drafts);
  const previousRoom = values.rooms.find((room) => !room.removed)?.room;
  const nextRoomType =
    roomTypes.data?.find(
      (type) => type.id === previousRoom?.roomTypeId && availableTypes.has(type.id),
    ) ?? roomTypes.data?.find((type) => availableTypes.has(type.id));
  const canAddRoom = roomTypes.isSuccess && rooms.isSuccess && availability.ready && !!nextRoomType;
  const isMobile = useIsMobile();
  const [revealingRoomId, setRevealingRoomId] = useState<string | null>(null);
  function addRoom(event: MouseEvent<HTMLButtonElement>) {
    if (!canAddRoom || !nextRoomType || !previousRoom) return;
    const id = crypto.randomUUID();
    setRevealingRoomId(event.detail > 0 ? id : null);
    form.pushFieldValue("rooms", {
      id,
      room: {
        roomTypeId: nextRoomType.id,
        roomId: null,
        adults: String(Math.min(Number(previousRoom.adults), nextRoomType.maxAdults)),
        children: String(Math.min(Number(previousRoom.children), nextRoomType.maxChildren)),
      },
      removed: false,
    });
  }
  const billing = summary.billing;
  const { send, saving: reservationSaving } = useReservationCommands(detail.id);
  const busy = submitting || reservationSaving;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const activeDrafts = drafts.filter((draft) => !draft.removed);
  async function saveChanges() {
    if (!stayDraft.submission.allowed) return;
    const result = await send(stayDraft.submission.command.actions);
    if (result.status === "saved") {
      resetDetails(result.reservation);
      toast.success("Detalles guardados");
      onSaved();
    } else if (result.status === "rejected") stayDraft.rejectSave(result.fields);
    else toastError("No se pudo guardar", result.message);
  }
  const removeRoom = (id: string) =>
    form.setFieldValue(`rooms[${values.rooms.findIndex((room) => room.id === id)}].removed`, true);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto max-sm:flex-1">
        <div className="grid min-w-0 shrink-0 gap-6 p-px lg:grid-cols-[minmax(0,1fr)_280px]">
          <form
            id={formId}
            noValidate
            className="min-w-0"
            onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
          >
            <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5">
              <FieldGroup className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <form.AppField
                  name="checkIn"
                  listeners={{
                    onChange: ({ value }) => {
                      stayDraft.changeCheckIn(value);
                    },
                  }}
                >
                  {(field) => <field.Text label="Check-in" type="date" required />}
                </form.AppField>
                <form.AppField name="checkOut">
                  {(field) => (
                    <field.Text
                      label="Check-out"
                      type="date"
                      required
                      min={stayDraft.minimumCheckOut}
                    />
                  )}
                </form.AppField>
              </FieldGroup>
              {roomTypes.error && (
                <div className="flex flex-col gap-2">
                  <FieldError>{roomTypes.error.message}</FieldError>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    onClick={() => void roomTypes.refetch()}
                  >
                    Reintentar
                  </Button>
                </div>
              )}
              <form.Field name="rooms" mode="array">
                {() => (
                  <section className="flex flex-col gap-5">
                    {activeDrafts.map((draft, i) => {
                      const roomIndex = values.rooms.findIndex((room) => room.id === draft.id);
                      return (
                        <form.Field key={draft.id} name={`rooms[${roomIndex}].room`}>
                          {() => (
                            <StayRoomFields
                              form={form}
                              roomIndex={roomIndex}
                              errors={errors}
                              reservationId={detail.id}
                              availableTypeIds={availableRoomTypeIds(
                                availability.types,
                                drafts.filter((other) => other.id !== draft.id),
                              )}
                              typesReady={
                                roomTypes.isSuccess && rooms.isSuccess && availability.ready
                              }
                              blockedRoomIds={overlappingRoomIds(
                                activeDrafts
                                  .filter((other) => other.id !== draft.id)
                                  .map((other) => other.room),
                              )}
                              row={{
                                index: i,
                                count: activeDrafts.length,
                                reveal: draft.id === revealingRoomId,
                                onRemove: () => removeRoom(draft.id),
                              }}
                            />
                          )}
                        </form.Field>
                      );
                    })}
                    {activeDrafts.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-fit"
                        disabled={drafts.length >= 60 || !canAddRoom}
                        onClick={addRoom}
                      >
                        <PlusIcon data-icon="inline-start" />
                        Agregar habitación
                      </Button>
                    )}
                    {errors.rooms && <FieldError>{errors.rooms}</FieldError>}
                  </section>
                )}
              </form.Field>
            </fieldset>
          </form>
          <aside className="min-w-0 md:self-start">
            <BookingSummary
              cancelled={!holdsInventory(detail.status)}
              rooms={summary.rooms.map((room) => ({
                key: room.key,
                typeName:
                  roomTypes.data?.find((type) => type.id === room.roomTypeId)?.name ??
                  room.roomTypeName ??
                  "Habitación",
                adults: room.adults,
                children: room.children,
                nights: room.nights,
                charges: room.charges,
              }))}
              summary={billing ?? null}
              currency={detail.currency}
              stayLabel={stayRange(common.checkIn, common.checkOut)}
              ratePlan={ratePlanLabels[detail.ratePlan.plan]}
              showNightlyPrices={isMobile}
              message={summary.calculating ? "Calculando…" : null}
              error={
                summary.error && (
                  <div className="flex flex-col items-start gap-2">
                    <FieldError>{summary.error.message}</FieldError>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void summary.retry()}
                    >
                      Reintentar
                    </Button>
                  </div>
                )
              }
            />
          </aside>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" form={formId} disabled={stayDraft.submission.disabled || busy}>
          {submitting && <Spinner data-icon="inline-start" />}
          {submitting ? "Guardando…" : "Guardar cambios"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function useRoomAssignmentOptions(
  room: { checkIn: string; checkOut: string },
  reservationId: string,
) {
  const nights =
    (Date.parse(`${room.checkOut}T00:00:00Z`) - Date.parse(`${room.checkIn}T00:00:00Z`)) / 86400000;
  const enabled = nights >= 1 && nights <= 60;
  const availability = useAvailability(room.checkIn, room.checkOut, enabled, {
    excludeReservationId: reservationId,
  });
  const types = availability.data?.roomTypes ?? [];
  return {
    types,
    assignable: new Set(types.flatMap((type) => type.freeRoomIds)),
    ready: enabled && availability.isSuccess,
    error: availability.error?.message,
  };
}

const StayRoomFields = withReservationForm({
  defaultValues: emptyDetails,
  props: {
    roomIndex: 0,
    reservationId: "",
    availableTypeIds: new Set<string>(),
    typesReady: false,
    blockedRoomIds: new Set<string>(),
    errors: {} as Record<string, string>,
    row: { index: 0, count: 1, reveal: false, onRemove: () => {} } as {
      index: number;
      count: number;
      reveal: boolean;
      onRemove: () => void;
    },
  },
  render: function StayRoomFields({
    form,
    roomIndex,
    reservationId,
    availableTypeIds,
    typesReady,
    blockedRoomIds,
    errors,
    row,
  }) {
    const types = useRoomTypes(),
      rooms = useRooms();
    const room = useSelector(form.store, (state) => state.values.rooms[roomIndex].room);
    const stay = useSelector(form.store, (state) => ({
      checkIn: state.values.checkIn,
      checkOut: state.values.checkOut,
    }));
    const availability = useRoomAssignmentOptions(stay, reservationId);
    const roomTypeId = useRef(room.roomTypeId);
    useEffect(() => {
      roomTypeId.current = room.roomTypeId;
    }, [room.roomTypeId]);
    const capacity = errors[`rooms[${roomIndex}].room`];
    const capacityId = useId();
    const assignmentError = errors[`rooms[${roomIndex}].room.roomId`];
    const assignmentErrorId = useId();
    const typeError = errors[`rooms[${roomIndex}].room.roomTypeId`];
    const typeErrorId = useId();
    const typeField = (
      <form.AppField
        name={`rooms[${roomIndex}].room.roomTypeId`}
        listeners={{
          onChange: ({ value }) => {
            if (value === roomTypeId.current) return;
            form.setFieldValue(`rooms[${roomIndex}].room.roomId`, null);
          },
        }}
      >
        {(field) => (
          <field.Choice
            label="Tipo"
            disabled={!typesReady}
            groupErrorId={typeError ? typeErrorId : undefined}
            options={(types.data ?? [])
              .filter((type) => type.id === room.roomTypeId || availableTypeIds.has(type.id))
              .map((type) => ({ value: type.id, label: type.name }))}
          />
        )}
      </form.AppField>
    );
    const roomField = (
      <form.AppField name={`rooms[${roomIndex}].room.roomId`}>
        {(field) => (
          <field.Choice
            label="Hab."
            nullable
            disabled={!availability.ready}
            groupErrorId={assignmentError ? assignmentErrorId : undefined}
            options={[
              { value: "none", label: "Sin asignar" },
              ...(rooms.data ?? [])
                .filter(
                  (r) =>
                    r.id === room.roomId ||
                    (r.roomTypeId === room.roomTypeId &&
                      !blockedRoomIds.has(r.id) &&
                      availability.assignable.has(r.id)),
                )
                .map((r) => ({
                  value: r.id,
                  label: r.number,
                  disabled:
                    blockedRoomIds.has(r.id) ||
                    (availability.ready && !availability.assignable.has(r.id)) ||
                    r.roomTypeId !== room.roomTypeId,
                })),
            ]}
          />
        )}
      </form.AppField>
    );
    const adultsField = (
      <form.AppField name={`rooms[${roomIndex}].room.adults`}>
        {(field) => (
          <field.Text
            label="Adultos"
            type="number"
            required
            min={1}
            max={100}
            live
            groupErrorId={capacity ? capacityId : undefined}
          />
        )}
      </form.AppField>
    );
    const childrenField = (
      <form.AppField name={`rooms[${roomIndex}].room.children`}>
        {(field) => (
          <field.Text
            label="Niños"
            type="number"
            required
            min={0}
            max={100}
            live
            groupErrorId={capacity ? capacityId : undefined}
          />
        )}
      </form.AppField>
    );
    const feedback = (capacity || typeError || assignmentError || availability.error) && (
      <>
        {capacity && (
          <FieldError id={capacityId} className="col-span-full">
            {capacity}
          </FieldError>
        )}
        {typeError && (
          <FieldError id={typeErrorId} className="col-span-full">
            {typeError}
          </FieldError>
        )}
        {assignmentError && (
          <FieldError id={assignmentErrorId} className="col-span-full">
            {assignmentError}
          </FieldError>
        )}
        {availability.error && (
          <FieldError className="col-span-full">{availability.error}</FieldError>
        )}
      </>
    );
    return (
      <ReservationRoomRow
        {...row}
        typeField={typeField}
        roomField={roomField}
        adultsField={adultsField}
        childrenField={childrenField}
        feedback={feedback}
      />
    );
  },
});
