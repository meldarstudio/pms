import type { State } from "./checkout-flow";
import { allowsNewPayment, type GuestPayment } from "./payment";

export function cardFor(state: State, payment: GuestPayment | null) {
  const stored = state.key ? state.card : null;
  if (!stored || !payment?.attemptId || stored.attemptId !== payment.attemptId) return null;
  return stored.sourceId;
}

export function awaitingStatus(state: State) {
  const status = state.payment?.state;
  return (
    status === "processing" ||
    status === "authentication_required" ||
    status === "paid_awaiting_reservation" ||
    status === "submitted" ||
    state.stored?.submitted != null
  );
}

export const payBusy = (state: State) => state.pay.kind !== "idle";

export const LOADING_STATUS = "reservation.review.loading";

export const SENDING_STATUS = "reservation.pay.sending";

export const sendingPayment = (state: State) =>
  payBusy(state) && state.status.key === SENDING_STATUS;

export const formVisible = (state: State) =>
  state.paymentsEnabled && allowsNewPayment(state.payment) && !state.outcomeShown;

export const reviewLoading = (state: State) =>
  !state.reviewShown && !state.problem && state.status.key === LOADING_STATUS;

export const whatsappVisible = (state: State) => !state.payment;

export const payActionVisible = (state: State) => !state.outcomeShown;

const VERIFYING: readonly GuestPayment["state"][] = ["processing", "paid_awaiting_reservation"];

export function outcomeActions(state: State) {
  const payment = state.payment;
  if (!payment) return { retry: false, bank: false, check: false };
  return {
    retry: allowsNewPayment(payment) && state.paymentsEnabled,
    bank: payment.state === "authentication_required" && cardFor(state, payment) !== null,
    check:
      payment.state === "submitted" ||
      payment.state === "authentication_required" ||
      (VERIFYING.includes(payment.state) && payment.delayed),
  };
}
