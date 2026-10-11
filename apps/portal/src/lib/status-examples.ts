import type { RecordPaymentInput, ReservationDetail } from "./api.ts"

export const exampleStatuses = [
  { value: "confirmed", label: "Confirmada" },
  { value: "checked_in", label: "Check-in" },
  { value: "checked_out", label: "Check-out" },
  { value: "cancelled", label: "Cancelada" },
  { value: "no_show", label: "No se presentó" },
] as const

export type ExampleStatus = (typeof exampleStatuses)[number]["value"]
export type ExampleRoom = Omit<ReservationDetail["rooms"][number], "status"> & {
  status: ExampleStatus
}
export type ExampleReservation = Omit<ReservationDetail, "rooms"> & {
  rooms: ExampleRoom[]
}

export const exampleScenarios = [
  {
    value: "single",
    label: "Una habitación",
    hint: "Registra el check-in y luego el check-out.",
  },
  {
    value: "multiple",
    label: "Dos habitaciones",
    hint: "Prueba una llegada conjunta y una llegada parcial.",
  },
  {
    value: "mixed",
    label: "Estados mixtos",
    hint: "La habitación 101 llegó; la 102 sigue confirmada.",
  },
  {
    value: "unassigned",
    label: "Habitación sin asignar",
    hint: "Asigna una habitación antes de registrar el check-in.",
  },
  {
    value: "checked_out",
    label: "Check-out realizado",
    hint: "Revisa cómo se muestra una estancia terminada.",
  },
  {
    value: "cancelled",
    label: "Reserva cancelada",
    hint: "Las habitaciones canceladas se excluyen del total.",
  },
  {
    value: "no_show",
    label: "No se presentó",
    hint: "La habitación queda libre; los cargos y pagos se conservan.",
  },
] as const

export type ExampleScenario = (typeof exampleScenarios)[number]["value"]

function offsetDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function statusLabel(status: ExampleStatus) {
  return exampleStatuses.find((item) => item.value === status)!.label
}

export function commonStatus(rooms: ExampleRoom[]): ExampleStatus | "mixed" {
  const first = rooms[0]?.status
  return first && rooms.every((room) => room.status === first) ? first : "mixed"
}

export function statusSummary(rooms: ExampleRoom[]) {
  const status = commonStatus(rooms)
  if (status !== "mixed") return statusLabel(status)
  return exampleStatuses
    .map((item) => {
      const count = rooms.filter((room) => room.status === item.value).length
      return count ? `${count} ${item.label}` : null
    })
    .filter(Boolean)
    .join(" · ")
}

export function recalculateExample(
  reservation: ExampleReservation
): ExampleReservation {
  const rooms = reservation.rooms.map((room) => {
    const subtotalCents = room.nights.reduce(
      (sum, night) => sum + night.priceCents,
      0
    )
    const discountCents = room.discountCents
    return {
      ...room,
      subtotalCents,
      discountCents,
      totalCents: subtotalCents - discountCents,
    }
  })
  const billed = rooms.filter((room) => room.status !== "cancelled")
  const subtotalCents = billed.reduce(
    (sum, room) => sum + room.subtotalCents,
    0
  )
  const discountCents = billed.reduce(
    (sum, room) => sum + room.discountCents,
    0
  )
  const totalCents = subtotalCents - discountCents
  const paidCents = reservation.payments.reduce(
    (sum, payment) => sum + payment.amountCents,
    0
  )
  return {
    ...reservation,
    rooms,
    subtotalCents,
    discountCents,
    totalCents,
    paidCents,
    balanceCents: totalCents - paidCents,
  }
}

export function createStatusExample(
  scenario: ExampleScenario,
  today: string
): ExampleReservation {
  const count = ["multiple", "mixed", "unassigned"].includes(scenario) ? 2 : 1
  const checkIn = offsetDate(today, -1)
  const checkOut = offsetDate(today, 2)
  const rooms: ExampleRoom[] = Array.from({ length: count }, (_, index) => {
    const status: ExampleStatus =
      scenario === "mixed" && index === 0
        ? "checked_in"
        : scenario === "checked_out" ||
            scenario === "cancelled" ||
            scenario === "no_show"
          ? scenario
          : "confirmed"
    const assigned = scenario !== "unassigned" || index === 0
    const number = String(101 + index)
    return {
      id: `example-line-${index + 1}`,
      roomTypeId: "example-double",
      checkIn,
      checkOut: status === "checked_out" ? today : checkOut,
      originalCheckIn: null,
      originalCheckOut: null,
      originalNights: null,
      actualArrival: null,
      actualDeparture: null,
      assignmentStart: null,
      cancellationReason: null,
      roomTypeName: "Doble",
      roomId: assigned ? `example-room-${number}` : null,
      roomNumber: assigned ? number : null,
      adults: 2,
      children: 0,
      status,
      discountCents: 0,
      subtotalCents: 0,
      totalCents: 0,
      nights: Array.from(
        { length: status === "checked_out" ? 1 : 3 },
        (_, night) => ({
          date: offsetDate(checkIn, night),
          priceCents: 15000,
        })
      ),
    }
  })
  return recalculateExample({
    id: "example-reservation",
    code: "DEMO0002",
    version: 0,
    cancelledAt: null,
    notes: null,
    waiverCents: 0,
    refundCents: 0,
    creditCents: 0,
    financialEntries: [],
    stayingGuests: [],
    history: [],
    guestId: "example-guest",
    guest: {
      id: "example-guest",
      fullName: "Ana Pérez",
      email: "ana@example.com",
      phone: "999 123 456",
      notes: null,
    },
    checkIn,
    checkOut: scenario === "checked_out" ? today : checkOut,
    currency: "PEN",
    rooms,
    payments: [
      {
        id: "example-deposit",
        amountCents: 15000,
        method: "yape",
        reference: "DEMO-001",
        paidAt: `${checkIn}T15:00:00Z`,
        notes: "Adelanto de reserva",
      },
    ],
    subtotalCents: 0,
    discountCents: 0,
    totalCents: 0,
    paidCents: 0,
    balanceCents: 0,
  })
}

// A draft may contain an assignment, but transitions always start from the saved status.
export function roomTransitionReason(room: ExampleRoom, next: ExampleStatus) {
  if (next === "checked_in" && !room.roomId)
    return "Asigna una habitación primero."
  return null
}

export function bulkTransition(
  reservation: ExampleReservation,
  next: ExampleStatus
) {
  const from = next === "checked_out" ? "checked_in" : "confirmed"
  const targets =
    next === "confirmed"
      ? []
      : reservation.rooms.filter((room) => room.status === from)
  let reason: string | null
  if (targets.length === 0)
    reason = "No hay habitaciones a las que aplicar este cambio."
  else {
    reason =
      targets.map((room) => roomTransitionReason(room, next)).find(Boolean) ??
      null
  }
  return { roomIds: targets.map((room) => room.id), reason }
}

export function roomRemovalReason(
  saved: ExampleReservation,
  draft: ExampleReservation,
  roomId: string
) {
  const room = saved.rooms.find((item) => item.id === roomId)
  if (!room || !draft.rooms.some((item) => item.id === roomId))
    return "Esta habitación no está en la reserva."
  if (room.status !== "confirmed")
    return "Solo se puede quitar una habitación confirmada que no se ha utilizado."
  if (draft.rooms.length <= 1)
    return "La reserva debe conservar al menos una habitación."
  return null
}

export function removeExampleRoom(
  saved: ExampleReservation,
  draft: ExampleReservation,
  roomId: string
) {
  const reason = roomRemovalReason(saved, draft, roomId)
  if (reason) throw new Error(reason)
  return recalculateExample({
    ...draft,
    rooms: draft.rooms.filter((room) => room.id !== roomId),
  })
}

export function saveStatusExample(
  saved: ExampleReservation,
  draft: ExampleReservation
) {
  if (draft.rooms.length === 0)
    throw new Error("La reserva debe conservar al menos una habitación.")
  const removed = saved.rooms.filter(
    (room) => !draft.rooms.some((item) => item.id === room.id)
  )
  if (removed.some((room) => room.status !== "confirmed"))
    throw new Error(
      "Solo se puede quitar una habitación confirmada que no se ha utilizado."
    )
  const rooms = draft.rooms.map((room) => {
    const before = saved.rooms.find((item) => item.id === room.id)!
    const reason = roomTransitionReason(
      { ...room, status: before.status },
      room.status
    )
    if (reason) throw new Error(reason)
    return room
  })
  return recalculateExample({ ...draft, rooms })
}

export function recordExamplePayment(
  reservation: ExampleReservation,
  body: RecordPaymentInput,
  id: string
): ExampleReservation {
  return recalculateExample({
    ...reservation,
    payments: [
      ...reservation.payments,
      {
        id,
        amountCents: body.amountCents,
        method: body.method,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        paidAt:
          body.paidAt?.length === 10
            ? `${body.paidAt}T12:00:00`
            : (body.paidAt ?? new Date().toISOString()),
      },
    ],
  })
}
