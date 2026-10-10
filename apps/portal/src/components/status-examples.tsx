import { useId, useState, type FormEvent } from "react"
import { differenceInCalendarDays, parseISO } from "date-fns"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

import { BookingSummary } from "@/components/booking-summary"
import { DateField } from "@/components/date-field"
import { ReservationPayments } from "@/components/reservation-payments"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { bookingRoomCharges, bookingSummary } from "@/lib/booking-prices"
import { format } from "@/lib/dates"
import { contactErrors } from "@/lib/form-validation"
import { CURRENCY, formatMoney } from "@/lib/money"
import {
  bulkTransition,
  commonStatus,
  createStatusExample,
  exampleScenarios,
  exampleStatuses,
  recalculateExample,
  recordExamplePayment,
  removeExampleRoom,
  roomRemovalReason,
  roomTransitionReason,
  saveStatusExample,
  statusLabel,
  statusSummary,
  type ExampleReservation,
  type ExampleRoom,
  type ExampleScenario,
  type ExampleStatus,
} from "@/lib/status-examples"
import { useFieldValidation } from "@/lib/use-field-validation"

const designs = [
  {
    value: "a",
    label: "A · General",
    title: "Un selector en el pie",
    description:
      "Cambia el estado de las habitaciones elegibles desde un solo control.",
    task: "Prueba registrar la llegada de todos los huéspedes con una sola selección.",
  },
  {
    value: "b",
    label: "B · Por habitación",
    title: "Un selector por habitación",
    description: "Cada habitación tiene su propio estado junto a sus datos.",
    task: "Con dos habitaciones, registra la llegada de la 101 y deja la 102 confirmada.",
  },
  {
    value: "c",
    label: "C · Combinado",
    title: "Estado general con excepciones por habitación",
    description:
      "Cambia el estado desde el pie de la reserva y despliega los controles por habitación cuando los necesites.",
    task: "Prueba el check-in conjunto, Quitar y Deshacer para una habitación extra, y el check-out individual desde Gestionar estados por habitación.",
  },
] as const
type Design = (typeof designs)[number]["value"]

function initialExamples(scenario: ExampleScenario, today: string) {
  return {
    a: createStatusExample(scenario, today),
    b: createStatusExample(scenario, today),
    c: createStatusExample(scenario, today),
  }
}

export function StatusExamples() {
  const scenarioId = useId()
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [design, setDesign] = useState<Design>("c")
  const [scenario, setScenario] = useState<ExampleScenario>("multiple")
  const [examples, setExamples] = useState(() =>
    initialExamples("multiple", today)
  )
  const [open, setOpen] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const selected = designs.find((item) => item.value === design)!
  const selectedScenario = exampleScenarios.find(
    (item) => item.value === scenario
  )!
  const reservation = examples[design]

  function reset(nextScenario = scenario) {
    setScenario(nextScenario)
    setExamples(initialExamples(nextScenario, today))
    setResetKey((current) => current + 1)
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">Ejemplos de estado</h1>
            <Badge variant="outline">Prototipo</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Compara los tres diseños con la misma reserva. Los cambios se
            guardan solo en este ejemplo y cada diseño conserva su propia
            prueba.
          </p>
        </header>

        <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
          <Field>
            <FieldLabel id="status-example-design-label">Diseño</FieldLabel>
            <ToggleGroup
              variant="outline"
              value={[design]}
              onValueChange={(values) => {
                const next = values[0]
                if (next === "a" || next === "b" || next === "c")
                  setDesign(next)
              }}
              aria-labelledby="status-example-design-label"
              className="flex-wrap"
            >
              {designs.map((item) => (
                <ToggleGroupItem key={item.value} value={item.value}>
                  {item.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor={scenarioId}>Escenario</FieldLabel>
            <Select
              items={exampleScenarios}
              value={scenario}
              onValueChange={(value) => {
                if (exampleScenarios.some((item) => item.value === value))
                  reset(value as ExampleScenario)
              }}
            >
              <SelectTrigger id={scenarioId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {exampleScenarios.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <Card>
          <CardHeader>
            <CardTitle>
              {selected.label}: {selected.title}
            </CardTitle>
            <CardDescription>{selected.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm">{selectedScenario.hint}</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">Huésped</dt>
                <dd>{reservation.guest.fullName}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">Estado guardado</dt>
                <dd>{statusSummary(reservation.rooms)}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">Total de reserva</dt>
                <dd>{formatMoney(reservation.totalCents, CURRENCY)}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">{selected.task}</p>
          </CardContent>
          <CardFooter className="flex-wrap gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button />}>Abrir reserva</DialogTrigger>
              {open ? (
                <ExampleDialog
                  key={`${design}-${scenario}-${resetKey}`}
                  design={design}
                  saved={reservation}
                  today={today}
                  onSave={(next) =>
                    setExamples((current) => ({ ...current, [design]: next }))
                  }
                  onClose={() => setOpen(false)}
                  onReset={() => reset()}
                />
              ) : null}
            </Dialog>
            <Button variant="outline" onClick={() => reset()}>
              <RotateCcwIcon data-icon="inline-start" />
              Reiniciar ejemplos
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}

function StatusSelect({
  id,
  label,
  value,
  reasons,
  description,
  onChange,
}: {
  id: string
  label: string
  value: ExampleStatus | "mixed"
  reasons: Partial<Record<ExampleStatus, string | null>>
  description?: string
  onChange: (status: ExampleStatus) => void
}) {
  const items =
    value === "mixed"
      ? [{ value: "mixed", label: "Estados mixtos" }, ...exampleStatuses]
      : exampleStatuses
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (exampleStatuses.some((item) => item.value === next))
            onChange(next as ExampleStatus)
        }}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-describedby={description ? `${id}-description` : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => {
              const reason =
                item.value === "mixed"
                  ? "Gestiona los estados por habitación."
                  : reasons[item.value as ExampleStatus]
              return (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  disabled={Boolean(reason)}
                  title={reason ?? undefined}
                >
                  {item.label}
                </SelectItem>
              )
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description ? (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      ) : null}
    </Field>
  )
}

function ExampleDialog({
  design,
  saved,
  today,
  onSave,
  onClose,
  onReset,
}: {
  design: Design
  saved: ExampleReservation
  today: string
  onSave: (reservation: ExampleReservation) => void
  onClose: () => void
  onReset: () => void
}) {
  const formId = useId()
  const paymentFormId = useId()
  const scopeId = useId()
  const [draft, setDraft] = useState(() => structuredClone(saved))
  const [tab, setTab] = useState("details")
  const [roomControls, setRoomControls] = useState<boolean | null>(null)
  const showRoomControls = roomControls ?? commonStatus(draft.rooms) === "mixed"
  const [removedRooms, setRemovedRooms] = useState<ExampleRoom[]>([])
  const [bulkChoice, setBulkChoice] = useState<ExampleStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const changedRooms = draft.rooms.filter(
    (room) =>
      saved.rooms.find((item) => item.id === room.id)?.status !== room.status
  )
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const baseline = {
    ...saved,
    rooms: draft.rooms.map((room) => ({
      ...room,
      status: saved.rooms.find((item) => item.id === room.id)!.status,
    })),
  }
  const preview = saveStatusExample(saved, draft, today)
  const summaryRooms = preview.rooms.map((room) => ({
    key: room.id,
    typeName: `${room.roomTypeName} · ${room.roomNumber ?? "Sin asignar"}`,
    adults: room.adults,
    children: room.children,
    status: room.status,
    charges: bookingRoomCharges(
      room.nights,
      undefined,
      false,
      room.discountCents
    ),
    invalid: false,
  }))
  const contact = contactErrors(draft.guest.fullName, draft.guest.email ?? "")
  const validation = useFieldValidation({
    [`${formId}-full-name`]: contact.fullName,
    [`${formId}-email`]: contact.email,
  })
  const reasons = Object.fromEntries(
    exampleStatuses.map((item) => [
      item.value,
      commonStatus(baseline.rooms) === item.value
        ? null
        : bulkTransition(baseline, item.value, today).reason,
    ])
  )
  const affected = bulkChoice
    ? bulkTransition(baseline, bulkChoice, today).roomIds
    : []
  const scope =
    bulkChoice && affected.length
      ? `Se aplicará ${statusLabel(bulkChoice)} a: ${draft.rooms
          .filter((room) => affected.includes(room.id))
          .map((room) =>
            room.roomNumber
              ? `Hab. ${room.roomNumber}`
              : "habitación sin asignar"
          )
          .join(", ")}. Las demás conservan su estado.`
      : baseline.rooms.some(
            (room) => !room.roomId && room.status === "confirmed"
          )
        ? "Asigna todas las habitaciones confirmadas antes del check-in general."
        : baseline.rooms.every(
              (room) =>
                room.status !== "confirmed" && room.status !== "checked_in"
            )
          ? "Esta reserva tiene estados finales. No hay cambios de estado disponibles."
          : "El cambio general se aplica a las habitaciones elegibles al pulsar Guardar."

  function update(next: ExampleReservation) {
    setDraft(next)
    setMessage(null)
    setError(null)
  }

  function selectBulk(next: ExampleStatus) {
    const restoring = commonStatus(baseline.rooms) === next
    const targetIds = restoring
      ? []
      : bulkTransition(baseline, next, today).roomIds
    update({
      ...draft,
      rooms: draft.rooms.map((room) => ({
        ...room,
        status: targetIds.includes(room.id)
          ? next
          : saved.rooms.find((item) => item.id === room.id)!.status,
      })),
    })
    setBulkChoice(restoring ? null : next)
    setRoomControls(null)
  }

  function selectRoom(id: string, status: ExampleStatus) {
    update({
      ...draft,
      rooms: draft.rooms.map((room) =>
        room.id === id ? { ...room, status } : room
      ),
    })
    setBulkChoice(null)
    setRoomControls(true)
  }

  function removeRoom(room: ExampleRoom) {
    update(removeExampleRoom(saved, draft, room.id))
    setRemovedRooms((current) => [...current, room])
    setBulkChoice(null)
    setRoomControls(null)
  }

  function undoRemoval(room: ExampleRoom) {
    const rooms = [...draft.rooms, room].sort(
      (a, b) =>
        saved.rooms.findIndex((item) => item.id === a.id) -
        saved.rooms.findIndex((item) => item.id === b.id)
    )
    update(recalculateExample({ ...draft, rooms }))
    setRemovedRooms((current) => current.filter((item) => item.id !== room.id))
    setBulkChoice(null)
    setRoomControls(null)
  }

  function discard() {
    setDraft(structuredClone(saved))
    setBulkChoice(null)
    setRemovedRooms([])
    setRoomControls(null)
    setMessage(null)
    setError(null)
    validation.reset()
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validation.validate(event.currentTarget)) {
      setTab("details")
      return
    }
    try {
      const next = saveStatusExample(saved, draft, today)
      onSave(next)
      setDraft(structuredClone(next))
      setBulkChoice(null)
      setRemovedRooms([])
      setRoomControls(null)
      setMessage("Cambios guardados en este ejemplo.")
      setError(null)
      validation.reset()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el ejemplo."
      )
    }
  }

  const generalSelect = (
    <StatusSelect
      id={`${formId}-general-status`}
      label="Estado de la reserva"
      value={
        design === "c"
          ? commonStatus(draft.rooms)
          : (bulkChoice ?? commonStatus(draft.rooms))
      }
      reasons={reasons}
      description={scope}
      onChange={selectBulk}
    />
  )

  return (
    <DialogContent className="w-[calc(100%-2rem)] sm:max-w-5xl">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(String(value))}
        className="max-h-[calc(100svh-4rem)] min-h-0 gap-0"
      >
        <DialogHeader className="shrink-0 gap-2 pr-8 pb-1">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Editar reserva
            <Badge variant="secondary">{saved.code}</Badge>
          </DialogTitle>
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="Estado guardado"
          >
            <StatusBadges rooms={saved.rooms} />
            {dirty ? <Badge variant="outline">Cambios pendientes</Badge> : null}
          </div>
          <DialogDescription>
            Diseño {design.toUpperCase()} · Reserva de ejemplo · Los cambios se
            aplican con Guardar.
          </DialogDescription>
          {design === "c" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={onReset}
            >
              <RotateCcwIcon data-icon="inline-start" />
              Reiniciar ejemplo
            </Button>
          ) : null}
          <TabsList
            variant="line"
            className="mt-1 -ml-1.5"
            aria-label="Secciones de la reserva"
          >
            <TabsTrigger value="details">Detalles</TabsTrigger>
            <TabsTrigger value="payments">Pagos</TabsTrigger>
          </TabsList>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-1">
          <TabsContent
            value="details"
            keepMounted
            className="data-hidden:hidden"
          >
            <form
              id={formId}
              onSubmit={save}
              noValidate
              className="grid gap-6 py-5 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start"
            >
              <FieldGroup className="min-w-0 gap-6">
                <FieldSet>
                  <FieldLegend className="sr-only">
                    Fechas de estancia
                  </FieldLegend>
                  <FieldGroup className="grid max-w-md grid-cols-2 gap-3">
                    <DateField
                      id={`${formId}-check-in`}
                      label="Entrada"
                      value={parseISO(saved.checkIn)}
                      timeZone={timeZone}
                      locked
                      onChange={() => undefined}
                    />
                    <DateField
                      id={`${formId}-check-out`}
                      label="Salida"
                      value={parseISO(saved.checkOut)}
                      timeZone={timeZone}
                      locked
                      onChange={() => undefined}
                    />
                  </FieldGroup>
                </FieldSet>

                <FieldSet>
                  <FieldLegend>Habitaciones y huéspedes</FieldLegend>
                  <FieldGroup id={scopeId} className="gap-3">
                    {draft.rooms.map((room, index) => (
                      <FieldSet
                        key={room.id}
                        className="min-w-0 gap-3 border p-3"
                      >
                        <FieldLegend variant="label">
                          Habitación {index + 1}
                        </FieldLegend>
                        <FieldGroup className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <ExampleInput
                            id={`${room.id}-type`}
                            label="Tipo"
                            value={room.roomTypeName ?? "Doble"}
                            readOnly
                          />
                          <Field>
                            <FieldLabel htmlFor={`${room.id}-number`}>
                              Hab.
                            </FieldLabel>
                            {room.roomId ? (
                              <Input
                                id={`${room.id}-number`}
                                value={room.roomNumber ?? ""}
                                readOnly
                              />
                            ) : (
                              <Select
                                items={[
                                  { value: "unassigned", label: "Sin asignar" },
                                  { value: "102", label: "102" },
                                ]}
                                value="unassigned"
                                onValueChange={(value) => {
                                  if (value === "102")
                                    update({
                                      ...draft,
                                      rooms: draft.rooms.map((item) =>
                                        item.id === room.id
                                          ? {
                                              ...item,
                                              roomId: "example-room-102",
                                              roomNumber: "102",
                                            }
                                          : item
                                      ),
                                    })
                                }}
                              >
                                <SelectTrigger
                                  id={`${room.id}-number`}
                                  className="w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    <SelectItem value="unassigned">
                                      Sin asignar
                                    </SelectItem>
                                    <SelectItem value="102">102</SelectItem>
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            )}
                          </Field>
                          <ExampleInput
                            id={`${room.id}-adults`}
                            label="Adultos"
                            value={String(room.adults)}
                            readOnly
                          />
                          <ExampleInput
                            id={`${room.id}-children`}
                            label="Niños"
                            value={String(room.children)}
                            readOnly
                          />
                        </FieldGroup>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-0 flex-1">
                            {design === "b" ||
                            (design === "c" &&
                              showRoomControls &&
                              draft.rooms.length > 1) ? (
                              <RoomStatus
                                room={room}
                                saved={saved}
                                today={today}
                                onChange={(status) =>
                                  selectRoom(room.id, status)
                                }
                              />
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">
                                  {statusLabel(
                                    saved.rooms.find(
                                      (item) => item.id === room.id
                                    )!.status
                                  )}
                                </Badge>
                                {room.status !==
                                saved.rooms.find((item) => item.id === room.id)!
                                  .status ? (
                                  <span className="text-muted-foreground">
                                    Al guardar: {statusLabel(room.status)}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>
                          {design === "c" &&
                          saved.rooms.find((item) => item.id === room.id)!
                            .status === "confirmed" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Quitar habitación ${room.roomNumber ?? "sin asignar"}`}
                              disabled={Boolean(
                                roomRemovalReason(saved, draft, room.id)
                              )}
                              title={
                                roomRemovalReason(saved, draft, room.id) ??
                                "Quitar una habitación añadida por error"
                              }
                              onClick={() => removeRoom(room)}
                            >
                              <Trash2Icon data-icon="inline-start" />
                              Quitar
                            </Button>
                          ) : null}
                        </div>
                      </FieldSet>
                    ))}
                    {design === "c" && removedRooms.length ? (
                      <div role="status" className="flex flex-col gap-2">
                        {removedRooms.map((room) => (
                          <div
                            key={room.id}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <p>
                              Habitación {room.roomNumber ?? "sin asignar"}{" "}
                              quitada. Se aplicará al guardar.
                            </p>
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              aria-label={`Deshacer eliminación de habitación ${room.roomNumber ?? "sin asignar"}`}
                              onClick={() => undoRemoval(room)}
                            >
                              Deshacer
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {design === "c" && draft.rooms.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="self-start"
                        aria-expanded={showRoomControls}
                        aria-controls={scopeId}
                        onClick={() => setRoomControls(!showRoomControls)}
                      >
                        {showRoomControls ? (
                          <ChevronUpIcon data-icon="inline-start" />
                        ) : (
                          <ChevronDownIcon data-icon="inline-start" />
                        )}
                        {showRoomControls
                          ? "Ocultar estados por habitación"
                          : "Gestionar estados por habitación"}
                      </Button>
                    ) : null}
                  </FieldGroup>
                </FieldSet>

                <FieldSet>
                  <FieldLegend>Contacto principal</FieldLegend>
                  <FieldGroup className="grid grid-cols-2 gap-3">
                    {(
                      [
                        ["fullName", "Nombre completo", "full-name"],
                        ["email", "Correo", "email"],
                        ["phone", "Teléfono", "phone"],
                      ] as const
                    ).map(([key, label, suffix]) => (
                      <ExampleInput
                        key={key}
                        id={`${formId}-${suffix}`}
                        label={label}
                        value={draft.guest[key] ?? ""}
                        error={validation.errorFor(`${formId}-${suffix}`)}
                        onBlur={() => validation.touch(`${formId}-${suffix}`)}
                        onChange={(value) =>
                          update({
                            ...draft,
                            guest: { ...draft.guest, [key]: value },
                          })
                        }
                      />
                    ))}
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>

              <div className="flex min-w-0 flex-col gap-3">
                {dirty ? (
                  <p className="text-muted-foreground">
                    Vista previa al guardar
                  </p>
                ) : null}
                <BookingSummary
                  rooms={summaryRooms}
                  summary={bookingSummary(summaryRooms, saved.paidCents)}
                  paidCents={saved.paidCents}
                  currency={CURRENCY}
                  stayLabel={`${format(parseISO(preview.checkIn), "d MMM")} al ${format(parseISO(preview.checkOut), "d MMM")} · ${differenceInCalendarDays(parseISO(preview.checkOut), parseISO(preview.checkIn))} noches`}
                  showPayments
                  message="Importes en soles."
                />
                <p className="text-muted-foreground">
                  {
                    preview.rooms.filter(
                      (room) =>
                        room.status === "confirmed" ||
                        room.status === "checked_in"
                    ).length
                  }{" "}
                  de {preview.rooms.length} habitaciones bloquean
                  disponibilidad.
                </p>
              </div>
            </form>
          </TabsContent>
          <TabsContent
            value="payments"
            keepMounted
            className="data-hidden:hidden"
          >
            <ReservationPayments
              formId={paymentFormId}
              reservation={saved}
              pending={false}
              onError={setPaymentError}
              onRecord={async (body) => {
                const next = recordExamplePayment(
                  saved,
                  body,
                  crypto.randomUUID()
                )
                onSave(next)
                setDraft((current) => ({
                  ...current,
                  payments: next.payments,
                  paidCents: next.paidCents,
                  balanceCents: current.totalCents - next.paidCents,
                }))
                return next
              }}
            />
          </TabsContent>
        </div>

        <DialogFooter className="grid shrink-0 grid-cols-2 gap-3 pt-3 sm:flex sm:flex-wrap sm:items-end">
          {error || (tab === "payments" && paymentError) ? (
            <FieldError className="col-span-2 sm:basis-full">
              {error ?? paymentError}
            </FieldError>
          ) : null}
          <div role="status" className="col-span-2 min-w-0 sm:basis-full">
            {dirty ? (
              <div className="flex flex-col gap-1">
                <p>
                  {removedRooms.length
                    ? `${removedRooms.length === 1 ? "Se quitará 1 habitación" : `Se quitarán ${removedRooms.length} habitaciones`} al guardar.`
                    : changedRooms.length
                      ? "Cambio de estado pendiente."
                      : "Cambios pendientes."}
                </p>
                {design !== "c"
                  ? changedRooms.map((room) => (
                      <p key={room.id} className="text-muted-foreground">
                        Hab. {room.roomNumber ?? "sin asignar"}:{" "}
                        {statusLabel(
                          saved.rooms.find((item) => item.id === room.id)!
                            .status
                        )}{" "}
                        → {statusLabel(room.status)}
                      </p>
                    ))
                  : null}
              </div>
            ) : (
              message
            )}
          </div>
          {design === "a" || design === "c" ? (
            <FieldGroup className="col-span-2 min-w-0 sm:mr-auto sm:max-w-sm">
              {generalSelect}
            </FieldGroup>
          ) : null}
          {design !== "c" ? (
            <Button type="button" variant="ghost" onClick={onReset}>
              <RotateCcwIcon data-icon="inline-start" />
              Reiniciar
            </Button>
          ) : null}
          {dirty ? (
            <Button type="button" variant="ghost" onClick={discard}>
              Descartar cambios
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {tab === "payments" ? (
            <Button type="submit" form={paymentFormId} variant="outline">
              Registrar pago
            </Button>
          ) : null}
          <Button type="submit" form={formId} disabled={!dirty}>
            Guardar
          </Button>
        </DialogFooter>
      </Tabs>
    </DialogContent>
  )
}

function RoomStatus({
  room,
  saved,
  today,
  onChange,
}: {
  room: ExampleRoom
  saved: ExampleReservation
  today: string
  onChange: (status: ExampleStatus) => void
}) {
  const baseline = saved.rooms.find((item) => item.id === room.id)!
  const reasons = Object.fromEntries(
    exampleStatuses.map((item) => [
      item.value,
      roomTransitionReason(
        { ...room, status: baseline.status },
        item.value,
        saved.checkIn,
        today
      ),
    ])
  )
  const description =
    baseline.status === "confirmed" && !room.roomId
      ? "Asigna una habitación antes de registrar el check-in."
      : baseline.status === "checked_out" ||
          baseline.status === "cancelled" ||
          baseline.status === "no_show"
        ? "Esta habitación tiene un estado final."
        : room.status !== baseline.status
          ? `Estado guardado: ${statusLabel(baseline.status)}. El cambio se aplicará con Guardar.`
          : undefined
  return (
    <StatusSelect
      id={`${room.id}-status`}
      label={`Estado · Hab. ${room.roomNumber ?? "sin asignar"}`}
      value={room.status}
      reasons={reasons}
      description={description}
      onChange={onChange}
    />
  )
}

function StatusBadges({ rooms }: { rooms: ExampleRoom[] }) {
  const mixed = commonStatus(rooms) === "mixed"
  return exampleStatuses.map((item) => {
    const count = rooms.filter((room) => room.status === item.value).length
    if (!count) return null
    return (
      <Badge
        key={item.value}
        variant={item.value === "checked_in" ? "default" : "secondary"}
      >
        {mixed ? `${count} ` : ""}
        {item.label}
      </Badge>
    )
  })
}

function ExampleInput({
  id,
  label,
  value,
  readOnly,
  error,
  onBlur,
  onChange,
}: {
  id: string
  label: string
  value: string
  readOnly?: boolean
  error?: string | null
  onBlur?: () => void
  onChange?: (value: string) => void
}) {
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        readOnly={readOnly}
        maxLength={200}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onBlur={onBlur}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  )
}
