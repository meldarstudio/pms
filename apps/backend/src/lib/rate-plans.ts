import type { reservations } from "../db/schema";

// Code-defined offers. Each reservation stores a snapshot of the terms it was
// accepted under, so changing a definition here never alters an existing agreement.

export type CancellationChargeBasis = "first_night" | "final_total";
export type PaymentSchedule = "first_night_deposit" | "full_upfront";
export type RatePlanCode = "flexible" | "non_refundable";

export type CancellationPolicy = {
  chargeBasis: CancellationChargeBasis;
  /** Hours before the scheduled check-in until which cancellation is free; null when never free. */
  freeUntilHoursBeforeCheckIn: number | null;
  /** Scheduled check-in time on the check-in date, in the property timezone. */
  checkInTime: string;
};

export type RatePlanTerms = {
  plan: RatePlanCode;
  cancellationPolicy: CancellationPolicy;
  paymentSchedule: PaymentSchedule;
  /** Signed percentage applied to ordinary nightly prices; -10 is a 10% reduction. */
  priceAdjustmentPercent: number;
};

const cancellationPolicies = {
  freeUntil48Hours: {
    chargeBasis: "first_night",
    freeUntilHoursBeforeCheckIn: 48,
    checkInTime: "15:00",
  },
  nonRefundable: {
    chargeBasis: "final_total",
    freeUntilHoursBeforeCheckIn: null,
    checkInTime: "15:00",
  },
} satisfies Record<string, CancellationPolicy>;

export const ratePlans = {
  flexible: {
    plan: "flexible",
    cancellationPolicy: cancellationPolicies.freeUntil48Hours,
    paymentSchedule: "first_night_deposit",
    priceAdjustmentPercent: 0,
  },
  non_refundable: {
    plan: "non_refundable",
    cancellationPolicy: cancellationPolicies.nonRefundable,
    paymentSchedule: "full_upfront",
    priceAdjustmentPercent: -10,
  },
} satisfies Record<RatePlanCode, RatePlanTerms>;

type Reservation = typeof reservations.$inferSelect;
type TermColumns = Pick<
  Reservation,
  | "ratePlan"
  | "cancellationChargeBasis"
  | "freeCancellationHours"
  | "checkInTime"
  | "paymentSchedule"
  | "priceAdjustmentPercent"
>;

/** The reservation columns that snapshot a plan's terms at acceptance. */
export function termColumns(terms: RatePlanTerms): TermColumns {
  return {
    ratePlan: terms.plan,
    cancellationChargeBasis: terms.cancellationPolicy.chargeBasis,
    freeCancellationHours: terms.cancellationPolicy.freeUntilHoursBeforeCheckIn,
    checkInTime: terms.cancellationPolicy.checkInTime,
    paymentSchedule: terms.paymentSchedule,
    priceAdjustmentPercent: terms.priceAdjustmentPercent,
  };
}

/** The terms a reservation was accepted under, read from its stored snapshot. */
export function acceptedTerms(reservation: TermColumns): RatePlanTerms {
  return {
    plan: reservation.ratePlan as RatePlanCode,
    cancellationPolicy: {
      chargeBasis: reservation.cancellationChargeBasis as CancellationChargeBasis,
      freeUntilHoursBeforeCheckIn: reservation.freeCancellationHours,
      checkInTime: reservation.checkInTime,
    },
    paymentSchedule: reservation.paymentSchedule as PaymentSchedule,
    priceAdjustmentPercent: reservation.priceAdjustmentPercent,
  };
}
