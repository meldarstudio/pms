import { patchRoomClosureSchema, roomClosureListQuerySchema, roomClosureSchema } from '@pms/shared'
import { and, eq, gt, inArray, lt, lte, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db'
import { reservationRooms, reservations, roomClosures, rooms } from '../db/schema'
import type { Env } from '../env'
import { HttpError, rethrowConflict, validate } from '../http'
import { inServiceCounts, occupiedCounts } from '../inventory'
import { requireStay } from '../rules'

const blockingStay = ['confirmed', 'checked_in', 'checked_out']

export const roomClosureRoutes = new Hono<Env>()

function present(row: typeof roomClosures.$inferSelect) {
  return {
    id: row.id,
    roomId: row.roomId,
    starts: row.starts,
    ends: row.ends,
    reason: row.reason,
  }
}

async function assertCanClose(
  db: ReturnType<typeof getDb>,
  room: { id: string; roomTypeId: string; status: string },
  starts: string,
  ends: string,
  excludeId?: string,
) {
  requireStay(starts, ends)
  const stay = await db
    .select({ id: reservationRooms.id })
    .from(reservationRooms)
    .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
    .where(
      and(
        eq(reservationRooms.roomId, room.id),
        inArray(reservationRooms.status, blockingStay),
        lt(reservations.checkIn, ends),
        gt(reservations.checkOut, starts),
      ),
    )
    .limit(1)
  if (stay.length > 0) throw new HttpError(409, 'room has a stay on those dates')
  const other = await db
    .select({ id: roomClosures.id })
    .from(roomClosures)
    .where(
      and(
        eq(roomClosures.roomId, room.id),
        excludeId ? ne(roomClosures.id, excludeId) : undefined,
        lt(roomClosures.starts, ends),
        gt(roomClosures.ends, starts),
      ),
    )
    .limit(1)
  if (other.length > 0) throw new HttpError(409, 'room is already closed on those dates')
  if (room.status !== 'in_service') {
    if (!excludeId) throw new HttpError(409, 'room is out of order')
    return
  }
  const [inService, occupied] = await Promise.all([
    inServiceCounts(db),
    occupiedCounts(db, starts, ends, undefined, excludeId),
  ])
  const free = (inService.get(room.roomTypeId) ?? 0) - (occupied.get(room.roomTypeId) ?? 0)
  if (free < 1) throw new HttpError(409, 'no availability')
}

roomClosureRoutes.get('/', validate('query', roomClosureListQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const db = getDb(c.env.DB)
  const rows = await db
    .select()
    .from(roomClosures)
    .where(
      and(
        query.roomId ? eq(roomClosures.roomId, query.roomId) : undefined,
        gt(roomClosures.ends, query.from),
        lte(roomClosures.starts, query.to),
      ),
    )
  return c.json(rows.map(present))
})

roomClosureRoutes.post('/', validate('json', roomClosureSchema), async (c) => {
  const body = c.req.valid('json')
  const db = getDb(c.env.DB)
  const [room] = await db.select().from(rooms).where(eq(rooms.id, body.roomId))
  if (!room) throw new HttpError(404, 'room not found')
  const reason = body.reason || null
  await assertCanClose(db, room, body.starts, body.ends)
  const row = {
    id: crypto.randomUUID(),
    roomId: room.id,
    starts: body.starts,
    ends: body.ends,
    reason,
    createdAt: new Date().toISOString(),
  }
  try {
    await db.insert(roomClosures).values(row)
  } catch (err) {
    rethrowConflict(err)
  }
  return c.json(present(row), 201)
})

roomClosureRoutes.patch('/:id', validate('json', patchRoomClosureSchema), async (c) => {
  const body = c.req.valid('json')
  const db = getDb(c.env.DB)
  const [closure] = await db.select().from(roomClosures).where(eq(roomClosures.id, c.req.param('id')))
  if (!closure) throw new HttpError(404, 'room closure not found')
  const [room] = await db.select().from(rooms).where(eq(rooms.id, closure.roomId))
  if (!room) throw new HttpError(404, 'room not found')
  const starts = body.starts
  const ends = body.ends
  const reason = body.reason === undefined ? closure.reason : body.reason || null
  await assertCanClose(db, room, starts, ends, closure.id)
  try {
    await db.update(roomClosures).set({ starts, ends, reason }).where(eq(roomClosures.id, closure.id))
  } catch (err) {
    rethrowConflict(err)
  }
  return c.json(present({ ...closure, starts, ends, reason }))
})

roomClosureRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const [closure] = await db.select().from(roomClosures).where(eq(roomClosures.id, c.req.param('id')))
  if (!closure) throw new HttpError(404, 'room closure not found')
  await db.delete(roomClosures).where(eq(roomClosures.id, closure.id))
  return c.json({ id: closure.id })
})
