import type { reservations } from "../db/schema";

// Code-defined offers. Each reservation stores a snapshot of the terms it was
// accepted under, so changing a definition here never alters an existing agreement.

export type CancellationChargeBasis = "first_night" | "final_total";
export type PaymentSchedule = "first_night_deposit" | "full_upfront";
export type RatePlanCode = "flexible" | "non_refundable";

export type CancellationPolicy = {
  chargeBasis: CancellationChargeBasis;
  /**
   * Days before the check-in date through whose end cancellation is free, in the
   * property calendar; null when never free. 2 frees a 10 Nov stay through 8 Nov.
   */
  freeUntilDaysBeforeCheckIn: number | null;
};

export type RatePlanTerms = {
  plan: RatePlanCode;
  cancellationPolicy: CancellationPolicy;
  paymentSchedule: PaymentSchedule;
  /** Signed percentage applied to ordinary nightly prices; -10 is a 10% reduction. */
  priceAdjustmentPercent: number;
};

const cancellationPolicies = {
  freeUntil2DaysBefore: {
    chargeBasis: "first_night",
    freeUntilDaysBeforeCheckIn: 2,
  },
  nonRefundable: {
    chargeBasis: "final_total",
    freeUntilDaysBeforeCheckIn: null,
  },
} satisfies Record<string, CancellationPolicy>;

export const ratePlans = {
  flexible: {
    plan: "flexible",
    cancellationPolicy: cancellationPolicies.freeUntil2DaysBefore,
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
  | "freeCancellationDays"
  | "freeCancellationHours"
  | "paymentSchedule"
  | "priceAdjustmentPercent"
>;

/** The reservation columns that snapshot a plan's terms at acceptance. */
export function termColumns(terms: RatePlanTerms): TermColumns {
  return {
    ratePlan: terms.plan,
    cancellationChargeBasis: terms.cancellationPolicy.chargeBasis,
    freeCancellationDays: terms.cancellationPolicy.freeUntilDaysBeforeCheckIn,
    freeCancellationHours: hoursFromDays(terms.cancellationPolicy.freeUntilDaysBeforeCheckIn),
    paymentSchedule: terms.paymentSchedule,
    priceAdjustmentPercent: terms.priceAdjustmentPercent,
  };
}

// The pre-0011 column a Worker from before that migration still reads.
const hoursFromDays = (days: number | null) => (days === null ? null : days * 24);

/** The terms a reservation was accepted under, read from its stored snapshot. */
export function acceptedTerms(reservation: TermColumns): RatePlanTerms {
  return {
    plan: reservation.ratePlan as RatePlanCode,
    cancellationPolicy: {
      chargeBasis: reservation.cancellationChargeBasis as CancellationChargeBasis,
      freeUntilDaysBeforeCheckIn: reservation.freeCancellationDays,
    },
    paymentSchedule: reservation.paymentSchedule as PaymentSchedule,
    priceAdjustmentPercent: reservation.priceAdjustmentPercent,
  };
}
