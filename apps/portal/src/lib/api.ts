import { translateError } from "./errors"

export type Room = {
  id: string
  number: string
  roomTypeId: string
}

export type RoomType = {
  id: string
  name: string
}

export type InventoryNight = {
  date: string
  free: number
  booked: number
  closed: number
  priceCents: number
  override: boolean
}

export type InventoryRoomType = {
  id: string
  name: string
  maxOccupancy: number
  baseRateCents: number
  capacity: number
  nights: InventoryNight[]
}

export type Inventory = {
  from: string
  to: string
  currency: string
  roomTypes: InventoryRoomType[]
}

export type ReservationLine = {
  id: string
  roomTypeId: string
  roomId: string | null
}

export type Reservation = {
  status: string
  code?: string
  balanceCents?: number
  totalCents?: number
  id: string
  guestName: string
  checkIn: string
  checkOut: string
  rooms: ReservationLine[]
}

export type RoomClosure = {
  id: string
  roomId: string
  starts: string
  ends: string
  reason: string | null
}

export type Availability = {
  checkIn: string
  checkOut: string
  nights: number
  currency: string
  roomTypes: {
    id: string
    name: string
    maxOccupancy: number
    free: number
    totalCents: number
    nights: { date: string; priceCents: number }[]
  }[]
}

export type ReservationGuest = {
  id: string
  fullName: string

  email: string | null
  phone: string | null
  notes: string | null
  documentType?: string | null
  documentNumber?: string | null
}

export type BookingContact = {
  fullName: string

  email: string | null
  phone: string | null
  documentType?: string | null
  documentNumber?: string | null
}
export type StayingGuest = BookingContact & {
  id: string
  reservationRoomId: string | null
}

export type PaymentMethod = "cash" | "card" | "transfer" | "yape" | "other"

export type ReservationPayment = {
  id: string
  amountCents: number
  method: PaymentMethod
  reference: string | null
  paidAt: string
  notes: string | null
}

export type PatchGuestInput = {
  fullName?: string

  email?: string
  phone?: string
  notes?: string
}

export type ReservationDetail = {
  status: string
  actualArrival: string | null
  actualDeparture: string | null
  cancellationReason: string | null
  cancelledAt: string | null
  notes: string | null
  waiverCents: number
  refundCents: number
  creditCents: number
  savedDiscountCents: number
  financialEntries: FinancialEntry[]
  history: WorkflowEvent[]
  id: string
  code: string
  guestId: string
  guest: ReservationGuest
  stayingGuests: StayingGuest[]
  checkIn: string
  checkOut: string
  currency: string
  totalCents: number
  subtotalCents: number
  discountCents: number
  paidCents: number
  balanceCents: number
  payments: ReservationPayment[]
  rooms: {
    id: string
    roomTypeId: string
    roomTypeName: string | null
    roomId: string | null
    roomNumber: string | null
    adults: number
    children: number
    subtotalCents: number
    discountCents: number
    totalCents: number
    nights: { date: string; priceCents: number }[]
  }[]
}

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "")

if (!API_BASE) {
  throw new Error("VITE_API_BASE_URL is not set. Set it before building.")
}

async function errorMessage(response: Response) {
  const fallback = `No se pudo completar la solicitud (${response.status}).`
  try {
    const body = (await response.json()) as { error?: unknown }
    return typeof body.error === "string" && body.error
      ? translateError(body.error)
      : fallback
  } catch {
    return fallback
  }
}

async function request(path: string, init: RequestInit) {
  try {
    return await fetch(`${API_BASE}${path}`, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error
    throw new Error(
      "No se pudo conectar con el servidor. Inténtalo de nuevo.",
      { cause: error }
    )
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await request(path, { signal })
  if (!response.ok) throw new Error(await errorMessage(response))
  return (await response.json()) as T
}

export function listRooms(signal?: AbortSignal) {
  return getJson<Room[]>("/rooms", signal)
}

export function patchRoom(
  id: string,
  body: { number?: string; roomTypeId?: string }
) {
  return writeJson<Room>(`/rooms/${id}`, "PATCH", body)
}

async function writeJson<T>(path: string, method: string, body?: unknown) {
  const response = await request(path, {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return (await response.json()) as T
}

export function listRoomTypes(signal?: AbortSignal) {
  return getJson<RoomType[]>("/room-types", signal)
}

export function getInventory(from: string, to: string, signal?: AbortSignal) {
  return getJson<Inventory>(`/inventory?from=${from}&to=${to}`, signal)
}

export function putRoomTypeRates(
  id: string,
  body: { from: string; to: string; priceCents: number; weekdays?: number[] }
) {
  return writeJson<{ updated: number }>(`/room-types/${id}/rates`, "PUT", body)
}

export function deleteRoomTypeRates(id: string, from: string, to: string) {
  return writeJson<{ deleted: number }>(
    `/room-types/${id}/rates?from=${from}&to=${to}`,
    "DELETE"
  )
}

export function getAvailability(
  checkIn: string,
  checkOut: string,
  signal?: AbortSignal
) {
  return getJson<Availability>(
    `/availability?checkIn=${checkIn}&checkOut=${checkOut}`,
    signal
  )
}

export function getReservation(id: string, signal?: AbortSignal) {
  return getJson<ReservationDetail>(`/reservations/${id}`, signal)
}

export function patchGuest(id: string, body: PatchGuestInput) {
  return writeJson<ReservationGuest>(`/guests/${id}`, "PATCH", body)
}

export async function assignRoom(
  reservationId: string,
  lineId: string,
  roomId: string
) {
  const detail = await getReservation(reservationId)
  const line = detail.rooms.find((l) => l.id === lineId)
  if (!line || detail.status !== "confirmed" || line.roomId)
    throw new Error("La habitación cambió. Actualiza la reserva.")
  return sendWorkflow(reservationId, {
    requestId: crypto.randomUUID(),
    actions: [
      {
        type: "edit-room",
        lineId,
        room: {
          roomTypeId: line.roomTypeId,
          roomId,
          adults: line.adults,
          children: line.children,
        },
      },
    ],
  })
}

export function listRoomClosures(
  from: string,
  to: string,
  signal?: AbortSignal
) {
  return getJson<RoomClosure[]>(`/room-closures?from=${from}&to=${to}`, signal)
}

export function createRoomClosure(body: {
  roomId: string
  starts: string
  ends: string
  reason?: string
}) {
  return writeJson<RoomClosure>("/room-closures", "POST", body)
}

export function patchRoomClosure(
  id: string,
  body: { starts: string; ends: string; reason: string | null }
) {
  return writeJson<RoomClosure>(`/room-closures/${id}`, "PATCH", body)
}

export function deleteRoomClosure(id: string) {
  return writeJson<{ id: string }>(`/room-closures/${id}`, "DELETE")
}

export async function listReservations(
  from: string,
  to: string,
  signal?: AbortSignal
) {
  const rows: Reservation[] = []
  const limit = 200
  let offset = 0
  for (;;) {
    const page = await getJson<Reservation[]>(
      `/reservations?from=${from}&to=${to}&limit=${limit}&offset=${offset}`,
      signal
    )
    rows.push(...page)
    if (page.length < limit || offset >= 2000) return rows
    offset += limit
  }
}

export type WorkflowRoom = {
  roomTypeId: string
  roomId: string | null
  adults: number
  children: number
  nightlyRateCents?: number
}
export type FinancialInput = {
  kind: "payment" | "discount"
  amountCents: number
  reason?: string
  method?: PaymentMethod
  occurredAt?: string
  paymentDate?: string
  reference?: string
}
export type FinancialEntry = Omit<
  FinancialInput,
  "kind" | "reason" | "method" | "reference" | "paymentDate"
> & {
  id: string
  kind:
    | FinancialInput["kind"]
    | "refund"
    | "waiver"
    | "legacy_signed"
    | "legacy_discount_excluded"
  appliedCents: number
  reason: string | null
  method: PaymentMethod | null
  occurredAt: string
  paymentDate: string | null
  reference: string | null
  createdAt: string
  voidedAt: string | null
  correctionReason: string | null
  replacesId: string | null
  legacy: number
}
export type WorkflowAction =
  | { type: "contact"; contact: BookingContact }
  | { type: "set-guests"; guests: StayingGuest[] }
  | { type: "edit-room"; lineId: string; room: WorkflowRoom }
  | { type: "add-room"; room: WorkflowRoom }
  | { type: "dates"; checkIn: string; checkOut: string }
  | { type: "remove-room"; lineId: string }
  | { type: "set-discount"; amountCents: number }
  | { type: "financial"; entry: FinancialInput }
  | {
      type: "set-status"
      reason?: string
      status:
        "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show"
    }
  | { type: "edit-financial"; entryId: string; entry: FinancialInput }
  | { type: "delete-financial"; entryId: string }
  | { type: "notes"; notes: string }
export type WorkflowCommand = {
  requestId: string
  actions: WorkflowAction[]
}
export type WorkflowPreview = Pick<
  ReservationDetail,
  | "status"
  | "checkIn"
  | "checkOut"
  | "subtotalCents"
  | "totalCents"
  | "discountCents"
  | "waiverCents"
  | "paidCents"
  | "refundCents"
  | "balanceCents"
  | "creditCents"
  | "savedDiscountCents"
> & {
  rooms: ReservationDetail["rooms"]
  financialEntries: ReservationDetail["financialEntries"]
}
export type WorkflowEvent = {
  id: string
  kind: string
  reason: string | null
  createdAt: string
  before: { lines?: ReservationDetail["rooms"] } | null
  after: { lines?: ReservationDetail["rooms"] } | ReservationDetail["rooms"]
}
export function sendWorkflow(id: string, body: WorkflowCommand) {
  return writeJson<ReservationDetail>(
    `/reservations/${id}/commands`,
    "POST",
    body
  )
}
export function previewWorkflow(id: string, body: WorkflowCommand) {
  return writeJson<WorkflowPreview>(`/reservations/${id}/preview`, "POST", body)
}
export function createWorkflowBooking(body: {
  checkIn: string
  checkOut: string
  requestId: string
  guest: {
    fullName: string
    email?: string
    phone?: string
    documentType?: string
    documentNumber?: string
    notes?: string
  }
  rooms: WorkflowRoom[]
  notes?: string
}) {
  return writeJson<ReservationDetail>("/reservations", "POST", body)
}
export function searchReservations(q: string, status: string, offset = 0) {
  return getJson<(ReservationDetail & { guestName: string })[]>(
    `/reservations?limit=50&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}`
  )
}
