import type { cancellationWaivers, reservationCancellations } from "../db/schema";
import { propertyCalendar } from "../property-calendar";
import { addDays } from "./dates";
import type { CancellationPolicy, RatePlanTerms } from "./rate-plans";
import { cancellationCharge, stayBill } from "./reservation-bill";

export type Waiver = typeof cancellationWaivers.$inferSelect & { recordedBy: string | null };
export type Cancellation = typeof reservationCancellations.$inferSelect & {
  recordedBy: string | null;
  waivers: Waiver[];
};

export const activeCancellation = (cancellations: Cancellation[]) =>
  cancellations.find((cancellation) => cancellation.restoredAt === null);

export function presentCancellation(cancellation: Cancellation) {
  return {
    id: cancellation.id,
    outcome: cancellation.outcome,
    recordedAt: cancellation.recordedAt,
    recordedBy: cancellation.recordedBy,
    freeUntil: cancellation.freeUntil,
    ...cancellationCharge(cancellation),
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

export function cancellationFields(cancellations: Cancellation[]) {
  const active = activeCancellation(cancellations);
  return {
    cancellation: active ? presentCancellation(active) : null,
    cancellations: cancellations
      .toSorted((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id))
      .map(presentCancellation),
  };
}

type BillableRoom = Parameters<typeof stayBill>[0][number];

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
    input.outcome === "no_show" ? null : freeCancellationUntil(policy, input.checkIn);
  if (
    freeUntil !== null &&
    propertyCalendar(input.timeZone, new Date(input.now)).today <= freeUntil
  )
    return { freeUntil, policyChargeCents: 0 };
  return {
    freeUntil,
    policyChargeCents: chargeableCents(policy, input.rooms, input.discountCents),
  };
}

export function freeCancellationUntil(policy: CancellationPolicy, checkIn: string) {
  return policy.freeUntilDaysBeforeCheckIn === null
    ? null
    : addDays(checkIn, -policy.freeUntilDaysBeforeCheckIn);
}

export function chargeableCents(
  policy: CancellationPolicy,
  rooms: BillableRoom[],
  discountCents: number,
) {
  const stay = stayBill(rooms, { discountCents, paymentSchedule: "first_night_deposit" });
  return policy.chargeBasis === "final_total" ? stay.totalCents : stay.requiredInitialPaymentCents;
}
