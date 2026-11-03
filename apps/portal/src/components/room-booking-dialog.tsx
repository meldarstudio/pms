import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import { useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRightIcon, LogInIcon, LogOutIcon, PhoneIcon, PlusIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { guestValues, overlappingRoomIds, availableRoomTypeIds } from "@/lib/reservation-editor";
import { holdsInventory } from "@/lib/reservation-statuses";
import { useStayDraft } from "@/lib/use-stay-draft";
import { ReservationStatusBadge } from "@/components/reservation-status-badge";
import { useLifecycleAction } from "@/components/lifecycle-action";
import { ReservationRoomRow } from "@/components/reservation-room-rows";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { BookingSummary } from "@/components/booking-summary";
import { useIsMobile } from "@/hooks/use-mobile";
import { NewBooking } from "@/components/new-booking";
import { StayingGuestList } from "@/components/reservation-records";
import { Movements } from "@/components/reservation-account";
import { GuestEntryForm, PaymentForm, paymentMethods } from "@/components/reservation-entry-forms";
import { format } from "@/lib/dates";
import { isValid, parseISO } from "date-fns";
import {
  type StayingGuest,
  type ReservationPayment,
  type ReservationDetail,
  type WorkflowAction,
} from "@/lib/api";
import { useAvailability, useReservation, useRooms, useRoomTypes } from "@/lib/queries";
import {
  unsavedMessage,
  useReservationCommands,
  type ReservationCommandResult,
} from "@/lib/reservation-commands";
import { toast, toastError } from "@/lib/toast";
import { formatMoney } from "@/lib/money";
import { setServerErrors } from "@/lib/form-errors";
import {
  useReservationForm,
  withReservationForm,
  blurThenChange,
  submitForm,
} from "@/lib/reservation-form";
import {
  emptyDetails,
  paymentSchema,
  paymentDefaults,
  paymentPayload,
  cancellationSchema,
  type PaymentValues,
} from "@/lib/reservation-form-schemas";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { phoneDisplay } from "@/lib/phone";
import { ratePlanLabels } from "@/lib/rate-plans";

export type BookingTarget =
  | {
      mode: "create";
      roomId: string;
      roomTypeId: string;
      number: string;
      typeName: string;
      checkIn: string;
    }
  | { mode: "new" }
  | {
      mode: "edit";
      reservationId: string;
      roomId: string;
      number: string;
      typeName: string;
    };
const stayDate = (value: string, pattern: string) => {
  const date = parseISO(value);
  return isValid(date) ? format(date, pattern) : "—";
};
const stayRange = (checkIn: string, checkOut: string) => {
  const range = `${stayDate(checkIn, "d MMM")} – ${stayDate(checkOut, "d MMM yyyy")}`;
  const nights =
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000;
  return nights >= 1 ? `${range} · ${nights} ${nights === 1 ? "noche" : "noches"}` : range;
};
type Intent = { type: "edit-payment" | "delete-payment"; entry: ReservationPayment };

export function RoomBookingDialog({
  target: requested,
  onClose,
  onViewReservation,
}: {
  target: BookingTarget | null;
  onClose: () => void;
  onViewReservation: (id: string) => void;
}) {
  const client = useQueryClient();
  const [created, setCreated] = useState<{
    from: BookingTarget;
    reservation: ReservationDetail;
  } | null>(null);
  const target = useMemo<BookingTarget | null>(
    () =>
      created && created.from === requested
        ? {
            mode: "edit",
            reservationId: created.reservation.id,
            roomId: created.reservation.rooms[0]?.roomId ?? "",
            number: created.reservation.rooms[0]?.roomNumber ?? "",
            typeName: created.reservation.rooms[0]?.roomTypeName ?? "",
          }
        : requested,
    [created, requested],
  );
  const reservationId = target?.mode === "edit" ? target.reservationId : null;
  const detail = useReservation(reservationId);
  const { saving } = useReservationCommands(reservationId);
  const [creating, setCreating] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const open = target !== null;
  const createOpen = target !== null && target.mode !== "edit";
  const dirty = useRef(false);
  const [tab, setTab] = useState("details");
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const resize = () => {
      popup.current?.style.setProperty("--reservation-viewport-height", `${viewport.height}px`);
      popup.current?.style.setProperty("--reservation-viewport-top", `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, [open]);
  useEffect(() => {
    const protectUnload = (event: BeforeUnloadEvent) => {
      if (!target || (!creating && !dirty.current && !saving)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnload);
    return () => window.removeEventListener("beforeunload", protectUnload);
  }, [saving, creating, target]);
  function navigate(action: () => void) {
    if (creating || saving) return;
    if (dirty.current) setLeave(() => action);
    else action();
  }
  function close() {
    dirty.current = false;
    setTab("details");
    setCreated(null);
    onClose();
  }
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && navigate(close)}>
      <DialogContent
        ref={popup}
        closeDisabled={saving || creating}
        showCloseButton={false}
        className={cn(
          "max-h-[94svh] max-md:top-(--reservation-viewport-top,0px) max-md:left-0 max-md:flex max-md:h-(--reservation-viewport-height,100dvh) max-md:max-h-(--reservation-viewport-height,100dvh) max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:flex-col max-md:gap-0 max-md:overflow-hidden max-md:p-0 max-md:transition-none",
          target?.mode === "edit"
            ? "flex flex-col overflow-hidden sm:max-w-4xl"
            : "overflow-y-auto sm:max-w-4xl",
        )}
      >
        <DialogHeader
          className={cn(
            target?.mode === "edit"
              ? "sr-only"
              : "shrink-0 max-md:py-4 max-md:pt-[max(1rem,env(safe-area-inset-top))] max-md:safe-area-padding-x",
          )}
        >
          <div className="flex flex-wrap items-center gap-3 pr-8">
            <DialogTitle>
              {target?.mode === "edit" ? "Editar reserva" : "Nueva reserva"}
            </DialogTitle>
          </div>
          <DialogDescription className={target?.mode === "edit" ? "sr-only" : undefined}>
            {target?.mode === "edit"
              ? "Detalles de la reserva, huéspedes y pagos."
              : "Completa la estancia y el contacto principal."}
          </DialogDescription>
          {createOpen && (
            <DialogClose
              disabled={creating}
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-2 right-2 max-md:top-[max(0.5rem,env(safe-area-inset-top))] max-md:right-[max(0.5rem,env(safe-area-inset-right))]"
                />
              }
            >
              <XIcon data-icon="inline-start" />
              <span className="sr-only">Cerrar</span>
            </DialogClose>
          )}
        </DialogHeader>
        {target?.mode === "edit" ? (
          detail.isPending ? (
            <BookingEditorSkeleton />
          ) : detail.error ? (
            <FieldError>{detail.error.message}</FieldError>
          ) : (
            detail.data && (
              <BookingEditor
                key={detail.data.id}
                detail={detail.data}
                initialTab={tab}
                onTabChange={setTab}
                paymentSuggestionCents={
                  created?.reservation.id === detail.data.id
                    ? created.reservation.requiredInitialPaymentCents
                    : undefined
                }
                onDirtyChange={onDirtyChange}
                onViewReservation={(id) => navigate(() => onViewReservation(id))}
                onCancel={() => navigate(close)}
              />
            )
          )
        ) : (
          target && (
            <NewBooking
              key={target.mode === "create" ? target.roomId + target.checkIn : "new"}
              target={target}
              onCreated={(reservation) => {
                toast.add({ title: "Reserva creada", type: "success" });
                client.setQueryData(["reservation", reservation.id], reservation);
                dirty.current = false;
                setTab("payments");
                setCreated({ from: requested!, reservation });
              }}
              onCancel={() => navigate(close)}
              onDirtyChange={onDirtyChange}
              onSavingChange={setCreating}
            />
          )
        )}
        {target?.mode === "edit" && (
          <DialogClose
            disabled={saving}
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2 max-md:top-[max(1rem,env(safe-area-inset-top))] max-md:right-[max(1rem,env(safe-area-inset-right))]"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Cerrar</span>
          </DialogClose>
        )}
      </DialogContent>
      {leave && (
        <DiscardChanges
          saving={saving}
          onStay={() => setLeave(null)}
          onLeave={() => {
            if (creating || saving) return;
            dirty.current = false;
            setLeave(null);
            leave();
          }}
        />
      )}
    </Dialog>
  );
}

function BookingEditorSkeleton() {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <div
        role="region"
        aria-label="Cargando reserva"
        aria-busy
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 flex-col gap-1.5 pt-[max(1rem,env(safe-area-inset-top))] pb-2 pl-[max(1rem,env(safe-area-inset-left))]">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="flex h-8 shrink-0 items-center justify-around border-b">
          {[0, 1, 2].map((tab) => (
            <Skeleton key={tab} className="h-4 w-16" />
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden py-4 safe-area-padding-x">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-28" />
            {[0, 1, 2, 3].map((field) => (
              <Skeleton key={field} className="h-14" />
            ))}
            <Skeleton className="h-8 w-38" />
          </div>
          <Skeleton className="h-22.25 shrink-0" />
        </div>
        <div className="shrink-0 pt-3 pb-px safe-area-padding-x">
          <Skeleton className="h-8" />
        </div>
        <div className="flex shrink-0 gap-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] safe-area-padding-x">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
        </div>
      </div>
    );
  }
  return (
    <div
      role="region"
      aria-label="Cargando reserva"
      aria-busy
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5 pr-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-52" />
        <div className="grid min-w-0 gap-6 p-px lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-14" />
              <Skeleton className="h-8 w-38" />
            </div>
            <Skeleton className="h-22.25" />
          </div>
          <Skeleton className="h-82.5" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-64" />
      </div>
    </div>
  );
}

export function BookingEditor({
  detail,
  onViewReservation,
  onDirtyChange,
  full = false,
  initialTab = "details",
  onTabChange,
  stayOnly = false,
  onCancel,
  onSaved,
  paymentSuggestionCents,
}: {
  detail: ReservationDetail;
  onViewReservation?: (id: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  full?: boolean;
  initialTab?: string;
  onTabChange?: (tab: string) => void;
  stayOnly?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
  paymentSuggestionCents?: number;
}) {
  const contact = detail.guest;
  const [guestDirty, setGuestDirty] = useState(false);
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
  const reservationState = stayOnly ? detail.status : (values.status ?? detail.status);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [tab, setTab] = useState(initialTab);
  const isMobile = useIsMobile();
  const compactEditor = !stayOnly && !full;
  const mobileEditor = isMobile && compactEditor;
  const [billOpen, setBillOpen] = useState(false);
  function addRoom() {
    if (!canAddRoom || !nextRoomType || !previousRoom) return;
    form.pushFieldValue("rooms", {
      id: crypto.randomUUID(),
      room: {
        roomTypeId: nextRoomType.id,
        roomId: null,
        adults: String(Math.min(Number(previousRoom.adults), nextRoomType.maxAdults)),
        children: String(Math.min(Number(previousRoom.children), nextRoomType.maxChildren)),
      },
      removed: false,
    });
  }
  const [paymentDirty, setPaymentDirty] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentDraftKey, setPaymentDraftKey] = useState(0);
  const unpayablePaymentDraft =
    detail.balanceCents <= 0 && paymentDirty && paymentMethod !== "coupon";
  const [discountDirty, setDiscountDirty] = useState(false);
  const [actionDirty, setActionDirty] = useState(false);
  const independentDraftDirty = guestDirty || paymentDirty || discountDirty || actionDirty;
  const draftDirty = dirty || independentDraftDirty;
  const billing = summary.billing;
  const { send, saving: reservationSaving } = useReservationCommands(detail.id);
  const lifecycle = useLifecycleAction(detail, draftDirty || submitting);
  const busy = submitting || reservationSaving;
  const bodySave = compactEditor && !mobileEditor;
  useEffect(() => {
    onDirtyChange?.(draftDirty);
  }, [draftDirty, onDirtyChange]);
  async function savePayment(title: string, actions: WorkflowAction[]) {
    const result = await send(actions);
    if (result.status === "saved") toast.add({ title, type: "success" });
    return result;
  }

  const activeDrafts = drafts.filter((draft) => !draft.removed);
  async function saveChanges() {
    if (tab !== "details" || !stayDraft.submission.allowed) return;
    const result = await send(stayDraft.submission.command.actions);
    if (result.status === "saved") {
      resetDetails(result.reservation);
      toast.add({ title: "Detalles guardados", type: "success" });
      onSaved?.();
    } else if (result.status === "rejected") stayDraft.rejectSave(result.fields);
    else toastError("No se pudo guardar", result.message);
  }
  const removeRoom = (id: string) =>
    form.setFieldValue(`rooms[${values.rooms.findIndex((room) => room.id === id)}].removed`, true);
  const viewReservation = !full && onViewReservation && (
    <Button
      type="button"
      variant="ghost"
      size={mobileEditor ? "icon" : "icon-sm"}
      aria-label="Ver reserva completa"
      title="Ver reserva completa"
      disabled={busy}
      onClick={() => onViewReservation(detail.id)}
    >
      <ArrowUpRightIcon />
    </Button>
  );
  const saveDetails = (
    <Button
      type="submit"
      form={formId}
      className={cn(mobileEditor && "min-w-0 flex-1")}
      disabled={stayDraft.submission.disabled || busy}
    >
      {submitting && <Spinner data-icon="inline-start" />}
      {submitting ? "Guardando…" : "Guardar cambios"}
    </Button>
  );
  const undoDetails = compactEditor && (
    <Button
      type="button"
      variant="outline"
      className={cn(mobileEditor && "min-w-0 flex-1")}
      disabled={!dirty || busy}
      onClick={stayDraft.discard}
    >
      Deshacer cambios
    </Button>
  );
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4",
        !full && "min-h-0 flex-1 overflow-hidden",
        compactEditor && "max-md:gap-0",
      )}
    >
      {lifecycle.dialogs}
      {mobileEditor && (
        <header className="flex shrink-0 items-start gap-2 pt-[max(1rem,env(safe-area-inset-top))] pr-[calc(2.25rem+max(1rem,env(safe-area-inset-right)))] pb-2 pl-[max(1rem,env(safe-area-inset-left))]">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-xs tracking-widest wrap-anywhere text-muted-foreground uppercase">
                #{detail.code}
              </span>
              <ReservationStatusBadge status={detail.status} />
            </div>
            <span className="min-w-0 truncate text-lg/tight font-semibold tracking-tight">
              {contact.fullName.trim()}
            </span>
            <span className="text-sm text-muted-foreground">
              {stayRange(detail.checkIn, detail.checkOut)}
            </span>
            {contact.phone && <ContactPhone phone={contact.phone} className="text-sm" />}
          </div>
          {viewReservation}
        </header>
      )}
      {!stayOnly && !mobileEditor && (
        <header className="flex shrink-0 flex-col gap-1.5 pr-16">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="font-mono text-xs tracking-widest wrap-anywhere text-muted-foreground uppercase">
              Reserva #{detail.code}
            </p>
            <ReservationStatusBadge status={detail.status} />
          </div>
          <span className="text-2xl font-semibold tracking-tight wrap-anywhere">
            {contact.fullName.trim()}
          </span>
          {viewReservation && <div className="absolute top-2 right-10">{viewReservation}</div>}
          {contact.phone && <ContactPhone phone={contact.phone} className="text-sm" />}
        </header>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
          onTabChange?.(value);
        }}
        className={cn(
          "gap-4",
          !full && "min-h-0 overflow-y-auto",
          stayOnly && "max-sm:flex-1",
          compactEditor && "max-md:flex-1 max-md:gap-0 max-md:overflow-hidden",
        )}
      >
        {!stayOnly && (
          <TabsList
            variant="line"
            className={cn(
              "shrink-0",
              compactEditor && "max-md:w-full max-md:border-b max-md:safe-area-padding-x",
            )}
          >
            <TabsTrigger value="details">
              Detalles
              {dirty && <UnsavedDot />}
            </TabsTrigger>
            <TabsTrigger value="payments">
              Movimientos
              {(paymentDirty || actionDirty) && <UnsavedDot />}
            </TabsTrigger>
            <TabsTrigger value="guests">
              Huéspedes
              {guestDirty && <UnsavedDot />}
            </TabsTrigger>
          </TabsList>
        )}
        <div
          className={cn(
            "grid min-w-0 shrink-0 gap-6 p-px",
            "lg:grid-cols-[minmax(0,1fr)_280px]",
            compactEditor && "max-md:contents",
          )}
        >
          <div
            className={cn(
              "min-w-0",
              compactEditor &&
                "max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain max-md:scroll-py-4 max-md:py-4 max-md:safe-area-padding-x",
            )}
          >
            <TabsContent value="details" keepMounted className="flex flex-col gap-5">
              <form
                id={formId}
                noValidate
                onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
              >
                <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5">
                  <FieldGroup
                    className={cn(
                      "grid gap-3",
                      full ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2",
                    )}
                  >
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
                      <section className={cn("flex flex-col", mobileEditor ? "gap-3" : "gap-5")}>
                        {mobileEditor && (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-medium">Habitaciones</h3>
                          </div>
                        )}
                        {activeDrafts.map((draft, i) => {
                          const roomIndex = values.rooms.findIndex((room) => room.id === draft.id);
                          const fields = (
                            <form.Field name={`rooms[${roomIndex}].room`}>
                              {() => (
                                <CompactRoomFields
                                  form={form}
                                  roomIndex={roomIndex}
                                  newRoom={!detail.rooms.some((room) => room.id === draft.id)}
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
                                    onRemove: () => removeRoom(draft.id),
                                  }}
                                  stacked={mobileEditor}
                                />
                              )}
                            </form.Field>
                          );
                          return (
                            <Fragment key={draft.id}>
                              {mobileEditor && i > 0 && <Separator className="my-2" />}
                              {fields}
                            </Fragment>
                          );
                        })}
                        {activeDrafts.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(mobileEditor ? "w-full" : "w-fit")}
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
                  {!stayOnly && (
                    <section className="flex flex-col gap-3">
                      <FieldGroup>
                        <form.AppField name="notes">
                          {(field) => <field.Text label="Notas" type="textarea" max={2000} />}
                        </form.AppField>
                      </FieldGroup>
                    </section>
                  )}
                  {bodySave && (
                    <div className="flex gap-2">
                      {undoDetails}
                      {saveDetails}
                    </div>
                  )}
                </fieldset>
              </form>
            </TabsContent>
            {!stayOnly && (
              <TabsContent value="guests" keepMounted className="flex flex-col gap-5">
                <GuestFields
                  detail={detail}
                  disabled={busy}
                  onSave={(guests) => send([{ type: "set-guests", guests: guestValues(guests) }])}
                  onDirtyChange={setGuestDirty}
                />
              </TabsContent>
            )}
            {!stayOnly && (
              <TabsContent value="payments" keepMounted className="flex flex-col gap-5">
                <div hidden={unpayablePaymentDraft}>
                  <PaymentForm
                    key={paymentDraftKey}
                    detail={detail}
                    suggestedAmountCents={paymentSuggestionCents}
                    disabled={busy || unpayablePaymentDraft}
                    onDirtyChange={setPaymentDirty}
                    onMethodChange={setPaymentMethod}
                    onReady={savePayment}
                    undoable
                  />
                </div>
                {unpayablePaymentDraft && (
                  <div className="flex flex-col items-start gap-2">
                    <p role="status" className="text-sm text-muted-foreground">
                      La cuenta ya no tiene saldo pendiente. El pago que estabas preparando no se ha
                      guardado.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setPaymentDraftKey((key) => key + 1);
                        setPaymentDirty(false);
                      }}
                    >
                      Descartar pago pendiente
                    </Button>
                  </div>
                )}
                <section aria-label="Movimientos" className="@container/mov min-w-0">
                  <Movements
                    detail={detail}
                    disabled={busy}
                    edit={(target) => {
                      if (target.kind !== "payment" && target.kind !== "delete-payment") return;
                      const entry = detail.payments.find((payment) => payment.id === target.id);
                      if (!entry) return;
                      setIntent({
                        type: target.kind === "delete-payment" ? "delete-payment" : "edit-payment",
                        entry,
                      });
                    }}
                  />
                </section>
              </TabsContent>
            )}
          </div>
          <aside
            className={cn(
              "min-w-0 md:self-start",
              compactEditor &&
                "max-md:flex max-md:min-h-0 max-md:flex-col max-md:pt-3 max-md:pb-px max-md:safe-area-padding-x",
            )}
          >
            <BookingSummary
              cancelled={!holdsInventory(reservationState)}
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
              editableDiscountCents={detail.savedDiscountCents}
              discountDisabled={busy}
              onDiscountSave={
                stayOnly
                  ? undefined
                  : (amountCents) => send([{ type: "set-discount", amountCents }])
              }
              onDiscountDirtyChange={setDiscountDirty}
              currency={detail.currency}
              stayLabel={stayRange(common.checkIn, common.checkOut)}
              ratePlan={ratePlanLabels[detail.ratePlan.plan]}
              showNightlyPrices={isMobile}
              message={
                summary.invalidPrices
                  ? "Revisa el precio por noche para ver el total."
                  : summary.calculating
                    ? "Calculando…"
                    : mobileEditor && !billing
                      ? "Importes no disponibles"
                      : null
              }
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
              collapsible={mobileEditor}
              expanded={billOpen}
              onExpandedChange={setBillOpen}
            />
          </aside>
        </div>
      </Tabs>
      <div
        className={cn(
          "contents",
          compactEditor &&
            "max-md:flex max-md:shrink-0 max-md:flex-col max-md:gap-3 max-md:py-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:safe-area-padding-x",
        )}
      >
        {compactEditor &&
          (mobileEditor && dirty ? (
            tab === "details" ? (
              <div key="save-details" className="flex gap-2">
                {undoDetails}
                {saveDetails}
              </div>
            ) : (
              <Button
                key="back-to-details"
                type="button"
                className="w-full"
                disabled={busy}
                onClick={() => {
                  setTab("details");
                  onTabChange?.("details");
                }}
              >
                Volver a Detalles
              </Button>
            )
          ) : (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-md:flex-nowrap">
              {lifecycle.running && (
                <p
                  role="status"
                  className={cn("mr-auto text-xs text-muted-foreground", mobileEditor && "sr-only")}
                >
                  Guardando estado…
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className={cn(mobileEditor && "min-w-0 flex-1")}
                disabled={busy}
                onClick={onCancel}
              >
                Cerrar
              </Button>
              {lifecycle.step && (
                <Button
                  type="button"
                  variant={lifecycle.step.due ? "default" : "outline"}
                  className={cn(mobileEditor && "min-w-0 flex-1")}
                  disabled={busy || lifecycle.running || draftDirty}
                  onClick={() => void lifecycle.run()}
                >
                  {lifecycle.running ? (
                    <Spinner data-icon="inline-start" />
                  ) : lifecycle.step.status === "checked_in" ? (
                    <LogInIcon data-icon="inline-start" />
                  ) : (
                    <LogOutIcon data-icon="inline-start" />
                  )}
                  {lifecycle.step.label}
                </Button>
              )}
            </div>
          ))}
        {stayOnly && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              Cancelar
            </Button>
            {saveDetails}
          </div>
        )}
      </div>
      {intent && (
        <ActionForm
          key={intent.type + intent.entry.id}
          intent={intent}
          onClose={() => {
            setIntent(null);
            setActionDirty(false);
          }}
          onDirtyChange={setActionDirty}
          onReady={async (title, actions) => {
            const result = await savePayment(title, actions);
            if (result.status === "saved") {
              setIntent(null);
              setActionDirty(false);
            }
            return result;
          }}
        />
      )}
    </div>
  );
}

function useRoomAssignmentOptions(
  room: { checkIn: string; checkOut: string },
  reservationId?: string,
) {
  const nights =
    (Date.parse(`${room.checkOut}T00:00:00Z`) - Date.parse(`${room.checkIn}T00:00:00Z`)) / 86400000;
  const enabled = nights >= 1 && nights <= 60;
  const availability = useAvailability(
    room.checkIn,
    room.checkOut,
    enabled,
    reservationId ? { excludeReservationId: reservationId } : undefined,
  );
  const types = availability.data?.roomTypes ?? [];
  return {
    types,
    assignable: new Set(types.flatMap((type) => type.freeRoomIds)),
    ready: enabled && availability.isSuccess,
    error: availability.error?.message,
  };
}

const CompactRoomFields = withReservationForm({
  defaultValues: emptyDetails,
  props: {
    roomIndex: 0,
    newRoom: false,
    reservationId: "",
    availableTypeIds: new Set<string>(),
    typesReady: false,
    blockedRoomIds: new Set<string>(),
    errors: {} as Record<string, string>,
    row: { index: 0, count: 1, onRemove: () => {} } as {
      index: number;
      count: number;
      onRemove: () => void;
    },
    stacked: false,
  },
  render: function CompactRoomFields({
    form,
    roomIndex,
    newRoom,
    reservationId,
    availableTypeIds,
    typesReady,
    blockedRoomIds,
    errors,
    row,
    stacked,
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
        stacked={stacked}
        price={
          newRoom
            ? {
                open: room.nightlyRate !== undefined,
                onOpen: () => form.setFieldValue(`rooms[${roomIndex}].room.nightlyRate`, ""),
                field: (onUndo) => (
                  <form.AppField name={`rooms[${roomIndex}].room.nightlyRate`}>
                    {(field) => <field.NightlyPrice onUndo={onUndo} />}
                  </form.AppField>
                ),
              }
            : null
        }
        typeField={typeField}
        roomField={roomField}
        adultsField={adultsField}
        childrenField={childrenField}
        feedback={feedback}
      />
    );
  },
});

function GuestFields({
  detail,
  disabled,
  onSave,
  onDirtyChange,
}: {
  detail: ReservationDetail;
  disabled: boolean;
  onSave: (guests: StayingGuest[]) => Promise<ReservationCommandResult>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState<StayingGuest | null>(null);
  const [addDirty, setAddDirty] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const dirty = addDirty || editDirty;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const reset = () => {
    setEditing(null);
    setEditDirty(false);
    setLeaving(false);
  };
  async function remove(id: string) {
    const result = await onSave(detail.stayingGuests.filter((guest) => guest.id !== id));
    if (result.status !== "saved")
      return toastError("No se pudo eliminar el huésped", unsavedMessage(result));
    if (editing?.id === id) reset();
    toast.add({ title: "Huésped eliminado", type: "success" });
  }
  const closeEdit = () => {
    if (disabled) return;
    if (editDirty) setLeaving(true);
    else reset();
  };
  return (
    <>
      <GuestEntryForm
        detail={detail}
        disabled={disabled || !!editing}
        onSave={onSave}
        onDirtyChange={setAddDirty}
        undoable
      />
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
      >
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar huésped</DialogTitle>
          </DialogHeader>
          {editing && (
            <GuestEntryForm
              key={editing.id}
              detail={detail}
              guest={editing}
              disabled={disabled}
              onSave={onSave}
              onDirtyChange={setEditDirty}
              onDone={reset}
              onCancel={closeEdit}
            />
          )}
        </DialogContent>
      </Dialog>
      {leaving && <DiscardChanges onStay={() => setLeaving(false)} onLeave={reset} />}

      <StayingGuestList
        detail={detail}
        disabled={disabled || dirty}
        onEdit={setEditing}
        onDelete={(guest) => void remove(guest.id)}
      />
    </>
  );
}

function ActionForm({
  intent,
  onClose,
  onReady,
  onDirtyChange,
}: {
  intent: Intent;
  onClose: () => void;
  onReady: (title: string, actions: WorkflowAction[]) => Promise<ReservationCommandResult>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { today } = usePropertyCalendar();
  const entry = intent.entry;
  const [leaving, setLeaving] = useState(false);
  const deleting = intent.type === "delete-payment";
  const [defaults] = useState<PaymentValues>(() => ({
    ...paymentDefaults(entry.amountCents),
    method: entry.method,
    date: entry.paymentDate,
    reference: entry.reference ?? "",
    reason: entry.notes ?? "",
  }));
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => {
        const result = deleting
          ? cancellationSchema.safeParse(value)
          : paymentSchema.safeParse(value);
        return result.success
          ? undefined
          : {
              fields: Object.fromEntries(
                result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
              ),
            };
      },
    },
    onSubmit: async ({ value }) => submit(value),
  });
  const saving = useSelector(form.store, (state) => state.isSubmitting);
  const changed = !useSelector(form.store, (state) => state.isDefaultValue);
  useEffect(() => {
    if (!deleting && form.state.fieldMeta.date?.errors.length) void form.validate("submit");
  }, [deleting, form, today]);
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);
  const formId = useId();
  const title = deleting ? "Eliminar pago" : "Editar pago";
  function close() {
    if (saving) return;
    if (changed && !deleting) setLeaving(true);
    else onClose();
  }
  async function submit(value: PaymentValues) {
    await commit(
      deleting
        ? [{ type: "delete-payment", paymentId: entry.id }]
        : [{ type: "edit-payment", paymentId: entry.id, payment: paymentPayload(value) }],
    );
  }
  async function commit(actions: WorkflowAction[]) {
    const result = await onReady(title, actions);
    if (result.status === "rejected") setServerErrors(form, result.fields);
    else if (result.status === "failed")
      toastError(
        deleting ? "No se pudo eliminar el pago" : "No se pudo guardar el pago",
        result.message,
      );
  }
  const Root = deleting ? AlertDialog : Dialog;
  const Content = deleting ? AlertDialogContent : DialogContent;
  const Header = deleting ? AlertDialogHeader : DialogHeader;
  const Title = deleting ? AlertDialogTitle : DialogTitle;
  const Description = deleting ? AlertDialogDescription : DialogDescription;
  const Footer = deleting ? AlertDialogFooter : "div";
  const CancelButton = deleting ? AlertDialogCancel : Button;
  const ConfirmButton = deleting ? AlertDialogAction : Button;
  return (
    <>
      <Root open onOpenChange={(open) => !open && close()}>
        <Content className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <Header>
            <Title>{title}</Title>
            <Description>
              {deleting
                ? `Se eliminará el pago de ${formatMoney(entry.amountCents)} al confirmar.`
                : "El cambio se guardará al confirmar. Los cambios de Detalles se guardan por separado."}
            </Description>
          </Header>
          <form
            id={formId}
            noValidate
            onSubmit={(event) => void submitForm(event, () => form.handleSubmit())}
          >
            {!deleting && (
              <fieldset disabled={saving}>
                <FieldGroup>
                  <form.AppField name="amount">
                    {(field) => <field.Text label="Importe S/" placeholder="0.00" />}
                  </form.AppField>
                  <form.AppField name="method">
                    {(field) => <field.Choice label="Método" options={paymentMethods} />}
                  </form.AppField>
                  <form.AppField name="date">
                    {(field) => (
                      <field.Text label="Fecha del pago" type="date" required max={today} />
                    )}
                  </form.AppField>
                  <form.AppField name="reference">
                    {(field) => <field.Text label="Referencia · Opcional" />}
                  </form.AppField>
                  <form.AppField name="reason">
                    {(field) => <field.Text label="Nota · Opcional" disabled={saving} />}
                  </form.AppField>
                </FieldGroup>
              </fieldset>
            )}
          </form>
          <Footer className="flex justify-end gap-2">
            <CancelButton type="button" variant="outline" disabled={saving} onClick={close}>
              Volver
            </CancelButton>
            <ConfirmButton
              type="submit"
              form={formId}
              variant={deleting ? "destructive" : "default"}
              disabled={saving}
            >
              {saving ? "Guardando…" : deleting ? "Eliminar" : "Guardar"}
            </ConfirmButton>
          </Footer>
        </Content>
      </Root>
      {leaving && <DiscardChanges onStay={() => setLeaving(false)} onLeave={onClose} />}
    </>
  );
}

export function DiscardChanges({
  onStay,
  onLeave,
  saving = false,
}: {
  onStay: () => void;
  onLeave: () => void;
  saving?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onStay()}>
      <DialogContent closeDisabled={saving} className="flex max-h-[90dvh] flex-col overflow-hidden">
        <DialogHeader className="min-h-0 overflow-y-auto">
          <DialogTitle>{saving ? "Guardando cambios" : "Hay cambios sin guardar"}</DialogTitle>
          <DialogDescription>
            {saving
              ? "Espera a que termine el guardado antes de salir."
              : "Si sales ahora, se descartarán tus cambios en esta reserva."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onStay}>
            Seguir editando
          </Button>
          <Button type="button" variant="destructive" disabled={saving} onClick={onLeave}>
            Descartar y salir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactPhone({ phone, className }: { phone: string; className?: string }) {
  const display = phoneDisplay(phone);
  return (
    <a
      href={display.href}
      className={cn(
        "flex w-fit items-center gap-1.5 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <PhoneIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">Teléfono </span>
      {display.text}
    </a>
  );
}

function UnsavedDot() {
  return (
    <span
      role="img"
      className="size-1.5 shrink-0 rounded-full bg-primary"
      aria-label="Cambios sin guardar"
      title="Cambios sin guardar"
    />
  );
}
