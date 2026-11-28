import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { SummaryRow, accountStatus, accountStatusTextTone } from "@/components/balance-status";
import { CommandRecovery } from "@/components/command-recovery";
import {
  StayRoomFields,
  useRoomAssignmentOptions,
  type StayEditorProps,
} from "@/components/stay-editor";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { FieldError, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { ReservationDetail, WorkflowBilling } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { unsavedMessage, useReservationCommands } from "@/lib/reservation-commands";
import { availableRoomTypeIds, overlappingRoomIds, type RoomDraft } from "@/lib/reservation-editor";
import { submitForm } from "@/lib/reservation-form";
import { occupantsLabel } from "@/lib/reservation-list";
import { useRooms } from "@/lib/queries";
import { emptyRoomDraft, useStayDraft } from "@/lib/use-stay-draft";
import { toastError } from "@/lib/toast";

const retryKey = "edit-rooms";

export function RoomsEditor({ detail, onDirtyChange, onCancel, onSaved }: StayEditorProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const newRoomHeading = useRef<HTMLHeadingElement>(null);
  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const { send, saving, canReplay } = useReservationCommands(detail.id);
  const needsRecovery = canReplay([], retryKey);
  const {
    form,
    drafts,
    reservationChanged,
    dirty,
    submitting,
    errors,
    roomTypes,
    summary,
    submission,
  } = useStayDraft({
    detail,
    roomsOnly: true,
    previewEnabled: reviewing && !needsRecovery,
    onSubmit: saveRooms,
  });
  const busy = submitting || saving;
  const rooms = useRooms();
  const availability = useRoomAssignmentOptions(detail, detail.id);
  const activeDrafts = drafts.filter((draft) => !draft.removed);
  const roomRows = drafts.map((draft, index) => {
    const saved = detail.rooms.find((room) => room.id === draft.id);
    const otherRooms = activeDrafts.filter((other) => other.id !== draft.id);
    const typeIds = availableRoomTypeIds(availability.types, otherRooms);
    return {
      draft,
      index,
      saved,
      typeIds,
      typeUnavailable:
        !!draft.room.roomTypeId &&
        draft.room.roomTypeId !== saved?.roomTypeId &&
        !typeIds.has(draft.room.roomTypeId),
      blockedRoomIds: overlappingRoomIds(otherRooms.map((other) => other.room)),
    };
  });
  const removedRooms = roomRows.flatMap(({ draft, saved }) =>
    draft.removed && saved ? [saved] : [],
  );
  const availableTypes = availableRoomTypeIds(availability.types, activeDrafts);
  const catalogReady = roomTypes.isSuccess && rooms.isSuccess && availability.ready;
  const catalogError = roomTypes.error?.message ?? rooms.error?.message ?? availability.error;
  const hasRoomToAdd = roomTypes.data?.some((type) => availableTypes.has(type.id));
  const typesAvailable = roomRows.every(
    ({ draft, typeUnavailable }) => draft.removed || (!!draft.room.roomTypeId && !typeUnavailable),
  );
  const atLimit = activeDrafts.length >= 60;
  const actionCount = submission.command.actions.length;
  const tooManyChanges = actionCount > 60;
  const canAdd = catalogReady && !reservationChanged && hasRoomToAdd && !atLimit && typesAvailable;
  const canProceed =
    catalogReady &&
    !reservationChanged &&
    submission.valid &&
    actionCount > 0 &&
    !tooManyChanges &&
    typesAvailable &&
    !needsRecovery;
  const bill = summary.billing;
  const quoted = bill && matchesRoomQuote(bill, detail, activeDrafts);
  const opensQuote = summary.billingChanged && !reviewing;
  const canSave =
    canProceed && (!summary.billingChanged || (reviewing && submission.allowed && !!quoted));
  const issues = Object.values(errors).map((message) => ({ message }));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => heading.current?.focus(), [reviewing]);
  useEffect(() => {
    if (focusRoomId) newRoomHeading.current?.focus();
  }, [focusRoomId]);

  async function retryAvailability() {
    await Promise.all([roomTypes.refetch(), rooms.refetch(), availability.retry()]);
  }

  function addRoom() {
    if (!canAdd || busy || needsRecovery) return;
    const draft = emptyRoomDraft();
    form.pushFieldValue("rooms", draft);
    setFocusRoomId(draft.id);
  }

  function removeRoom(index: number, saved: boolean) {
    if (activeDrafts.length <= 1) return;
    if (saved) form.setFieldValue(`rooms[${index}].removed`, true);
    else {
      void form.removeFieldValue("rooms", index);
      heading.current?.focus();
    }
  }

  async function saveRooms() {
    if (saving || !canSave) return;
    const actions = submission.command.actions;
    const result = await send(
      summary.billingChanged
        ? actions
        : actions.map((action) =>
            action.type === "edit-room"
              ? { ...action, expectedRoomTypeId: action.room.roomTypeId }
              : action,
          ),
      retryKey,
    );
    if (result.status === "saved") {
      toast.success("Cambios de habitaciones guardados");
      onSaved();
    } else {
      toastError("No se pudieron guardar las habitaciones", unsavedMessage(result));
      if (!canReplay([], retryKey)) {
        void retryAvailability();
        if (reviewing) void summary.retry();
      }
    }
  }

  return (
    <form
      noValidate
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={(event) =>
        void submitForm(event, async () => {
          if (busy || !canProceed) return;
          if (opensQuote) setReviewing(true);
          else if (canSave) await form.handleSubmit();
        })
      }
    >
      <header className="flex shrink-0 items-baseline justify-between gap-3 px-4 pt-4 pb-2">
        <h3 ref={heading} tabIndex={-1} className="text-sm font-medium outline-none">
          {reviewing
            ? "Cotización"
            : `${activeDrafts.length} ${activeDrafts.length === 1 ? "habitación" : "habitaciones"}`}
        </h3>
        {summary.billingChanged && (
          <p className="shrink-0 text-muted-foreground">Paso {reviewing ? 2 : 1} de 2</p>
        )}
      </header>
      <div
        key={reviewing ? "quote" : "rooms"}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pt-1 pb-4"
      >
        <CommandRecovery
          reservationId={detail.id}
          retryKey={retryKey}
          disabled={busy}
          onDone={onSaved}
          successDescription="Revisa las habitaciones en Estadía."
        />
        {reservationChanged && (
          <FieldError>
            La estadía cambió. Cierra este panel y vuelve a abrirlo para continuar.
          </FieldError>
        )}
        {catalogError && (
          <div className="flex flex-col items-start gap-2">
            <FieldError>{catalogError}</FieldError>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void retryAvailability()}
            >
              Reintentar
            </Button>
          </div>
        )}
        {reviewing ? (
          <section aria-label="Cotización" aria-live="polite" className="flex flex-col gap-3">
            {bill && quoted ? (
              <RoomsQuote bill={bill} removedRooms={removedRooms} currency={detail.currency} />
            ) : bill ? (
              <FieldError>
                La reserva cambió. Vuelve a cargar la página para cotizar de nuevo.
              </FieldError>
            ) : summary.error ? (
              <div className="flex flex-col items-start gap-2">
                <FieldError>{summary.error.message}</FieldError>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || needsRecovery}
                  onClick={() => void summary.retry()}
                >
                  Reintentar cotización
                </Button>
              </div>
            ) : summary.calculating && !needsRecovery && !reservationChanged ? (
              <p role="status" className="text-muted-foreground">
                Calculando cotización…
              </p>
            ) : (
              <FieldError errors={issues} />
            )}
            {catalogReady && !typesAvailable && (
              <FieldError>
                La disponibilidad cambió. Vuelve al paso anterior para revisar las habitaciones.
              </FieldError>
            )}
          </section>
        ) : !roomTypes.data || !rooms.data ? (
          !catalogError && (
            <p role="status" className="text-muted-foreground">
              Cargando habitaciones…
            </p>
          )
        ) : (
          <FieldSet disabled={busy || needsRecovery || reservationChanged} className="min-w-0">
            {!catalogReady && !catalogError && (
              <p role="status" className="text-muted-foreground">
                Consultando disponibilidad…
              </p>
            )}
            {roomRows.map(({ draft, index, saved, typeIds, typeUnavailable, blockedRoomIds }) => (
              <section key={draft.id} className="flex min-w-0 flex-col gap-2 border-b pb-4">
                <div className="flex min-h-(--control-h-sm) items-center justify-between gap-2">
                  <h4
                    ref={draft.id === focusRoomId ? newRoomHeading : undefined}
                    tabIndex={-1}
                    className="font-medium outline-none"
                  >
                    Habitación {index + 1}
                    {!saved && <span className="ml-2 text-muted-foreground">Nueva</span>}
                  </h4>
                  {draft.removed ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={atLimit}
                      onClick={() => form.setFieldValue(`rooms[${index}].removed`, false)}
                    >
                      Deshacer
                    </Button>
                  ) : activeDrafts.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Quitar habitación ${index + 1}`}
                      onClick={() => removeRoom(index, !!saved)}
                    >
                      Quitar
                    </Button>
                  ) : null}
                </div>
                {draft.removed && saved ? (
                  <p className="text-muted-foreground">{roomLabel(saved)} · Se quitará</p>
                ) : (
                  <StayRoomFields
                    form={form}
                    roomIndex={index}
                    errors={errors}
                    reservationId={detail.id}
                    availableTypeIds={typeIds}
                    typesReady={catalogReady}
                    blockedRoomIds={blockedRoomIds}
                    row={null}
                  />
                )}
                {!draft.removed && catalogReady && typeUnavailable && (
                  <FieldError>No hay disponibilidad para este tipo de habitación.</FieldError>
                )}
              </section>
            ))}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={!canAdd}
              onClick={addRoom}
            >
              <PlusIcon data-icon="inline-start" />
              Agregar habitación
            </Button>
            {atLimit ? (
              <p className="text-muted-foreground">La reserva admite hasta 60 habitaciones.</p>
            ) : catalogReady && !hasRoomToAdd ? (
              <p className="text-muted-foreground">No hay más habitaciones para toda la estadía.</p>
            ) : null}
            {tooManyChanges && <FieldError>Puedes confirmar hasta 60 cambios a la vez.</FieldError>}
            <FieldError
              errors={Object.entries(errors)
                .filter(([path]) => !path.startsWith("rooms["))
                .map(([, message]) => ({ message }))}
            />
          </FieldSet>
        )}
      </div>
      <DialogFooter className="shrink-0 border-t px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={reviewing ? () => setReviewing(false) : onCancel}
        >
          {reviewing ? "Volver" : "Cancelar"}
        </Button>
        <Button type="submit" disabled={busy || !(opensQuote ? canProceed : canSave)}>
          {submitting && <Spinner data-icon="inline-start" />}
          {submitting
            ? "Guardando…"
            : reviewing
              ? "Confirmar cambios"
              : opensQuote
                ? "Ver cotización"
                : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function matchesRoomQuote(bill: WorkflowBilling, detail: ReservationDetail, drafts: RoomDraft[]) {
  if (
    bill.checkIn !== detail.checkIn ||
    bill.checkOut !== detail.checkOut ||
    bill.status !== detail.status ||
    bill.rooms.length !== drafts.length
  )
    return false;
  const savedIds = new Set(detail.rooms.map(({ id }) => id));
  return bill.rooms.every((room, index) => {
    const draft = drafts[index];
    return (
      (savedIds.has(draft.id) ? room.id === draft.id : !savedIds.has(room.id)) &&
      room.roomTypeId === draft.room.roomTypeId &&
      room.roomId === draft.room.roomId &&
      room.adults === draft.room.adults &&
      room.children === draft.room.children
    );
  });
}

type ReservedRoom = ReservationDetail["rooms"][number];

function roomLabel(room: ReservedRoom) {
  const name = room.roomTypeName ?? "Habitación";
  return room.roomNumber ? `${name} · Hab. ${room.roomNumber}` : name;
}

function RoomsQuote({
  bill,
  removedRooms,
  currency,
}: {
  bill: WorkflowBilling;
  removedRooms: ReservedRoom[];
  currency: string;
}) {
  const status = accountStatus(bill);
  const money = (cents: number) => formatMoney(cents, currency);
  return (
    <>
      <dl className="flex flex-col gap-2 border-b pb-3">
        <SummaryRow
          label="Nuevo total de la reserva"
          value={money(bill.totalCents)}
          className="items-baseline text-sm font-medium"
        />
        <SummaryRow
          label={
            <span
              className={cn(
                "inline-flex items-center gap-1.5 font-medium",
                accountStatusTextTone[status.state],
              )}
            >
              <status.Icon aria-hidden className="size-3.5 shrink-0" />
              {status.label}
            </span>
          }
          value={money(status.cents)}
          className="items-baseline [&>dd]:text-sm [&>dd]:font-semibold"
        />
      </dl>
      <div className="flex flex-col gap-1">
        <h4 className="font-medium">Cargos por habitación</h4>
        <ol aria-label="Cargos de las habitaciones" className="divide-y">
          {bill.rooms.map((room) => (
            <li key={room.id} className="flex min-w-0 items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="wrap-anywhere">{room.roomTypeName ?? "Habitación"}</p>
                <p className="wrap-anywhere text-muted-foreground">
                  {occupantsLabel([room])} ·{" "}
                  {room.roomNumber ? `Hab. ${room.roomNumber}` : "Sin asignar"}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{money(room.totalCents)}</span>
            </li>
          ))}
        </ol>
      </div>
      {removedRooms.length > 0 && (
        <div className="flex flex-col gap-1 border-t pt-3">
          <h4 className="font-medium">Habitaciones que se quitarán</h4>
          <ul className="wrap-anywhere text-muted-foreground">
            {removedRooms.map((room) => (
              <li key={room.id}>{roomLabel(room)}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
