import { couponCodeSchema } from "@pms/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { couponMovements, coupons, reservations, user } from "../db/schema";
import type { Env } from "../env";
import { HttpError } from "../http";
import { byTime, couponMovementQuery, presentCoupon, withIssuer } from "../lib/coupons";

export const couponRoutes = new Hono<Env>();

couponRoutes.get("/:code", async (c) => {
  const code = couponCodeSchema.safeParse(c.req.param("code"));
  if (!code.success) throw new HttpError(404, "coupon not found");
  const db = getDb(c.env.DB);
  const [found] = await db
    .select({ coupon: coupons, issuedBy: user.username, sourceReservationCode: reservations.code })
    .from(coupons)
    .innerJoin(reservations, eq(reservations.id, coupons.sourceReservationId))
    .leftJoin(user, eq(user.id, coupons.accountId))
    .where(eq(coupons.code, code.data));
  if (!found) throw new HttpError(404, "coupon not found");
  const movements = await couponMovementQuery(db)
    .innerJoin(reservations, eq(reservations.id, couponMovements.reservationId))
    .where(eq(couponMovements.couponId, found.coupon.id));
  return c.json({
    ...presentCoupon(withIssuer(found)),
    sourceReservationId: found.coupon.sourceReservationId,
    sourceReservationCode: found.sourceReservationCode,
    movements: movements
      .map(({ movement, recordedBy }) => ({
        id: movement.id,
        kind: movement.kind,
        amountCents: movement.amountCents,
        reservationId: movement.reservationId,
        recordedAt: movement.recordedAt,
        recordedOn: movement.recordedOn,
        recordedBy,
      }))
      .sort(byTime((m) => m.recordedAt)),
  });
});
