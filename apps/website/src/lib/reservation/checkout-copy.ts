import type { CheckoutOutcome } from "./checkout";
import type { ContactField } from "./checkout-form";
import type { GuestPayment, PaymentOutcome } from "./payment";

export type Ready = Extract<CheckoutOutcome, { kind: "ready" }>;
export type Problem = Exclude<CheckoutOutcome, Ready> | { kind: "missing" };

export const problemCopy: Record<Problem["kind"], { title: string; body: string; retry: boolean }> =
  {
    missing: {
      title: "reservation.review.missing.title",
      body: "reservation.review.missing.body",
      retry: false,
    },
    sold_out: {
      title: "reservation.review.soldOut.title",
      body: "reservation.review.soldOut.body",
      retry: false,
    },
    invalid: {
      title: "reservation.review.invalid.title",
      body: "reservation.problem.invalidSearch",
      retry: false,
    },
    throttled: {
      title: "reservation.review.throttled.title",
      body: "reservation.review.throttled.body",
      retry: true,
    },
    limited: {
      title: "reservation.review.limited.title",
      body: "reservation.review.limited.body",
      retry: true,
    },
    unavailable: {
      title: "reservation.review.unavailable.title",
      body: "reservation.review.unavailable.body",
      retry: true,
    },
    expired: {
      title: "reservation.review.unavailable.title",
      body: "reservation.review.unavailable.body",
      retry: true,
    },
    replaced: {
      title: "reservation.review.unavailable.title",
      body: "reservation.review.unavailable.body",
      retry: true,
    },
    denied: {
      title: "reservation.review.unavailable.title",
      body: "reservation.review.unavailable.body",
      retry: true,
    },
    has_payment: {
      title: "reservation.review.unavailable.title",
      body: "reservation.review.unavailable.body",
      retry: true,
    },
  };

export const payErrorCopy: Partial<Record<PaymentOutcome["kind"], string>> = {
  paused: "reservation.pay.error.paused",
  throttled: "reservation.pay.error.throttled",
  security_failed: "reservation.pay.error.securityFailed",
  security_unavailable: "reservation.pay.error.securityUnavailable",
  unavailable: "reservation.pay.error.unavailable",
};

export const formErrorCopy: Partial<Record<Problem["kind"], string>> = {
  invalid: "reservation.review.error.invalid",
  throttled: "reservation.review.error.throttled",
  unavailable: "reservation.review.error.unavailable",
};

export const backendProblems: Record<string, string> = {
  "online check-in must be after today": "reservation.problem.checkInTooSoon",
  "too many guests for this room type": "reservation.review.problem.tooManyGuests",
  "room type not found": "reservation.room.offline",
  "stay must be at least one night": "reservation.problem.checkOutBeforeCheckIn",
  "stay cannot be longer than 60 nights": "reservation.problem.tooManyNights",
  "invalid date": "reservation.problem.invalidDate",
};

export const contactProblems: Record<string, [ContactField, string]> = {
  "full name is required": ["fullName", "reservation.review.error.fullName"],
  "email is required": ["email", "reservation.review.error.email"],
  "invalid email": ["email", "reservation.review.error.email"],
  "phone is required": ["phone", "reservation.review.error.phone"],
  "invalid phone number": ["phone", "reservation.review.error.phoneInvalid"],
  "phone number is too short": ["phone", "reservation.review.error.phoneInvalid"],
  "phone number is too long": ["phone", "reservation.review.error.phoneInvalid"],
  "phone extensions are not supported": ["phone", "reservation.review.error.phoneInvalid"],
};

export const outcomeTone: Record<GuestPayment["state"], string> = {
  declined: "border-red-700",
  submitted: "border-amber-600",
  authentication_required: "border-amber-600",
  processing: "border-amber-600",
  paid_awaiting_reservation: "border-amber-600",
  unfulfilled: "border-red-700",
  confirmed: "border-accent-700",
  reservation_changed: "border-amber-600",
};

export function problemPresentation(problem: Problem) {
  const copy = problemCopy[problem.kind];
  const body =
    problem.kind === "invalid" ? (backendProblems[problem.error] ?? copy.body) : copy.body;
  return { titleKey: copy.title, bodyKey: body, retry: copy.retry };
}

export type OutcomeRow = { labelKey: string; value: string | { cents: number } };

export function outcomePresentation(payment: GuestPayment) {
  const key = `reservation.outcome.${payment.state}`;
  const { reservation } = payment;
  const rows: OutcomeRow[] =
    payment.state === "confirmed" && reservation
      ? [
          { labelKey: "reservation.outcome.reference", value: reservation.code },
          { labelKey: "reservation.outcome.paid", value: { cents: reservation.paidCents } },
          {
            labelKey: "reservation.outcome.outstanding",
            value: { cents: reservation.outstandingCents },
          },
        ]
      : payment.state === "unfulfilled" && reservation
        ? [
            { labelKey: "reservation.outcome.supportReference", value: reservation.code },
            { labelKey: "reservation.outcome.received", value: { cents: reservation.paidCents } },
            {
              labelKey: "reservation.outcome.awaiting",
              value: { cents: reservation.refundDueCents },
            },
          ]
        : reservation
          ? [
              { labelKey: "reservation.outcome.reference", value: reservation.code },
              { labelKey: "reservation.outcome.paid", value: { cents: reservation.paidCents } },
            ]
          : [{ labelKey: "reservation.outcome.amount", value: { cents: payment.amountCents } }];
  return {
    tone: outcomeTone[payment.state],
    titleKey: `${key}.title`,
    bodyKey:
      payment.state === "processing" && payment.delayed
        ? "reservation.outcome.processing.delayed"
        : `${key}.body`,
    rows,
  };
}
