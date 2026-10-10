import { paymentListQuerySchema } from '@pms/shared'
import { sql, and, asc, eq, gte, lte, isNull, inArray, exists } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db'
import { guests, financialEntries as payments, reservations, reservationRooms } from '../db/schema'
import type { Env } from '../env'
import { currency, validate } from '../http'
import { requireInclusiveRange } from '../rules'

export const paymentRoutes = new Hono<Env>()

paymentRoutes.get('/', validate('query', paymentListQuerySchema), async (c) => {
  const { from, to } = c.req.valid('query')
  requireInclusiveRange(from, to, 366)
  const db = getDb(c.env.DB)
  const paidOn = sql<string>`substr(${payments.occurredAt}, 1, 10)`
  const rows = await db
    .select({
      id: payments.id,
      reservationId: payments.reservationId,
      code: reservations.code,
      guestName: guests.fullName,
      amountCents: sql<number>`CASE WHEN ${payments.kind} = 'refund' THEN -${payments.amountCents} ELSE ${payments.amountCents} END`,
      method: payments.method,
      reference: payments.reference,
      paidAt: payments.occurredAt,
      notes: payments.reason,
    })
    .from(payments)
    .innerJoin(reservations, eq(reservations.id, payments.reservationId))
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(
      and(
        gte(paidOn, from),
        lte(paidOn, to),
        isNull(payments.voidedAt),
        exists(
          db
            .select({ id: reservationRooms.id })
            .from(reservationRooms)
            .where(
              and(
                eq(reservationRooms.reservationId, reservations.id),
                inArray(reservationRooms.status, ['confirmed', 'checked_in', 'checked_out']),
              ),
            ),
        ),
        inArray(payments.kind, ['payment', 'refund', 'legacy_signed']),
      ),
    )
    .orderBy(asc(payments.occurredAt))
  return c.json({
    from,
    to,
    currency: currency(c),
    totalCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    payments: rows,
  })
})
