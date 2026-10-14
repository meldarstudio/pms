import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  type ReactNode,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-form"
import { ArrowUpRightIcon, EllipsisIcon, PlusIcon, XIcon } from "lucide-react"
import { cn } from "cn"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import {
  billingPreviewActions,
  changeCheckIn,
  minimumCheckOut,
  guestValues,
  overlappingRoomIds,
  unavailableRoomIds,
  roomEdits,
} from "@/lib/reservation-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { TextField, ChoiceField } from "@/components/workflow-fields"
import { WorkflowBill } from "@/components/workflow-bill"
import { BookingSummary } from "@/components/booking-summary"
import {
  GuestEntryForm,
  PaymentForm,
  paymentMethods,
} from "@/components/reservation-entry-forms"
import { format } from "@/lib/dates"
import { isValid, parseISO } from "date-fns"
import {
  createWorkflowBooking,
  previewWorkflow,
  type StayingGuest,
  type ReservationPayment,
  type ReservationDetail,
  type WorkflowAction,
  type WorkflowCommand,
  type WorkflowRoom,
} from "@/lib/api"
import {
  useAvailability,
  useReservation,
  useReservations,
  useRoomClosures,
  useRooms,
  useRoomTypes,
  useWorkflowCommand,
} from "@/lib/queries"
import { toast, toastError } from "@/lib/toast"
import { createWorkflowSaver } from "@/lib/workflow-save"
import { formatMoney } from "@/lib/money"
import { setServerErrors } from "@/lib/form-errors"
import {
  useReservationForm,
  withReservationForm,
  blurThenChange,
  submitForm,
} from "@/lib/reservation-form"
import { serverFieldErrors } from "@/lib/api-error"
import { reservationStatusLabel } from "@/lib/reservation-list"
import {
  detailsSchema,
  detailsDefaults,
  emptyDetails,
  workflowDrafts,
  schemaErrors,
  paymentSchema,
  paymentDefaults,
  paymentPayload,
  cancellationSchema,
  utcToday,
  type PaymentValues,
} from "@/lib/reservation-form-schemas"

export type BookingTarget =
  | {
      mode: "create"
      roomId: string
      roomTypeId: string
      number: string
      typeName: string
      checkIn: string
    }
  | { mode: "new" }
  | {
      mode: "edit"
      reservationId: string
      roomId: string
      number: string
      typeName: string
    }
const stayDate = (value: string, pattern: string) => {
  const date = parseISO(value)
  return isValid(date) ? format(date, pattern) : "—"
}
const today = () => new Date().toISOString().slice(0, 10)
const paymentToday = utcToday
function useDraftCommand(actionsKey: string) {
  return useMemo<WorkflowCommand>(
    () => ({
      requestId: crypto.randomUUID(),
      actions: JSON.parse(actionsKey) as WorkflowAction[],
    }),
    [actionsKey]
  )
}
type Intent =
  | { type: "edit-payment" | "delete-payment"; entry: ReservationPayment }
  | { type: "cancel" }

export function ReservationStatus({ detail }: { detail: ReservationDetail }) {
  return (
    <Badge variant="secondary">{reservationStatusLabel(detail.status)}</Badge>
  )
}

export function RoomBookingDialog({
  target,
  onClose,
  onViewReservation,
}: {
  target: BookingTarget | null
  timeZone: string
  onClose: () => void
  onViewReservation: (id: string) => void
}) {
  const detail = useReservation(
    target?.mode === "edit" ? target.reservationId : null
  )
  const dirty = useRef(false)
  const [tab, setTab] = useState("details")
  const [leave, setLeave] = useState<(() => void) | null>(null)
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value
  }, [])
  function navigate(action: () => void) {
    if (dirty.current) setLeave(() => action)
    else action()
  }
  function close() {
    dirty.current = false
    setTab("details")
    onClose()
  }
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => !open && navigate(close)}
    >
      <DialogContent
        className={cn(
          "max-h-[94svh]",
          target?.mode === "edit"
            ? "flex flex-col overflow-hidden sm:max-w-4xl"
            : "overflow-y-auto sm:max-w-5xl"
        )}
      >
        <DialogHeader
          className={target?.mode === "edit" ? "sr-only" : undefined}
        >
          <div className="flex flex-wrap items-center gap-3 pr-8">
            <DialogTitle>
              {target?.mode === "edit"
                ? `Editar reserva · ${detail.data?.code ?? ""}`
                : "Nueva reserva"}
            </DialogTitle>
            {target?.mode === "edit" && detail.data && (
              <ReservationStatus detail={detail.data} />
            )}
          </div>
          <DialogDescription
            className={target?.mode === "edit" ? "sr-only" : undefined}
          >
            {target?.mode === "edit"
              ? "Detalles de la reserva, huéspedes y pagos."
              : "Reserva por tipo y asigna una habitación ahora o antes del check-in."}
          </DialogDescription>
        </DialogHeader>
        {target?.mode === "edit" ? (
          detail.isPending ? (
            <Skeleton className="h-80 w-full" />
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
                onClose={() => navigate(close)}
                onCancelled={close}
                onViewReservation={(id) =>
                  navigate(() => onViewReservation(id))
                }
              />
            )
          )
        ) : (
          target && (
            <NewBooking
              key={
                target.mode === "create"
                  ? target.roomId + target.checkIn
                  : "new"
              }
              target={target}
              onCreated={onViewReservation}
            />
          )
        )}
      </DialogContent>
      {leave && (
        <DiscardChanges
          onStay={() => setLeave(null)}
          onLeave={() => {
            dirty.current = false
            setLeave(null)
            leave()
          }}
        />
      )}
    </Dialog>
  )
}

function RoomFields({
  room,
  onChange,
  blockedRoomIds = new Set<string>(),
}: {
  room: WorkflowRoom
  onChange: (room: WorkflowRoom) => void
  blockedRoomIds?: Set<string>
}) {
  const types = useRoomTypes(),
    rooms = useRooms()
  const set = (patch: Partial<WorkflowRoom>) => onChange({ ...room, ...patch })
  return (
    <FieldGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <ChoiceField
        label="Tipo"
        value={room.roomTypeId}
        options={(types.data ?? []).map((t) => ({
          value: t.id,
          label: t.name,
        }))}
        onChange={(roomTypeId) => {
          if (roomTypeId !== room.roomTypeId) set({ roomTypeId, roomId: null })
        }}
      />
      <ChoiceField
        label="Hab."
        value={room.roomId ?? "unassigned"}
        options={[
          { value: "unassigned", label: "Sin asignar" },
          ...(rooms.data ?? [])
            .filter(
              (r) =>
                r.roomTypeId === room.roomTypeId && !blockedRoomIds.has(r.id)
            )
            .map((r) => ({
              value: r.id,
              label: r.number,
            })),
        ]}
        onChange={(v) => set({ roomId: v === "unassigned" ? null : v })}
      />
      <TextField
        label="Adultos"
        type="number"
        min={1}
        value={room.adults}
        onChange={(v) => set({ adults: Number(v) })}
      />
      <TextField
        label="Niños"
        type="number"
        min={0}
        value={room.children}
        onChange={(v) => set({ children: Number(v) })}
      />
    </FieldGroup>
  )
}

function NewBooking({
  target,
  onCreated,
}: {
  target: Exclude<BookingTarget, { mode: "edit" }>
  onCreated: (id: string) => void
}) {
  const client = useQueryClient()
  const start = target.mode === "create" ? target.checkIn : today()
  const [fullName, setFullName] = useState(""),
    [phone, setPhone] = useState(""),
    [email, setEmail] = useState("")
  const [stay, setStay] = useState({
    checkIn: start,
    checkOut: minimumCheckOut(start),
  })
  const [drafts, setDrafts] = useState<WorkflowRoom[]>([
    {
      roomTypeId: target.mode === "create" ? target.roomTypeId : "",
      roomId: target.mode === "create" ? target.roomId : null,
      adults: 1,
      children: 0,
    },
  ])
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const retry = useRef<{ payload: string; requestId: string } | null>(null)
  async function save() {
    setBusy(true)
    setError("")
    try {
      const data = {
        guest: {
          fullName,
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
        },
        ...stay,
        rooms: drafts,
      }
      const payload = JSON.stringify(data)
      if (retry.current?.payload !== payload)
        retry.current = { payload, requestId: crypto.randomUUID() }
      const result = await createWorkflowBooking({
        ...data,
        requestId: retry.current!.requestId,
      })
      await client.invalidateQueries()
      onCreated(result.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5">
        <FieldGroup className="grid grid-cols-2 gap-3">
          <TextField
            label="Nombre completo"
            value={fullName}
            onChange={setFullName}
          />
          <TextField label="Teléfono" value={phone} onChange={setPhone} />
          <TextField
            label="Correo"
            type="email"
            value={email}
            onChange={setEmail}
          />
        </FieldGroup>
        <FieldGroup className="grid grid-cols-2 gap-3">
          <TextField
            label="Check-in"
            type="date"
            required
            value={stay.checkIn}
            onChange={(checkIn) => setStay(changeCheckIn(stay, checkIn))}
          />
          <TextField
            label="Check-out"
            type="date"
            required
            min={minimumCheckOut(stay.checkIn)}
            value={stay.checkOut}
            onChange={(checkOut) => setStay({ ...stay, checkOut })}
          />
        </FieldGroup>
        <Separator />
        {drafts.map((room, i) => (
          <section key={i} className="flex flex-col gap-3 border p-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Habitación {i + 1}</h3>
              {drafts.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar habitación ${i + 1}`}
                  onClick={() => setDrafts((d) => d.filter((_, n) => n !== i))}
                >
                  <XIcon />
                </Button>
              )}
            </div>
            <RoomFields
              room={room}
              blockedRoomIds={overlappingRoomIds(
                drafts.filter((_, n) => n !== i)
              )}
              onChange={(r) =>
                setDrafts((d) => d.map((v, n) => (n === i ? r : v)))
              }
            />
            <NewRoomPrice room={room} stay={stay} />
          </section>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() =>
            setDrafts((d) => [...d, { ...d[d.length - 1], roomId: null }])
          }
        >
          <PlusIcon data-icon="inline-start" />
          Añadir habitación
        </Button>
      </fieldset>
      <FieldError>{error}</FieldError>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={
            busy || !fullName.trim() || drafts.some((d) => !d.roomTypeId)
          }
        >
          {busy ? "Guardando…" : "Crear reserva"}
        </Button>
      </div>
    </form>
  )
}
function NewRoomPrice({
  room,
  stay,
}: {
  room: WorkflowRoom
  stay: { checkIn: string; checkOut: string }
}) {
  const q = useAvailability(stay.checkIn, stay.checkOut),
    type = q.data?.roomTypes.find((t) => t.id === room.roomTypeId)
  return q.error ? (
    <FieldError>{q.error.message}</FieldError>
  ) : type ? (
    <p className="text-muted-foreground">
      {q.data?.nights} noches · {formatMoney(type.totalCents)} · {type.free}{" "}
      disponibles de este tipo. La disponibilidad se valida al guardar.
    </p>
  ) : null
}

export function BookingEditor({
  detail,
  onClose,
  onCancelled,
  onViewReservation,
  onDirtyChange,
  full = false,
  initialTab = "details",
  onTabChange,
}: {
  detail: ReservationDetail
  onRefresh: () => void
  onClose?: () => void
  onCancelled?: () => void
  onViewReservation?: (id: string) => void
  onDirtyChange?: (dirty: boolean) => void
  full?: boolean
  initialTab?: string
  onTabChange?: (tab: string) => void
}) {
  const contact = detail.guest
  const [guestDirty, setGuestDirty] = useState(false)
  const roomTypes = useRoomTypes()
  const [defaults, setDefaults] = useState(() => detailsDefaults(detail))
  const schema = useMemo(
    () => detailsSchema(roomTypes.data ?? []),
    [roomTypes.data]
  )
  const formId = useId()
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: { onDynamic: schema },
    onSubmit: async () => saveChanges(),
  })
  const values = useSelector(form.store, (state) => state.values)
  const submitting = useSelector(form.store, (state) => state.isSubmitting)
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue)
  const drafts = workflowDrafts(values)
  const common = { checkIn: values.checkIn, checkOut: values.checkOut }
  const reservationState = values.status
  const notes = values.notes
  const [intent, setIntent] = useState<Intent | null>(null)
  const [tab, setTab] = useState(initialTab)
  const [paymentDirty, setPaymentDirty] = useState(false)
  const [discountDirty, setDiscountDirty] = useState(false)
  const [actionDirty, setActionDirty] = useState(false)
  const validation = schema.safeParse(values)
  const localErrors = schemaErrors(validation)
  const countsValid = validation.success && !!roomTypes.data
  const changes = roomEdits(detail, drafts)
  if (common.checkIn !== detail.checkIn || common.checkOut !== detail.checkOut)
    changes.unshift({ type: "dates", ...common })
  if (reservationState !== detail.status)
    changes.push({
      type: "set-status",
      status: reservationState as Extract<
        WorkflowAction,
        { type: "set-status" }
      >["status"],
    })
  if (notes !== (detail.notes ?? "")) changes.push({ type: "notes", notes })
  const dirty = changes.length > 0 || (!validation.success && !unchanged)
  const previewActions = billingPreviewActions(changes)
  const billingDirty = previewActions.length > 0
  const previewActionsKey = JSON.stringify(previewActions)
  const changesKey = JSON.stringify(changes)
  const editCommand = useDraftCommand(changesKey)
  const billingCommand = useDraftCommand(previewActionsKey)
  const [previewCommand, setPreviewCommand] = useState(billingCommand)
  useEffect(() => {
    const timer = setTimeout(() => setPreviewCommand(billingCommand), 300)
    return () => clearTimeout(timer)
  }, [billingCommand])
  const editPreview = useQuery({
    queryKey: ["workflow-edit-preview", detail.id, previewCommand],
    queryFn: () => previewWorkflow(detail.id, previewCommand),
    enabled:
      billingDirty &&
      previewCommand.actions.length > 0 &&
      previewCommand === billingCommand &&
      countsValid,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const previewCurrent = previewCommand === billingCommand
  const previewFields = useMemo(
    () =>
      billingDirty && previewCurrent
        ? serverFieldErrors(editPreview.error, "details")
        : null,
    [editPreview.error, billingDirty, previewCurrent]
  )
  useEffect(() => {
    if (previewFields) setServerErrors(form, previewFields)
    else form.setErrorMap({ onServer: undefined })
  }, [form, previewFields])
  const billing = billingDirty
    ? previewCurrent
      ? editPreview.data
      : undefined
    : detail
  const billingRooms = billing?.rooms ?? []
  const saveMutation = useWorkflowCommand()
  const guestMutation = useWorkflowCommand()
  const paymentMutation = useWorkflowCommand()
  const discountMutation = useWorkflowCommand()
  const discountSave = useRef<Promise<ReservationDetail> | null>(null)
  const busy =
    submitting ||
    saveMutation.isPending ||
    guestMutation.isPending ||
    paymentMutation.isPending
  const [guestSaver] = useState(createWorkflowSaver)
  const [paymentSaver] = useState(createWorkflowSaver)
  const [discountSaver] = useState(createWorkflowSaver)
  async function saveGuests(guests: StayingGuest[]) {
    await discountSave.current
    await guestSaver(
      [{ type: "set-guests", guests: guestValues(guests) }],
      (command) => guestMutation.mutateAsync({ id: detail.id, command })
    )
  }
  useEffect(() => {
    onDirtyChange?.(
      dirty ||
        paymentDirty ||
        guestDirty ||
        discountDirty ||
        actionDirty ||
        busy ||
        discountMutation.isPending
    )
  }, [
    dirty,
    paymentDirty,
    guestDirty,
    discountDirty,
    actionDirty,
    busy,
    discountMutation.isPending,
    onDirtyChange,
  ])
  function resetDetails(saved: ReservationDetail) {
    const next = detailsDefaults(saved)
    setDefaults(next)
    form.reset(next)
  }
  async function savePayment(title: string, actions: WorkflowAction[]) {
    await discountSave.current
    await paymentSaver(actions, (command) =>
      paymentMutation.mutateAsync({ id: detail.id, command })
    )
    toast.add({ title, type: "success" })
  }
  async function saveDiscount(amountCents: number) {
    const pending = discountSaver(
      [{ type: "set-discount", amountCents }],
      (command) => discountMutation.mutateAsync({ id: detail.id, command })
    )
    discountSave.current = pending
    try {
      await pending
    } finally {
      if (discountSave.current === pending) discountSave.current = null
    }
  }

  const activeDrafts = drafts.filter((draft) => !draft.removed)
  const unassigned = activeDrafts.some((draft) => !draft.room.roomId)
  const cancel = () => setIntent({ type: "cancel" })
  async function saveChanges() {
    if (!countsValid) return
    if (
      tab !== "details" ||
      !dirty ||
      !billing ||
      (billingDirty && editPreview.isFetching) ||
      saveMutation.isPending ||
      guestMutation.isPending ||
      paymentMutation.isPending
    )
      return
    try {
      await discountSave.current
      const saved = await saveMutation.mutateAsync({
        id: detail.id,
        command: editCommand,
      })
      resetDetails(saved)
      toast.add({ title: "Reserva guardada", type: "success" })
    } catch (e) {
      const fields = serverFieldErrors(e, "details")
      if (fields) setServerErrors(form, fields)
      else toastError("No se pudo guardar", e)
    }
  }
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4",
        !full && "min-h-0 flex-1 overflow-hidden"
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 pr-8">
        <span className="text-lg font-semibold">
          {`${contact.fullName}`.trim()}
        </span>
        <span className="text-lg text-muted-foreground"> · {detail.code}</span>
        {!full && onViewReservation && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Ver reserva completa"
            title="Ver reserva completa"
            onClick={() => onViewReservation(detail.id)}
          >
            <ArrowUpRightIcon />
          </Button>
        )}
      </div>
      {(contact.phone || contact.email) && (
        <p className="-mt-2 shrink-0 text-sm wrap-anywhere text-muted-foreground">
          {[contact.phone, contact.email].filter(Boolean).join(" · ")}
        </p>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value)
          onTabChange?.(value)
        }}
        className={cn("gap-4", !full && "min-h-0 overflow-y-auto")}
      >
        <TabsList variant="line" className="shrink-0">
          <TabsTrigger value="details">
            Detalles
            {dirty ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-muted-foreground/70"
                aria-label="Cambios sin guardar"
                title="Cambios sin guardar"
              />
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="guests">Huéspedes</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
        </TabsList>
        <div className="grid min-w-0 shrink-0 gap-6 p-px lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <TabsContent
              value="details"
              keepMounted
              className="flex flex-col gap-5"
            >
              <form
                id={formId}
                noValidate
                onSubmit={(event) =>
                  void submitForm(event, () => form.handleSubmit())
                }
              >
                <fieldset
                  disabled={saveMutation.isPending}
                  className="flex min-w-0 flex-col gap-5"
                >
                  <FieldGroup className="grid grid-cols-2 gap-3">
                    <form.AppField
                      name="checkIn"
                      listeners={{
                        onChange: ({ value }) => {
                          const next = changeCheckIn(
                            {
                              checkIn: value,
                              checkOut: form.getFieldValue("checkOut"),
                            },
                            value
                          )
                          form.setFieldValue("checkOut", next.checkOut)
                        },
                      }}
                    >
                      {(field) => (
                        <field.Text label="Check-in" type="date" required />
                      )}
                    </form.AppField>
                    <form.AppField name="checkOut">
                      {(field) => (
                        <field.Text
                          label="Check-out"
                          type="date"
                          required
                          min={minimumCheckOut(common.checkIn)}
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
                            className="flex min-w-0 flex-col gap-3"
                          >
                            <form.Field
                              name={`rooms[${values.rooms.findIndex((room) => room.id === draft.id)}].room`}
                            >
                              {() => (
                                <CompactRoomFields
                                  form={form}
                                  roomIndex={values.rooms.findIndex(
                                    (room) => room.id === draft.id
                                  )}
                                  errors={localErrors}
                                  reservationId={detail.id}
                                  blockedRoomIds={overlappingRoomIds(
                                    activeDrafts
                                      .filter((other) => other.id !== draft.id)
                                      .map((other) => other.room)
                                  )}
                                  occupied={reservationState === "checked_in"}
                                  actions={
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      aria-label={`Quitar habitación ${i + 1}`}
                                      disabled={activeDrafts.length <= 1}
                                      onClick={() =>
                                        form.setFieldValue(
                                          `rooms[${values.rooms.findIndex((room) => room.id === draft.id)}].removed`,
                                          true
                                        )
                                      }
                                    >
                                      <XIcon />
                                    </Button>
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
                            disabled={drafts.length >= 60}
                            onClick={() =>
                              form.pushFieldValue("rooms", {
                                id: crypto.randomUUID(),
                                room: {
                                  ...values.rooms.find((room) => !room.removed)!
                                    .room,
                                  roomId: null,
                                },
                                removed: false,
                              })
                            }
                          >
                            <PlusIcon data-icon="inline-start" />
                            Agregar habitación
                          </Button>
                        )}
                        {localErrors.rooms && (
                          <FieldError>{localErrors.rooms}</FieldError>
                        )}
                      </section>
                    )}
                  </form.Field>
                  <section className="flex flex-col gap-3">
                    <FieldGroup>
                      <form.AppField name="notes">
                        {(field) => (
                          <field.Text
                            label="Notas"
                            type="textarea"
                            max={2000}
                          />
                        )}
                      </form.AppField>
                    </FieldGroup>
                  </section>
                </fieldset>
              </form>
            </TabsContent>
            <TabsContent
              value="guests"
              keepMounted
              className="flex flex-col gap-5"
            >
              <GuestFields
                detail={detail}
                disabled={busy}
                onSave={saveGuests}
                onDirtyChange={setGuestDirty}
              />
            </TabsContent>
            <TabsContent
              value="payments"
              keepMounted
              className="flex flex-col gap-5"
            >
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
                onDelete={(entry) =>
                  setIntent({ type: "delete-payment", entry })
                }
              />
            </TabsContent>
          </div>
          <aside className="min-w-0 md:self-start">
            <BookingSummary
              cancelled={reservationState === "cancelled"}
              rooms={billingRooms.map((room) => ({
                key: room.id,
                typeName:
                  roomTypes.data?.find((type) => type.id === room.roomTypeId)
                    ?.name ??
                  room.roomTypeName ??
                  "Habitación",
                adults: room.adults,
                children: room.children,
                charges: {
                  subtotalCents: room.subtotalCents,
                  discountCents: room.discountCents,
                  totalCents: room.totalCents,
                },
              }))}
              summary={billing ?? null}
              paidCents={billing?.paidCents ?? detail.paidCents}
              editableDiscountCents={detail.savedDiscountCents}
              discountDisabled={busy || discountMutation.isPending}
              onDiscountSave={saveDiscount}
              onDiscountDirtyChange={setDiscountDirty}
              currency={detail.currency}
              stayLabel={
                common
                  ? `${stayDate(common.checkIn, "d MMM")} – ${stayDate(common.checkOut, "d MMM yyyy")}`
                  : null
              }
              showPayments
              message={
                !countsValid || (editPreview.error && previewCurrent)
                  ? null
                  : "Calculando…"
              }
            />
            {billingDirty &&
              countsValid &&
              previewCurrent &&
              !previewFields &&
              editPreview.error && (
                <FieldError>{editPreview.error.message}</FieldError>
              )}
          </aside>
        </div>
      </Tabs>
      <div className="flex shrink-0 flex-wrap items-end gap-3">
        {!detail.cancelledAt && (
          <Button
            type="button"
            variant="destructive"
            disabled={busy || (dirty && !billing)}
            onClick={cancel}
          >
            Cancelar reserva
          </Button>
        )}
        <div className="ml-auto flex flex-wrap items-end justify-end gap-3">
          {tab === "details" && (
            <FieldGroup className="w-48">
              <form.AppField name="status">
                {(field) => (
                  <field.Choice
                    label="Estado de la reserva"
                    hideLabel
                    disabled={busy}
                    options={[
                      { value: "confirmed", label: "Confirmada" },
                      {
                        value: "checked_in",
                        label: "Check-in",
                        disabled: unassigned,
                      },
                      { value: "checked_out", label: "Check-out" },
                      { value: "no_show", label: "No se presentó" },
                      ...(reservationState === "cancelled"
                        ? [
                            {
                              value: "cancelled",
                              label: "Cancelada",
                              disabled: true,
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </form.AppField>
            </FieldGroup>
          )}
          <div className="flex flex-wrap gap-2">
            {tab === "details" && (
              <Button
                type="submit"
                form={formId}
                disabled={
                  !dirty ||
                  roomTypes.isPending ||
                  roomTypes.isError ||
                  (countsValid &&
                    billingDirty &&
                    previewCurrent &&
                    !!editPreview.error) ||
                  (countsValid && !billing) ||
                  (billingDirty && editPreview.isFetching) ||
                  busy
                }
              >
                {saveMutation.isPending ? "Guardando…" : "Guardar"}
              </Button>
            )}
            {!full && onClose && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onClose}
              >
                Cerrar
              </Button>
            )}
          </div>
        </div>
      </div>
      {tab === "details" && unassigned && (
        <p className="text-xs text-muted-foreground">
          Asigna una habitación a cada estancia antes del check-in.
        </p>
      )}
      {intent && (
        <ActionForm
          key={intent.type + ("entry" in intent ? intent.entry.id : "")}
          detail={detail}
          intent={intent}
          onClose={() => {
            setIntent(null)
            setActionDirty(false)
          }}
          onDirtyChange={setActionDirty}
          onSaved={(saved) => {
            resetDetails(saved)
            setActionDirty(false)
            onCancelled?.()
          }}
          onReady={async (title, actions) => {
            await savePayment(title, actions)
            setIntent(null)
            setActionDirty(false)
          }}
        />
      )}
    </div>
  )
}

function useRoomAssignmentOptions(
  room: { checkIn: string; checkOut: string },
  reservationId?: string
) {
  const nights =
    (Date.parse(`${room.checkOut}T00:00:00Z`) -
      Date.parse(`${room.checkIn}T00:00:00Z`)) /
    86400000
  const enabled = nights >= 1 && nights <= 60
  const reservations = useReservations(room.checkIn, room.checkOut, enabled)
  const closures = useRoomClosures(room.checkIn, room.checkOut, enabled)
  return {
    blocked: unavailableRoomIds(
      room,
      reservations.data ?? [],
      closures.data ?? [],
      reservationId
    ),
    ready:
      enabled &&
      !!reservations.data &&
      !!closures.data &&
      !reservations.isPlaceholderData &&
      !closures.isPlaceholderData &&
      !reservations.isError &&
      !closures.isError,
    error: reservations.error?.message ?? closures.error?.message,
  }
}

const CompactRoomFields = withReservationForm({
  defaultValues: emptyDetails,
  props: {
    roomIndex: 0,
    reservationId: "",
    blockedRoomIds: new Set<string>(),
    occupied: false,
    actions: null as ReactNode,
    errors: {} as Record<string, string>,
  },
  render: function CompactRoomFields({
    form,
    roomIndex,
    reservationId,
    blockedRoomIds,
    occupied,
    actions,
    errors,
  }) {
    const types = useRoomTypes(),
      rooms = useRooms()
    const room = useSelector(
      form.store,
      (state) => state.values.rooms[roomIndex].room
    )
    const stay = useSelector(form.store, (state) => ({
      checkIn: state.values.checkIn,
      checkOut: state.values.checkOut,
    }))
    const availability = useRoomAssignmentOptions(stay, reservationId)
    const roomTypeId = useRef(room.roomTypeId)
    useEffect(() => {
      roomTypeId.current = room.roomTypeId
    }, [room.roomTypeId])
    const capacity = errors[`rooms[${roomIndex}].room`]
    const capacityId = useId()
    return (
      <FieldGroup className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_88px_56px_56px_28px]">
        <form.AppField
          name={`rooms[${roomIndex}].room.roomTypeId`}
          listeners={{
            onChange: ({ value }) => {
              if (value === roomTypeId.current) return
              form.setFieldValue(`rooms[${roomIndex}].room.roomId`, null)
            },
          }}
        >
          {(field) => (
            <field.Choice
              label="Tipo"
              options={(types.data ?? []).map((t) => ({
                value: t.id,
                label: t.name,
              }))}
            />
          )}
        </form.AppField>
        <form.AppField name={`rooms[${roomIndex}].room.roomId`}>
          {(field) => (
            <field.Choice
              label="Hab."
              nullable
              disabled={!availability.ready}
              options={[
                ...(!occupied ? [{ value: "none", label: "Sin asignar" }] : []),
                ...(rooms.data ?? [])
                  .filter(
                    (r) =>
                      r.roomTypeId === room.roomTypeId &&
                      !blockedRoomIds.has(r.id) &&
                      !availability.blocked.has(r.id)
                  )
                  .map((r) => ({
                    value: r.id,
                    label: r.number,
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
        <div className="col-start-2 self-end justify-self-end sm:col-start-auto">
          {actions}
        </div>
        {capacity && (
          <FieldError id={capacityId} className="col-span-full">
            {capacity}
          </FieldError>
        )}
        {availability.error && (
          <FieldError className="col-span-full">
            {availability.error}
          </FieldError>
        )}
      </FieldGroup>
    )
  },
})

function GuestFields({
  detail,
  disabled,
  onSave,
  onDirtyChange,
}: {
  detail: ReservationDetail
  disabled: boolean
  onSave: (guests: StayingGuest[]) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
}) {
  const [editing, setEditing] = useState<StayingGuest | null>(null)
  const [addDirty, setAddDirty] = useState(false)
  const [editDirty, setEditDirty] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const dirty = addDirty || editDirty
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  const reset = () => {
    setEditing(null)
    setEditDirty(false)
    setLeaving(false)
  }
  async function remove(id: string) {
    try {
      await onSave(detail.stayingGuests.filter((guest) => guest.id !== id))
      if (editing?.id === id) reset()
      toast.add({ title: "Huésped eliminado", type: "success" })
    } catch (cause) {
      toastError("No se pudo eliminar el huésped", cause)
    }
  }
  const roomLabel = (id: string | null) =>
    detail.rooms.find((room) => room.id === id)?.roomNumber ?? "Sin indicar"
  const closeEdit = () => {
    if (disabled) return
    if (editDirty) setLeaving(true)
    else reset()
  }
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
          if (!open) closeEdit()
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
      {leaving && (
        <DiscardChanges onStay={() => setLeaving(false)} onLeave={reset} />
      )}

      {detail.stayingGuests.length ? (
        <section className="flex flex-col gap-3">
          <h3 className="font-medium">Huéspedes registrados</h3>
          <ul aria-label="Huéspedes registrados" className="flex flex-col">
            {detail.stayingGuests.map((guest, index) => (
              <li key={guest.id}>
                {index > 0 && <Separator />}
                <div className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium wrap-anywhere">
                      {guest.fullName}
                    </p>
                    <p className="text-xs wrap-anywhere text-muted-foreground">
                      {[
                        guest.reservationRoomId
                          ? `Hab. ${roomLabel(guest.reservationRoomId)}`
                          : "Sin habitación indicada",
                        [guest.documentType, guest.documentNumber]
                          .filter(Boolean)
                          .join(" "),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={disabled || dirty}
                          aria-label={`Acciones de ${guest.fullName}`}
                        />
                      }
                    >
                      <EllipsisIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(guest)
                          }}
                        >
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => void remove(guest.id)}
                        >
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Sin huéspedes registrados</EmptyTitle>
            <EmptyDescription>
              Agrega a las personas que se alojan. Pueden ser distintas del
              contacto principal.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  )
}

function PaymentList({
  detail,
  disabled,
  onEdit,
  onDelete,
}: {
  detail: ReservationDetail
  disabled: boolean
  onEdit: (entry: ReservationPayment) => void
  onDelete: (entry: ReservationPayment) => void
}) {
  const entries = detail.payments
  if (!entries.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Sin pagos registrados</EmptyTitle>
          <EmptyDescription>
            Los pagos registrados aparecerán aquí.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium">Pagos registrados</h3>
      <Table aria-label="Pagos registrados">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead className="text-right">Importe</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...entries]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((e) => (
              <TableRow key={e.id}>
                <TableCell>{stayDate(e.paymentDate, "d MMM yyyy")}</TableCell>
                <TableCell>
                  {paymentMethods.find((method) => method.value === e.method)
                    ?.label ??
                    e.method ??
                    "—"}
                </TableCell>
                <TableCell className="max-w-40 break-words whitespace-normal">
                  {e.reference?.toUpperCase() || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(e.amountCents, detail.currency)}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={disabled}
                          aria-label={`Acciones del pago de ${formatMoney(e.amountCents, detail.currency)} del ${e.paymentDate}`}
                        />
                      }
                    >
                      <EllipsisIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => onEdit(e)}>
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDelete(e)}
                        >
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </section>
  )
}

function ActionForm({
  detail,
  intent,
  onClose,
  onReady,
  onSaved,
  onDirtyChange,
}: {
  detail: ReservationDetail
  intent: Intent
  onClose: () => void
  onReady: (title: string, actions: WorkflowAction[]) => Promise<void>
  onSaved: (detail: ReservationDetail) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const entry = "entry" in intent ? intent.entry : null
  const [leaving, setLeaving] = useState(false)
  const isCancellation = intent.type === "cancel"
  const deleting = intent.type === "delete-payment"
  const confirmation = isCancellation || deleting
  const [defaults] = useState<PaymentValues>(() => ({
    ...paymentDefaults(entry?.amountCents),
    method: entry?.method ?? "cash",
    date: entry?.paymentDate ?? paymentToday(),
    reference: entry?.reference ?? "",
    reason: entry?.notes ?? "",
  }))
  const form = useReservationForm({
    defaultValues: defaults,
    validationLogic: blurThenChange(),
    validators: {
      onDynamic: ({ value }) => {
        const result = confirmation
          ? cancellationSchema.safeParse(value)
          : paymentSchema.safeParse(value)
        return result.success
          ? undefined
          : {
              fields: Object.fromEntries(
                result.error.issues.map((issue) => [
                  issue.path.join("."),
                  issue.message,
                ])
              ),
            }
      },
    },
    onSubmit: async ({ value }) => submit(value),
  })
  const reason = useSelector(form.store, (state) => state.values.reason)
  const cancellationValid = cancellationSchema.safeParse({ reason }).success
  const saving = useSelector(form.store, (state) => state.isSubmitting)
  const changed = !useSelector(form.store, (state) => state.isDefaultValue)
  useEffect(
    () => onDirtyChange(changed || saving),
    [changed, saving, onDirtyChange]
  )
  const formId = useId()
  const cancellationCommand = useMemo<WorkflowCommand>(
    () => ({
      requestId: crypto.randomUUID(),
      actions: [
        {
          type: "set-status",
          status: "cancelled",
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      ],
    }),
    [reason]
  )
  const cancellationPreview = useQuery({
    queryKey: ["cancellation-preview", detail.id, cancellationCommand],
    queryFn: () => previewWorkflow(detail.id, cancellationCommand),
    enabled: isCancellation && cancellationValid,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const cancellation = useWorkflowCommand()
  const title = isCancellation
    ? "Cancelar reserva"
    : deleting
      ? "Eliminar pago"
      : "Editar pago"
  function close() {
    if (cancellation.isPending || saving) return
    if (changed && !confirmation) setLeaving(true)
    else onClose()
  }
  async function submit(value: PaymentValues) {
    if (isCancellation) {
      if (
        !cancellationPreview.data ||
        cancellationPreview.isFetching ||
        cancellationPreview.error ||
        cancellation.isPending
      )
        return
      try {
        const saved = await cancellation.mutateAsync({
          id: detail.id,
          command: cancellationCommand,
        })
        onSaved(saved)
        toast.add({
          title: "Reserva cancelada",
          type: "success",
        })
        onClose()
      } catch (cause) {
        toastError("No se pudo cancelar", cause)
      }
      return
    }
    if (deleting && entry) {
      await commit([{ type: "delete-payment", paymentId: entry.id }])
      return
    }
    const input = paymentPayload(value)
    if (entry)
      await commit([
        { type: "edit-payment", paymentId: entry.id, payment: input },
      ])
  }
  async function commit(actions: WorkflowAction[]) {
    try {
      await onReady(title, actions)
    } catch (cause) {
      const fields = deleting ? null : serverFieldErrors(cause, "payment")
      if (fields) setServerErrors(form, fields)
      else
        toastError(
          deleting
            ? "No se pudo eliminar el pago"
            : "No se pudo guardar el pago",
          cause
        )
    }
  }
  const Root = confirmation ? AlertDialog : Dialog
  const Content = confirmation ? AlertDialogContent : DialogContent
  const Header = confirmation ? AlertDialogHeader : DialogHeader
  const Title = confirmation ? AlertDialogTitle : DialogTitle
  const Description = confirmation ? AlertDialogDescription : DialogDescription
  const Footer = confirmation ? AlertDialogFooter : "div"
  const CancelButton = confirmation ? AlertDialogCancel : Button
  const ConfirmButton = confirmation ? AlertDialogAction : Button
  return (
    <>
      <Root open onOpenChange={(open) => !open && close()}>
        <Content className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <Header>
            <Title>{title}</Title>
            <Description>
              {isCancellation
                ? "Se liberará la disponibilidad y se quitarán los cargos; los pagos quedan como saldo a favor. Confirmar descarta los demás cambios sin guardar."
                : deleting
                  ? `Se eliminará el pago de ${formatMoney(entry?.amountCents ?? 0)} al confirmar.`
                  : "El cambio se guardará al confirmar. Los cambios de Detalles se guardan por separado."}
            </Description>
          </Header>
          <form
            id={formId}
            noValidate
            onSubmit={(event) =>
              void submitForm(event, () => form.handleSubmit())
            }
          >
            {!deleting && (
              <fieldset disabled={saving || cancellation.isPending}>
                <FieldGroup>
                  {!isCancellation && (
                    <>
                      <form.AppField name="amount">
                        {(field) => (
                          <field.Text label="Importe S/" placeholder="0.00" />
                        )}
                      </form.AppField>
                      <form.AppField name="method">
                        {(field) => (
                          <field.Choice
                            label="Método"
                            options={paymentMethods}
                          />
                        )}
                      </form.AppField>
                      <form.AppField name="date">
                        {(field) => (
                          <field.Text
                            label="Fecha del pago"
                            type="date"
                            required
                            max={paymentToday()}
                          />
                        )}
                      </form.AppField>
                      <form.AppField name="reference">
                        {(field) => (
                          <field.Text label="Referencia · Opcional" />
                        )}
                      </form.AppField>
                    </>
                  )}
                  <form.AppField name="reason">
                    {(field) => (
                      <field.Text
                        label={
                          isCancellation
                            ? "Motivo · Opcional"
                            : "Nota · Opcional"
                        }
                        disabled={cancellation.isPending || saving}
                      />
                    )}
                  </form.AppField>
                </FieldGroup>
              </fieldset>
            )}
          </form>
          {isCancellation &&
            (cancellationPreview.data ? (
              <WorkflowBill bill={cancellationPreview.data} />
            ) : cancellationPreview.error ? (
              <FieldError>{cancellationPreview.error.message}</FieldError>
            ) : cancellationValid ? (
              <p role="status" className="text-muted-foreground">
                Calculando…
              </p>
            ) : null)}
          <Footer className="flex justify-end gap-2">
            <CancelButton
              type="button"
              variant="outline"
              disabled={cancellation.isPending || saving}
              onClick={close}
            >
              Volver
            </CancelButton>
            <ConfirmButton
              type="submit"
              form={formId}
              variant={confirmation ? "destructive" : "default"}
              disabled={
                cancellation.isPending ||
                saving ||
                (isCancellation &&
                  cancellationValid &&
                  (!cancellationPreview.data ||
                    cancellationPreview.isFetching ||
                    !!cancellationPreview.error))
              }
            >
              {saving
                ? "Guardando…"
                : cancellation.isPending
                  ? "Cancelando…"
                  : deleting
                    ? "Eliminar"
                    : isCancellation
                      ? "Confirmar"
                      : "Guardar"}
            </ConfirmButton>
          </Footer>
        </Content>
      </Root>
      {leaving && (
        <DiscardChanges onStay={() => setLeaving(false)} onLeave={onClose} />
      )}
    </>
  )
}

export function DiscardChanges({
  onStay,
  onLeave,
}: {
  onStay: () => void
  onLeave: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onStay()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hay cambios sin guardar</DialogTitle>
          <DialogDescription>
            Si sales ahora, se descartarán tus cambios en esta reserva.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onStay}>
            Seguir editando
          </Button>
          <Button type="button" variant="destructive" onClick={onLeave}>
            Descartar y salir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
