import type {
  CheckoutAuthentication,
  CheckoutAuthenticationFailure,
  CheckoutPayment,
} from "@pms/shared";
import { onlinePaymentMethod, yapeAllowed } from "@pms/shared/online-payment";
import type { Db } from "./db";
import { HttpError, PAYMENT_PENDING } from "./http";
import { quoteBill, reservationBill } from "./lib/reservation-bill";
import { requirePublicPaymentAdmission } from "./operation-controls";
import {
  continuePublicAuthentication,
  failPublicAuthentication,
  findAttempt,
  latestCheckoutAttempt,
  PAYMENT_NOT_ADMITTED,
  paymentDelayed,
  refreshPaymentAttempt,
  startPaymentAttempt,
  type Attempt,
  type PaymentContext,
} from "./payment-attempts";
import { latestAcceptance, requireCurrentQuote, type PublicCheckout } from "./public-checkouts";
import { requireSellableRooms, type Quote } from "./quotes";
import { loadReservation } from "./reservation-read";

export const TOO_MANY_PAYMENTS = "too many payment attempts";
export const QUOTE_NOT_ACCEPTED = "quote has not been accepted";
export const YAPE_LIMIT_EXCEEDED = "Yape payment exceeds its limit";

export type GuestPaymentState =
  | "authentication_required"
  | "declined"
  | "processing"
  | "paid_awaiting_reservation"
  | "unfulfilled"
  | "confirmed"
  | "reservation_changed";

type PayableQuote = {
  quote: Quote;
  acceptance: NonNullable<Awaited<ReturnType<typeof latestAcceptance>>>;
};

export async function checkoutPayment(
  db: Db,
  checkout: PublicCheckout,
  context: PaymentContext,
  options: { open?: boolean } = {},
) {
  const latest = await latestCheckoutAttempt(db, checkout.id, options);
  return latest && presentGuestPayment(db, await refreshPaymentAttempt(db, latest.id, context));
}

export async function payableQuote(
  db: Db,
  checkout: PublicCheckout,
  quoteId: string,
  context: { today: string; now: Date },
): Promise<PayableQuote> {
  const quote = await requireCurrentQuote(db, checkout, quoteId, context);
  const acceptance = await latestAcceptance(db, checkout.id);
  if (acceptance?.quoteId !== quote.id) throw new HttpError(409, QUOTE_NOT_ACCEPTED);
  return { quote, acceptance };
}

export function requireMethodAllows({ quote }: PayableQuote, sourceId: string) {
  if (
    onlinePaymentMethod(sourceId) === "yape" &&
    !yapeAllowed(quoteBill(quote).requiredInitialPaymentCents)
  )
    throw new HttpError(400, YAPE_LIMIT_EXCEEDED);
}

export async function authenticateCheckout(
  db: Db,
  checkout: PublicCheckout,
  { attemptId, ...authentication }: CheckoutAuthentication,
  context: PaymentContext,
) {
  const latest = await latestCheckoutAttempt(db, checkout.id);
  if (!latest) throw new HttpError(404, "payment attempt not found");
  if (latest.id === attemptId && latest.status === "review") {
    const continued = await continuePublicAuthentication(db, latest, authentication, context);
    if (continued) return presentGuestPayment(db, continued);
  }
  const current = await checkoutPayment(db, checkout, context);
  if (!current) throw new HttpError(404, "payment attempt not found");
  return current;
}

export async function failCheckoutAuthentication(
  db: Db,
  checkout: PublicCheckout,
  { attemptId }: CheckoutAuthenticationFailure,
  context: PaymentContext,
) {
  const latest = await latestCheckoutAttempt(db, checkout.id);
  if (!latest) throw new HttpError(404, "payment attempt not found");
  if (latest.id === attemptId) await failPublicAuthentication(db, latest);
  const current = await checkoutPayment(db, checkout, context);
  if (!current) throw new HttpError(404, "payment attempt not found");
  return current;
}

export async function chargeCheckout(
  db: Db,
  checkout: PublicCheckout,
  { quote, acceptance }: PayableQuote,
  input: CheckoutPayment,
  context: PaymentContext & { today: string; now: Date },
) {
  await requireSellableRooms(db, quote, null);
  try {
    const started = await startPaymentAttempt(
      db,
      {
        quoteId: quote.id,
        sourceId: input.sourceId,
        deviceFingerprint: input.deviceFingerprint,
      },
      context,
      { checkoutId: checkout.id, acceptanceId: acceptance.id, language: acceptance.language },
    );
    return {
      created: true,
      payment: await presentGuestPayment(db, await findAttempt(db, started.id)),
    };
  } catch (error) {
    if (error instanceof HttpError && error.message === PAYMENT_NOT_ADMITTED) {
      await requirePublicPaymentAdmission(db);
      await payableQuote(db, checkout, quote.id, context);
      throw new HttpError(409, QUOTE_NOT_ACCEPTED);
    }
    if (!(error instanceof HttpError && error.status === 409 && error.message === PAYMENT_PENDING))
      throw error;
    const open = await checkoutPayment(db, checkout, context, { open: true });
    if (!open) throw error;
    return { created: false, payment: open };
  }
}

function guestState(attempt: Attempt, reservationStatus: string | null): GuestPaymentState {
  switch (attempt.status) {
    case "unknown":
      return "processing";
    case "review":
      return "authentication_required";
    case "succeeded":
      return "paid_awaiting_reservation";
    case "failed":
      return "declined";
    case "saved":
      if (reservationStatus === "confirmed" || reservationStatus === "unfulfilled")
        return reservationStatus;
      return "reservation_changed";
  }
}

async function presentGuestPayment(db: Db, attempt: Attempt) {
  const saved =
    attempt.status === "saved" && attempt.reservationId
      ? await loadReservation(db, attempt.reservationId)
      : null;
  const bill = saved && reservationBill(saved);
  return {
    attemptId: attempt.id,
    state: guestState(attempt, saved?.reservation.status ?? null),
    method: onlinePaymentMethod(attempt.sourceId),
    ...(attempt.status === "failed" && attempt.failureCode === "authentication_expired"
      ? { declineReason: "authentication_expired" as const }
      : {}),
    amountCents: attempt.amountCents,
    currency: attempt.currency,
    delayed: paymentDelayed(attempt),
    reservation:
      saved && bill
        ? {
            code: saved.reservation.code,
            paidCents: bill.paidCents,
            outstandingCents: Math.max(0, bill.balanceCents),
            refundDueCents: bill.refundDueCents,
          }
        : null,
  };
}
