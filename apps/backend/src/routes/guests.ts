import { guestFields, listQuerySchema } from '@pms/shared'
import { asc, desc, eq, like, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db'
import { guests, reservations } from '../db/schema'
import type { Env } from '../env'
import { HttpError, validate } from '../http'
import { presentGuest } from '../present'

function searchPattern(q: string) {
  return `%${q.replace(/[%_]/g, '')}%`
}

export const guestRoutes = new Hono<Env>()

guestRoutes.get('/', validate('query', listQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const db = getDb(c.env.DB)
  const pattern = query.q ? searchPattern(query.q) : undefined
  const rows = await db
    .select()
    .from(guests)
    .where(
      pattern
        ? or(
            like(guests.fullName, pattern),
            like(guests.email, pattern),
            like(guests.phone, pattern),
            like(guests.documentNumber, pattern),
          )
        : undefined,
    )
    .orderBy(asc(guests.fullName))
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0)
  return c.json(rows.map(presentGuest))
})

guestRoutes.post('/', validate('json', guestFields), async (c) => {
  const body = c.req.valid('json')
  const db = getDb(c.env.DB)
  const row = {
    id: crypto.randomUUID(),
    fullName: body.fullName,
    firstName: '',
    lastName: '',
    email: body.email ?? null,
    phone: body.phone ?? null,
    documentType: body.documentType ?? null,
    documentNumber: body.documentNumber ?? null,
    notes: body.notes ?? null,
    createdAt: new Date().toISOString(),
  }
  await db.insert(guests).values(row)
  return c.json(presentGuest(row), 201)
})

guestRoutes.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const [guest] = await db.select().from(guests).where(eq(guests.id, c.req.param('id')))
  if (!guest) throw new HttpError(404, 'guest not found')
  const stays = await db
    .select({
      id: reservations.id,
      code: reservations.code,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
    })
    .from(reservations)
    .where(eq(reservations.guestId, guest.id))
    .orderBy(desc(reservations.checkIn))
  return c.json({ ...presentGuest(guest), reservations: stays })
})

guestRoutes.patch('/:id', validate('json', guestFields.partial()), async (c) => {
  const body = c.req.valid('json')
  const db = getDb(c.env.DB)
  const [guest] = await db.select().from(guests).where(eq(guests.id, c.req.param('id')))
  if (!guest) throw new HttpError(404, 'guest not found')
  if (Object.keys(body).length === 0) throw new HttpError(400, 'send a field to update')
  await db.update(guests).set(body).where(eq(guests.id, guest.id))
  const [updated] = await db.select().from(guests).where(eq(guests.id, guest.id))
  return c.json(presentGuest(updated))
})
