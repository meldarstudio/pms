import type { reservations } from "../db/schema";

export type CancellationChargeBasis = "first_night" | "final_total";
export type PaymentSchedule = "first_night_deposit" | "full_upfront";
export type RatePlanCode = "flexible" | "non_refundable";

export type CancellationPolicy = {
  chargeBasis: CancellationChargeBasis;
  freeUntilDaysBeforeCheckIn: number | null;
};

export type RatePlanTerms = {
  plan: RatePlanCode;
  cancellationPolicy: CancellationPolicy;
  paymentSchedule: PaymentSchedule;
  priceAdjustmentPercent: number;
};

export type RatePlans = Record<RatePlanCode, RatePlanTerms>;

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

export const defaultRatePlans = {
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
} satisfies RatePlans;

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

const hoursFromDays = (days: number | null) => (days === null ? null : days * 24);

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
