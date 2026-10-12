import { paymentListQuerySchema } from '@pms/shared'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db'
import { guests, payments, reservations } from '../db/schema'
import type { Env } from '../env'
import { currency, validate } from '../http'
import { requireInclusiveRange } from '../rules'

export const paymentRoutes = new Hono<Env>()

paymentRoutes.get('/', validate('query', paymentListQuerySchema), async (c) => {
  const { from, to } = c.req.valid('query')
  requireInclusiveRange(from, to, 366)
  const db = getDb(c.env.DB)
  const rows = await db
    .select({
      id: payments.id,
      reservationId: payments.reservationId,
      code: reservations.code,
      guestName: guests.fullName,
      amountCents: payments.amountCents,
      method: payments.method,
      reference: payments.reference,
      paymentDate: payments.paymentDate,
      notes: payments.notes,
    })
    .from(payments)
    .innerJoin(reservations, eq(reservations.id, payments.reservationId))
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(
      and(
        gte(payments.paymentDate, from),
        lte(payments.paymentDate, to),
      ),
    )
    .orderBy(asc(payments.paymentDate))
  return c.json({
    from,
    to,
    currency: currency(c),
    totalCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    payments: rows,
  })
})
