import {
  addRoomSchema,
  assignRoomSchema,
  createReservationSchema,
  patchReservationSchema,
  paymentSchema,
  reservationListQuerySchema,
} from '@pms/shared'
import { and, desc, eq, exists, gt, inArray, like, lt, lte, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb, runBatch } from '../db'
import {
  guests,
  payments,
  reservationRoomNights,
  reservationRooms,
  reservations,
  roomClosures,
  rooms,
} from '../db/schema'
import type { Env } from '../env'
import { currency, HttpError, rethrowConflict, validate } from '../http'
import { chunks } from '../lib/chunks'
import { confirmationCode } from '../lib/codes'
import { overridesFor, quoteNights } from '../lib/quote'
import { assertCapacity, countRequested, roomCounts, loadRoomTypes, occupiedCounts, ratesBetween } from '../inventory'
import { requireLine, reservationDetail } from '../load'
import { assertOccupancy, requireStay } from '../rules'

const openStatuses = ['confirmed', 'checked_in']
const inactive = ['cancelled', 'no_show']

function pattern(q: string) {
  return `%${q.replace(/[%_]/g, '')}%`
}

function nightRows(lineId: string, nights: { date: string; priceCents: number }[]) {
  return nights.map((night) => ({
    id: crypto.randomUUID(),
    reservationRoomId: lineId,
    date: night.date,
    priceCents: night.priceCents,
  }))
}

function paidAtValue(value?: string) {
  if (!value) return new Date().toISOString()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value
  throw new HttpError(400, 'invalid paidAt')
}

export const reservationRoutes = new Hono<Env>()

reservationRoutes.get('/', validate('query', reservationListQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const db = getDb(c.env.DB)
  const filters = []
  if (query.guestId) filters.push(eq(reservations.guestId, query.guestId))
  if (query.checkIn) filters.push(eq(reservations.checkIn, query.checkIn))
  if (query.from) filters.push(gt(reservations.checkOut, query.from))
  if (query.to) filters.push(lte(reservations.checkIn, query.to))
  if (query.status) {
    filters.push(
      exists(
        db
          .select({ id: reservationRooms.id })
          .from(reservationRooms)
          .where(and(eq(reservationRooms.reservationId, reservations.id), eq(reservationRooms.status, query.status!))),
      ),
    )
  }
  if (query.q) {
    const likePattern = pattern(query.q)
    filters.push(
      or(
        like(reservations.code, likePattern),
        like(sql`${guests.firstName} || ' ' || ${guests.lastName}`, likePattern),
      ),
    )
  }
  const rows = await db
    .select({ reservation: reservations, guest: guests })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(and(...filters))
    .orderBy(desc(reservations.checkIn), desc(reservations.createdAt))
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0)
  if (rows.length === 0) return c.json([])
  const ids = rows.map((row) => row.reservation.id)
  const lines = await db.select().from(reservationRooms).where(inArray(reservationRooms.reservationId, ids))
  const lineIds = lines.map((line) => line.id)
  const nights =
    lineIds.length === 0
      ? []
      : await db.select().from(reservationRoomNights).where(inArray(reservationRoomNights.reservationRoomId, lineIds))
  const paymentRows = await db.select().from(payments).where(inArray(payments.reservationId, ids))
  const nightTotal = new Map<string, number>()
  for (const night of nights) {
    const line = lines.find((item) => item.id === night.reservationRoomId)
    if (!line || line.status === 'cancelled') continue
    nightTotal.set(line.reservationId, (nightTotal.get(line.reservationId) ?? 0) + night.priceCents)
  }
  const paidTotal = new Map<string, number>()
  for (const payment of paymentRows) {
    paidTotal.set(payment.reservationId, (paidTotal.get(payment.reservationId) ?? 0) + payment.amountCents)
  }
  return c.json(
    rows.map(({ reservation, guest }) => {
      const total = nightTotal.get(reservation.id) ?? 0
      const paid = paidTotal.get(reservation.id) ?? 0
      return {
        id: reservation.id,
        code: reservation.code,
        guestId: reservation.guestId,
        guestName: `${guest.firstName} ${guest.lastName}`,
        checkIn: reservation.checkIn,
        checkOut: reservation.checkOut,
        source: reservation.source,
        createdAt: reservation.createdAt,
        totalCents: total,
        paidCents: paid,
        balanceCents: total - paid,
        rooms: lines
          .filter((line) => line.reservationId === reservation.id)
          .map((line) => ({
            id: line.id,
            roomTypeId: line.roomTypeId,
            roomId: line.roomId,
            status: line.status,
          })),
      }
    }),
  )
})

reservationRoutes.post('/', validate('json', createReservationSchema), async (c) => {
  const body = c.req.valid('json')
  const stay = requireStay(body.checkIn, body.checkOut)
  const db = getDb(c.env.DB)
  const typeIds = [...new Set(body.rooms.map((room) => room.roomTypeId))]
  const types = await loadRoomTypes(db, typeIds)
  if (types.length !== typeIds.length) throw new HttpError(404, 'room type not found')
  const typeById = new Map(types.map((type) => [type.id, type]))
  for (const room of body.rooms) {
    const type = typeById.get(room.roomTypeId)!
    assertOccupancy(room.adults, room.children ?? 0, type.maxOccupancy)
  }
  let guestId = body.guestId
  let guestRow: typeof guests.$inferInsert | undefined
  if (guestId) {
    const [guest] = await db.select().from(guests).where(eq(guests.id, guestId))
    if (!guest) throw new HttpError(404, 'guest not found')
  } else if (body.guest) {
    guestId = crypto.randomUUID()
    guestRow = {
      id: guestId,
      firstName: body.guest.firstName,
      lastName: body.guest.lastName,
      email: body.guest.email ?? null,
      phone: body.guest.phone ?? null,
      documentType: body.guest.documentType ?? null,
      documentNumber: body.guest.documentNumber ?? null,
      notes: body.guest.notes ?? null,
      createdAt: new Date().toISOString(),
    }
  }
  const [capacity, occupied, rates] = await Promise.all([
    roomCounts(db),
    occupiedCounts(db, body.checkIn, body.checkOut),
    ratesBetween(db, typeIds, body.checkIn, body.checkOut),
  ])
  assertCapacity(capacity, occupied, countRequested(body.rooms))
  const now = new Date().toISOString()
  const reservationId = crypto.randomUUID()
  const lines = body.rooms.map((room) => ({
    id: crypto.randomUUID(),
    reservationId,
    roomTypeId: room.roomTypeId,
    roomId: null,
    adults: room.adults,
    children: room.children ?? 0,
    status: 'confirmed',
    createdAt: now,
    flat: room.nightlyRateCents,
  }))
  const nights = lines.flatMap((line) => {
    const type = typeById.get(line.roomTypeId)!
    return nightRows(line.id, quoteNights(stay, type.baseRateCents, overridesFor(rates, type.id), line.flat))
  })
  try {
    await runBatch(db, [
      ...(guestRow ? [db.insert(guests).values(guestRow)] : []),
      db.insert(reservations).values({
        id: reservationId,
        code: confirmationCode(),
        guestId: guestId!,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        source: 'desk',
        notes: body.notes ?? null,
        createdAt: now,
      }),
      ...chunks(lines, 20).map((chunk) =>
        db.insert(reservationRooms).values(chunk.map(({ flat: _flat, ...line }) => line)),
      ),
      ...chunks(nights, 20).map((chunk) => db.insert(reservationRoomNights).values(chunk)),
    ])
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowConflict(err)
  }
  return c.json(await reservationDetail(db, reservationId, currency(c)), 201)
})

reservationRoutes.get('/:id', async (c) => {
  return c.json(await reservationDetail(getDb(c.env.DB), c.req.param('id'), currency(c)))
})

reservationRoutes.patch('/:id', validate('json', patchReservationSchema), async (c) => {
  const body = c.req.valid('json')
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id))
  if (!reservation) throw new HttpError(404, 'reservation not found')
  const lines = await db.select().from(reservationRooms).where(eq(reservationRooms.reservationId, id))
  const checkIn = body.checkIn ?? reservation.checkIn
  const checkOut = body.checkOut ?? reservation.checkOut
  const datesChanged = checkIn !== reservation.checkIn || checkOut !== reservation.checkOut
  if (datesChanged && lines.some((line) => line.status === 'checked_out')) {
    throw new HttpError(400, 'change dates before check-out')
  }
  const notes = body.notes === undefined ? reservation.notes : body.notes || null
  if (!datesChanged && !body.rooms) {
    await db.update(reservations).set({ notes }).where(eq(reservations.id, id))
    return c.json(await reservationDetail(db, id, currency(c)))
  }
  const active = lines.filter((line) => openStatuses.includes(line.status))
  const targets = datesChanged ? active : active.filter((line) => body.rooms?.some((room) => room.id === line.id))
  if (body.rooms) {
    for (const room of body.rooms) {
      if (!active.some((line) => line.id === room.id)) throw new HttpError(404, 'room line not found')
    }
  }
  const stay = requireStay(checkIn, checkOut)
  const typeIds = [...new Set(targets.map((line) => line.roomTypeId))]
  const types = await loadRoomTypes(db, typeIds)
  const typeById = new Map(types.map((type) => [type.id, type]))
  const flats = new Map(body.rooms?.map((room) => [room.id, room.nightlyRateCents]) ?? [])
  if (datesChanged) {
    const [capacity, occupied] = await Promise.all([
      roomCounts(db),
      occupiedCounts(db, checkIn, checkOut, id),
    ])
    assertCapacity(capacity, occupied, countRequested(active))
  }
  const rates = await ratesBetween(db, typeIds, checkIn, checkOut)
  const nights = targets.flatMap((line) => {
    const type = typeById.get(line.roomTypeId)!
    return nightRows(line.id, quoteNights(stay, type.baseRateCents, overridesFor(rates, type.id), flats.get(line.id)))
  })
  try {
    await runBatch(db, [
      db.update(reservations).set({ checkIn, checkOut, notes }).where(eq(reservations.id, id)),
      ...targets.map((line) =>
        db.delete(reservationRoomNights).where(eq(reservationRoomNights.reservationRoomId, line.id)),
      ),
      ...chunks(nights, 20).map((chunk) => db.insert(reservationRoomNights).values(chunk)),
    ])
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowConflict(err)
  }
  return c.json(await reservationDetail(db, id, currency(c)))
})

reservationRoutes.post('/:id/rooms', validate('json', addRoomSchema), async (c) => {
  const body = c.req.valid('json')
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id))
  if (!reservation) throw new HttpError(404, 'reservation not found')
  const lines = await db.select().from(reservationRooms).where(eq(reservationRooms.reservationId, id))
  if (!lines.some((line) => openStatuses.includes(line.status))) throw new HttpError(400, 'reservation is closed')
  const [type] = await loadRoomTypes(db, [body.roomTypeId])
  if (!type) throw new HttpError(404, 'room type not found')
  assertOccupancy(body.adults, body.children ?? 0, type.maxOccupancy)
  const stay = requireStay(reservation.checkIn, reservation.checkOut)
  const [capacity, occupied, rates] = await Promise.all([
    roomCounts(db),
    occupiedCounts(db, reservation.checkIn, reservation.checkOut),
    ratesBetween(db, [type.id], reservation.checkIn, reservation.checkOut),
  ])
  assertCapacity(capacity, occupied, countRequested([{ roomTypeId: type.id }]))
  const lineId = crypto.randomUUID()
  const nights = nightRows(
    lineId,
    quoteNights(stay, type.baseRateCents, overridesFor(rates, type.id), body.nightlyRateCents),
  )
  try {
    await runBatch(db, [
      db.insert(reservationRooms).values({
        id: lineId,
        reservationId: id,
        roomTypeId: type.id,
        roomId: null,
        adults: body.adults,
        children: body.children ?? 0,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      }),
      ...chunks(nights, 20).map((chunk) => db.insert(reservationRoomNights).values(chunk)),
    ])
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowConflict(err)
  }
  return c.json(await reservationDetail(db, id, currency(c)), 201)
})

reservationRoutes.post('/:id/rooms/:lineId/assign-room', validate('json', assignRoomSchema), async (c) => {
  const { roomId } = c.req.valid('json')
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  const line = await requireLine(db, id, c.req.param('lineId'))
  if (!openStatuses.includes(line.status)) throw new HttpError(400, 'room cannot be assigned in this status')
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId))
  if (!room) throw new HttpError(404, 'room not found')
  if (room.roomTypeId !== line.roomTypeId) throw new HttpError(400, 'room is a different type')
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id))
  if (!reservation) throw new HttpError(404, 'reservation not found')
  const conflicts = await db
    .select({ id: reservationRooms.id })
    .from(reservationRooms)
    .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
    .where(
      and(
        eq(reservationRooms.roomId, room.id),
        sql`${reservationRooms.id} != ${line.id}`,
        notInArray(reservationRooms.status, inactive),
        sql`${reservations.checkIn} < ${reservation.checkOut}`,
        sql`${reservations.checkOut} > ${reservation.checkIn}`,
      ),
    )
    .limit(1)
  if (conflicts.length > 0) throw new HttpError(409, 'room is already assigned for those dates')
  const closed = await db
    .select({ id: roomClosures.id })
    .from(roomClosures)
    .where(
      and(
        eq(roomClosures.roomId, room.id),
        lt(roomClosures.starts, reservation.checkOut),
        gt(roomClosures.ends, reservation.checkIn),
      ),
    )
    .limit(1)
  if (closed.length > 0) throw new HttpError(409, 'room is closed for those dates')
  try {
    await db.update(reservationRooms).set({ roomId: room.id }).where(eq(reservationRooms.id, line.id))
  } catch (err) {
    rethrowConflict(err)
  }
  return c.json(await reservationDetail(db, id, currency(c)))
})

async function setStatus(
  c: { env: Env['Bindings']; req: { param: (name: string) => string } },
  from: string[],
  to: string,
  missing: string,
) {
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  const line = await requireLine(db, id, c.req.param('lineId'))
  if (!from.includes(line.status)) throw new HttpError(400, missing)
  if (to === 'checked_in' && !line.roomId) throw new HttpError(400, 'assign a room before check-in')
  await db.update(reservationRooms).set({ status: to }).where(eq(reservationRooms.id, line.id))
  return c
}

reservationRoutes.post('/:id/rooms/:lineId/check-in', async (c) => {
  const ctx = await setStatus(c, ['confirmed'], 'checked_in', 'room is not confirmed')
  return c.json(await reservationDetail(getDb(ctx.env.DB), c.req.param('id'), currency(c)))
})

reservationRoutes.post('/:id/rooms/:lineId/check-out', async (c) => {
  await setStatus(c, ['checked_in'], 'checked_out', 'room is not checked in')
  return c.json(await reservationDetail(getDb(c.env.DB), c.req.param('id'), currency(c)))
})

reservationRoutes.post('/:id/rooms/:lineId/cancel', async (c) => {
  await setStatus(c, ['confirmed'], 'cancelled', 'only a confirmed room can be cancelled')
  return c.json(await reservationDetail(getDb(c.env.DB), c.req.param('id'), currency(c)))
})

reservationRoutes.post('/:id/rooms/:lineId/no-show', async (c) => {
  await setStatus(c, ['confirmed'], 'no_show', 'only a confirmed room can be marked no-show')
  return c.json(await reservationDetail(getDb(c.env.DB), c.req.param('id'), currency(c)))
})

reservationRoutes.post('/:id/check-in', async (c) => {
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id))
  if (!reservation) throw new HttpError(404, 'reservation not found')
  const lines = await db.select().from(reservationRooms).where(eq(reservationRooms.reservationId, id))
  const confirmed = lines.filter((line) => line.status === 'confirmed')
  if (confirmed.length === 0) throw new HttpError(400, 'no rooms to check in')
  if (confirmed.some((line) => !line.roomId)) throw new HttpError(400, 'assign a room before check-in')
  await db
    .update(reservationRooms)
    .set({ status: 'checked_in' })
    .where(and(eq(reservationRooms.reservationId, id), eq(reservationRooms.status, 'confirmed')))
  return c.json(await reservationDetail(db, id, currency(c)))
})

reservationRoutes.post('/:id/cancel', async (c) => {
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id))
  if (!reservation) throw new HttpError(404, 'reservation not found')
  const lines = await db.select().from(reservationRooms).where(eq(reservationRooms.reservationId, id))
  if (!lines.some((line) => line.status === 'confirmed')) throw new HttpError(400, 'no confirmed rooms to cancel')
  await db
    .update(reservationRooms)
    .set({ status: 'cancelled' })
    .where(and(eq(reservationRooms.reservationId, id), eq(reservationRooms.status, 'confirmed')))
  return c.json(await reservationDetail(db, id, currency(c)))
})

reservationRoutes.get('/:id/payments', async (c) => {
  const detail = await reservationDetail(getDb(c.env.DB), c.req.param('id'), currency(c))
  return c.json(detail.payments)
})

reservationRoutes.post('/:id/payments', validate('json', paymentSchema), async (c) => {
  const body = c.req.valid('json')
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id))
  if (!reservation) throw new HttpError(404, 'reservation not found')
  await db.insert(payments).values({
    id: crypto.randomUUID(),
    reservationId: id,
    amountCents: body.amountCents,
    method: body.method,
    reference: body.reference ?? null,
    paidAt: paidAtValue(body.paidAt),
    notes: body.notes ?? null,
  })
  return c.json(await reservationDetail(db, id, currency(c)), 201)
})

reservationRoutes.delete('/:id/payments/:paymentId', async (c) => {
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  const paymentId = c.req.param('paymentId')
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId))
  if (!payment || payment.reservationId !== id) throw new HttpError(404, 'payment not found')
  await db.delete(payments).where(eq(payments.id, paymentId))
  return c.json(await reservationDetail(db, id, currency(c)))
})
