import type { CheckoutLanguage } from "@pms/shared";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "./db";
import { confirmationIntents, paymentAttempts, reservations } from "./db/schema";
import { HttpError } from "./http";
import { loadReservation } from "./reservation-read";

export const CONFIRMATION_NOT_ESTABLISHED = "confirmation was not established";

export type ConfirmationProvenance = {
  attemptId: string;
  checkoutId: string;
  acceptanceId: string;
  recipientEmail: string;
  language: CheckoutLanguage | null;
};

let skipIntent = false;
let beforeRepairInsert: (() => Promise<void>) | null = null;

export function skipNextConfirmationIntent() {
  skipIntent = true;
}

export function whenRepairingConfirmation(hook: (() => Promise<void>) | null) {
  beforeRepairInsert = hook;
}

export function resetConfirmationHooks() {
  skipIntent = false;
  beforeRepairInsert = null;
}

export function consumeSkippedIntent() {
  const skip = skipIntent;
  skipIntent = false;
  return skip;
}

export function confirmationLanguage(
  language: CheckoutLanguage | null | undefined,
): CheckoutLanguage {
  return language ?? "es";
}

export function confirmationIntentValues(
  reservationId: string,
  provenance: ConfirmationProvenance,
  now: string,
) {
  return {
    id: crypto.randomUUID(),
    reservationId,
    attemptId: provenance.attemptId,
    checkoutId: provenance.checkoutId,
    acceptanceId: provenance.acceptanceId,
    recipientEmail: provenance.recipientEmail,
    language: confirmationLanguage(provenance.language),
    createdAt: now,
  };
}

export async function repairConfirmationIntents(db: Db) {
  const owed = await db
    .select({ id: reservations.id, checkoutId: reservations.publicCheckoutId })
    .from(reservations)
    .leftJoin(confirmationIntents, eq(confirmationIntents.reservationId, reservations.id))
    .where(and(eq(reservations.confirmationOwed, 1), isNull(confirmationIntents.id)));
  for (const reservation of owed) {
    try {
      await insertOwedIntent(db, reservation.id, reservation.checkoutId);
    } catch (error) {
      console.error("confirmation intent", reservation.id, redactAddresses(error));
    }
  }
}

async function insertOwedIntent(db: Db, reservationId: string, checkoutId: string | null) {
  if (!checkoutId) return;
  const [attempt] = await db
    .select()
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.reservationId, reservationId),
        eq(paymentAttempts.confirmationEmailEligible, true),
        eq(paymentAttempts.checkoutId, checkoutId),
        isNotNull(paymentAttempts.acceptanceId),
      ),
    )
    .limit(1);
  if (!attempt?.checkoutId || !attempt.acceptanceId) return;
  await beforeRepairInsert?.();
  await db
    .insert(confirmationIntents)
    .values(
      confirmationIntentValues(
        reservationId,
        {
          attemptId: attempt.id,
          checkoutId: attempt.checkoutId,
          acceptanceId: attempt.acceptanceId,
          recipientEmail: attempt.email,
          language: attempt.language,
        },
        new Date().toISOString(),
      ),
    )
    .onConflictDoNothing();
  const [existing] = await db
    .select()
    .from(confirmationIntents)
    .where(eq(confirmationIntents.reservationId, reservationId));
  return existing;
}

function redactAddresses(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  return new Error(error.message.replace(/[\w.+-]+@[\w.-]+/g, "[redacted]"), {
    cause: error.cause === undefined ? undefined : redactAddresses(error.cause),
  });
}

export async function staffConfirmationIntent(db: Db, reservationId: string) {
  const state = await loadReservation(db, reservationId);
  const [intent] = await db
    .select()
    .from(confirmationIntents)
    .where(eq(confirmationIntents.reservationId, reservationId));
  if (!intent) throw new HttpError(404, CONFIRMATION_NOT_ESTABLISHED);
  return {
    id: intent.id,
    recipientEmail: intent.recipientEmail,
    language: intent.language,
    attemptId: intent.attemptId,
    acceptanceId: intent.acceptanceId,
    createdAt: intent.createdAt,
    reservation: {
      id: state.reservation.id,
      code: state.reservation.code,
      status: state.reservation.status,
    },
  };
}
