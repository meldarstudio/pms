import {
  useCallback,
  useEffect,
  useId,
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
  guestValues,
  isActiveStay,
  nextStayAction,
  overlappingRoomIds,
  unavailableRoomIds,
  roomEdits,
  sharedStay,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { TextField, ChoiceField } from "@/components/workflow-fields"
import { WorkflowBill } from "@/components/workflow-bill"
import { BookingSummary } from "@/components/booking-summary"
import { format } from "@/lib/dates"
import { parseISO } from "date-fns"
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
const eventLabels: Record<string, string> = {
  created: "Reserva creada",
  contact: "Contacto actualizado",
  "set-guests": "Huéspedes actualizados",
  "edit-room": "Habitación modificada",
  "add-room": "Habitación añadida",
  "check-in": "Llegada registrada",
  "check-out": "Salida registrada",
  move: "Cambio de habitación",
  "undo-check-in": "Llegada corregida",
  "cancel-room": "Habitación cancelada",
  "no-show": "No se presentó",
  cancel: "Reserva cancelada",
  financial: "Movimiento financiero",
  "correct-financial": "Corrección financiera",
  notes: "Notas actualizadas",
}
const today = () => new Date().toISOString().slice(0, 10)
const tomorrow = (date: string) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000)
    .toISOString()
    .slice(0, 10)
type Intent =
  | { type: "financial"; kind: FinancialInput["kind"] }
  | { type: "correction"; entry: FinancialEntry }
  | {
      type: "move" | "undo-check-in" | "cancel-room" | "no-show"
      lineId: string
    }
  | { type: "cancel" }

export function ReservationStatus({ detail }: { detail: ReservationDetail }) {
  const statuses = [
    ...new Set(
      detail.rooms
        .filter((room) => room.status !== "cancelled")
        .map((room) => room.status)
    ),
  ]
  return (
    <Badge variant="secondary">
      {detail.cancelledAt
        ? "Cancelada"
        : statuses.length > 1
          ? "Estados diferentes"
          : (labels[statuses[0]] ?? "Cancelada")}
    </Badge>
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
                key={`${detail.data.id}-${detail.data.version}`}
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
  locked = false,
  extension = false,
  blockedRoomIds = new Set<string>(),
}: {
  room: WorkflowRoom
  onChange: (room: WorkflowRoom) => void
  locked?: boolean
  extension?: boolean
  blockedRoomIds?: Set<string>
}) {
  const types = useRoomTypes(),
    rooms = useRooms()
  const set = (patch: Partial<WorkflowRoom>) => onChange({ ...room, ...patch })
  return (
    <FieldGroup className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <ChoiceField
        label="Tipo"
        value={room.roomTypeId}
        disabled={locked || extension}
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
        disabled={locked || extension}
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
        label="Llegada prevista"
        type="date"
        value={room.checkIn}
        disabled={locked || extension}
        onChange={(checkIn) => set({ checkIn })}
      />
      <TextField
        label={extension ? "Extender hasta" : "Salida prevista"}
        type="date"
        value={room.checkOut}
        disabled={locked}
        onChange={(checkOut) => set({ checkOut })}
      />
      <TextField
        label="Adultos"
        type="number"
        min={1}
        value={room.adults}
        disabled={locked || extension}
        onChange={(v) => set({ adults: Number(v) })}
      />
      <TextField
        label="Niños"
        type="number"
        min={0}
        value={room.children}
        disabled={locked || extension}
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
  const [drafts, setDrafts] = useState<WorkflowRoom[]>([
    {
      roomTypeId: target.mode === "create" ? target.roomTypeId : "",
      roomId: target.mode === "create" ? target.roomId : null,
      adults: 1,
      children: 0,
      checkIn: start,
      checkOut: tomorrow(start),
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
                room,
                drafts.filter((_, n) => n !== i)
              )}
              onChange={(r) =>
                setDrafts((d) => d.map((v, n) => (n === i ? r : v)))
              }
            />
            <NewRoomPrice room={room} />
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
function NewRoomPrice({ room }: { room: WorkflowRoom }) {
  const q = useAvailability(room.checkIn, room.checkOut),
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
      reason: "",
    }))
  )
  const [notes, setNotes] = useState(detail.notes ?? "")
  const [contact] = useState<BookingContact>(contactValue(detail.guest))
  const [guests, setGuests] = useState<StayingGuest[]>(
    guestValues(detail.stayingGuests)
  )
  const roomTypes = useRoomTypes()
  const physicalRooms = useRooms()
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set())
  const [intent, setIntent] = useState<Intent | null>(null)
  const [pendingActions, setPendingActions] = useState<WorkflowAction[]>([])
  const [tab, setTab] = useState(initialTab)
  const [error, setError] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const [paymentDirty, setPaymentDirty] = useState(false)
  const changes = roomEdits(detail, drafts)
  if (notes !== (detail.notes ?? "")) changes.push({ type: "notes", notes })
  if (
    JSON.stringify(contactValue(contact)) !==
    JSON.stringify(contactValue(detail.guest))
  )
    changes.push({ type: "contact", contact: contactValue(contact) })
  if (
    JSON.stringify(guestValues(guests)) !==
    JSON.stringify(guestValues(detail.stayingGuests))
  )
    changes.push({ type: "set-guests", guests: guestValues(guests) })
  changes.push(...pendingActions)
  const dirty = changes.length > 0
  const changesKey = JSON.stringify(changes)
  const editCommand = useMemo<WorkflowCommand>(
    () => ({
      requestId: crypto.randomUUID(),
      version: detail.version,
      actions: JSON.parse(changesKey) as WorkflowAction[],
    }),
    [changesKey, detail.version]
  )
  const [previewCommand, setPreviewCommand] = useState(editCommand)
  useEffect(() => {
    const timer = setTimeout(() => setPreviewCommand(editCommand), 300)
    return () => clearTimeout(timer)
  }, [editCommand])
  const editPreview = useQuery({
    queryKey: ["workflow-edit-preview", detail.id, previewCommand],
    queryFn: () => previewWorkflow(detail.id, previewCommand),
    enabled: dirty && previewCommand.actions.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const previewCurrent = previewCommand === editCommand
  const billing = dirty
    ? previewCurrent
      ? editPreview.data
      : undefined
    : detail
  const billingRooms = dirty ? (billing?.rooms ?? []) : detail.rooms
  const saveMutation = useWorkflowCommand()
  useEffect(() => {
    onDirtyChange?.(dirty || paymentDirty)
  }, [dirty, paymentDirty, onDirtyChange])
  const activeDrafts = drafts.filter(
    (d) =>
      !d.removed &&
      (!detail.rooms.some((l) => l.id === d.id) ||
        isActiveStay(detail.rooms.find((l) => l.id === d.id)!.status))
  )
  const common = sharedStay(activeDrafts)
  const projectedDetail = billing ? { ...detail, ...billing } : detail
  const projectedRooms = projectedDetail.rooms.map((room) => ({
    ...room,
    roomTypeName:
      roomTypes.data?.find((type) => type.id === room.roomTypeId)?.name ??
      room.roomTypeName,
    roomNumber:
      physicalRooms.data?.find((physical) => physical.id === room.roomId)
        ?.number ?? room.roomNumber,
  }))
  const current = projectedRooms.filter((l) => isActiveStay(l.status))
  const next = nextStayAction(projectedRooms)
  const unassigned = current.some((l) => !l.roomId)
  const update = (id: string, patch: Partial<WorkflowRoom>) =>
    setDrafts((ds) =>
      ds.map((d) => (d.id === id ? { ...d, room: { ...d.room, ...patch } } : d))
    )
  const cancel = () => setIntent({ type: "cancel" })
  function review(_title: string, actions: WorkflowAction[]) {
    setError("")
    setPendingActions((pending) => [...pending, ...actions])
  }
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
    if (guests.some((g) => !g.fullName.trim())) {
      setTab("guests")
      setError("Completa el nombre completo de cada huésped.")
      return
    }
    if (
      guests.some(
        (g) =>
          g.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim())
      )
    ) {
      setTab("guests")
      setError("Revisa el email de los huéspedes en Más datos.")
      return
    }
    if (!formRef.current?.reportValidity()) return
    if (!dirty || !billing || editPreview.isFetching || saveMutation.isPending)
      return
    try {
      await saveMutation.mutateAsync({ id: detail.id, command: editCommand })
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
        void saveChanges()
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
                  disabled={saveMutation.isPending || (dirty && !billing)}
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
          {full && <TabsTrigger value="history">Historial</TabsTrigger>}
        </TabsList>
        <div className="grid min-w-0 shrink-0 gap-6 p-px lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <TabsContent value="details" className="flex flex-col gap-5">
              {common ? (
                <section className="flex flex-col gap-2">
                  <FieldGroup className="grid grid-cols-2 gap-3">
                    <TextField
                      label="Check-in"
                      type="date"
                      required
                      value={common.checkIn}
                      disabled={current.some((l) => l.status === "checked_in")}
                      onChange={(checkIn) =>
                        setDrafts((ds) =>
                          ds.map((d) =>
                            activeDrafts.some((a) => a.id === d.id)
                              ? { ...d, room: { ...d.room, checkIn } }
                              : d
                          )
                        )
                      }
                    />
                    <TextField
                      label="Check-out"
                      type="date"
                      required
                      value={common.checkOut}
                      min={
                        current.some((l) => l.status === "checked_in")
                          ? current.reduce(
                              (date, l) =>
                                l.checkOut > date ? l.checkOut : date,
                              ""
                            )
                          : undefined
                      }
                      onChange={(checkOut) =>
                        setDrafts((ds) =>
                          ds.map((d) =>
                            activeDrafts.some((a) => a.id === d.id)
                              ? { ...d, room: { ...d.room, checkOut } }
                              : d
                          )
                        )
                      }
                    />
                  </FieldGroup>
                </section>
              ) : activeDrafts.length > 0 ? (
                <p className="text-muted-foreground">
                  Las habitaciones tienen fechas diferentes. Revisa las fechas
                  de cada una en las opciones.
                </p>
              ) : null}
              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">Habitaciones</h3>
                </div>
                {drafts
                  .filter(
                    (d) =>
                      projectedRooms.find((l) => l.id === d.id)?.status !==
                      "cancelled"
                  )
                  .map((draft, i) => {
                    const saved = projectedRooms.find((l) => l.id === draft.id)
                    const locked = !!saved && !isActiveStay(saved.status)
                    const occupied = saved?.status === "checked_in"
                    return (
                      <section
                        key={draft.id}
                        className="flex min-w-0 flex-col gap-3"
                      >
                        {draft.removed ? (
                          <div className="flex flex-col gap-3">
                            <p>
                              Hab. {saved?.roomNumber ?? i + 1} se retirará al
                              guardar.
                            </p>
                            <FieldGroup>
                              <TextField
                                label="Motivo de la retirada"
                                required
                                value={draft.reason}
                                onChange={(reason) =>
                                  setDrafts((ds) =>
                                    ds.map((d) =>
                                      d.id === draft.id ? { ...d, reason } : d
                                    )
                                  )
                                }
                              />
                            </FieldGroup>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-fit"
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
                              <Undo2Icon data-icon="inline-start" />
                              Deshacer retirada
                            </Button>
                          </div>
                        ) : (
                          <>
                            <CompactRoomFields
                              reservationId={detail.id}
                              room={draft.room}
                              blockedRoomIds={overlappingRoomIds(
                                draft.room,
                                drafts
                                  .filter((other) => {
                                    const status = projectedRooms.find(
                                      (line) => line.id === other.id
                                    )?.status
                                    return (
                                      other.id !== draft.id &&
                                      !other.removed &&
                                      status !== "cancelled" &&
                                      status !== "no_show"
                                    )
                                  })
                                  .map((other) => other.room)
                              )}
                              locked={locked}
                              occupied={occupied}
                              onChange={(room) => update(draft.id, room)}
                              actions={
                                <RoomStatusMenu
                                  expanded={expandedRooms.has(draft.id)}
                                  onToggleAdvanced={() =>
                                    setExpandedRooms((current) => {
                                      const next = new Set(current)
                                      if (next.has(draft.id))
                                        next.delete(draft.id)
                                      else next.add(draft.id)
                                      return next
                                    })
                                  }
                                  saved={saved}
                                  disabled={
                                    saveMutation.isPending ||
                                    (dirty && !billing)
                                  }
                                  onCancel={() => {
                                    if (!saved)
                                      setDrafts((ds) =>
                                        ds.filter((d) => d.id !== draft.id)
                                      )
                                    else if (
                                      detail.rooms.filter(
                                        (l) => l.status !== "cancelled"
                                      ).length === 1
                                    )
                                      cancel()
                                    else
                                      setIntent({
                                        type: "cancel-room",
                                        lineId: saved.id,
                                      })
                                  }}
                                />
                              }
                            />
                            {!common && (
                              <div className="text-xs text-muted-foreground">
                                {`${draft.room.checkIn} al ${draft.room.checkOut}`}
                              </div>
                            )}
                            {expandedRooms.has(draft.id) && (
                              <div className="flex flex-col gap-3">
                                <FieldGroup className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                  <TextField
                                    label="Check-in de habitación"
                                    type="date"
                                    required
                                    value={draft.room.checkIn}
                                    disabled={locked || occupied}
                                    onChange={(checkIn) =>
                                      update(draft.id, { checkIn })
                                    }
                                  />
                                  <TextField
                                    label={
                                      occupied
                                        ? "Extender hasta"
                                        : "Check-out de habitación"
                                    }
                                    type="date"
                                    required
                                    value={draft.room.checkOut}
                                    disabled={locked}
                                    min={occupied ? saved.checkOut : undefined}
                                    onChange={(checkOut) =>
                                      update(draft.id, { checkOut })
                                    }
                                  />
                                  <ChoiceField
                                    label="Estado"
                                    value={saved?.status ?? "confirmed"}
                                    disabled={
                                      !saved ||
                                      saveMutation.isPending ||
                                      (dirty && !billing)
                                    }
                                    options={[
                                      {
                                        value: "confirmed",
                                        label: "Confirmada",
                                        disabled:
                                          !saved ||
                                          !["confirmed", "checked_in"].includes(
                                            saved.status
                                          ),
                                      },
                                      {
                                        value: "checked_in",
                                        label: "Check-in",
                                        disabled:
                                          !saved?.roomId ||
                                          !["confirmed", "checked_in"].includes(
                                            saved?.status ?? ""
                                          ),
                                      },
                                      {
                                        value: "checked_out",
                                        label: "Check-out",
                                        disabled: ![
                                          "checked_in",
                                          "checked_out",
                                        ].includes(saved?.status ?? ""),
                                      },
                                      ...(saved?.status === "no_show"
                                        ? [
                                            {
                                              value: "no_show",
                                              label: "No se presentó",
                                              disabled: true,
                                            },
                                          ]
                                        : []),
                                    ]}
                                    onChange={(status) => {
                                      if (!saved || status === saved.status)
                                        return
                                      if (status === "confirmed")
                                        setIntent({
                                          type: "undo-check-in",
                                          lineId: saved.id,
                                        })
                                      else
                                        review(
                                          status === "checked_in"
                                            ? "Check-in de habitación"
                                            : "Check-out de habitación",
                                          [
                                            {
                                              type:
                                                status === "checked_in"
                                                  ? "check-in"
                                                  : "check-out",
                                              lineIds: [saved.id],
                                            },
                                          ]
                                        )
                                    }}
                                  />
                                </FieldGroup>
                                {saved && full && (
                                  <div className="flex flex-wrap gap-2">
                                    <RoomOtherActions
                                      saved={saved}
                                      detail={detail}
                                      disabled={
                                        saveMutation.isPending ||
                                        (dirty && !billing)
                                      }
                                      onIntent={setIntent}
                                      onRemove={() =>
                                        setDrafts((ds) =>
                                          ds.map((d) =>
                                            d.id === saved.id
                                              ? {
                                                  ...d,
                                                  removed: true,
                                                  reason:
                                                    "Habitación añadida por error",
                                                }
                                              : d
                                          )
                                        )
                                      }
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </section>
                    )
                  })}
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
                          reason: "",
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
            </TabsContent>
            <TabsContent value="guests" className="flex flex-col gap-4">
              <GuestFields
                guests={guests}
                detail={detail}
                onChange={setGuests}
              />
            </TabsContent>
            <TabsContent
              value="payments"
              keepMounted
              className="flex flex-col gap-5"
            >
              <PaymentForm
                detail={projectedDetail}
                disabled={saveMutation.isPending || (dirty && !billing)}
                onDirtyChange={setPaymentDirty}
                onReady={review}
              />
              <details>
                <summary className="cursor-pointer text-xs">
                  Más opciones de facturación
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["discount", "waiver", "refund"] as const).map((kind) => (
                    <Button
                      type="button"
                      key={kind}
                      variant="outline"
                      disabled={
                        dirty ||
                        (kind === "waiver" && detail.balanceCents <= 0) ||
                        (kind === "refund" && detail.creditCents <= 0)
                      }
                      onClick={() => setIntent({ type: "financial", kind })}
                    >
                      {labels[kind]}
                    </Button>
                  ))}
                </div>
              </details>
              <FinancialList
                detail={projectedDetail}
                disabled={saveMutation.isPending || (dirty && !billing)}
                onCorrect={(entry) => setIntent({ type: "correction", entry })}
              />
            </TabsContent>
            {full && (
              <TabsContent value="history" className="flex flex-col gap-5">
                <ReservationHistory detail={detail} />
              </TabsContent>
            )}
          </div>
          <aside className="min-w-0 md:self-start">
            <BookingSummary
              rooms={billingRooms.map((room) => ({
                key: room.id,
                typeName:
                  roomTypes.data?.find((type) => type.id === room.roomTypeId)
                    ?.name ??
                  room.roomTypeName ??
                  "Habitación",
                adults: room.adults,
                children: room.children,
                status: room.status,
                charges: {
                  subtotalCents: room.subtotalCents,
                  discountCents: room.discountCents,
                  totalCents: room.totalCents,
                },
                invalid: false,
              }))}
              summary={billing ?? null}
              paidCents={billing?.paidCents ?? detail.paidCents}
              waiverCents={billing?.waiverCents ?? detail.waiverCents}
              refundCents={billing?.refundCents ?? detail.refundCents}
              currency={detail.currency}
              stayLabel={`${format(parseISO(common?.checkIn ?? detail.checkIn), "d MMM")} – ${format(parseISO(common?.checkOut ?? detail.checkOut), "d MMM yyyy")}`}
              showPayments
              message={
                editPreview.error && previewCurrent
                  ? "Revisa los cambios para calcular el total."
                  : "Calculando…"
              }
            />
            {dirty &&
              billing &&
              "settlementBlocked" in billing &&
              billing.settlementBlocked && (
                <FieldError>
                  Registra un pago o una condonación antes de guardar la salida
                  final.
                </FieldError>
              )}
            {dirty && previewCurrent && editPreview.error && (
              <FieldError>{editPreview.error.message}</FieldError>
            )}
          </aside>
        </div>
      </Tabs>
      {error && <FieldError role="alert">{error}</FieldError>}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          {full && !detail.cancelledAt && (
            <Button
              type="button"
              variant="destructive"
              disabled={saveMutation.isPending || (dirty && !billing)}
              onClick={cancel}
            >
              Cancelar reserva
            </Button>
          )}
          {tab === "details" && next && (
            <Button
              type="button"
              disabled={
                saveMutation.isPending || (next === "check-in" && unassigned)
              }
              onClick={() =>
                review(
                  next === "check-in"
                    ? "Revisar check-in"
                    : "Revisar check-out",
                  [{ type: next, lineIds: current.map((l) => l.id) }]
                )
              }
            >
              {next === "check-in" ? "Check-in" : "Check-out"}
              {current.length > 1 ? ` · ${current.length} habitaciones` : ""}
            </Button>
          )}
          <Button
            type="submit"
            disabled={
              !dirty ||
              !!editPreview.error ||
              !billing ||
              ("settlementBlocked" in billing && billing.settlementBlocked) ||
              editPreview.isFetching ||
              saveMutation.isPending
            }
          >
            {saveMutation.isPending ? "Guardando…" : "Guardar"}
          </Button>
          {!full && onClose && (
            <Button type="button" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </div>
      {tab === "details" && next === "check-in" && unassigned && (
        <p className="text-xs text-muted-foreground">
          Asigna una habitación a cada estancia antes del check-in.
        </p>
      )}
      {intent && (
        <ActionForm
          detail={projectedDetail}
          intent={intent}
          onClose={() => setIntent(null)}
          onReady={(title, actions) => {
            setIntent(null)
            review(title, actions)
          }}
        />
      )}
    </form>
  )
}

function useRoomAssignmentOptions(room: WorkflowRoom, reservationId?: string) {
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
  reservationId,
  blockedRoomIds,
  locked,
  occupied,
  onChange,
  actions,
}: {
  room: WorkflowRoom
  reservationId: string
  blockedRoomIds: Set<string>
  locked: boolean
  occupied: boolean
  onChange: (room: WorkflowRoom) => void
  actions: ReactNode
}) {
  const types = useRoomTypes(),
    rooms = useRooms()
  const availability = useRoomAssignmentOptions(room, reservationId)
  return (
    <FieldGroup className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_88px_56px_56px_28px]">
      <ChoiceField
        label="Tipo"
        value={room.roomTypeId}
        disabled={locked || occupied}
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
        disabled={locked || !availability.ready}
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
        disabled={locked || occupied}
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
        disabled={locked || occupied}
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

function RoomStatusMenu({
  expanded,
  onToggleAdvanced,
  saved,
  disabled,
  onCancel,
}: {
  expanded: boolean
  onToggleAdvanced: () => void
  saved?: ReservationDetail["rooms"][number]
  disabled: boolean
  onCancel: () => void
}) {
  const status = saved?.status ?? "confirmed"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Opciones de habitación ${saved?.roomNumber ?? "sin asignar"}`}
            disabled={status === "cancelled"}
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onToggleAdvanced}>
            {expanded ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={!!saved && disabled}
            onClick={onCancel}
          >
            Cancelar habitación
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RoomOtherActions({
  saved,
  detail,
  disabled,
  onIntent,
  onRemove,
}: {
  saved: ReservationDetail["rooms"][number]
  detail: ReservationDetail
  disabled: boolean
  onIntent: (intent: Intent) => void
  onRemove: () => void
}) {
  if (!isActiveStay(saved.status)) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" size="sm" variant="ghost" disabled={disabled} />
        }
      >
        Más acciones
        <EllipsisIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          {saved.status === "confirmed" && (
            <>
              <DropdownMenuItem
                onClick={() => onIntent({ type: "no-show", lineId: saved.id })}
              >
                No se presentó
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={
                  detail.rooms.filter((l) => isActiveStay(l.status)).length < 2
                }
                onClick={onRemove}
              >
                Retirar habitación añadida por error
              </DropdownMenuItem>
            </>
          )}
          {saved.status === "checked_in" && (
            <DropdownMenuItem
              onClick={() =>
                onIntent({ type: "undo-check-in", lineId: saved.id })
              }
            >
              Corregir llegada por error
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function GuestFields({
  guests,
  detail,
  onChange,
}: {
  guests: StayingGuest[]
  detail: ReservationDetail
  onChange: (guests: StayingGuest[]) => void
}) {
  const patch = (id: string, changes: Partial<StayingGuest>) =>
    onChange(guests.map((g) => (g.id === id ? { ...g, ...changes } : g)))
  return (
    <>
      {!guests.length && (
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
      {guests.map((g, i) => (
        <section key={g.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium">Huésped {i + 1}</h4>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Quitar huésped ${i + 1}`}
              onClick={() => onChange(guests.filter((p) => p.id !== g.id))}
            >
              <XIcon />
            </Button>
          </div>
          <FieldGroup className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px]">
            <TextField
              label="Nombre completo"
              required
              value={g.fullName}
              onChange={(fullName) => patch(g.id, { fullName })}
            />
            <ChoiceField
              label="Hab. del huésped"
              value={g.reservationRoomId ?? "none"}
              onChange={(v) =>
                patch(g.id, { reservationRoomId: v === "none" ? null : v })
              }
              options={[
                { value: "none", label: "Sin indicar" },
                ...detail.rooms.map((l, n) => ({
                  value: l.id,
                  label: `${l.roomNumber ?? `Sin asignar · ${n + 1}`}${l.status === "cancelled" ? " · Cancelada" : ""}`,
                })),
              ]}
            />
          </FieldGroup>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Más datos
            </summary>
            <FieldGroup className="mt-3 grid grid-cols-2 gap-3">
              <ChoiceField
                label="Documento"
                value={g.documentType ?? "none"}
                onChange={(v) =>
                  patch(g.id, { documentType: v === "none" ? null : v })
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
                value={g.documentNumber ?? ""}
                onChange={(documentNumber) => patch(g.id, { documentNumber })}
              />
              <TextField
                label="Email del huésped"
                type="email"
                value={g.email ?? ""}
                onChange={(email) => patch(g.id, { email })}
              />
              <TextField
                label="Teléfono del huésped"
                type="tel"
                placeholder="+51…"
                value={g.phone ?? ""}
                onChange={(phone) => patch(g.id, { phone })}
              />
            </FieldGroup>
          </details>
          <Separator />
        </section>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={guests.length >= 200}
        onClick={() =>
          onChange([
            ...guests,
            {
              id: crypto.randomUUID(),
              reservationRoomId:
                detail.rooms.length === 1 ? detail.rooms[0].id : null,
              fullName: "",
              email: null,
              phone: null,
              documentType: null,
              documentNumber: null,
            },
          ])
        }
      >
        <PlusIcon data-icon="inline-start" />
        Agregar huésped
      </Button>
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
  onReady: (title: string, actions: WorkflowAction[]) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [amount, setAmount] = useState(
    detail.balanceCents > 0 ? formatMajor(detail.balanceCents) : ""
  )
  const [method, setMethod] = useState("cash")
  const [date, setDate] = useState(today())
  const [reference, setReference] = useState("")
  const [error, setError] = useState("")
  const initial = useRef({ amount, date })
  useEffect(() => {
    onDirtyChange(
      amount !== initial.current.amount ||
        date !== initial.current.date ||
        method !== "cash" ||
        !!reference
    )
  }, [amount, date, method, reference, onDirtyChange])
  function reviewPayment() {
    setError("")
    const amountCents = parseMajorToCents(amount)
    if (!amountCents || amountCents <= 0) {
      setError("Introduce un importe positivo con hasta dos decimales.")
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) {
      setError("Indica una fecha de pago válida, hasta hoy.")
      return
    }
    onReady("Revisar pago", [
      {
        type: "financial",
        entry: {
          kind: "payment",
          amountCents,
          method: method as FinancialInput["method"],
          paymentDate: date,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        },
      },
    ])
    initial.current = { amount: "", date }
    setAmount("")
    setReference("")
    setMethod("cash")
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium">Registrar pago</h3>
      <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-3">
        <FieldGroup className="grid grid-cols-2 gap-3">
          <TextField
            label="Importe S/"
            required
            value={amount}
            placeholder="0.00"
            onChange={setAmount}
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
            required
            max={today()}
            value={date}
            onChange={setDate}
            disabled={disabled}
          />
          <TextField
            label="Referencia · Opcional"
            value={reference}
            placeholder="N.º de operación o comprobante"
            onChange={setReference}
            disabled={disabled}
          />
        </FieldGroup>
        <Button
          type="button"
          className="w-fit"
          disabled={disabled}
          onClick={reviewPayment}
        >
          Agregar pago
        </Button>
      </fieldset>
      {error && <FieldError role="alert">{error}</FieldError>}
    </section>
  )
}

function FinancialList({
  detail,
  disabled,
  onCorrect,
}: {
  detail: ReservationDetail
  disabled: boolean
  onCorrect: (entry: FinancialEntry) => void
}) {
  if (!detail.financialEntries.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Sin movimientos</EmptyTitle>
          <EmptyDescription>
            Los pagos registrados aparecerán aquí.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium">Movimientos</h3>
      {[...detail.financialEntries]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((e) => (
          <article key={e.id} className="flex flex-col gap-2 border-b pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p>
                  {labels[e.kind]}
                  {e.method
                    ? ` · ${paymentMethods.find((m) => m.value === e.method)?.label ?? e.method}`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.paymentDate ?? e.occurredAt.slice(0, 10)}
                  {e.voidedAt ? " · Anulado" : ""}
                </p>
                <p className="text-xs break-words text-muted-foreground">
                  {e.reference || "Sin referencia"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">
                  {formatMoney(e.amountCents)}
                </span>
                {!e.voidedAt && e.kind !== "legacy_discount_excluded" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={disabled}
                          aria-label={`Acciones de ${labels[e.kind]} ${e.paymentDate ?? e.occurredAt.slice(0, 10)}`}
                        />
                      }
                    >
                      <EllipsisIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => onCorrect(e)}>
                          Corregir movimiento
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            {e.reason && (
              <p className="text-xs text-muted-foreground">{e.reason}</p>
            )}
            {e.voidedAt && (
              <p className="text-xs text-muted-foreground">
                Corrección: {e.correctionReason}
              </p>
            )}
            {["discount", "waiver"].includes(e.kind) && (
              <p className="text-xs text-muted-foreground">
                Aplicado: {formatMoney(e.appliedCents)}
              </p>
            )}
          </article>
        ))}
    </section>
  )
}

function ReservationHistory({ detail }: { detail: ReservationDetail }) {
  const physical = useRooms()
  const roomName = (id: string | null) =>
    physical.data?.find((r) => r.id === id)?.number ??
    (id ? "Habitación no disponible" : "Sin asignar")
  return (
    <>
      <h3 className="font-medium">Estancias y precios guardados</h3>
      {detail.rooms.map((l, i) => (
        <article key={l.id} className="flex flex-col gap-2 border-b pb-4">
          <h4 className="font-medium">
            {l.roomTypeName} · Hab. {l.roomNumber ?? i + 1}
          </h4>
          <p>
            Reserva original: {l.originalCheckIn ?? "No disponible"} al{" "}
            {l.originalCheckOut ?? "No disponible"}
          </p>
          <p>
            Fechas actuales: {l.checkIn} al {l.checkOut}
          </p>
          <p>Llegada real: {l.actualArrival ?? "No registrada"}</p>
          <p>Salida real: {l.actualDeparture ?? "No registrada"}</p>
          {l.cancellationReason && <p>Motivo: {l.cancellationReason}</p>}
          <details>
            <summary className="cursor-pointer">Precios por noche</summary>
            <div className="mt-2 flex flex-col gap-1">
              {l.nights.map((n) => (
                <p key={n.date}>
                  {n.date} · {formatMoney(n.priceCents)}
                </p>
              ))}
            </div>
          </details>
        </article>
      ))}
      <h3 className="font-medium">Historial de la reserva</h3>
      {!detail.history.length && (
        <p className="text-muted-foreground">
          No hay cambios registrados. Las reservas anteriores pueden no tener
          historial.
        </p>
      )}
      {[...detail.history]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((e) => (
          <article key={e.id} className="flex flex-col gap-2 border-l-2 pl-3">
            <h4 className="font-medium">
              {e.kind
                .split(", ")
                .map((k) => eventLabels[k] ?? k)
                .join(" · ")}
            </h4>
            <p className="text-xs text-muted-foreground">{e.createdAt}</p>
            {e.reason && <p>{e.reason}</p>}
            {e.before?.lines?.map((before) => {
              const after = !Array.isArray(e.after)
                ? e.after?.lines?.find((l) => l.id === before.id)
                : undefined
              return after && before.roomId !== after.roomId ? (
                <p key={before.id}>
                  Asignación: {roomName(before.roomId)} →{" "}
                  {roomName(after.roomId)}
                </p>
              ) : null
            })}
            <details>
              <summary className="cursor-pointer text-xs">
                Ver datos del cambio
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto bg-muted p-3 text-xs break-all whitespace-pre-wrap">
                {JSON.stringify({ antes: e.before, después: e.after }, null, 2)}
              </pre>
            </details>
          </article>
        ))}
    </>
  )
}

function ActionForm({
  detail,
  intent,
  onClose,
  onReady,
}: {
  detail: ReservationDetail
  intent: Intent
  onClose: () => void
  onReady: (title: string, actions: WorkflowAction[]) => void
}) {
  const rooms = useRooms()
  const entry = intent.type === "correction" ? intent.entry : null
  const confirmationId = useId()
  const initialKind =
    intent.type === "financial"
      ? intent.kind
      : entry?.kind === "legacy_signed" ||
          entry?.kind === "legacy_discount_excluded"
        ? "payment"
        : (entry?.kind ?? "payment")
  const [kind, setKind] = useState<FinancialInput["kind"]>(initialKind)
  const [amount, setAmount] = useState(
    formatMajor(
      entry?.amountCents && entry.amountCents > 0
        ? entry.amountCents
        : initialKind === "waiver"
          ? Math.max(0, detail.balanceCents)
          : initialKind === "refund"
            ? detail.creditCents
            : Math.max(0, detail.balanceCents)
    )
  )
  const [reason, setReason] = useState("")
  const isCancellation =
    intent.type === "cancel" || intent.type === "cancel-room"
  const cancellationLineId =
    intent.type === "cancel-room" ? intent.lineId : null
  const cancellationCommand = useMemo<WorkflowCommand>(
    () => ({
      requestId: crypto.randomUUID(),
      version: detail.version,
      actions: [
        cancellationLineId
          ? {
              type: "cancel-room",
              lineId: cancellationLineId,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            }
          : {
              type: "cancel",
              confirmed: true,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            },
      ],
    }),
    [detail.version, reason, cancellationLineId]
  )
  const cancellationPreview = useQuery({
    queryKey: ["cancellation-preview", detail.id, cancellationCommand],
    queryFn: () => previewWorkflow(detail.id, cancellationCommand),
    enabled: isCancellation,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const cancellation = useWorkflowCommand()

  const [entryReason, setEntryReason] = useState(entry?.reason ?? "")
  const [method, setMethod] = useState<string>(entry?.method ?? "cash")
  const [date, setDate] = useState(
    entry?.paymentDate ?? entry?.occurredAt.slice(0, 10) ?? today()
  )
  const [reference, setReference] = useState(entry?.reference ?? "")
  const [replace, setReplace] = useState("replace")
  const [roomId, setRoomId] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState("")
  const line =
    "lineId" in intent ? detail.rooms.find((l) => l.id === intent.lineId) : null
  const title =
    intent.type === "financial"
      ? {
          payment: "Registrar pago",
          refund: "Registrar devolución",
          discount: "Aplicar descuento",
          waiver: "Condonar saldo",
        }[kind]
      : intent.type === "correction"
        ? "Corregir movimiento"
        : {
            move: "Mover habitación ahora",
            "undo-check-in": "Corregir llegada por error",
            "cancel-room": "Cancelar habitación",
            "no-show": "No se presentó",
            cancel: "Cancelar reserva",
          }[intent.type]
  async function submit() {
    setError("")
    if (
      intent.type !== "financial" &&
      intent.type !== "cancel" &&
      intent.type !== "cancel-room" &&
      !reason.trim() &&
      intent.type !== "move"
    ) {
      setError("Escribe un motivo.")
      return
    }
    let action: WorkflowAction
    if (intent.type === "financial" || intent.type === "correction") {
      const cents = parseMajorToCents(amount)
      if (
        (intent.type === "financial" || replace === "replace") &&
        (!cents || cents <= 0)
      ) {
        setError("Introduce un importe positivo con hasta dos decimales.")
        return
      }
      const r = intent.type === "correction" ? entryReason : reason
      if (
        (intent.type === "financial" || replace === "replace") &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today())
      ) {
        setError("Indica una fecha válida, hasta hoy.")
        return
      }
      if (
        (intent.type === "financial" || replace === "replace") &&
        kind !== "payment" &&
        !r.trim()
      ) {
        setError("Escribe el motivo del movimiento.")
        return
      }
      const financial: FinancialInput = {
        kind,
        amountCents: cents ?? 0,
        method: method as FinancialInput["method"],
        ...(r.trim() ? { reason: r.trim() } : {}),
        ...(kind === "payment"
          ? { paymentDate: date }
          : { occurredAt: `${date}T00:00:00.000Z` }),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      }
      action =
        intent.type === "financial"
          ? { type: "financial", entry: financial }
          : {
              type: "correct-financial",
              entryId: intent.entry.id,
              reason,
              ...(replace === "replace" ? { replacement: financial } : {}),
            }
    } else if (intent.type === "move")
      action = { type: "move", lineId: intent.lineId, roomId }
    else if (intent.type === "undo-check-in") {
      if (!confirmed) return
      action = {
        type: "undo-check-in",
        lineId: intent.lineId,
        reason,
        guestsNotArrived: true,
      }
    } else if (isCancellation) {
      if (
        (intent.type === "cancel" && !confirmed) ||
        !cancellationPreview.data ||
        cancellationPreview.isFetching ||
        cancellationPreview.error ||
        cancellation.isPending
      )
        return
      try {
        await cancellation.mutateAsync({
          id: detail.id,
          command: cancellationCommand,
        })
        toast.add({
          title:
            intent.type === "cancel-room"
              ? "Habitación cancelada"
              : "Reserva cancelada",
          type: "success",
        })
        onClose()
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo cancelar la reserva."
        )
      }
      return
    } else
      action = {
        type: intent.type as "cancel-room" | "no-show",
        lineId: intent.lineId,
        reason,
      }
    onReady(title, [action])
  }
  const financial = intent.type === "financial" || intent.type === "correction"
  const Root = isCancellation ? AlertDialog : Dialog
  const Content = isCancellation ? AlertDialogContent : DialogContent
  const Header = isCancellation ? AlertDialogHeader : DialogHeader
  const Title = isCancellation ? AlertDialogTitle : DialogTitle
  const Description = isCancellation
    ? AlertDialogDescription
    : DialogDescription
  const Footer = isCancellation ? AlertDialogFooter : "div"
  const CancelButton = isCancellation ? AlertDialogCancel : Button
  const ConfirmButton = isCancellation ? AlertDialogAction : Button
  return (
    <Root open onOpenChange={(v) => !v && !cancellation.isPending && onClose()}>
      <Content
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
        {...(!isCancellation
          ? { showCloseButton: !cancellation.isPending }
          : {})}
      >
        <Header>
          <Title>{title}</Title>
          <Description>
            {intent.type === "cancel"
              ? "Se cancelarán todas las habitaciones y sus cargos, incluso las noches utilizadas. Los pagos quedarán como crédito. Confirmar aplicará el cambio inmediatamente. Otros cambios sin guardar se descartarán. No devuelve dinero."
              : intent.type === "correction"
                ? "El original quedará visible como anulado. Registra lo que realmente ocurrió; esta corrección no mueve dinero."
                : intent.type === "move"
                  ? "El cambio se registra ahora. Se conserva el precio y la habitación anterior queda libre para el resto de la estancia."
                  : intent.type === "cancel-room"
                    ? "Se eliminarán los cargos de esta habitación y se conservará su estancia real. Confirmar aplicará el cambio inmediatamente. Otros cambios sin guardar se descartarán."
                    : "Revisa los datos y el saldo antes de confirmar."}
          </Description>
        </Header>
        <FieldGroup>
          {intent.type === "correction" && (
            <ChoiceField
              label="Corrección"
              value={replace}
              onChange={setReplace}
              options={[
                { value: "replace", label: "Anular y reemplazar" },
                { value: "void", label: "Anular sin reemplazo" },
              ]}
            />
          )}
          {financial &&
            (intent.type !== "correction" || replace === "replace") && (
              <>
                {entry?.kind === "legacy_signed" && (
                  <ChoiceField
                    label="Tipo del movimiento real"
                    value={kind}
                    onChange={(v) => setKind(v as FinancialInput["kind"])}
                    options={[
                      { value: "payment", label: "Pago" },
                      { value: "refund", label: "Devolución" },
                    ]}
                  />
                )}
                <TextField
                  label="Importe S/"
                  value={amount}
                  onChange={setAmount}
                />
                {["payment", "refund"].includes(kind) && (
                  <ChoiceField
                    label="Método"
                    value={method}
                    onChange={setMethod}
                    options={[
                      { value: "cash", label: "Efectivo" },
                      { value: "card", label: "Tarjeta" },
                      { value: "transfer", label: "Transferencia" },
                      { value: "yape", label: "Yape" },
                      { value: "other", label: "Otro" },
                    ]}
                  />
                )}
                <TextField
                  label={
                    kind === "payment"
                      ? "Fecha del pago"
                      : "Fecha del movimiento"
                  }
                  type="date"
                  required
                  max={today()}
                  value={date}
                  onChange={setDate}
                />
                <TextField
                  label="Referencia · Opcional"
                  value={reference}
                  onChange={setReference}
                />
                {intent.type === "correction" && (
                  <TextField
                    label="Motivo del movimiento corregido"
                    value={entryReason}
                    onChange={setEntryReason}
                  />
                )}
              </>
            )}
          {intent.type === "move" ? (
            <ChoiceField
              label="Nueva habitación del mismo tipo"
              value={roomId}
              onChange={setRoomId}
              options={(rooms.data ?? [])
                .filter(
                  (r) =>
                    r.roomTypeId === line?.roomTypeId && r.id !== line?.roomId
                )
                .map((r) => ({ value: r.id, label: r.number }))}
            />
          ) : (
            <TextField
              label={
                intent.type === "correction"
                  ? "Motivo de la corrección"
                  : intent.type === "cancel" || intent.type === "cancel-room"
                    ? "Motivo (opcional)"
                    : kind === "payment" && intent.type === "financial"
                      ? "Nota opcional"
                      : "Motivo obligatorio"
              }
              value={reason}
              disabled={cancellation.isPending}
              onChange={setReason}
            />
          )}
          {intent.type === "undo-check-in" && (
            <Field orientation="horizontal">
              <Checkbox
                id={confirmationId}
                disabled={cancellation.isPending}
                checked={confirmed}
                onCheckedChange={setConfirmed}
              />
              <FieldLabel htmlFor={confirmationId}>
                Los huéspedes no llegaron. La entrada fue un error de registro.
              </FieldLabel>
            </Field>
          )}
          {intent.type === "cancel" && (
            <Field orientation="horizontal">
              <Checkbox
                id={confirmationId}
                disabled={cancellation.isPending}
                checked={confirmed}
                onCheckedChange={setConfirmed}
              />
              <FieldLabel htmlFor={confirmationId}>
                Confirmo la cancelación de toda la reserva.
              </FieldLabel>
            </Field>
          )}
          {intent.type === "correction" && entry?.kind === "refund" && (
            <p>
              El dinero que realmente se devolvió debe permanecer registrado. No
              anules una devolución real para aumentar el crédito.
            </p>
          )}
        </FieldGroup>
        {isCancellation &&
          (cancellationPreview.data ? (
            <WorkflowBill bill={cancellationPreview.data} />
          ) : cancellationPreview.error ? (
            <FieldError>{cancellationPreview.error.message}</FieldError>
          ) : (
            <p role="status" className="text-muted-foreground">
              Calculando cancelación…
            </p>
          ))}
        <FieldError>{error}</FieldError>
        <Footer className="flex justify-end gap-2">
          <CancelButton
            type="button"
            variant="outline"
            disabled={cancellation.isPending}
            onClick={onClose}
          >
            Volver
          </CancelButton>
          <ConfirmButton
            type="button"
            variant={isCancellation ? "destructive" : "default"}
            onClick={() => void submit()}
            disabled={
              cancellation.isPending ||
              (isCancellation &&
                (!cancellationPreview.data ||
                  cancellationPreview.isFetching ||
                  !!cancellationPreview.error)) ||
              (["cancel", "undo-check-in"].includes(intent.type) &&
                !confirmed) ||
              (intent.type === "move" && !roomId)
            }
          >
            {cancellation.isPending
              ? "Cancelando…"
              : isCancellation
                ? "Confirmar"
                : "Aplicar"}
          </ConfirmButton>
        </Footer>
      </Content>
    </Root>
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
