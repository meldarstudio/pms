import { rateRangeQuerySchema } from '@pms/shared'
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db'
import { reservationRooms, reservations, roomClosures, rooms } from '../db/schema'
import type { Env } from '../env'
import { currency, validate } from '../http'
import { loadRoomTypes, ratesBetween, roomCounts } from '../inventory'
import { addDays } from '../lib/dates'
import { inventoryGrid } from '../lib/inventory-grid'
import { requireInclusiveRange } from '../rules'

export const inventoryRoutes = new Hono<Env>()

inventoryRoutes.get('/', validate('query', rateRangeQuerySchema), async (c) => {
  const { from, to } = c.req.valid('query')
  const dates = requireInclusiveRange(from, to, 366)
  const windowEnd = addDays(to, 1)
  const db = getDb(c.env.DB)
  const types = await loadRoomTypes(db)
  const [capacity, stays, closures, rates] = await Promise.all([
    roomCounts(db),
    db
      .select({
        roomTypeId: reservationRooms.roomTypeId,
        status: reservationRooms.status,
        checkIn: sql<string>`coalesce(${reservationRooms.checkIn}, ${reservations.checkIn})`,
        checkOut: sql<string>`coalesce(${reservationRooms.checkOut}, ${reservations.checkOut})`,
      })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .where(and(lt(reservationRooms.checkIn, windowEnd), gt(reservationRooms.checkOut, from))),
    db
      .select({
        roomId: roomClosures.roomId,
        roomTypeId: rooms.roomTypeId,
        starts: roomClosures.starts,
        ends: roomClosures.ends,
      })
      .from(roomClosures)
      .innerJoin(rooms, eq(rooms.id, roomClosures.roomId))
      .where(and(lt(roomClosures.starts, windowEnd), gt(roomClosures.ends, from))),
    ratesBetween(
      db,
      types.map((type) => type.id),
      from,
      windowEnd,
    ),
  ])
  return c.json({
    from,
    to,
    currency: currency(c),
    roomTypes: inventoryGrid(dates, types, capacity, stays, closures, rates),
  })
})
