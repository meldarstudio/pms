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
  status: string
}

export type Reservation = {
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
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
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

export type RecordPaymentInput = {
  amountCents: number
  method: PaymentMethod
  reference?: string
  paidAt?: string
  notes?: string
}

export type PatchReservationInput = {
  checkIn?: string
  checkOut?: string
  rooms?: {
    id: string
    adults?: number
    children?: number
    discountCents?: number
  }[]
}

export type PatchGuestInput = {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  notes?: string
}

export type ReservationDetail = {
  id: string
  code: string
  guestId: string
  guest: ReservationGuest
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
    status: string
    subtotalCents: number
    discountCents: number
    totalCents: number
    nights: { date: string; priceCents: number }[]
  }[]
}

export type CreateReservationInput = {
  guest: {
    firstName: string
    lastName: string
    email?: string
    phone?: string
    notes?: string
  }
  checkIn: string
  checkOut: string
  rooms: {
    roomTypeId: string
    adults: number
    children: number
    discountCents?: number
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

export function createReservation(body: CreateReservationInput) {
  return writeJson<ReservationDetail>("/reservations", "POST", body)
}

export function getReservation(id: string, signal?: AbortSignal) {
  return getJson<ReservationDetail>(`/reservations/${id}`, signal)
}

export function patchReservation(id: string, body: PatchReservationInput) {
  return writeJson<ReservationDetail>(`/reservations/${id}`, "PATCH", body)
}

export function recordReservationPayment(id: string, body: RecordPaymentInput) {
  return writeJson<ReservationDetail>(
    `/reservations/${id}/payments`,
    "POST",
    body
  )
}

export type ReservationStatusAction =
  "check-in" | "undo-check-in" | "check-out" | "cancel"

export function changeReservationStatus(
  id: string,
  action: ReservationStatusAction
) {
  return writeJson<ReservationDetail>(`/reservations/${id}/${action}`, "POST")
}

export function patchGuest(id: string, body: PatchGuestInput) {
  return writeJson<ReservationGuest>(`/guests/${id}`, "PATCH", body)
}

export function assignRoom(
  reservationId: string,
  lineId: string,
  roomId: string
) {
  return writeJson<ReservationDetail>(
    `/reservations/${reservationId}/rooms/${lineId}/assign-room`,
    "POST",
    { roomId }
  )
}

export function unassignRoom(reservationId: string, lineId: string) {
  return writeJson<ReservationDetail>(
    `/reservations/${reservationId}/rooms/${lineId}/unassign-room`,
    "POST"
  )
}

export function addReservationRoom(
  id: string,
  body: {
    roomTypeId: string
    adults: number
    children?: number
    discountCents?: number
  }
) {
  return writeJson<ReservationDetail>(`/reservations/${id}/rooms`, "POST", body)
}

export function cancelReservationRoom(id: string, lineId: string) {
  return writeJson<ReservationDetail>(
    `/reservations/${id}/rooms/${lineId}/cancel`,
    "POST"
  )
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
