import type { CheckoutLanguage } from "@pms/shared";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "./db";
import { confirmationIntents, paymentAttempts, reservations } from "./db/schema";
import { HttpError } from "./http";
import { confirmationSubmissionView } from "./confirmation-submissions";
import { loadReservation } from "./reservation-read";
import { confirmationResendHistory } from "./confirmation-resends";

export const CONFIRMATION_NOT_ESTABLISHED = "confirmation was not established";

export type ConfirmationProvenance = {
  attemptId: string;
  checkoutId: string;
  acceptanceId: string;
  recipientEmail: string;
  language: CheckoutLanguage | null;
};

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
    } catch {
      console.error("confirmation intent repair failed", reservation.id);
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

export async function staffConfirmationIntent(db: Db, reservationId: string) {
  const state = await loadReservation(db, reservationId);
  const [intent] = await db
    .select()
    .from(confirmationIntents)
    .where(eq(confirmationIntents.reservationId, reservationId));
  if (!intent) throw new HttpError(404, CONFIRMATION_NOT_ESTABLISHED);
  const submission = await confirmationSubmissionView(db, intent.id);
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
    submission,
    history: [
      {
        id: intent.id,
        kind: "automatic" as const,
        recipientEmail: intent.recipientEmail,
        language: intent.language,
        createdAt: intent.createdAt,
        requestedBy: null,
        mayDuplicateEarlierDelivery: false,
        submission,
      },
      ...(await confirmationResendHistory(db, intent.id)),
    ],
  };
}
