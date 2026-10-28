import type { cancellationWaivers, reservationCancellations } from "../db/schema";
import { propertyCalendar } from "../property-calendar";
import { addDays } from "./dates";
import type { RatePlanTerms } from "./rate-plans";
import { reservationBill } from "./workflow-billing";

export type Waiver = typeof cancellationWaivers.$inferSelect & { recordedBy: string | null };
export type Cancellation = typeof reservationCancellations.$inferSelect & {
  recordedBy: string | null;
  waivers: Waiver[];
};

/** The cancellation or no-show whose charge replaces the stay bill; restored ones are history. */
export const activeCancellation = (cancellations: Cancellation[]) =>
  cancellations.find((cancellation) => cancellation.restoredAt === null);

export function presentCancellation(cancellation: Cancellation) {
  const waivedCents = cancellation.waivers.reduce((sum, waiver) => sum + waiver.amountCents, 0);
  return {
    id: cancellation.id,
    outcome: cancellation.outcome,
    recordedAt: cancellation.recordedAt,
    recordedBy: cancellation.recordedBy,
    freeUntil: cancellation.freeUntil,
    policyChargeCents: cancellation.policyChargeCents,
    waivedCents,
    finalChargeCents: cancellation.policyChargeCents - waivedCents,
    restoredAt: cancellation.restoredAt,
    waivers: cancellation.waivers
      .toSorted((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id))
      .map((waiver) => ({
        id: waiver.id,
        amountCents: waiver.amountCents,
        reason: waiver.reason,
        recordedAt: waiver.recordedAt,
        recordedBy: waiver.recordedBy,
      })),
  };
}

/** The active cancellation and the restored history, as every read presents them. */
export function cancellationFields(cancellations: Cancellation[]) {
  const active = activeCancellation(cancellations);
  return {
    cancellation: active ? presentCancellation(active) : null,
    cancellations: cancellations
      .toSorted((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id))
      .map(presentCancellation),
  };
}

type BillableRoom = Parameters<typeof reservationBill>[0][number];

/**
 * The charge the accepted terms impose when the outcome is recorded at `now`.
 * Cancellation is free through the end of the deadline date in the property
 * calendar; otherwise, and always for a no-show, the basis applies to the stay
 * bill after the reservation discount.
 */
export function policyCharge(input: {
  outcome: string;
  rooms: BillableRoom[];
  discountCents: number;
  terms: RatePlanTerms;
  checkIn: string;
  now: string;
  timeZone: string;
}) {
  const { cancellationPolicy: policy } = input.terms;
  const freeUntil =
    input.outcome === "no_show" || policy.freeUntilDaysBeforeCheckIn === null
      ? null
      : addDays(input.checkIn, -policy.freeUntilDaysBeforeCheckIn);
  if (
    freeUntil !== null &&
    propertyCalendar(input.timeZone, new Date(input.now)).today <= freeUntil
  )
    return { freeUntil, policyChargeCents: 0 };
  const stay = reservationBill(input.rooms, [], input.discountCents, {
    released: false,
    paymentSchedule: "first_night_deposit",
  });
  return {
    freeUntil,
    policyChargeCents:
      policy.chargeBasis === "final_total" ? stay.totalCents : stay.requiredInitialPaymentCents,
  };
}
