import { and, eq, gt, inArray, lt, ne, notInArray, sql } from 'drizzle-orm'
import type { Db } from './db'
import { reservationRooms, reservations, roomClosures, roomTypeRates, roomTypes, rooms } from './db/schema'
import { HttpError } from './http'

const inactive = ['cancelled', 'no_show']

export async function loadRoomTypes(db: Db, ids?: string[]) {
  if (ids && ids.length === 0) return []
  if (!ids) return db.select().from(roomTypes)
  return db.select().from(roomTypes).where(inArray(roomTypes.id, ids))
}

export async function inServiceCounts(db: Db) {
  const rows = await db
    .select({
      roomTypeId: rooms.roomTypeId,
      count: sql<number>`count(*)`,
    })
    .from(rooms)
    .where(eq(rooms.status, 'in_service'))
    .groupBy(rooms.roomTypeId)
  return new Map(rows.map((row) => [row.roomTypeId, Number(row.count)]))
}

export async function bookedCounts(db: Db, checkIn: string, checkOut: string, excludeReservationId?: string) {
  const rows = await db
    .select({
      roomTypeId: reservationRooms.roomTypeId,
      count: sql<number>`count(*)`,
    })
    .from(reservationRooms)
    .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
    .where(
      and(
        notInArray(reservationRooms.status, inactive),
        lt(reservations.checkIn, checkOut),
        gt(reservations.checkOut, checkIn),
        excludeReservationId ? ne(reservations.id, excludeReservationId) : undefined,
      ),
    )
    .groupBy(reservationRooms.roomTypeId)
  return new Map(rows.map((row) => [row.roomTypeId, Number(row.count)]))
}

export async function closureCounts(db: Db, checkIn: string, checkOut: string, excludeClosureId?: string) {
  const rows = await db
    .select({
      roomTypeId: rooms.roomTypeId,
      count: sql<number>`count(distinct ${roomClosures.roomId})`,
    })
    .from(roomClosures)
    .innerJoin(rooms, eq(rooms.id, roomClosures.roomId))
    .where(
      and(
        eq(rooms.status, 'in_service'),
        lt(roomClosures.starts, checkOut),
        gt(roomClosures.ends, checkIn),
        excludeClosureId ? ne(roomClosures.id, excludeClosureId) : undefined,
      ),
    )
    .groupBy(rooms.roomTypeId)
  return new Map(rows.map((row) => [row.roomTypeId, Number(row.count)]))
}

export async function occupiedCounts(
  db: Db,
  checkIn: string,
  checkOut: string,
  excludeReservationId?: string,
  excludeClosureId?: string,
) {
  const [booked, closed] = await Promise.all([
    bookedCounts(db, checkIn, checkOut, excludeReservationId),
    closureCounts(db, checkIn, checkOut, excludeClosureId),
  ])
  const occupied = new Map(booked)
  for (const [id, count] of closed) occupied.set(id, (occupied.get(id) ?? 0) + count)
  return occupied
}

export function countRequested(lines: { roomTypeId: string }[]) {
  const requested = new Map<string, number>()
  for (const line of lines) requested.set(line.roomTypeId, (requested.get(line.roomTypeId) ?? 0) + 1)
  return requested
}

export function assertCapacity(
  inService: Map<string, number>,
  booked: Map<string, number>,
  requested: Map<string, number>,
) {
  for (const [roomTypeId, count] of requested) {
    const free = (inService.get(roomTypeId) ?? 0) - (booked.get(roomTypeId) ?? 0)
    if (count > free) throw new HttpError(409, 'no availability')
  }
}

export async function ratesBetween(db: Db, typeIds: string[], checkIn: string, checkOut: string) {
  if (typeIds.length === 0) return []
  return db
    .select()
    .from(roomTypeRates)
    .where(
      and(
        inArray(roomTypeRates.roomTypeId, typeIds),
        sql`${roomTypeRates.date} >= ${checkIn}`,
        sql`${roomTypeRates.date} < ${checkOut}`,
      ),
    )
}
