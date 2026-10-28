import type { cancellationWaivers, reservationCancellations } from "../db/schema";
import type { RatePlanTerms } from "./rate-plans";
import { reservationBill } from "./workflow-billing";

export type Waiver = typeof cancellationWaivers.$inferSelect & { recordedBy: string | null };
export type Cancellation = typeof reservationCancellations.$inferSelect & {
  recordedBy: string | null;
  waivers: Waiver[];
};

/** The cancellation whose charge replaces the stay bill; restored ones are history. */
export const activeCancellation = (cancellations: Cancellation[]) =>
  cancellations.find((cancellation) => cancellation.restoredAt === null);

export function presentCancellation(cancellation: Cancellation) {
  const waivedCents = cancellation.waivers.reduce((sum, waiver) => sum + waiver.amountCents, 0);
  return {
    id: cancellation.id,
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

/** The UTC instant of a wall-clock time on a calendar date in `timeZone`. */
export function zonedInstant(date: string, time: string, timeZone: string) {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const offset = (instant: number) => {
    const parts = Object.fromEntries(
      format.formatToParts(instant).map((part) => [part.type, Number(part.value)]),
    );
    const local = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    return local - instant;
  };
  // The second pass corrects a guess that crossed an offset change.
  let instant = wall - offset(wall);
  instant = wall - offset(instant);
  return new Date(instant);
}

/**
 * The charge the accepted terms impose when cancellation is recorded at `now`.
 * Cancellation is free at or before the deadline; otherwise the basis applies to
 * the stay bill after the reservation discount.
 */
export function policyCharge(input: {
  rooms: BillableRoom[];
  discountCents: number;
  terms: RatePlanTerms;
  checkIn: string;
  now: string;
  timeZone: string;
}) {
  const { cancellationPolicy: policy } = input.terms;
  const freeUntil =
    policy.freeUntilHoursBeforeCheckIn === null
      ? null
      : new Date(
          zonedInstant(input.checkIn, policy.checkInTime, input.timeZone).getTime() -
            policy.freeUntilHoursBeforeCheckIn * 3_600_000,
        ).toISOString();
  if (freeUntil !== null && Date.parse(input.now) <= Date.parse(freeUntil))
    return { freeUntil, policyChargeCents: 0 };
  const stay = reservationBill(input.rooms, [], input.discountCents, {
    cancelled: false,
    paymentSchedule: "first_night_deposit",
  });
  return {
    freeUntil,
    policyChargeCents:
      policy.chargeBasis === "final_total" ? stay.totalCents : stay.requiredInitialPaymentCents,
  };
}
