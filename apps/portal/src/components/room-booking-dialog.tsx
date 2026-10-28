import { useCallback, useEffect, useRef, useState, useId, type ReactNode } from "react";
import { useSelector } from "@tanstack/react-form";
import {
  ArrowUpRightIcon,
  EllipsisIcon,
  LogInIcon,
  LogOutIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { guestValues, overlappingRoomIds, availableRoomTypeIds } from "@/lib/reservation-editor";
import { unavailableRoomIds } from "@/lib/assignment-availability";
import { useStayDraft } from "@/lib/use-stay-draft";
import { ReservationStatusBadge } from "@/components/reservation-status-badge";
import { useDirtyRoomCheckIn } from "@/components/dirty-room-check-in";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { BookingSummary } from "@/components/booking-summary";
import { useIsMobile } from "@/hooks/use-mobile";
import { ReservationPageEditor } from "@/components/reservation-page-editors";
import { NewBooking } from "@/components/new-booking";
import { PaymentList, StayingGuestList } from "@/components/reservation-records";
import { GuestEntryForm, PaymentForm, paymentMethods } from "@/components/reservation-entry-forms";
import { format } from "@/lib/dates";
import { isValid, parseISO } from "date-fns";
import {
  type StayingGuest,
  type ReservationPayment,
  type ReservationDetail,
  type WorkflowAction,
} from "@/lib/api";
import {
  useReservation,
  useReservations,
  useRoomClosures,
  useRooms,
  useRoomTypes,
} from "@/lib/queries";
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
import { propertyToday } from "@/lib/property-calendar";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import { phoneDisplay } from "@/lib/phone";

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
type Intent = { type: "edit-payment" | "delete-payment"; entry: ReservationPayment };

export function RoomBookingDialog({
  target,
  onClose,
  onViewReservation,
}: {
  target: BookingTarget | null;
  onClose: () => void;
  onViewReservation: (id: string) => void;
}) {
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
    // Mobile keyboards can shrink/pan the visual viewport without changing dvh.
    // Resize the same popup rather than remounting the form and losing its draft.
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
                onRefresh={() => void detail.refetch()}
                initialTab={tab}
                onTabChange={setTab}
                onDirtyChange={onDirtyChange}
                onCancelled={close}
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
              onCreated={() => {
                toast.add({ title: "Reserva creada", type: "success" });
                close();
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

/**
 * The editor's Detalles layout with placeholders, sized like a confirmed reservation with one
 * room so the dialog keeps its size and position when the reservation loads.
 */
function BookingEditorSkeleton() {
  const isMobile = useIsMobile();
  if (isMobile) {
    // The full-screen phone editor: fixed header, tabs, and footer around a scrolling form.
    return (
      <div
        role="region"
        aria-label="Cargando reserva"
        aria-busy
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex h-12 shrink-0 items-start gap-2 pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))]">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-1 h-5 w-24" />
        </div>
        <div className="h-5 shrink-0 safe-area-padding-x">
          <Skeleton className="h-5 w-52" />
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
          <Skeleton className="h-7" />
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
      <div className="flex items-center gap-2 pr-8">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton className="-mt-2 h-7 w-52" />
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
          <Skeleton className="h-77.75" />
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
  onCancelled,
  onViewReservation,
  onDirtyChange,
  full = false,
  initialTab = "details",
  onTabChange,
  stayOnly = false,
  onCancel,
  onSaved,
}: {
  detail: ReservationDetail;
  onRefresh?: () => void;
  onCancelled?: () => void;
  onViewReservation?: (id: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  full?: boolean;
  initialTab?: string;
  onTabChange?: (tab: string) => void;
  stayOnly?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
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
  const availableTypes = availableRoomTypeIds(
    common,
    rooms.data ?? [],
    availability.reservations ?? [],
    availability.closures ?? [],
    drafts,
    detail.id,
  );
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
  const [paymentDirty, setPaymentDirty] = useState(false);
  const [discountDirty, setDiscountDirty] = useState(false);
  const [actionDirty, setActionDirty] = useState(false);
  const independentDraftDirty = guestDirty || paymentDirty || discountDirty || actionDirty;
  const [cancellation, setCancellation] = useState<{
    detail: ReservationDetail;
    discardDraft: boolean;
  } | null>(null);
  const [restoration, setRestoration] = useState<{
    detail: ReservationDetail;
    status: "confirmed" | "checked_in" | "checked_out";
  } | null>(null);
  const [cancellationDirty, setCancellationDirty] = useState(false);
  const draftDirty = dirty || independentDraftDirty;
  const billing = summary.billing;
  // Saves to one Reservation run in send order, so a Discount autosave finishes before a
  // later Staying guest, Payment, status or details save reads the Reservation.
  const { send, saving: reservationSaving } = useReservationCommands(detail.id);
  const [statusSaving, setStatusSaving] = useState(false);
  const busy = submitting || reservationSaving;
  useEffect(() => {
    onDirtyChange?.(draftDirty || cancellationDirty);
  }, [draftDirty, cancellationDirty, onDirtyChange]);
  async function savePayment(title: string, actions: WorkflowAction[]) {
    const result = await send(actions);
    if (result.status === "saved") toast.add({ title, type: "success" });
    return result;
  }

  const activeDrafts = drafts.filter((draft) => !draft.removed);
  const [confirmCheckIn, checkInDialog] = useDirtyRoomCheckIn();
  async function changeStatus(status: "confirmed" | "checked_in" | "checked_out") {
    if (status === detail.status || dirty || independentDraftDirty || busy) return;
    if (!(await confirmCheckIn(detail, status))) return;
    setStatusSaving(true);
    const result = await send([{ type: "set-status", status }]);
    setStatusSaving(false);
    if (result.status === "saved") toast.add({ title: "Estado guardado", type: "success" });
    else toastError("No se pudo cambiar el estado", unsavedMessage(result));
  }
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
  const reservationActions = (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy || (!mobileEditor && independentDraftDirty)}
        render={
          <Button type="button" variant="ghost" size="icon" aria-label="Más acciones de reserva" />
        }
      >
        <span className="sr-only">Más acciones de reserva</span>
        <EllipsisIcon data-icon="inline-start" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={mobileEditor ? "bottom" : "top"} className="w-52">
        <DropdownMenuGroup>
          {mobileEditor && onViewReservation && (
            <DropdownMenuItem onClick={() => onViewReservation(detail.id)}>
              Ver reserva completa
            </DropdownMenuItem>
          )}
          {detail.status !== "cancelled" && (
            <DropdownMenuItem
              variant="destructive"
              disabled={independentDraftDirty}
              closeOnClick={false}
              onClick={() => {
                if (reservationSaving) return;
                setCancellation({ detail, discardDraft: dirty });
              }}
            >
              Cancelar reserva
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={dirty || independentDraftDirty}>
              Cambiar estado
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-36">
              <DropdownMenuRadioGroup
                aria-label="Estado de la reserva"
                value={detail.status}
                onValueChange={(value) => {
                  if (value !== "confirmed" && value !== "checked_in" && value !== "checked_out")
                    return;
                  if (detail.status === "cancelled") {
                    const next = value;
                    queueMicrotask(async () => {
                      if (await confirmCheckIn(detail, next))
                        setRestoration({ detail, status: next });
                    });
                    return;
                  }
                  void changeStatus(value);
                }}
              >
                <DropdownMenuRadioItem value="confirmed" closeOnClick>
                  Confirmada
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="checked_in" closeOnClick>
                  Check-in
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="checked_out" closeOnClick>
                  Check-out
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const discardDetails = !full && !stayOnly && (mobileEditor ? dirty : tab === "details") && (
    <Button
      type="button"
      variant={mobileEditor ? "ghost" : "outline"}
      disabled={!dirty || busy}
      onClick={stayDraft.discard}
    >
      {mobileEditor ? "Descartar" : "Descartar cambios"}
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
      {checkInDialog}
      {!stayOnly && (
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-2 pr-8",
            compactEditor &&
              "max-md:min-h-[calc(2rem+max(1rem,env(safe-area-inset-top)))] max-md:flex-nowrap max-md:items-start max-md:pt-[max(1rem,env(safe-area-inset-top))] max-md:pr-[calc(2.25rem+max(1rem,env(safe-area-inset-right)))] max-md:pl-[max(1rem,env(safe-area-inset-left))]",
          )}
        >
          <div
            className={
              mobileEditor
                ? "flex min-h-7 min-w-0 flex-1 flex-nowrap items-center gap-2"
                : "contents"
            }
          >
            <span className={cn("text-lg font-semibold", mobileEditor && "min-w-0 truncate")}>
              {`${contact.fullName}`.trim()}
            </span>
            <ReservationStatusBadge status={detail.status} />
          </div>
          {mobileEditor && reservationActions}
        </div>
      )}
      {!stayOnly && (
        <p
          className={cn(
            "-mt-2 flex shrink-0 flex-wrap items-center gap-1 text-sm wrap-anywhere text-muted-foreground",
            compactEditor && "max-md:mt-0 max-md:safe-area-padding-x",
          )}
        >
          {[contact.phone && phoneDisplay(contact.phone).text, detail.code]
            .filter(Boolean)
            .join(" · ")}
          {!full && !mobileEditor && onViewReservation && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Ver reserva completa"
              title="Ver reserva completa"
              disabled={busy}
              onClick={() => onViewReservation(detail.id)}
            >
              <ArrowUpRightIcon />
            </Button>
          )}
        </p>
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
              {dirty ? (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                  aria-label="Cambios sin guardar"
                  title="Cambios sin guardar"
                />
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="guests">Huéspedes</TabsTrigger>
            <TabsTrigger value="payments">Pagos</TabsTrigger>
          </TabsList>
        )}
        <div
          className={cn(
            "grid min-w-0 shrink-0 gap-6 p-px",
            !stayOnly && "lg:grid-cols-[minmax(0,1fr)_280px]",
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
                  {stayOnly && <h3 className="font-medium">Estadía</h3>}
                  <FieldGroup
                    className={cn(
                      "grid gap-3",
                      compactEditor ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2",
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
                      <section className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-medium">Habitaciones</h3>
                        </div>
                        {activeDrafts.map((draft, i) => (
                          <section
                            key={draft.id}
                            aria-labelledby={
                              mobileEditor && activeDrafts.length > 1
                                ? `${formId}-${draft.id}-title`
                                : undefined
                            }
                            className="flex min-w-0 flex-col gap-3"
                          >
                            {mobileEditor && i > 0 && <Separator className="my-2" />}
                            {mobileEditor && activeDrafts.length > 1 && (
                              <div className="flex items-center justify-between gap-3">
                                <h4
                                  id={`${formId}-${draft.id}-title`}
                                  className="font-medium text-muted-foreground"
                                >
                                  Habitación {i + 1}
                                </h4>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  aria-label={`Quitar habitación ${i + 1}`}
                                  onClick={() =>
                                    form.setFieldValue(
                                      `rooms[${values.rooms.findIndex((room) => room.id === draft.id)}].removed`,
                                      true,
                                    )
                                  }
                                >
                                  Quitar
                                </Button>
                              </div>
                            )}
                            <form.Field
                              name={`rooms[${values.rooms.findIndex((room) => room.id === draft.id)}].room`}
                            >
                              {() => (
                                <CompactRoomFields
                                  form={form}
                                  roomIndex={values.rooms.findIndex((room) => room.id === draft.id)}
                                  errors={errors}
                                  reservationId={detail.id}
                                  availableTypeIds={availableRoomTypeIds(
                                    common,
                                    rooms.data ?? [],
                                    availability.reservations ?? [],
                                    availability.closures ?? [],
                                    drafts.filter((other) => other.id !== draft.id),
                                    detail.id,
                                  )}
                                  typesReady={
                                    roomTypes.isSuccess && rooms.isSuccess && availability.ready
                                  }
                                  mobileLayout={compactEditor}
                                  blockedRoomIds={overlappingRoomIds(
                                    activeDrafts
                                      .filter((other) => other.id !== draft.id)
                                      .map((other) => other.room),
                                  )}
                                  actions={
                                    !mobileEditor && (
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="icon"
                                        aria-label={`Quitar habitación ${i + 1}`}
                                        disabled={activeDrafts.length <= 1}
                                        onClick={() =>
                                          form.setFieldValue(
                                            `rooms[${values.rooms.findIndex((room) => room.id === draft.id)}].removed`,
                                            true,
                                          )
                                        }
                                      >
                                        <XIcon />
                                      </Button>
                                    )
                                  }
                                />
                              )}
                            </form.Field>
                          </section>
                        ))}
                        {activeDrafts.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-fit"
                            disabled={drafts.length >= 60 || !canAddRoom}
                            onClick={() => {
                              if (!canAddRoom || !nextRoomType || !previousRoom) return;
                              form.pushFieldValue("rooms", {
                                id: crypto.randomUUID(),
                                room: {
                                  roomTypeId: nextRoomType.id,
                                  roomId: null,
                                  adults: String(
                                    Math.min(Number(previousRoom.adults), nextRoomType.maxAdults),
                                  ),
                                  children: String(
                                    Math.min(
                                      Number(previousRoom.children),
                                      nextRoomType.maxChildren,
                                    ),
                                  ),
                                },
                                removed: false,
                              });
                            }}
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
                <PaymentForm
                  detail={detail}
                  disabled={busy}
                  onDirtyChange={setPaymentDirty}
                  onReady={savePayment}
                />
                <PaymentList
                  detail={detail}
                  disabled={busy}
                  onEdit={(entry) => setIntent({ type: "edit-payment", entry })}
                  onDelete={(entry) => setIntent({ type: "delete-payment", entry })}
                />
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
              cancelled={reservationState === "cancelled"}
              rooms={summary.rooms.map((room) => ({
                key: room.key,
                typeName:
                  roomTypes.data?.find((type) => type.id === room.roomTypeId)?.name ??
                  room.roomTypeName ??
                  "Habitación",
                adults: room.adults,
                children: room.children,
                charges: room.charges,
              }))}
              summary={billing ?? null}
              paidCents={billing?.paidCents ?? detail.paidCents}
              schedule={{ plan: detail.ratePlan.plan, amounts: billing ?? null }}
              editableDiscountCents={detail.savedDiscountCents}
              discountDisabled={busy}
              onDiscountSave={
                stayOnly
                  ? undefined
                  : (amountCents) => send([{ type: "set-discount", amountCents }])
              }
              onDiscountDirtyChange={setDiscountDirty}
              currency={detail.currency}
              stayLabel={
                common
                  ? `${stayDate(common.checkIn, "d MMM")} – ${stayDate(common.checkOut, "d MMM yyyy")}`
                  : null
              }
              showPayments
              message={
                summary.calculating
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
              provisional={summary.provisional}
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
        {!stayOnly && independentDraftDirty && (
          <p className="text-xs text-muted-foreground">
            Guarda o descarta los cambios de huéspedes, pagos o descuento antes de cambiar el estado
            o cancelar la reserva.
          </p>
        )}
        {(!mobileEditor ||
          dirty ||
          (mobileEditor && !dirty) ||
          detail.status === "confirmed" ||
          detail.status === "checked_in") && (
          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center justify-between gap-3",
              compactEditor && "max-md:flex-nowrap max-md:gap-2",
            )}
          >
            {!stayOnly && (!mobileEditor || !dirty) && (
              <div
                className={cn("flex flex-wrap items-center gap-2", mobileEditor && "max-md:flex-1")}
              >
                {(!mobileEditor || !dirty) &&
                  (detail.status === "confirmed" || detail.status === "checked_in") && (
                    <Button
                      type="button"
                      variant={mobileEditor ? "default" : "outline"}
                      className={cn(mobileEditor && "max-md:min-w-0 max-md:flex-1")}
                      disabled={busy || dirty || independentDraftDirty}
                      onClick={() =>
                        void changeStatus(
                          detail.status === "confirmed" ? "checked_in" : "checked_out",
                        )
                      }
                    >
                      {statusSaving ? (
                        <Spinner data-icon="inline-start" />
                      ) : detail.status === "confirmed" ? (
                        <LogInIcon data-icon="inline-start" />
                      ) : (
                        <LogOutIcon data-icon="inline-start" />
                      )}
                      {detail.status === "confirmed" ? "Hacer check-in" : "Hacer check-out"}
                    </Button>
                  )}
                {statusSaving && (
                  <p role="status" className="text-xs text-muted-foreground">
                    Guardando estado…
                  </p>
                )}
                {!mobileEditor && reservationActions}
                {mobileEditor && !dirty && (
                  <Button
                    type="button"
                    variant="outline"
                    className="max-md:min-w-0 max-md:flex-1"
                    disabled={busy}
                    onClick={onCancel}
                  >
                    Cerrar
                  </Button>
                )}
              </div>
            )}
            {(!mobileEditor || dirty) && (
              <div
                className={cn(
                  "ml-auto flex flex-wrap items-end justify-end gap-3",
                  mobileEditor && dirty && "min-w-0 flex-1",
                )}
              >
                <div
                  className={cn(
                    "flex flex-wrap gap-2",
                    mobileEditor &&
                      dirty &&
                      "w-full flex-nowrap justify-end [&>button]:min-w-0 [&>button]:flex-1",
                  )}
                >
                  {stayOnly && (
                    <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
                      Cancelar
                    </Button>
                  )}
                  {mobileEditor && discardDetails}
                  {tab === "details" && (!mobileEditor || dirty) && (
                    <Button
                      type="submit"
                      form={formId}
                      disabled={stayDraft.submission.disabled || busy}
                    >
                      {submitting && <Spinner data-icon="inline-start" />}
                      {submitting ? "Guardando…" : "Guardar cambios"}
                    </Button>
                  )}
                  {mobileEditor && dirty && tab !== "details" && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setTab("details");
                        onTabChange?.("details");
                      }}
                    >
                      Volver a Detalles
                    </Button>
                  )}
                  {!mobileEditor && discardDetails}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {restoration && (
        <ReservationPageEditor
          target={{ kind: "status", status: restoration.status }}
          detail={restoration.detail}
          onDirtyChange={() => {}}
          onClose={() => setRestoration(null)}
          onSaved={(saved) => {
            resetDetails(saved);
            setRestoration(null);
          }}
        />
      )}
      {cancellation && (
        <ReservationPageEditor
          target={{ kind: "status", status: "cancelled" }}
          detail={cancellation.detail}
          description={
            cancellation.discardDraft
              ? "Confirmar descarta los demás cambios sin guardar de Detalles."
              : undefined
          }
          onDirtyChange={setCancellationDirty}
          onClose={() => {
            setCancellation(null);
            setCancellationDirty(false);
          }}
          onSaved={(saved) => {
            resetDetails(saved);
            setCancellation(null);
            setCancellationDirty(false);
            onCancelled?.();
          }}
        />
      )}
      {intent && (
        <ActionForm
          key={intent.type + ("entry" in intent ? intent.entry.id : "")}
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
  const reservations = useReservations(room.checkIn, room.checkOut, enabled);
  const closures = useRoomClosures(room.checkIn, room.checkOut, enabled);
  return {
    reservations: reservations.data,
    closures: closures.data,
    blocked: unavailableRoomIds(room, reservations.data ?? [], closures.data ?? [], reservationId),
    ready:
      enabled &&
      !!reservations.data &&
      !!closures.data &&
      !reservations.isPlaceholderData &&
      !closures.isPlaceholderData &&
      !reservations.isError &&
      !closures.isError,
    error: reservations.error?.message ?? closures.error?.message,
  };
}

const CompactRoomFields = withReservationForm({
  defaultValues: emptyDetails,
  props: {
    roomIndex: 0,
    reservationId: "",
    availableTypeIds: new Set<string>(),
    typesReady: false,
    blockedRoomIds: new Set<string>(),
    actions: null as ReactNode,
    errors: {} as Record<string, string>,
    mobileLayout: false,
  },
  render: function CompactRoomFields({
    form,
    roomIndex,
    reservationId,
    availableTypeIds,
    typesReady,
    blockedRoomIds,
    actions,
    errors,
    mobileLayout,
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
    return (
      <FieldGroup
        className={cn(
          "grid gap-3",
          mobileLayout
            ? "grid-cols-1 md:grid-cols-[minmax(0,1fr)_88px_56px_56px_28px]"
            : "grid-cols-2 sm:grid-cols-[minmax(0,1fr)_88px_56px_56px_28px]",
        )}
      >
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
                        !availability.blocked.has(r.id)),
                  )
                  .map((r) => ({
                    value: r.id,
                    label: r.number,
                    disabled:
                      blockedRoomIds.has(r.id) ||
                      availability.blocked.has(r.id) ||
                      r.roomTypeId !== room.roomTypeId,
                  })),
              ]}
            />
          )}
        </form.AppField>
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
        {actions && (
          <div className="col-start-2 self-end justify-self-end sm:col-start-auto">{actions}</div>
        )}
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
      </FieldGroup>
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
  const confirmation = deleting;
  const [defaults] = useState<PaymentValues>(() => ({
    ...paymentDefaults(entry?.amountCents),
    method: entry?.method ?? "cash",
    date: entry?.paymentDate ?? propertyToday(),
    reference: entry?.reference ?? "",
    reason: entry?.notes ?? "",
  }));
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => {
        const result = confirmation
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
    if (!confirmation && form.state.fieldMeta.date?.errors.length) void form.validate("submit");
  }, [confirmation, form, today]);
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);
  const formId = useId();
  const title = deleting ? "Eliminar pago" : "Editar pago";
  function close() {
    if (saving) return;
    if (changed && !confirmation) setLeaving(true);
    else onClose();
  }
  async function submit(value: PaymentValues) {
    if (deleting && entry) {
      await commit([{ type: "delete-payment", paymentId: entry.id }]);
      return;
    }
    const input = paymentPayload(value);
    if (entry) await commit([{ type: "edit-payment", paymentId: entry.id, payment: input }]);
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
  const Root = confirmation ? AlertDialog : Dialog;
  const Content = confirmation ? AlertDialogContent : DialogContent;
  const Header = confirmation ? AlertDialogHeader : DialogHeader;
  const Title = confirmation ? AlertDialogTitle : DialogTitle;
  const Description = confirmation ? AlertDialogDescription : DialogDescription;
  const Footer = confirmation ? AlertDialogFooter : "div";
  const CancelButton = confirmation ? AlertDialogCancel : Button;
  const ConfirmButton = confirmation ? AlertDialogAction : Button;
  return (
    <>
      <Root open onOpenChange={(open) => !open && close()}>
        <Content className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <Header>
            <Title>{title}</Title>
            <Description>
              {deleting
                ? `Se eliminará el pago de ${formatMoney(entry?.amountCents ?? 0)} al confirmar.`
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
              variant={confirmation ? "destructive" : "default"}
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
      <DialogContent closeDisabled={saving}>
        <DialogHeader>
          <DialogTitle>{saving ? "Guardando cambios" : "Hay cambios sin guardar"}</DialogTitle>
          <DialogDescription>
            {saving
              ? "Espera a que termine el guardado antes de salir."
              : "Si sales ahora, se descartarán tus cambios en esta reserva."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-end gap-2">
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
