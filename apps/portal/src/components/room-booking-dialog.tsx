import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowUpRightIcon,
  EllipsisIcon,
  PlusIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import {
  contactValue,
  billingPreviewActions,
  changeCheckIn,
  minimumCheckOut,
  guestValues,
  overlappingRoomIds,
  unavailableRoomIds,
  roomEdits,
  stayValue,
  type RoomDraft,
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
import { format } from "@/lib/dates"
import { isValid, parseISO } from "date-fns"
import {
  createWorkflowBooking,
  previewWorkflow,
  type BookingContact,
  type StayingGuest,
  type FinancialEntry,
  type FinancialInput,
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
import { toast } from "@/lib/toast"
import { contactErrors } from "@/lib/form-validation"
import { createWorkflowSaver } from "@/lib/workflow-save"
import { formatMajor, formatMoney, parseMajorToCents } from "@/lib/money"

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
const labels: Record<string, string> = {
  confirmed: "Confirmada",
  checked_in: "En estancia",
  checked_out: "Salida registrada",
  cancelled: "Cancelada",
  no_show: "No se presentó",
  payment: "Pago",
  refund: "Devolución",
  discount: "Descuento",
  waiver: "Condonación",
  legacy_signed: "Movimiento histórico",
  legacy_discount_excluded: "Descuento histórico excluido",
}
const stayDate = (value: string, pattern: string) => {
  const date = parseISO(value)
  return isValid(date) ? format(date, pattern) : "—"
}
const today = () => new Date().toISOString().slice(0, 10)
const paymentToday = () => format(new Date(), "yyyy-MM-dd")
type Intent =
  | { type: "financial"; kind: FinancialInput["kind"] }
  | { type: "edit-financial" | "delete-financial"; entry: FinancialEntry }
  | { type: "cancel" }

export function ReservationStatus({ detail }: { detail: ReservationDetail }) {
  return (
    <Badge variant="secondary">{labels[detail.status] ?? detail.status}</Badge>
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
              : "Reserva por tipo y asigna una habitación ahora o antes de la llegada."}
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
  onViewReservation,
  onDirtyChange,
  full = false,
  initialTab = "details",
  onTabChange,
}: {
  detail: ReservationDetail
  onRefresh: () => void
  onClose?: () => void
  onViewReservation?: (id: string) => void
  onDirtyChange?: (dirty: boolean) => void
  full?: boolean
  initialTab?: string
  onTabChange?: (tab: string) => void
}) {
  const [drafts, setDrafts] = useState<RoomDraft[]>(
    detail.rooms.map((l) => ({
      id: l.id,
      room: stayValue(l),
      removed: false,
    }))
  )
  const [notes, setNotes] = useState(detail.notes ?? "")
  const [contact] = useState<BookingContact>(contactValue(detail.guest))
  const [guestDirty, setGuestDirty] = useState(false)
  const roomTypes = useRoomTypes()
  const [common, setCommon] = useState({
    checkIn: detail.checkIn,
    checkOut: detail.checkOut,
  })
  const [reservationState, setReservationState] = useState(detail.status)
  const [intent, setIntent] = useState<Intent | null>(null)
  const [tab, setTab] = useState(initialTab)
  const [error, setError] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const [paymentDirty, setPaymentDirty] = useState(false)
  const [discountDirty, setDiscountDirty] = useState(false)
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
  if (
    JSON.stringify(contactValue(contact)) !==
    JSON.stringify(contactValue(detail.guest))
  )
    changes.push({ type: "contact", contact: contactValue(contact) })
  const dirty = changes.length > 0
  const previewActions = billingPreviewActions(changes)
  const billingDirty = previewActions.length > 0
  const previewActionsKey = JSON.stringify(previewActions)
  const changesKey = JSON.stringify(changes)
  const editCommand = useMemo<WorkflowCommand>(
    () => ({
      requestId: crypto.randomUUID(),
      actions: JSON.parse(changesKey) as WorkflowAction[],
    }),
    [changesKey]
  )
  const billingCommand = useMemo<WorkflowCommand>(
    () => ({
      requestId: crypto.randomUUID(),
      actions: JSON.parse(previewActionsKey) as WorkflowAction[],
    }),
    [previewActionsKey]
  )
  const [previewCommand, setPreviewCommand] = useState(billingCommand)
  useEffect(() => {
    const timer = setTimeout(() => setPreviewCommand(billingCommand), 300)
    return () => clearTimeout(timer)
  }, [billingCommand])
  const editPreview = useQuery({
    queryKey: ["workflow-edit-preview", detail.id, previewCommand],
    queryFn: () => previewWorkflow(detail.id, previewCommand),
    enabled: billingDirty && previewCommand.actions.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const previewCurrent = previewCommand === billingCommand
  const billing = billingDirty
    ? previewCurrent
      ? editPreview.data
      : undefined
    : detail
  const billingRooms = billing?.rooms ?? []
  const saveMutation = useWorkflowCommand()
  const guestMutation = useWorkflowCommand()
  const financialMutation = useWorkflowCommand()
  const discountMutation = useWorkflowCommand()
  const discountSave = useRef<Promise<ReservationDetail> | null>(null)
  const busy =
    saveMutation.isPending ||
    guestMutation.isPending ||
    financialMutation.isPending
  const [guestSaver] = useState(createWorkflowSaver)
  const [financialSaver] = useState(createWorkflowSaver)
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
        busy ||
        discountMutation.isPending
    )
  }, [
    dirty,
    paymentDirty,
    guestDirty,
    discountDirty,
    busy,
    discountMutation.isPending,
    onDirtyChange,
  ])
  function resetDetails(saved: ReservationDetail) {
    setDrafts(
      saved.rooms.map((room) => ({
        id: room.id,
        room: stayValue(room),
        removed: false,
      }))
    )
    setCommon({ checkIn: saved.checkIn, checkOut: saved.checkOut })
    setReservationState(saved.status)
    setNotes(saved.notes ?? "")
  }
  async function saveFinancial(title: string, actions: WorkflowAction[]) {
    await discountSave.current
    await financialSaver(actions, (command) =>
      financialMutation.mutateAsync({ id: detail.id, command })
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
  const update = (id: string, patch: Partial<WorkflowRoom>) =>
    setDrafts((ds) =>
      ds.map((d) => (d.id === id ? { ...d, room: { ...d.room, ...patch } } : d))
    )
  const cancel = () => setIntent({ type: "cancel" })
  async function saveChanges() {
    setError("")
    if (
      !contact.fullName.trim() ||
      (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))
    ) {
      setTab("details")
      setError(
        "Completa el nombre completo del contacto. Si indicas un email, revisa que sea válido."
      )
      return
    }
    if (!formRef.current?.reportValidity()) return
    if (
      tab !== "details" ||
      !dirty ||
      !billing ||
      (billingDirty && editPreview.isFetching) ||
      busy
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
      setError(e instanceof Error ? e.message : "No se pudo guardar.")
    }
  }
  return (
    <form
      ref={formRef}
      noValidate
      className={cn(
        "flex min-w-0 flex-col gap-4",
        !full && "min-h-0 flex-1 overflow-hidden"
      )}
      onSubmit={(e) => {
        e.preventDefault()
        if (tab === "details") void saveChanges()
      }}
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
        {!full && !detail.cancelledAt && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Más acciones de reserva"
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={busy || (dirty && !billing)}
                  onClick={cancel}
                >
                  Cancelar reserva
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
          <TabsTrigger value="details">Detalles</TabsTrigger>
          <TabsTrigger value="guests">Huéspedes</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
        </TabsList>
        <div className="grid min-w-0 shrink-0 gap-6 p-px lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <TabsContent value="details" className="flex flex-col gap-5">
              <fieldset
                disabled={saveMutation.isPending}
                className="flex min-w-0 flex-col gap-5"
              >
                <FieldGroup className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Check-in"
                    type="date"
                    required
                    value={common.checkIn}
                    onChange={(checkIn) =>
                      setCommon(changeCheckIn(common, checkIn))
                    }
                  />
                  <TextField
                    label="Check-out"
                    type="date"
                    required
                    value={common.checkOut}
                    min={minimumCheckOut(common.checkIn)}
                    onChange={(checkOut) => setCommon({ ...common, checkOut })}
                  />
                </FieldGroup>
                <section className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">Habitaciones</h3>
                  </div>
                  {drafts.map((draft, i) => (
                    <section
                      key={draft.id}
                      className="flex min-w-0 flex-col gap-3"
                    >
                      {draft.removed ? (
                        <div className="flex items-center justify-between gap-3">
                          <p>Habitación {i + 1} se retirará al guardar.</p>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              setDrafts((ds) =>
                                ds.map((d) =>
                                  d.id === draft.id
                                    ? { ...d, removed: false }
                                    : d
                                )
                              )
                            }
                          >
                            <Undo2Icon />
                            Deshacer
                          </Button>
                        </div>
                      ) : (
                        <CompactRoomFields
                          reservationId={detail.id}
                          stay={common}
                          room={draft.room}
                          blockedRoomIds={overlappingRoomIds(
                            activeDrafts
                              .filter((other) => other.id !== draft.id)
                              .map((other) => other.room)
                          )}
                          occupied={reservationState === "checked_in"}
                          onChange={(room) => update(draft.id, room)}
                          actions={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Quitar habitación ${i + 1}`}
                              disabled={activeDrafts.length <= 1}
                              onClick={() =>
                                setDrafts((ds) =>
                                  ds.map((d) =>
                                    d.id === draft.id
                                      ? { ...d, removed: true }
                                      : d
                                  )
                                )
                              }
                            >
                              <XIcon />
                            </Button>
                          }
                        />
                      )}
                    </section>
                  ))}
                  {activeDrafts.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit"
                      disabled={drafts.length >= 60}
                      onClick={() =>
                        setDrafts((ds) => [
                          ...ds,
                          {
                            id: crypto.randomUUID(),
                            room: { ...activeDrafts[0].room, roomId: null },
                            removed: false,
                          },
                        ])
                      }
                    >
                      <PlusIcon data-icon="inline-start" />
                      Agregar habitación
                    </Button>
                  )}
                </section>
                <section className="flex flex-col gap-3">
                  <FieldGroup>
                    <TextField
                      label="Notas"
                      type="textarea"
                      max={2000}
                      value={notes}
                      onChange={setNotes}
                    />
                  </FieldGroup>
                </section>
              </fieldset>
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
                onReady={saveFinancial}
              />
              <PaymentList
                detail={detail}
                disabled={busy}
                onEdit={(entry) => setIntent({ type: "edit-financial", entry })}
                onDelete={(entry) =>
                  setIntent({ type: "delete-financial", entry })
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
              waiverCents={billing?.waiverCents ?? detail.waiverCents}
              refundCents={billing?.refundCents ?? detail.refundCents}
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
                billingDirty && editPreview.error && previewCurrent
                  ? "Revisa los cambios para calcular el total."
                  : "Calculando…"
              }
            />
            {billingDirty && previewCurrent && editPreview.error && (
              <FieldError>{editPreview.error.message}</FieldError>
            )}
          </aside>
        </div>
      </Tabs>
      {error && <FieldError role="alert">{error}</FieldError>}
      <div className="flex shrink-0 flex-wrap items-end justify-end gap-3">
        {tab === "details" && (
          <FieldGroup className="w-48">
            <ChoiceField
              label="Estado de la reserva"
              hideLabel
              value={reservationState}
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
                { value: "cancelled", label: "Cancelada" },
              ]}
              onChange={(status) => {
                if (status === reservationState) return
                if (status === "cancelled") {
                  cancel()
                  return
                }
                setReservationState(status)
              }}
            />
          </FieldGroup>
        )}
        <div className="flex flex-wrap gap-2">
          {tab === "details" && (
            <Button
              type="submit"
              disabled={
                !dirty ||
                (billingDirty && previewCurrent && !!editPreview.error) ||
                !billing ||
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
      {tab === "details" && unassigned && (
        <p className="text-xs text-muted-foreground">
          Asigna una habitación a cada estancia antes del check-in.
        </p>
      )}
      {intent && (
        <ActionForm
          detail={detail}
          intent={intent}
          onClose={() => setIntent(null)}
          onSaved={(saved) => {
            resetDetails(saved)
          }}
          onReady={async (title, actions) => {
            await saveFinancial(title, actions)
            setIntent(null)
          }}
        />
      )}
    </form>
  )
}

function useRoomAssignmentOptions(
  room: { checkIn: string; checkOut: string },
  reservationId?: string
) {
  const reservations = useReservations(room.checkIn, room.checkOut)
  const closures = useRoomClosures(room.checkIn, room.checkOut)
  return {
    blocked: unavailableRoomIds(
      room,
      reservations.data ?? [],
      closures.data ?? [],
      reservationId
    ),
    ready:
      !!reservations.data &&
      !!closures.data &&
      !reservations.isPlaceholderData &&
      !closures.isPlaceholderData &&
      !reservations.isError &&
      !closures.isError,
    error: reservations.error?.message ?? closures.error?.message,
  }
}

function CompactRoomFields({
  room,
  stay,
  reservationId,
  blockedRoomIds,
  occupied,
  onChange,
  actions,
}: {
  room: WorkflowRoom
  reservationId: string
  stay: { checkIn: string; checkOut: string }
  blockedRoomIds: Set<string>
  occupied: boolean
  onChange: (room: WorkflowRoom) => void
  actions: ReactNode
}) {
  const types = useRoomTypes(),
    rooms = useRooms()
  const availability = useRoomAssignmentOptions(stay, reservationId)
  return (
    <FieldGroup className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_88px_56px_56px_28px]">
      <ChoiceField
        label="Tipo"
        value={room.roomTypeId}
        options={(types.data ?? []).map((t) => ({
          value: t.id,
          label: t.name,
        }))}
        onChange={(roomTypeId) => {
          if (roomTypeId !== room.roomTypeId)
            onChange({ ...room, roomTypeId, roomId: null })
        }}
      />
      <ChoiceField
        label="Hab."
        value={room.roomId ?? "unassigned"}
        disabled={!availability.ready}
        options={[
          ...(!occupied ? [{ value: "unassigned", label: "Sin asignar" }] : []),
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
        onChange={(roomId) =>
          onChange({ ...room, roomId: roomId === "unassigned" ? null : roomId })
        }
      />
      <TextField
        label="Adultos"
        type="number"
        required
        min={1}
        max={100}
        value={Number.isNaN(room.adults) ? "" : room.adults}
        onChange={(v) =>
          onChange({ ...room, adults: v === "" ? NaN : Number(v) })
        }
      />
      <TextField
        label="Niños"
        type="number"
        required
        min={0}
        max={100}
        value={Number.isNaN(room.children) ? "" : room.children}
        onChange={(v) =>
          onChange({ ...room, children: v === "" ? NaN : Number(v) })
        }
      />
      {availability.error && (
        <FieldError className="col-span-full">{availability.error}</FieldError>
      )}
      <div className="col-start-2 self-end justify-self-end sm:col-start-auto">
        {actions}
      </div>
    </FieldGroup>
  )
}

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
  const emptyGuest = (): StayingGuest => {
    const rooms = detail.rooms
    return {
      id: crypto.randomUUID(),
      reservationRoomId: rooms.length === 1 ? rooms[0].id : null,
      fullName: "",
      email: null,
      phone: null,
      documentType: null,
      documentNumber: null,
    }
  }
  const [draft, setDraft] = useState<StayingGuest>(emptyGuest)
  const [editing, setEditing] = useState(false)
  const [addDraft, setAddDraft] = useState(draft)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [baseline, setBaseline] = useState(draft)
  const [addBaseline, setAddBaseline] = useState(draft)
  const dirty =
    JSON.stringify(guestValues([draft])) !==
    JSON.stringify(guestValues([baseline]))
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  const validation = contactErrors(draft.fullName, draft.email ?? "")
  const patch = (changes: Partial<StayingGuest>) => {
    setDraft((guest) => ({ ...guest, ...changes }))
    setError("")
  }
  const reset = () => {
    const next = emptyGuest()
    setDraft(editing ? addDraft : next)
    setBaseline(editing ? addBaseline : next)
    setEditing(false)
    setLeaving(false)
    setAttempted(false)
    setError("")
  }
  async function submit() {
    if (disabled) return
    setAttempted(true)
    if (Object.values(validation).some(Boolean)) return
    try {
      await onSave(
        editing
          ? detail.stayingGuests.map((guest) =>
              guest.id === draft.id ? draft : guest
            )
          : [...detail.stayingGuests, draft]
      )
      reset()
      toast.add({
        title: editing ? "Huésped actualizado" : "Huésped agregado",
        type: "success",
      })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el huésped."
      )
    }
  }
  async function remove(id: string) {
    try {
      await onSave(detail.stayingGuests.filter((guest) => guest.id !== id))
      if (draft.id === id) reset()
      toast.add({ title: "Huésped eliminado", type: "success" })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo eliminar el huésped."
      )
    }
  }
  const roomLabel = (id: string | null) =>
    detail.rooms.find((room) => room.id === id)?.roomNumber ?? "Sin indicar"
  const closeEdit = () => {
    if (disabled) return
    if (dirty) setLeaving(true)
    else reset()
  }
  const guestForm = (isEdit: boolean) => {
    const values = !isEdit && editing ? addDraft : draft
    return (
      <fieldset
        disabled={disabled}
        className="flex min-w-0 flex-col gap-3"
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.nativeEvent.isComposing &&
            event.target instanceof HTMLInputElement
          ) {
            event.preventDefault()
            event.stopPropagation()
            void submit()
          }
        }}
      >
        <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Nombre completo"
            value={values.fullName}
            error={
              attempted && isEdit === editing
                ? (validation.fullName ?? undefined)
                : undefined
            }
            onChange={(fullName) => patch({ fullName })}
          />
          <ChoiceField
            label="Hab. del huésped"
            value={values.reservationRoomId ?? "none"}
            onChange={(value) =>
              patch({ reservationRoomId: value === "none" ? null : value })
            }
            options={[
              { value: "none", label: "Sin indicar" },
              ...detail.rooms
                .filter(
                  (room) =>
                    detail.status !== "cancelled" ||
                    room.id === values.reservationRoomId
                )
                .map((room, index) => ({
                  value: room.id,
                  label: room.roomNumber ?? `Sin asignar · ${index + 1}`,
                })),
            ]}
          />
        </FieldGroup>
        <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ChoiceField
            label="Documento"
            value={values.documentType ?? "none"}
            onChange={(value) =>
              patch({ documentType: value === "none" ? null : value })
            }
            options={[
              { value: "none", label: "Sin indicar" },
              { value: "DNI", label: "DNI" },
              { value: "Pasaporte", label: "Pasaporte" },
              { value: "Otro", label: "Otro" },
            ]}
          />
          <TextField
            label="Número de documento"
            value={values.documentNumber ?? ""}
            onChange={(documentNumber) => patch({ documentNumber })}
          />
          <TextField
            label="Email del huésped"
            type="email"
            value={values.email ?? ""}
            error={
              attempted && isEdit === editing
                ? (validation.email ?? undefined)
                : undefined
            }
            onChange={(email) => patch({ email })}
          />
          <TextField
            label="Teléfono del huésped"
            type="tel"
            placeholder="+51…"
            value={values.phone ?? ""}
            onChange={(phone) => patch({ phone })}
          />
        </FieldGroup>
        {error && <FieldError role="alert">{error}</FieldError>}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={
              disabled || (!isEdit && detail.stayingGuests.length >= 200)
            }
            onClick={() => void submit()}
          >
            {!isEdit && <PlusIcon data-icon="inline-start" />}
            {disabled ? "Guardando…" : isEdit ? "Guardar" : "Agregar huésped"}
          </Button>
          {isEdit && (
            <Button type="button" variant="ghost" onClick={closeEdit}>
              Cancelar
            </Button>
          )}
        </div>
      </fieldset>
    )
  }
  return (
    <>
      {guestForm(false)}
      <Dialog
        open={editing}
        onOpenChange={(open) => {
          if (!open) closeEdit()
        }}
      >
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar huésped</DialogTitle>
          </DialogHeader>
          {guestForm(true)}
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
                            setAddDraft(draft)
                            setAddBaseline(baseline)
                            setDraft({ ...guest })
                            setBaseline({ ...guest })
                            setEditing(true)
                            setAttempted(false)
                            setError("")
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

const paymentMethods = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "yape", label: "Yape" },
  { value: "other", label: "Otro" },
]
function PaymentForm({
  detail,
  disabled,
  onReady,
  onDirtyChange,
}: {
  detail: ReservationDetail
  disabled: boolean
  onReady: (title: string, actions: WorkflowAction[]) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
}) {
  const [enteredAmount, setEnteredAmount] = useState<string | null>(null)
  const amount =
    enteredAmount ??
    (detail.balanceCents > 0 ? formatMajor(detail.balanceCents) : "")
  const [method, setMethod] = useState("cash")
  const [date, setDate] = useState(paymentToday())
  const [reference, setReference] = useState("")
  const [error, setError] = useState("")
  const initial = useRef({ amount, date })
  useEffect(() => {
    onDirtyChange(
      (enteredAmount !== null && amount !== initial.current.amount) ||
        date !== initial.current.date ||
        method !== "cash" ||
        !!reference
    )
  }, [amount, enteredAmount, date, method, reference, onDirtyChange])
  async function reviewPayment() {
    setError("")
    const amountCents = parseMajorToCents(amount)
    if (!amountCents || amountCents <= 0) {
      setError("Introduce un importe positivo con hasta dos decimales.")
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > paymentToday()) {
      setError("Indica una fecha de pago válida, hasta hoy.")
      return
    }
    try {
      await onReady("Pago registrado", [
        {
          type: "financial",
          entry: {
            kind: "payment",
            amountCents,
            method: method as FinancialInput["method"],
            paymentDate: date,
            ...(reference.trim()
              ? { reference: reference.trim().toUpperCase() }
              : {}),
          },
        },
      ])
      initial.current = { amount: "", date }
      setEnteredAmount("")
      setReference("")
      setMethod("cash")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo guardar el pago."
      )
    }
  }
  return (
    <section className="flex flex-col gap-3">
      <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-3">
        <FieldGroup className="grid grid-cols-2 gap-3">
          <TextField
            label="Importe S/"
            value={amount}
            placeholder="0.00"
            onChange={setEnteredAmount}
            disabled={disabled}
          />
          <ChoiceField
            label="Método"
            value={method}
            onChange={setMethod}
            options={paymentMethods}
            disabled={disabled}
          />
          <TextField
            label="Fecha del pago"
            type="date"
            max={paymentToday()}
            value={date}
            onChange={setDate}
            disabled={disabled}
          />
          <TextField
            label="Referencia · Opcional"
            value={reference}
            placeholder="N.º de operación o comprobante"
            onChange={(value) => setReference(value.toUpperCase())}
            disabled={disabled}
          />
        </FieldGroup>
        <Button
          type="button"
          className="w-fit"
          disabled={disabled}
          onClick={() => void reviewPayment()}
        >
          Agregar pago
        </Button>
      </fieldset>
      {error && <FieldError role="alert">{error}</FieldError>}
    </section>
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
  onEdit: (entry: FinancialEntry) => void
  onDelete: (entry: FinancialEntry) => void
}) {
  const entries = detail.financialEntries.filter(
    (e) => !e.voidedAt && (e.kind === "payment" || e.kind === "legacy_signed")
  )
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
                <TableCell>
                  {stayDate(
                    e.paymentDate ?? e.occurredAt.slice(0, 10),
                    "d MMM yyyy"
                  )}
                </TableCell>
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
                          aria-label={`Acciones del pago de ${formatMoney(e.amountCents, detail.currency)} del ${e.paymentDate ?? e.occurredAt.slice(0, 10)}`}
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
}: {
  detail: ReservationDetail
  intent: Intent
  onClose: () => void
  onReady: (title: string, actions: WorkflowAction[]) => Promise<void>
  onSaved: (detail: ReservationDetail) => void
}) {
  const entry = "entry" in intent ? intent.entry : null
  const kind: FinancialInput["kind"] =
    intent.type === "financial"
      ? intent.kind
      : entry?.kind === "discount"
        ? "discount"
        : "payment"
  const [amount, setAmount] = useState(
    entry ? formatMajor(entry.amountCents) : ""
  )
  const [method, setMethod] = useState<string>(entry?.method ?? "cash")
  const [date, setDate] = useState(
    entry?.paymentDate ?? entry?.occurredAt.slice(0, 10) ?? paymentToday()
  )
  const [reference, setReference] = useState(
    entry?.reference?.toUpperCase() ?? ""
  )
  const [reason, setReason] = useState(entry?.reason ?? "")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [initial] = useState(() =>
    JSON.stringify({ amount, method, date, reference, reason })
  )
  const changed =
    JSON.stringify({ amount, method, date, reference, reason }) !== initial
  const isCancellation = intent.type === "cancel"
  const deleting = intent.type === "delete-financial"
  const confirmation = isCancellation || deleting
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
    enabled: isCancellation,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const cancellation = useWorkflowCommand()
  const title = isCancellation
    ? "Cancelar reserva"
    : deleting
      ? kind === "discount"
        ? "Eliminar descuento"
        : "Eliminar pago"
      : intent.type === "edit-financial"
        ? kind === "discount"
          ? "Editar descuento"
          : "Editar pago"
        : "Agregar descuento"
  function close() {
    if (cancellation.isPending || saving) return
    if (changed && !confirmation) setLeaving(true)
    else onClose()
  }
  async function submit() {
    setError("")
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
        setError(
          cause instanceof Error ? cause.message : "No se pudo cancelar."
        )
      }
      return
    }
    if (deleting && entry) {
      await commit([{ type: "delete-financial", entryId: entry.id }])
      return
    }
    const amountCents = parseMajorToCents(amount)
    if (!amountCents || amountCents <= 0) {
      setError("Introduce un importe positivo con hasta dos decimales.")
      return
    }
    if (
      kind === "payment" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > paymentToday())
    ) {
      setError("Indica una fecha de pago válida, hasta hoy.")
      return
    }
    const input: FinancialInput = {
      kind,
      amountCents,
      ...(kind === "payment"
        ? { method: method as FinancialInput["method"], paymentDate: date }
        : {}),
      ...(reference.trim()
        ? { reference: reference.trim().toUpperCase() }
        : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    }
    await commit([
      intent.type === "edit-financial" && entry
        ? { type: "edit-financial", entryId: entry.id, entry: input }
        : { type: "financial", entry: input },
    ])
  }
  async function commit(actions: WorkflowAction[]) {
    if (saving) return
    setSaving(true)
    try {
      await onReady(title, actions)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.")
    } finally {
      setSaving(false)
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
                ? "Se liberará la disponibilidad y se quitarán los cargos. Los pagos se conservarán como saldo a favor si no quedan otras habitaciones con cargos. Confirmar aplica la cancelación y descarta otros cambios sin guardar."
                : deleting
                  ? `Se eliminará ${kind === "discount" ? "el descuento" : "el pago"} de ${formatMoney(entry?.amountCents ?? 0)} al confirmar.`
                  : "El cambio se guardará al confirmar. Los cambios de Detalles se guardan por separado."}
            </Description>
          </Header>
          {!deleting && (
            <fieldset disabled={saving || cancellation.isPending}>
              <FieldGroup>
                {!isCancellation && (
                  <>
                    <TextField
                      label="Importe S/"
                      value={amount}
                      placeholder="0.00"
                      onChange={setAmount}
                    />
                    {kind === "payment" && (
                      <>
                        <ChoiceField
                          label="Método"
                          value={method}
                          onChange={setMethod}
                          options={paymentMethods}
                        />
                        <TextField
                          label="Fecha del pago"
                          type="date"
                          required
                          max={paymentToday()}
                          value={date}
                          onChange={setDate}
                        />
                        <TextField
                          label="Referencia · Opcional"
                          value={reference}
                          onChange={(value) =>
                            setReference(value.toUpperCase())
                          }
                        />
                      </>
                    )}
                  </>
                )}
                {(isCancellation || kind === "discount") && (
                  <TextField
                    label={
                      isCancellation ? "Motivo · Opcional" : "Nota · Opcional"
                    }
                    value={reason}
                    disabled={cancellation.isPending || saving}
                    onChange={setReason}
                  />
                )}
              </FieldGroup>
            </fieldset>
          )}
          {isCancellation &&
            (cancellationPreview.data ? (
              <WorkflowBill bill={cancellationPreview.data} />
            ) : cancellationPreview.error ? (
              <FieldError>{cancellationPreview.error.message}</FieldError>
            ) : (
              <p role="status" className="text-muted-foreground">
                Calculando…
              </p>
            ))}
          {error && <FieldError role="alert">{error}</FieldError>}
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
              type="button"
              variant={confirmation ? "destructive" : "default"}
              onClick={() => void submit()}
              disabled={
                cancellation.isPending ||
                saving ||
                (isCancellation &&
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
