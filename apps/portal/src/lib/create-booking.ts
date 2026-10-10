import type { CreateReservationInput, ReservationDetail } from "./api"

export type BookingRoomRequest = CreateReservationInput["rooms"][number] & {
  key: string
  roomId: string | null
}

export type CreatedBooking = {
  reservation: ReservationDetail
  lineIds: Record<string, string>
}

// Persist each successful step before attempting the next request. A retry
// resumes assignments on the saved reservation, including identical room lines.
export async function createBooking({
  input,
  rooms,
  saved,
  create,
  assign,
  onProgress,
}: {
  input: CreateReservationInput
  rooms: BookingRoomRequest[]
  saved: CreatedBooking | null
  create: (input: CreateReservationInput) => Promise<ReservationDetail>
  assign: (input: {
    reservationId: string
    lineId: string
    roomId: string
  }) => Promise<ReservationDetail>
  onProgress: (saved: CreatedBooking) => void
}) {
  let progress = saved
  if (!progress) {
    progress = { reservation: await create(input), lineIds: {} }
    onProgress(progress)
  }

  const knownIds = new Set(Object.values(progress.lineIds))
  const pool = progress.reservation.rooms.filter(
    (line) => !knownIds.has(line.id)
  )
  for (const room of rooms) {
    if (progress.lineIds[room.key]) continue
    const index = pool.findIndex(
      (line) =>
        line.roomTypeId === room.roomTypeId &&
        line.adults === room.adults &&
        line.children === (room.children ?? 0) &&
        line.discountCents === (room.discountCents ?? 0)
    )
    const line = index < 0 ? undefined : pool.splice(index, 1)[0]
    if (!line)
      throw new Error("No se pudo identificar la habitación reservada.")
    progress = {
      ...progress,
      lineIds: { ...progress.lineIds, [room.key]: line.id },
    }
    onProgress(progress)
  }

  for (const room of rooms) {
    if (!room.roomId) continue
    const lineId = progress.lineIds[room.key]!
    if (
      progress.reservation.rooms.some(
        (line) => line.id === lineId && line.roomId === room.roomId
      )
    )
      continue
    const reservation = await assign({
      reservationId: progress.reservation.id,
      lineId,
      roomId: room.roomId,
    })
    progress = { ...progress, reservation }
    onProgress(progress)
  }
  return progress.reservation
}
