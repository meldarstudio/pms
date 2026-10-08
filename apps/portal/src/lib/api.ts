export type Room = {
  id: string
  number: string
  roomTypeId: string
}

export type RoomType = {
  id: string
  name: string
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

export type ReservationDetail = {
  id: string
  code: string
  checkIn: string
  checkOut: string
  currency: string
  totalCents: number
  rooms: {
    id: string
    roomTypeId: string
    roomId: string | null
    roomNumber: string | null
  }[]
}

export type CreateReservationInput = {
  guest: {
    firstName: string
    lastName: string
    phone?: string
  }
  checkIn: string
  checkOut: string
  rooms: {
    roomTypeId: string
    adults: number
    children: number
  }[]
}

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "")

if (!API_BASE) {
  throw new Error("VITE_API_BASE_URL is not set. Set it before building.")
}

async function errorMessage(response: Response) {
  const fallback = `Request failed (${response.status})`
  try {
    const body = (await response.json()) as { error?: unknown }
    return typeof body.error === "string" && body.error ? body.error : fallback
  } catch {
    return fallback
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { signal })
  if (!response.ok) throw new Error(await errorMessage(response))
  return (await response.json()) as T
}

export function listRooms(signal?: AbortSignal) {
  return getJson<Room[]>("/rooms", signal)
}

async function writeJson<T>(path: string, method: string, body?: unknown) {
  const response = await fetch(`${API_BASE}${path}`, {
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
