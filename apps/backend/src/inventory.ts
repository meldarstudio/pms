import { and, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm'
import type { Db } from './db'
import { reservationRooms, reservations, roomClosures, roomTypeRates, roomTypes, rooms } from './db/schema'
import { nightsBetween } from './lib/dates'
import { peakOccupied } from './lib/inventory-grid'

const openStatuses = ['confirmed', 'checked_in', 'checked_out']

export async function loadRoomTypes(db: Db, ids?: string[]) {
  if (ids && ids.length === 0) return []
  if (!ids) return db.select().from(roomTypes)
  return db.select().from(roomTypes).where(inArray(roomTypes.id, ids))
}

export async function roomCounts(db: Db) {
  const rows = await db
    .select({
      roomTypeId: rooms.roomTypeId,
      count: sql<number>`count(*)`,
    })
    .from(rooms)
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
  const dates = nightsBetween(checkIn, checkOut)
  if (dates.length === 0) return new Map<string, number>()
  const [stays, closures] = await Promise.all([
    db
      .select({
        roomTypeId: reservationRooms.roomTypeId,
        status: reservationRooms.status,
        checkIn: sql<string>`coalesce(${reservationRooms.checkIn}, ${reservations.checkIn})`,
        checkOut: sql<string>`coalesce(${reservationRooms.checkOut}, ${reservations.checkOut})`,
      })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .where(
        and(
          inArray(reservationRooms.status, openStatuses),
          lt(reservationRooms.checkIn, checkOut),
          gt(reservationRooms.checkOut, checkIn),
          excludeReservationId ? ne(reservations.id, excludeReservationId) : undefined,
        ),
      ),
    db
      .select({
        roomId: roomClosures.roomId,
        roomTypeId: rooms.roomTypeId,
        starts: roomClosures.starts,
        ends: roomClosures.ends,
      })
      .from(roomClosures)
      .innerJoin(rooms, eq(rooms.id, roomClosures.roomId))
      .where(
        and(
          lt(roomClosures.starts, checkOut),
          gt(roomClosures.ends, checkIn),
          excludeClosureId ? ne(roomClosures.id, excludeClosureId) : undefined,
        ),
      ),
  ])
  return peakOccupied(dates, stays, closures)
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
