import { patchRoomSchema, roomListQuerySchema, roomSchema } from '@pms/shared'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db'
import { reservationRooms, reservations, roomTypes, rooms } from '../db/schema'
import type { Env } from '../env'
import { HttpError, rethrowConflict, validate } from '../http'
import { todayUtc } from '../lib/dates'

export const roomRoutes = new Hono<Env>()

roomRoutes.get('/', validate('query', roomListQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const db = getDb(c.env.DB)
  const rows = await db
    .select()
    .from(rooms)
    .where(
      and(
        query.roomTypeId ? eq(rooms.roomTypeId, query.roomTypeId) : undefined,
        query.status ? eq(rooms.status, query.status) : undefined,
      ),
    )
  return c.json(rows)
})

roomRoutes.post('/', validate('json', roomSchema), async (c) => {
  const body = c.req.valid('json')
  const db = getDb(c.env.DB)
  const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, body.roomTypeId))
  if (!type) throw new HttpError(404, 'room type not found')
  const row = {
    id: crypto.randomUUID(),
    number: body.number,
    roomTypeId: body.roomTypeId,
    status: body.status ?? 'in_service',
  }
  try {
    await db.insert(rooms).values(row)
  } catch (err) {
    rethrowConflict(err)
  }
  return c.json(row, 201)
})

roomRoutes.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const [room] = await db.select().from(rooms).where(eq(rooms.id, c.req.param('id')))
  if (!room) throw new HttpError(404, 'room not found')
  return c.json(room)
})

roomRoutes.patch('/:id', validate('json', patchRoomSchema), async (c) => {
  const body = c.req.valid('json')
  const db = getDb(c.env.DB)
  const [room] = await db.select().from(rooms).where(eq(rooms.id, c.req.param('id')))
  if (!room) throw new HttpError(404, 'room not found')
  if (body.status === 'out_of_order') {
    const blocking = await db
      .select({ id: reservationRooms.id })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .where(
        and(
          eq(reservationRooms.roomId, room.id),
          inArray(reservationRooms.status, ['confirmed', 'checked_in']),
          gte(reservations.checkOut, todayUtc()),
        ),
      )
      .limit(1)
    if (blocking.length > 0) throw new HttpError(409, 'room has a current or upcoming stay')
  }
  try {
    await db.update(rooms).set(body).where(eq(rooms.id, room.id))
  } catch (err) {
    rethrowConflict(err)
  }
  const [updated] = await db.select().from(rooms).where(eq(rooms.id, room.id))
  return c.json(updated)
})
