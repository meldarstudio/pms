import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { couponMovements, coupons, user } from "../db/schema";
import { addMonths } from "./dates";

export type Coupon = typeof coupons.$inferSelect & { issuedBy: string | null };
export type CouponMovement = typeof couponMovements.$inferSelect & { recordedBy: string | null };
type CouponMoney = Pick<CouponMovement, "kind" | "amountCents">;

export const couponQuery = (db: Db) =>
  db
    .select({ coupon: coupons, issuedBy: user.username })
    .from(coupons)
    .leftJoin(user, eq(user.id, coupons.accountId));
export const couponMovementQuery = (db: Db) =>
  db
    .select({ movement: couponMovements, recordedBy: user.username })
    .from(couponMovements)
    .leftJoin(user, eq(user.id, couponMovements.accountId));

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function couponCode(): string {
  let code = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(10))) code += alphabet[byte % 32];
  return code;
}

export const couponExpiry = (today: string) => addMonths(today, 12);

const sum = (movements: CouponMoney[], kind: CouponMoney["kind"]) =>
  movements.reduce((total, m) => total + (m.kind === kind ? m.amountCents : 0), 0);

export const couponIssuedCents = (movements: CouponMoney[]) => sum(movements, "issue");
export const couponAppliedCents = (movements: CouponMoney[]) =>
  sum(movements, "redeem") - sum(movements, "return");

const byTime =
  <T extends { id: string }>(time: (row: T) => string) =>
  (a: T, b: T) =>
    time(a).localeCompare(time(b)) || a.id.localeCompare(b.id);

export function presentCoupon(coupon: Coupon) {
  return {
    id: coupon.id,
    code: coupon.code,
    valueCents: coupon.valueCents,
    balanceCents: coupon.balanceCents,
    issuedAt: coupon.issuedAt,
    issuedBy: coupon.issuedBy,
    expiresOn: coupon.expiresOn,
  };
}

export function couponFields(
  reservationId: string,
  coupons: Coupon[],
  movements: CouponMovement[],
) {
  const codes = new Map(coupons.map((coupon) => [coupon.id, coupon]));
  return {
    coupons: coupons
      .filter((coupon) => coupon.sourceReservationId === reservationId)
      .toSorted(byTime((coupon) => coupon.issuedAt))
      .map(presentCoupon),
    couponMovements: movements.toSorted(byTime((m) => m.recordedAt)).map((movement) => ({
      id: movement.id,
      couponId: movement.couponId,
      code: codes.get(movement.couponId)?.code ?? null,
      kind: movement.kind,
      amountCents: movement.amountCents,
      recordedAt: movement.recordedAt,
      recordedOn: movement.recordedOn,
      recordedBy: movement.recordedBy,
    })),
  };
}
