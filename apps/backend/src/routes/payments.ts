import { paymentListQuerySchema } from "@pms/shared";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { guests, payments, refunds, reservations } from "../db/schema";
import type { Env } from "../env";
import { currency, validate } from "../http";
import { requireInclusiveRange } from "../rules";

export const paymentRoutes = new Hono<Env>();

paymentRoutes.get("/", validate("query", paymentListQuerySchema), async (c) => {
  const { from, to } = c.req.valid("query");
  requireInclusiveRange(from, to, 366);
  const db = getDb(c.env.DB);
  const [rows, refundRows] = await db.batch([
    db
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
      .where(and(gte(payments.paymentDate, from), lte(payments.paymentDate, to)))
      .orderBy(asc(payments.paymentDate)),
    db
      .select({
        id: refunds.id,
        paymentId: refunds.paymentId,
        reservationId: refunds.reservationId,
        code: reservations.code,
        guestName: guests.fullName,
        amountCents: refunds.amountCents,
        method: refunds.method,
        reference: refunds.completionReference,
        refundDate: refunds.refundDate,
        reason: refunds.reason,
      })
      .from(refunds)
      .innerJoin(reservations, eq(reservations.id, refunds.reservationId))
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .where(
        and(
          eq(refunds.status, "completed"),
          gte(refunds.refundDate, from),
          lte(refunds.refundDate, to),
        ),
      )
      .orderBy(asc(refunds.refundDate), asc(refunds.resolvedAt)),
  ]);
  return c.json({
    from,
    to,
    currency: currency(c),
    totalCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    payments: rows,
    refundedCents: refundRows.reduce((sum, row) => sum + row.amountCents, 0),
    refunds: refundRows,
  });
});
