import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "@tanstack/react-form";
import { XIcon } from "lucide-react";
import { cn } from "cn";
import { DiscardChanges } from "@/components/discard-changes";
import { RoomsEditor } from "@/components/rooms-editor";
import { StayEditor } from "@/components/stay-editor";
import { GuestEntryForm, PaymentForm } from "@/components/reservation-entry-forms";
import { CouponIssued, RefundForm, ResolveRefundForm } from "@/components/refund-forms";
import { CancellationForm } from "@/components/cancellation-form";
import { WaiverForm } from "@/components/waiver-form";
import { RestoreReservationForm } from "@/components/restore-reservation-form";
import { WorkflowBill } from "@/components/workflow-bill";
import { ChoiceField } from "@/components/workflow-fields";
import { useDirtyRoomCheckIn } from "@/components/dirty-room-check-in";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  wideDialogContent,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { FieldGroup, FieldDescription, FieldError } from "@/components/ui/field";
import type {
  ReservationChannel,
  ReservationCoupon,
  ReservationDetail,
  StaffReservationChannel,
  WorkflowAction,
} from "@/lib/api";
import {
  useReservationCommands,
  useReservationPreview,
  type ReservationCommandResult,
} from "@/lib/reservation-commands";
import { guestValues } from "@/lib/reservation-editor";
import { useReservationForm, blurThenChange, submitForm } from "@/lib/reservation-form";
import {
  contactSchema,
  contactDefaults,
  contactPayload,
  channelCorrectionSchema,
  notesSchema,
  paymentVoidSchema,
  cancellationSchema,
} from "@/lib/reservation-form-schemas";
import { setServerErrors } from "@/lib/form-errors";
import {
  reservationChannelLabels,
  reservationStatusLabel,
  staffReservationChannels,
} from "@/lib/reservation-list";
import { translateError } from "@/lib/errors";
import { stayRange } from "@/lib/dates";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";

export type ReservationEditorTarget =
  | { kind: "stay" }
  | { kind: "rooms"; trigger: HTMLButtonElement }
  | { kind: "contact" }
  | { kind: "guest"; id?: string }
  | { kind: "payment" }
  | { kind: "refund" }
  | { kind: "waiver" }
  | { kind: "resolve-refund"; id: string; failing: boolean }
  | { kind: "void-payment" | "delete-guest"; id: string }
  | { kind: "correct-status" }
  | { kind: "status"; status: Extract<WorkflowAction, { type: "set-status" }>["status"] };

function editorTitle(target: ReservationEditorTarget, detail: ReservationDetail) {
  switch (target.kind) {
    case "waiver":
      return "Perdonar cargo";
    case "stay":
      return "Editar estadía";
    case "rooms":
      return "Editar habitaciones";
    case "contact":
      return detail.channel === "online" ? "Contacto y notas" : "Contacto, canal y notas";
    case "guest":
      return target.id ? "Editar huésped" : "Agregar huésped";
    case "payment":
      return "Registrar pago";
    case "refund":
      return "Devolver";
    case "resolve-refund":
      return target.failing ? "Marcar como fallido" : "Confirmar reembolso";
    case "void-payment":
      return "Anular pago";
    case "delete-guest":
      return "Eliminar huésped";
    case "status":
      return target.status === "cancelled"
        ? "Cancelar reserva"
        : target.status === "no_show"
          ? "¿El huésped no se presentó?"
          : detail.status === "cancelled" || detail.status === "no_show"
            ? "¿Restaurar reserva?"
            : `Confirmar ${reservationStatusLabel(target.status)}`;
    case "correct-status":
      return "Corregir estado";
  }
}

const contactAndNotesSchema = contactSchema.extend({
  ...notesSchema.shape,
  ...channelCorrectionSchema.shape,
});

const editableChannel = (channel: ReservationChannel): StaffReservationChannel | "" =>
  channel === "online" || channel === "unspecified" ? "" : channel;

export function ReservationPageEditor({
  target,
  detail,
  onClose,
  onDirtyChange,
  onSaved,
}: {
  target: ReservationEditorTarget;
  detail: ReservationDetail;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: (saved: ReservationDetail) => void;
}) {
  const dirty = useRef(false);
  const [popup, setPopup] = useState<HTMLDivElement | null>(null);
  const [leaving, setLeaving] = useState(false);
  const { send, saving } = useReservationCommands(detail.id);
  const [issued, setIssued] = useState<ReservationCoupon | null>(null);
  const editRooms = target.kind === "rooms";
  const fullScreen = ["stay", "contact", "guest", "payment"].includes(target.kind);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [asDrawer] = useState(() => isMobile || isTablet);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!asDrawer) return;
    const frame = requestAnimationFrame(() => setDrawerOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [asDrawer]);
  const finish = asDrawer ? () => setDrawerOpen(false) : onClose;
  const refund =
    target.kind === "resolve-refund"
      ? detail.refunds.find((entry) => entry.id === target.id && entry.status === "requested")
      : undefined;
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !popup) return;
    const resize = () => {
      popup.style.setProperty("--reservation-viewport-height", `${viewport.height}px`);
      popup.style.setProperty("--reservation-viewport-top", `${viewport.offsetTop}px`);
      popup.style.setProperty(
        "--reservation-keyboard-inset",
        `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
      );
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, [popup]);
  const handleDirty = useCallback(
    (value: boolean) => {
      dirty.current = value;
      onDirtyChange(value);
    },
    [onDirtyChange],
  );
  function close() {
    if (saving) return;
    if (dirty.current) setLeaving(true);
    else finish();
  }
  const title = issued ? "Cupón emitido" : editorTitle(target, detail);
  const finalFocus =
    target.kind === "rooms"
      ? () => (target.trigger.isConnected ? target.trigger : true)
      : undefined;
  const descriptionText = editRooms
    ? stayRange(detail.checkIn, detail.checkOut)
    : target.kind === "status" &&
        target.status === "confirmed" &&
        (detail.status === "cancelled" || detail.status === "no_show")
      ? "Volverá a Confirmada."
      : target.kind === "resolve-refund" && target.failing
        ? "El reembolso queda registrado como fallido y el dinero sigue por devolver."
        : null;
  const body =
    target.kind === "stay" ? (
      <StayEditor detail={detail} onCancel={close} onDirtyChange={handleDirty} onSaved={finish} />
    ) : editRooms ? (
      <RoomsEditor detail={detail} onCancel={close} onDirtyChange={handleDirty} onSaved={finish} />
    ) : target.kind === "guest" ? (
      <GuestEntryForm
        scrollable
        detail={detail}
        guest={detail.stayingGuests.find((guest) => guest.id === target.id)}
        disabled={saving}
        onDirtyChange={handleDirty}
        onSave={(guests) => send([{ type: "set-guests", guests: guestValues(guests) }])}
        onDone={finish}
        onCancel={close}
      />
    ) : target.kind === "payment" ? (
      <PaymentForm
        scrollable
        detail={detail}
        disabled={saving}
        onDirtyChange={handleDirty}
        onCancel={close}
        onSaved={onSaved ?? finish}
        onReady={async (title, actions) => {
          const result = await send(actions);
          if (result.status === "saved") toast.success(title);
          return result;
        }}
      />
    ) : target.kind === "refund" ? (
      issued ? (
        <CouponIssued
          coupon={issued}
          reservationId={detail.id}
          currency={detail.currency}
          onDone={finish}
        />
      ) : (
        <RefundForm
          detail={detail}
          disabled={saving}
          onDirtyChange={handleDirty}
          onSave={send}
          onDone={finish}
          onCancel={close}
          onCouponIssued={(coupon) => {
            handleDirty(false);
            setIssued(coupon);
          }}
        />
      )
    ) : target.kind === "resolve-refund" ? (
      refund ? (
        <ResolveRefundForm
          detail={detail}
          refund={refund}
          failing={target.failing}
          disabled={saving}
          onDirtyChange={handleDirty}
          onSave={send}
          onDone={finish}
          onCancel={close}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <FieldError>Este reembolso ya fue completado o marcado como fallido.</FieldError>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={close}>
              Cerrar
            </Button>
          </div>
        </div>
      )
    ) : target.kind === "status" &&
      target.status === "confirmed" &&
      (detail.status === "cancelled" || detail.status === "no_show") ? (
      <RestoreReservationForm
        detail={detail}
        disabled={saving}
        onSave={send}
        onDone={finish}
        onCancel={close}
      />
    ) : target.kind === "waiver" ? (
      <WaiverForm
        detail={detail}
        disabled={saving}
        onDirtyChange={handleDirty}
        onSave={send}
        onDone={finish}
        onCancel={close}
      />
    ) : target.kind === "status" &&
      (target.status === "cancelled" || target.status === "no_show") ? (
      <CancellationForm
        detail={detail}
        outcome={target.status}
        disabled={saving}
        onDirtyChange={handleDirty}
        onSave={send}
        onDone={finish}
        onCancel={close}
      />
    ) : (
      <ReservationActionForm
        target={target}
        detail={detail}
        disabled={saving}
        onDirtyChange={handleDirty}
        onSave={send}
        onSaved={onSaved ?? finish}
        onCancel={close}
      />
    );
  return (
    <>
      {asDrawer ? (
        <Drawer
          showSwipeHandle
          open={drawerOpen}
          onOpenChange={(open, details) => {
            if (!open) {
              if (saving || dirty.current) details.cancel();
              close();
            }
          }}
          onOpenChangeComplete={(open) => {
            if (!open) onClose();
          }}
        >
          <DrawerContent
            ref={setPopup}
            finalFocus={finalFocus}
            className={cn(
              "overflow-hidden pb-[env(safe-area-inset-bottom)] data-[swipe-axis=y]:[--drawer-content-max-height:min(90dvh,calc(var(--reservation-viewport-height,100dvh)-1rem))] data-[swipe-direction=down]:bottom-(--reservation-keyboard-inset,0px)",
              editRooms && "data-[swipe-axis=y]:h-(--drawer-content-max-height)",
            )}
          >
            <DrawerHeader
              className={cn(
                "shrink-0 border-b pb-4 group-data-[swipe-axis=y]/drawer-popup:text-left",
                editRooms && "py-3",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <DrawerTitle>{title}</DrawerTitle>
                  {!issued && descriptionText && (
                    <DrawerDescription>{descriptionText}</DrawerDescription>
                  )}
                </div>
                <DrawerClose
                  render={<Button variant="ghost" size="icon-sm" disabled={saving} />}
                  aria-label="Cerrar"
                >
                  <XIcon />
                </DrawerClose>
              </div>
            </DrawerHeader>
            {editRooms ? (
              body
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4">
                {body}
              </div>
            )}
          </DrawerContent>
        </Drawer>
      ) : editRooms ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <SheetContent
            finalFocus={finalFocus}
            showCloseButton={false}
            className="overflow-hidden data-[side=right]:sm:max-w-md"
          >
            <SheetHeader className="shrink-0 flex-row items-start justify-between gap-2 border-b px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <SheetTitle>{title}</SheetTitle>
                <SheetDescription>{descriptionText}</SheetDescription>
              </div>
              <SheetClose
                render={<Button variant="ghost" size="icon-sm" disabled={saving} />}
                aria-label="Cerrar"
              >
                <XIcon />
              </SheetClose>
            </SheetHeader>
            {body}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogContent
            ref={setPopup}
            closeDisabled={saving}
            className={cn(
              "flex max-h-[90svh] flex-col overflow-hidden sm:max-w-lg max-sm:top-[calc(var(--reservation-viewport-top,0px)+var(--reservation-viewport-height,100dvh)/2)] max-sm:max-h-[calc(var(--reservation-viewport-height,100dvh)-2rem)]",
              fullScreen &&
                "max-sm:top-(--reservation-viewport-top,0px) max-sm:left-0 max-sm:h-(--reservation-viewport-height,100dvh) max-sm:max-h-(--reservation-viewport-height,100dvh) max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:pt-[max(1rem,env(safe-area-inset-top))] max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:safe-area-padding-x max-sm:transition-none",
              target.kind === "stay" && wideDialogContent,
            )}
          >
            <DialogHeader className="shrink-0">
              <DialogTitle>{title}</DialogTitle>
              {!issued && descriptionText && (
                <DialogDescription>{descriptionText}</DialogDescription>
              )}
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      )}
      {leaving && (
        <DiscardChanges
          saving={saving}
          onStay={() => setLeaving(false)}
          onLeave={() => {
            if (saving) return;
            setLeaving(false);
            finish();
          }}
        />
      )}
    </>
  );
}

function ReservationActionForm({
  target,
  detail,
  disabled,
  onSave,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  target: Exclude<
    ReservationEditorTarget,
    { kind: "guest" | "stay" | "rooms" | "payment" | "refund" | "resolve-refund" | "waiver" }
  >;
  detail: ReservationDetail;
  disabled: boolean;
  onSave: (actions: WorkflowAction[]) => Promise<ReservationCommandResult>;
  onSaved: (saved: ReservationDetail) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState<
    Extract<WorkflowAction, { type: "set-status" }>["status"] | ""
  >(target.kind === "status" ? target.status : "");
  const [confirmCheckIn, checkInDialog] = useDirtyRoomCheckIn();
  const [defaults] = useState(() => ({
    ...contactDefaults(detail),
    notes: detail.notes ?? "",
    channel: editableChannel(detail.channel),
    reason: "",
    voidReason: "",
  }));
  const schema =
    target.kind === "contact"
      ? contactAndNotesSchema
      : target.kind === "void-payment"
        ? paymentVoidSchema
        : cancellationSchema;
  const rejectedContact = useRef<{ key: string; fields: Record<string, string> } | null>(null);
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => {
        const result = schema.safeParse(value);
        const fields = result.success
          ? {}
          : Object.fromEntries(
              result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
            );
        if (target.kind === "contact" && rejectedContact.current?.key === JSON.stringify(value))
          Object.assign(fields, rejectedContact.current.fields);
        return Object.keys(fields).length ? { fields } : undefined;
      },
    },
    onSubmit: async ({ value }) => {
      if (disabled || (needsPreview && !previewReady)) return;
      if (statusEditor && (!selectedStatus || !(await confirmCheckIn(detail, selectedStatus))))
        return;
      let actions: WorkflowAction[];
      switch (target.kind) {
        case "contact": {
          actions = [];
          if (
            (["fullName", "phone", "email", "nationality"] as const).some(
              (name) => JSON.stringify(value[name]) !== JSON.stringify(defaults[name]),
            )
          )
            actions.push({ type: "contact", contact: contactPayload(value) });
          if (value.channel && value.channel !== defaults.channel)
            actions.push({ type: "set-channel", channel: value.channel });
          if (value.notes !== defaults.notes) actions.push({ type: "notes", notes: value.notes });
          break;
        }
        case "void-payment":
          actions = [
            { type: "void-payment", paymentId: target.id, reason: value.voidReason.trim() },
          ];
          break;
        case "delete-guest":
          actions = [
            {
              type: "set-guests",
              guests: guestValues(detail.stayingGuests.filter((guest) => guest.id !== target.id)),
            },
          ];
          break;
        case "correct-status":
        case "status":
          if (!selectedStatus) return;
          actions = [
            {
              type: "set-status",
              status: selectedStatus,
            },
          ];
          break;
        default:
          return;
      }
      if (!actions.length) {
        onSaved(detail);
        return;
      }
      const result = await onSave(actions);
      if (result.status === "saved") {
        toast.success("Cambios guardados");
        onSaved(result.reservation);
      } else if (result.status === "failed") toastError("No se pudo guardar", result.message);
      else if (target.kind === "contact") {
        const { fields } = result;
        rejectedContact.current = { key: JSON.stringify(value), fields };
        form.setErrorMap({ onDynamic: { fields } });
      } else setServerErrors(form, result.fields);
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const changed = !useSelector(form.store, (state) => state.isDefaultValue);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const saving = disabled || submitting;
  const statusEditor = target.kind === "status" || target.kind === "correct-status";
  const statusChanged = selectedStatus !== (target.kind === "status" ? target.status : "");
  useEffect(() => onDirtyChange(changed || statusChanged), [changed, statusChanged, onDirtyChange]);
  const needsPreview = target.kind === "status";
  const status = target.kind === "status" ? selectedStatus : null;
  const previewActions = useMemo<WorkflowAction[]>(
    () => (status ? [{ type: "set-status", status }] : []),
    [status],
  );
  const valid = schema.safeParse(values).success;
  const preview = useReservationPreview(detail.id, previewActions, needsPreview && valid);
  const previewReady =
    valid &&
    preview.isSuccess &&
    !preview.isFetching &&
    preview.data.validation.issues.length === 0;
  const destructive = target.kind === "void-payment" || target.kind === "delete-guest";
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden"
      onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
    >
      {checkInDialog}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-px">
        <fieldset disabled={saving}>
          <FieldGroup>
            {target.kind === "contact" && (
              <>
                <form.AppField name="fullName">
                  {(field) => <field.Text label="Nombre completo" required max={200} />}
                </form.AppField>
                <form.AppField name="email">
                  {(field) => <field.Text label="Correo electrónico" type="email" max={320} />}
                </form.AppField>
                <form.AppField name="phone">{(field) => <field.Phone />}</form.AppField>
                <form.AppField name="nationality">{(field) => <field.Nationality />}</form.AppField>
                {detail.channel !== "online" && (
                  <form.AppField name="channel">
                    {(field) => (
                      <field.Choice
                        label="Canal"
                        placeholder={reservationChannelLabels.unspecified}
                        options={staffReservationChannels.map((channel) => ({
                          value: channel,
                          label: reservationChannelLabels[channel],
                        }))}
                      />
                    )}
                  </form.AppField>
                )}
                <form.AppField name="notes">
                  {(field) => (
                    <field.Text label="Notas para esta reserva" type="textarea" max={2000} />
                  )}
                </form.AppField>
              </>
            )}
            {target.kind === "void-payment" && (
              <form.AppField name="voidReason">
                {(field) => <field.Text label="Motivo" type="textarea" required max={2000} />}
              </form.AppField>
            )}
            {target.kind === "delete-guest" && (
              <FieldDescription>
                Se eliminará a{" "}
                {detail.stayingGuests.find((guest) => guest.id === target.id)?.fullName} de la lista
                de huéspedes. La ocupación declarada de la habitación no cambia.
              </FieldDescription>
            )}
            {statusEditor && (
              <>
                {(target.kind === "correct-status" ||
                  detail.status === "cancelled" ||
                  detail.status === "no_show") && (
                  <ChoiceField
                    label="Estado"
                    value={selectedStatus}
                    disabled={saving}
                    options={(["confirmed", "checked_in", "checked_out"] as const)
                      .filter((status) => status !== detail.status)
                      .map((value) => ({ value, label: reservationStatusLabel(value) }))}
                    onChange={(value) => {
                      if (
                        value === "confirmed" ||
                        value === "checked_in" ||
                        value === "checked_out"
                      )
                        setSelectedStatus(value);
                    }}
                  />
                )}
                <FieldDescription>
                  Cambiar el estado no modifica las fechas de la estadía. El saldo y las
                  habitaciones sin asignar no impiden el check-in ni el check-out.
                </FieldDescription>
                {(detail.status === "cancelled" || detail.status === "no_show") && (
                  <FieldDescription>
                    Se revisa la disponibilidad, las asignaciones y la capacidad antes de restaurar
                    como {reservationStatusLabel(selectedStatus || "confirmed")}.
                  </FieldDescription>
                )}
              </>
            )}
          </FieldGroup>
        </fieldset>
        {needsPreview && (
          <section aria-label="Cuenta resultante" className="flex flex-col gap-3">
            {preview.isFetching || (!preview.data && !preview.error) ? (
              <p role="status" className="text-sm text-muted-foreground">
                Calculando…
              </p>
            ) : preview.error ? (
              <>
                <FieldError>{preview.error.message}</FieldError>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || !valid}
                  onClick={() => void preview.refetch()}
                >
                  Reintentar
                </Button>
              </>
            ) : (
              preview.data && (
                <>
                  <WorkflowBill bill={preview.data.billing} />
                  {preview.data.validation.issues.map((issue, index) => (
                    <FieldError key={index}>
                      Habitación {issue.roomIndex + 1}: {translateError(issue.code)}
                    </FieldError>
                  ))}
                </>
              )
            )}
          </section>
        )}
      </div>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          {target.kind === "contact" ? "Cancelar" : "Cerrar"}
        </Button>
        <Button
          type="submit"
          variant={destructive ? "destructive" : "default"}
          disabled={saving || (statusEditor && !selectedStatus) || (needsPreview && !previewReady)}
        >
          {saving
            ? "Guardando…"
            : target.kind === "void-payment"
              ? "Anular pago"
              : destructive
                ? "Confirmar"
                : "Guardar cambios"}
        </Button>
      </DialogFooter>
    </form>
  );
}
