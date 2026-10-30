import { paymentListQuerySchema } from "@pms/shared";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import {
  couponMovements,
  coupons,
  guests,
  payments,
  refunds,
  reservations,
  user,
  type CouponMovementKind,
} from "../db/schema";
import type { Env } from "../env";
import { currency, validate } from "../http";
import { requireInclusiveRange } from "../rules";

export const paymentRoutes = new Hono<Env>();

paymentRoutes.get("/", validate("query", paymentListQuerySchema), async (c) => {
  const { from, to } = c.req.valid("query");
  requireInclusiveRange(from, to, 366);
  const db = getDb(c.env.DB);
  const [rows, refundRows, couponRows] = await db.batch([
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
    db
      .select({
        id: couponMovements.id,
        couponId: couponMovements.couponId,
        code: sql<string>`${coupons.code}`.as("coupon_code"),
        reservationId: couponMovements.reservationId,
        reservationCode: reservations.code,
        guestName: guests.fullName,
        kind: couponMovements.kind,
        amountCents: couponMovements.amountCents,
        recordedOn: couponMovements.recordedOn,
        recordedBy: user.username,
      })
      .from(couponMovements)
      .innerJoin(coupons, eq(coupons.id, couponMovements.couponId))
      .innerJoin(reservations, eq(reservations.id, couponMovements.reservationId))
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .leftJoin(user, eq(user.id, couponMovements.accountId))
      .where(and(gte(couponMovements.recordedOn, from), lte(couponMovements.recordedOn, to)))
      .orderBy(asc(couponMovements.recordedOn), asc(couponMovements.recordedAt)),
  ]);
  const couponCents = (kind: CouponMovementKind) =>
    couponRows.reduce((sum, row) => sum + (row.kind === kind ? row.amountCents : 0), 0);
  return c.json({
    from,
    to,
    currency: currency(c),
    totalCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    payments: rows,
    refundedCents: refundRows.reduce((sum, row) => sum + row.amountCents, 0),
    refunds: refundRows,
    couponIssuedCents: couponCents("issue"),
    couponRedeemedCents: couponCents("redeem"),
    couponReturnedCents: couponCents("return"),
    couponMovements: couponRows,
  });
});
