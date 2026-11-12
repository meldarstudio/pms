import type { Lang } from "@/i18n/utils";
import {
  offerKey,
  quoteStillValid,
  selectionKey,
  type BookingContact,
  type CheckoutOutcome,
  type CheckoutSelection,
  type CheckoutView,
} from "./checkout";
import {
  backendProblems,
  contactProblems,
  formErrorCopy,
  payErrorCopy,
  type Problem,
  type Ready,
} from "./checkout-copy";
import {
  noFieldErrors,
  reviewProblems,
  trimmedContact,
  type FieldErrors,
  type ReviewField,
} from "./checkout-form";
import { awaitingStatus, cardFor, formVisible } from "./checkout-selectors";
import { contactKey, isStoredCard, type StoredCard, type StoredCheckout } from "./draft";
import { allowsNewPayment, type GuestPayment, type PaymentOutcome } from "./payment";
import type { AuthenticationParameters } from "./providers";
import type { StaySearch } from "./search";
import type { CheckoutAccess } from "./summary";

export type FocusTarget =
  | ReviewField
  | "problemTitle"
  | "outcomeTitle"
  | "outcomeBank"
  | "payButton";

export type Charge = {
  sourceId: string;
  turnstileToken: string;
  fingerprint: string | null;
};

export type PayStep =
  | { kind: "idle" }
  | { kind: "accepting"; retried: boolean }
  | { kind: "reopening"; reviewed: string }
  | { kind: "confirming" }
  | { kind: "refreshing" }
  | { kind: "reloading" }
  | { kind: "securing" }
  | { kind: "cardForm"; turnstileToken: string }
  | { kind: "fingerprint"; turnstileToken: string; sourceId: string }
  | { kind: "charging"; charge: Charge }
  | { kind: "recovering"; charge: Charge; reviewed: string }
  | { kind: "retrying"; charge: Charge; reviewed: string }
  | { kind: "rechecking"; reviewed: string }
  | { kind: "recoveringPayment"; charge: Charge }
  | { kind: "settling" };

export type StatusLine = { key: string; visible: boolean };

export type AccessState = {
  request: number;
  token: string | null;
  panel: boolean;
  copied: boolean;
};

export type State = {
  lang: Lang;
  paymentsEnabled: boolean;
  selection: CheckoutSelection | null;
  key: string;
  token: string;
  view: CheckoutView | null;
  reviewShown: boolean;
  problem: Problem | null;
  status: StatusLine;
  contact: BookingContact;
  agreed: boolean;
  changed: boolean;
  fieldErrors: FieldErrors;
  formError: string;
  payment: GuestPayment | null;
  outcomeShown: boolean;
  stored: StoredCheckout | null;
  card: StoredCard | null;
  pay: PayStep;
  securityCheck: "idle" | "requested";
  bankOpenedFor: string | null;
  access: AccessState;
};

export const LOADING_STATUS = "reservation.review.loading";

export const initialState: State = {
  lang: "es",
  paymentsEnabled: false,
  selection: null,
  key: "",
  token: "",
  view: null,
  reviewShown: false,
  problem: null,
  status: { key: LOADING_STATUS, visible: true },
  contact: { fullName: "", email: "", phone: "" },
  agreed: false,
  changed: false,
  fieldErrors: noFieldErrors,
  formError: "",
  payment: null,
  outcomeShown: false,
  stored: null,
  card: null,
  pay: { kind: "idle" },
  securityCheck: "idle",
  bankOpenedFor: null,
  access: { request: 0, token: null, panel: false, copied: false },
};

export type Draft = {
  contact: BookingContact;
  checkout: StoredCheckout | null;
  card: StoredCard | null;
};

export type CheckoutThen =
  | { kind: "load"; releasesPay: boolean }
  | { kind: "acceptRecovery" }
  | { kind: "payRefresh" }
  | { kind: "recover" }
  | { kind: "recoverLatest" };

export type PaymentThen =
  | { kind: "confirm" }
  | { kind: "sync"; announce: boolean; releasesPay: boolean }
  | { kind: "settled"; releasesPay: boolean }
  | { kind: "recovered" }
  | { kind: "authenticated" };

export type PaymentRequest = {
  quoteId: string;
  sourceId: string;
  turnstileToken: string;
  deviceFingerprint?: string;
};

export type CardCharge = {
  amountCents: number;
  currency: string;
  email: string;
};

export type Event =
  | {
      type: "started";
      lang: Lang;
      paymentsEnabled: boolean;
      selection: CheckoutSelection | null;
      draft: Draft;
    }
  | { type: "pageShown"; persisted: boolean; draft: Draft }
  | { type: "networkRestored" }
  | { type: "contactEdited"; field: "fullName" | "email" | "phone"; value: string }
  | { type: "agreeToggled"; agreed: boolean }
  | { type: "payRequested" }
  | { type: "loadRequested" }
  | { type: "payAgainRequested" }
  | { type: "bankRequested" }
  | { type: "statusCheckRequested" }
  | { type: "accessCopyRequested" }
  | { type: "accessCopied"; copied: boolean }
  | { type: "pollElapsed" }
  | { type: "checkoutRead"; after: CheckoutThen; outcome: CheckoutOutcome; now: number }
  | { type: "checkoutStarted"; after: CheckoutThen; outcome: CheckoutOutcome; now: number }
  | { type: "quoteRefreshed"; after: CheckoutThen; outcome: CheckoutOutcome; now: number }
  | { type: "quoteAccepted"; outcome: CheckoutOutcome; now: number }
  | { type: "paymentRead"; after: PaymentThen; outcome: PaymentOutcome; now: number }
  | { type: "paymentStarted"; outcome: PaymentOutcome; now: number }
  | { type: "paymentContinued"; outcome: PaymentOutcome }
  | { type: "accessRead"; request: number; access: CheckoutAccess | null }
  | { type: "securityCheckFailed" }
  | { type: "securityCheckErrored" }
  | { type: "securityTokenRead"; token: string }
  | { type: "cardFormResolved"; sourceId: string | null }
  | { type: "cardFormFailed" }
  | { type: "fingerprintRead"; fingerprint: string | null }
  | { type: "bankParameters"; parameters: AuthenticationParameters }
  | { type: "bankIncomplete" };

export type Effect =
  | { type: "readCheckout"; token: string; after: CheckoutThen }
  | { type: "startCheckout"; selection: CheckoutSelection; lang: Lang; after: CheckoutThen }
  | { type: "refreshQuote"; token: string; after: CheckoutThen }
  | {
      type: "acceptQuote";
      token: string;
      acceptance: { quoteId: string; language: Lang; contact: BookingContact };
    }
  | { type: "readPayment"; token: string; after: PaymentThen }
  | { type: "startPayment"; token: string; payment: PaymentRequest }
  | {
      type: "continuePayment";
      token: string;
      authentication: AuthenticationParameters & { attemptId: string };
    }
  | { type: "readCheckoutAccess"; token: string; request: number }
  | { type: "startSecurityCheck"; lang: Lang }
  | { type: "readSecurityToken" }
  | { type: "resetSecurityCheck" }
  | ({ type: "openCardForm"; lang: Lang } & CardCharge)
  | ({ type: "deviceFingerprint" } & CardCharge)
  | ({ type: "openBank"; sourceId: string } & CardCharge)
  | { type: "storeCheckout"; key: string; checkout: StoredCheckout }
  | { type: "storeCard"; key: string; card: StoredCard }
  | { type: "clearCardSource"; key: string }
  | { type: "storeContact"; contact: BookingContact }
  | { type: "storeConfirmedReservation"; code: string }
  | { type: "schedulePoll" }
  | { type: "cancelPoll" }
  | { type: "redirectToSummary"; token: string }
  | { type: "copyAccessLink"; token: string }
  | { type: "focus"; target: FocusTarget };

export type Transition = { state: State; effects: Effect[] };

export function checkoutSelection(
  search: StaySearch,
  roomTypeId: string | null | undefined,
): CheckoutSelection | null {
  const { room, plan, checkIn, checkOut } = search;
  if (!room || !plan || !checkIn || !checkOut || !roomTypeId) return null;
  return {
    roomTypeId,
    checkIn,
    checkOut,
    adults: search.adults,
    children: search.children,
    ratePlan: plan,
  };
}

type Ctx = { s: State; fx: Effect[] };

const VERIFYING: readonly GuestPayment["state"][] = ["processing", "paid_awaiting_reservation"];
const CARD_RELEASED: readonly GuestPayment["state"][] = [
  "declined",
  "confirmed",
  "unfulfilled",
  "reservation_changed",
  "paid_awaiting_reservation",
];

const isRejectedCharge = (outcome: PaymentOutcome) =>
  outcome.kind === "expired" || outcome.kind === "replaced";

const serverAccepted = (view: CheckoutView, now: number) =>
  quoteStillValid(view, now) && view.acceptance?.quoteId === view.quote.id;

const sameAcceptedOffer = (view: CheckoutView, reviewed: string, now: number) =>
  serverAccepted(view, now) && offerKey(view) === reviewed;

function setStatus(c: Ctx, key: string) {
  c.s.status = { ...c.s.status, key };
}

function writeCheckout(c: Ctx, checkout: StoredCheckout) {
  c.s.stored = checkout;
  c.fx.push({ type: "storeCheckout", key: c.s.key, checkout });
}

function markSubmitted(c: Ctx, quoteId: string | null) {
  if (c.s.stored) writeCheckout(c, { ...c.s.stored, submitted: quoteId });
}

function release(c: Ctx) {
  c.s.pay = { kind: "idle" };
}

function focus(c: Ctx, target: FocusTarget) {
  c.fx.push({ type: "focus", target });
}

function fieldError(c: Ctx, field: ReviewField, key: string | null) {
  c.s.fieldErrors = { ...c.s.fieldErrors, [field]: key };
}

function submittedPayment(s: State): GuestPayment | null {
  const view = s.view;
  if (!view || s.stored?.submitted !== view.quote.id) return null;
  return {
    attemptId: s.card?.attemptId ?? "",
    state: "submitted",
    amountCents: view.quote.requiredInitialPaymentCents,
    currency: view.currency,
    delayed: false,
    reservation: null,
  };
}

function waitingForBank(s: State): GuestPayment | null {
  const view = s.view;
  if (!view) return null;
  return {
    attemptId: s.card?.attemptId ?? "",
    state: "authentication_required",
    amountCents: view.quote.requiredInitialPaymentCents,
    currency: view.currency,
    delayed: false,
    reservation: null,
  };
}

function isAccepted(s: State) {
  const view = s.view;
  const accepted = s.stored?.accepted;
  return Boolean(
    view &&
    view.acceptance?.quoteId === view.quote.id &&
    accepted?.quoteId === view.quote.id &&
    accepted.contact === contactKey(s.contact) &&
    s.agreed,
  );
}

function showCheckout(c: Ctx) {
  if (formVisible(c.s) && c.s.view && c.s.securityCheck === "idle") {
    c.s.securityCheck = "requested";
    c.fx.push({ type: "startSecurityCheck", lang: c.s.lang });
  }
}

function showProblem(c: Ctx, problem: Problem) {
  setStatus(c, "");
  c.s.reviewShown = false;
  c.s.problem = problem;
  focus(c, "problemTitle");
}

function restoreDraft(c: Ctx, draft: Draft) {
  c.s.contact = draft.contact;
  c.s.stored = draft.checkout;
  c.s.card = draft.card;
  c.s.agreed = Boolean(c.s.view && draft.checkout?.agreedOffer === offerKey(c.s.view));
}

function load(c: Ctx, releasesPay: boolean) {
  c.s.problem = null;
  c.s.status = { key: LOADING_STATUS, visible: true };
  if (releasesPay) c.s.pay = { kind: "reloading" };
  openCheckout(c, { kind: "load", releasesPay });
}

function openCheckout(c: Ctx, after: CheckoutThen) {
  const token = c.s.stored?.token;
  if (token) c.fx.push({ type: "readCheckout", token, after });
  else if (c.s.selection)
    c.fx.push({ type: "startCheckout", selection: c.s.selection, lang: c.s.lang, after });
}

function ready(c: Ctx, outcome: Ready) {
  const previous = c.s.stored;
  const offer = offerKey(outcome.view);
  const agreed = previous?.agreedOffer === offer;
  c.s.token = outcome.token;
  c.s.view = outcome.view;
  writeCheckout(c, {
    token: outcome.token,
    agreedOffer: agreed ? offer : null,
    accepted: previous?.token === outcome.token ? previous.accepted : null,
    submitted: previous?.token === outcome.token ? (previous.submitted ?? null) : null,
  });
  c.s.agreed = agreed;
  c.s.changed = Boolean(previous?.agreedOffer) && !agreed;
  c.s.reviewShown = true;
  c.s.status = { key: "reservation.review.loaded", visible: false };
  showCheckout(c);
}

function afterLoad(c: Ctx, outcome: CheckoutOutcome, releasesPay: boolean) {
  if (outcome.kind !== "ready") {
    showProblem(c, outcome);
    if (releasesPay) release(c);
    return;
  }
  ready(c, outcome);
  syncPayment(c, false, releasesPay);
}

function syncPayment(c: Ctx, announce: boolean, releasesPay: boolean) {
  c.fx.push({ type: "cancelPoll" });
  if (releasesPay) c.s.pay = { kind: "reloading" };
  if (!c.s.token) {
    if (releasesPay) release(c);
    return;
  }
  if (announce) setStatus(c, "reservation.outcome.checking");
  c.fx.push({
    type: "readPayment",
    token: c.s.token,
    after: { kind: "sync", announce, releasesPay },
  });
}

function scheduleStatusPoll(c: Ctx) {
  c.fx.push({ type: "cancelPoll" });
  if (awaitingStatus(c.s)) c.fx.push({ type: "schedulePoll" });
}

function afterSync(c: Ctx, outcome: PaymentOutcome, after: Extract<PaymentThen, { kind: "sync" }>) {
  if (after.announce) setStatus(c, "");
  if (outcome.kind !== "payment") {
    scheduleStatusPoll(c);
  } else {
    if (outcome.payment) markSubmitted(c, null);
    showPayment(c, outcome.payment ?? submittedPayment(c.s), after.announce);
  }
  if (after.releasesPay) release(c);
}

function showPayment(c: Ctx, payment: GuestPayment | null, focusOutcome: boolean) {
  c.s.payment = payment;
  c.s.outcomeShown = Boolean(payment);
  showAccess(c, payment);
  if (payment && CARD_RELEASED.includes(payment.state) && c.s.key) {
    c.s.card = null;
    c.fx.push({ type: "clearCardSource", key: c.s.key });
  }
  showCheckout(c);
  if (payment && focusOutcome) focus(c, "outcomeTitle");
  if (payment?.state === "authentication_required") maybeOpenBank(c);
  if (payment && VERIFYING.includes(payment.state) && !payment.delayed)
    c.fx.push({ type: "schedulePoll" });
}

function showAccess(c: Ctx, payment: GuestPayment | null) {
  const request = c.s.access.request + 1;
  c.s.access = { request, token: null, panel: false, copied: false };
  const saved =
    payment?.state === "confirmed" ||
    payment?.state === "unfulfilled" ||
    payment?.state === "reservation_changed";
  if (!saved || !c.s.token) return;
  c.fx.push({ type: "readCheckoutAccess", token: c.s.token, request });
}

function afterAccessRead(c: Ctx, request: number, access: CheckoutAccess | null) {
  if (request !== c.s.access.request || !access) return;
  c.s.access = { ...c.s.access, token: access.token };
  const payment = c.s.payment;
  if (payment?.state === "confirmed" && payment.reservation) {
    c.fx.push({ type: "storeConfirmedReservation", code: payment.reservation.code });
    c.fx.push({ type: "redirectToSummary", token: access.token });
    return;
  }
  c.s.access = { ...c.s.access, panel: true };
}

function bankCharge(s: State): (CardCharge & { sourceId: string }) | null {
  const sourceId = cardFor(s, s.payment);
  const view = s.view;
  if (!sourceId || !s.paymentsEnabled || !view) return null;
  return {
    sourceId,
    amountCents: s.payment?.amountCents ?? view.quote.requiredInitialPaymentCents,
    currency: view.currency,
    email: trimmedContact(s.contact).email,
  };
}

function openBank(c: Ctx) {
  const charge = bankCharge(c.s);
  if (charge) c.fx.push({ type: "openBank", ...charge });
}

function maybeOpenBank(c: Ctx) {
  const source = cardFor(c.s, c.s.payment);
  if (!source || c.s.bankOpenedFor === source) return;
  c.s.bankOpenedFor = source;
  openBank(c);
}

function showAuthenticationIncomplete(c: Ctx) {
  const payment = c.s.payment;
  if (payment && payment.state !== "authentication_required" && payment.state !== "submitted")
    return;
  const pending = payment?.state === "authentication_required" ? payment : waitingForBank(c.s);
  if (!pending) return;
  showPayment(c, pending, false);
  focus(c, "outcomeBank");
}

function finishAuthentication(c: Ctx, parameters: AuthenticationParameters) {
  const attemptId = cardFor(c.s, c.s.payment) ? c.s.payment?.attemptId : null;
  if (!c.s.view || !c.s.token || !attemptId) return;
  markSubmitted(c, c.s.view.quote.id);
  c.fx.push({
    type: "continuePayment",
    token: c.s.token,
    authentication: { ...parameters, attemptId },
  });
}

function afterContinued(c: Ctx, outcome: PaymentOutcome) {
  if (outcome.kind === "payment" || outcome.kind === "unavailable") {
    settlePayment(c, outcome, false);
    return;
  }
  c.fx.push({ type: "readPayment", token: c.s.token, after: { kind: "authenticated" } });
}

function showReadPayment(c: Ctx, outcome: PaymentOutcome) {
  const payment = outcome.kind === "payment" ? outcome.payment : null;
  if (payment) markSubmitted(c, null);
  showPayment(c, payment ?? submittedPayment(c.s), true);
}

function settlePayment(c: Ctx, outcome: PaymentOutcome, releasesPay: boolean) {
  setStatus(c, "");
  const done = () => {
    if (releasesPay) release(c);
  };
  if (outcome.kind === "unavailable") {
    if (releasesPay) c.s.pay = { kind: "settling" };
    c.fx.push({
      type: "readPayment",
      token: c.s.token,
      after: { kind: "settled", releasesPay },
    });
    return;
  }
  markSubmitted(c, null);
  if (outcome.kind === "payment") {
    showPayment(c, outcome.payment, true);
    return done();
  }
  if (outcome.kind === "sold_out") {
    showProblem(c, { kind: "sold_out" });
    return done();
  }
  if (outcome.kind === "denied") return load(c, releasesPay);
  if (outcome.kind === "invalid" && backendProblems[outcome.error]) {
    showProblem(c, outcome);
    return done();
  }
  if (outcome.kind === "expired" || outcome.kind === "replaced") {
    c.s.formError = "reservation.pay.changed";
    return done();
  }
  c.s.formError = payErrorCopy[outcome.kind] ?? "reservation.pay.error.unavailable";
  done();
}

function rememberCreatedCard(c: Ctx, outcome: PaymentOutcome, sourceId: string) {
  if (outcome.kind !== "payment" || !outcome.created || !outcome.payment?.attemptId || !c.s.key)
    return;
  const card = { sourceId, attemptId: outcome.payment.attemptId };
  if (!isStoredCard(card)) return;
  c.s.card = card;
  c.fx.push({ type: "storeCard", key: c.s.key, card });
}

function settle(c: Ctx, outcome: Exclude<CheckoutOutcome, Ready>) {
  setStatus(c, "");
  if (outcome.kind === "invalid" && contactProblems[outcome.error]) {
    const [field, key] = contactProblems[outcome.error]!;
    fieldError(c, field, key);
    return focus(c, field);
  }
  if (outcome.kind === "invalid" && backendProblems[outcome.error]) return showProblem(c, outcome);
  const formError = formErrorCopy[outcome.kind];
  if (formError) {
    c.s.formError = formError;
    return;
  }
  if (outcome.kind === "limited" && c.s.stored)
    writeCheckout(c, { ...c.s.stored, token: "", accepted: null });
  showProblem(c, outcome);
}

function keepCheckoutAtAgreementCap(c: Ctx) {
  c.s.reviewShown = true;
  c.s.problem = null;
  c.s.formError = "reservation.pay.error.limited";
}

function installRefreshedQuote(c: Ctx, outcome: Ready) {
  c.s.token = outcome.token || c.s.token;
  c.s.view = outcome.view;
  c.s.reviewShown = true;
  c.s.problem = null;
}

function keepRefreshedAgreement(c: Ctx, outcome: Ready) {
  const stored = c.s.stored;
  installRefreshedQuote(c, outcome);
  writeCheckout(c, {
    token: c.s.token,
    agreedOffer: offerKey(outcome.view),
    accepted: {
      quoteId: outcome.view.quote.id,
      contact: stored?.accepted?.contact ?? contactKey(c.s.contact),
    },
    submitted: stored?.submitted ?? null,
  });
  c.s.agreed = true;
  c.s.changed = false;
  c.s.formError = "";
  showCheckout(c);
}

function showChangedOffer(c: Ctx, outcome: Ready) {
  const stored = c.s.stored;
  installRefreshedQuote(c, outcome);
  if (stored) writeCheckout(c, { ...stored, token: c.s.token, agreedOffer: null, accepted: null });
  c.s.agreed = false;
  c.s.changed = true;
  c.s.formError = "reservation.pay.changed";
  showCheckout(c);
  focus(c, "agree");
}

function validate(c: Ctx) {
  const { errors, firstInvalid } = reviewProblems(c.s.contact, c.s.agreed);
  c.s.fieldErrors = errors;
  if (firstInvalid) focus(c, firstInvalid);
  return firstInvalid === null;
}

function acceptEffect(c: Ctx, view: CheckoutView): Effect {
  return {
    type: "acceptQuote",
    token: c.s.token,
    acceptance: {
      quoteId: view.quote.id,
      language: c.s.lang,
      contact: trimmedContact(c.s.contact),
    },
  };
}

function pay(c: Ctx) {
  const view = c.s.view;
  if (c.s.pay.kind !== "idle" || !view || !c.s.paymentsEnabled || !validate(c)) return;
  c.s.formError = "";
  if (isAccepted(c.s)) return confirmNoOpenPayment(c);
  setStatus(c, "reservation.review.saving");
  c.s.pay = { kind: "accepting", retried: false };
  c.fx.push(acceptEffect(c, view));
}

function afterAccept(c: Ctx, outcome: CheckoutOutcome | null) {
  setStatus(c, "");
  if (!outcome) return release(c);
  if (outcome.kind === "has_payment") return syncPayment(c, true, true);
  if (outcome.kind !== "ready") {
    settle(c, outcome);
    return release(c);
  }
  c.s.view = outcome.view;
  if (c.s.stored)
    writeCheckout(c, {
      ...c.s.stored,
      accepted: { quoteId: outcome.view.quote.id, contact: contactKey(c.s.contact) },
    });
  confirmNoOpenPayment(c);
}

function onQuoteAccepted(c: Ctx, outcome: CheckoutOutcome) {
  if (c.s.pay.kind !== "accepting" || !c.s.view) return;
  const rejected =
    outcome.kind === "expired" || outcome.kind === "replaced" || outcome.kind === "denied";
  if (c.s.pay.retried || !rejected) return afterAccept(c, outcome);
  c.s.pay = { kind: "reopening", reviewed: offerKey(c.s.view) };
  if (outcome.kind === "expired")
    c.fx.push({ type: "refreshQuote", token: c.s.token, after: { kind: "acceptRecovery" } });
  else openCheckout(c, { kind: "acceptRecovery" });
}

function afterAcceptRecovery(c: Ctx, outcome: CheckoutOutcome) {
  if (c.s.pay.kind !== "reopening") return;
  if (outcome.kind !== "ready") return afterAccept(c, outcome);
  const { reviewed } = c.s.pay;
  ready(c, outcome);
  if (offerKey(outcome.view) === reviewed) {
    c.s.pay = { kind: "accepting", retried: true };
    c.fx.push(acceptEffect(c, outcome.view));
    return;
  }
  c.s.agreed = false;
  c.s.changed = true;
  focus(c, "agree");
  afterAccept(c, null);
}

function confirmNoOpenPayment(c: Ctx) {
  c.s.pay = { kind: "confirming" };
  c.fx.push({ type: "readPayment", token: c.s.token, after: { kind: "confirm" } });
}

function afterConfirm(c: Ctx, outcome: PaymentOutcome, now: number) {
  if (c.s.pay.kind !== "confirming") return;
  if (outcome.kind === "payment") {
    if (outcome.payment && !allowsNewPayment(outcome.payment)) {
      markSubmitted(c, null);
      showPayment(c, outcome.payment, true);
      return release(c);
    }
    return ensureAcceptedQuote(c, now);
  }
  if (outcome.kind === "denied") return load(c, true);
  c.s.formError = payErrorCopy[outcome.kind] ?? "reservation.pay.error.unavailable";
  release(c);
}

function ensureAcceptedQuote(c: Ctx, now: number) {
  const view = c.s.view;
  if (!view) return release(c);
  if (quoteStillValid(view, now)) return serverAccepted(view, now) ? secure(c) : release(c);
  c.s.pay = { kind: "refreshing" };
  c.fx.push({ type: "refreshQuote", token: c.s.token, after: { kind: "payRefresh" } });
}

function afterPayRefresh(c: Ctx, outcome: CheckoutOutcome, now: number) {
  if (c.s.pay.kind !== "refreshing") return;
  if (outcome.kind === "has_payment") return syncPayment(c, true, true);
  if (outcome.kind === "limited") {
    keepCheckoutAtAgreementCap(c);
    return release(c);
  }
  if (outcome.kind === "ready") {
    if (serverAccepted(outcome.view, now)) {
      keepRefreshedAgreement(c, outcome);
      return secure(c);
    }
    showChangedOffer(c, outcome);
    return release(c);
  }
  settle(c, outcome);
  release(c);
}

function secure(c: Ctx) {
  c.s.pay = { kind: "securing" };
  c.fx.push({ type: "readSecurityToken" });
}

function cardCharge(c: Ctx, view: CheckoutView): CardCharge {
  return {
    amountCents: view.quote.requiredInitialPaymentCents,
    currency: view.currency,
    email: trimmedContact(c.s.contact).email,
  };
}

function afterSecurityToken(c: Ctx, token: string) {
  const view = c.s.view;
  if (c.s.pay.kind !== "securing" || !view) return;
  if (!token) {
    c.s.formError = "reservation.pay.error.security";
    return release(c);
  }
  c.s.pay = { kind: "cardForm", turnstileToken: token };
  c.fx.push({ type: "openCardForm", lang: c.s.lang, ...cardCharge(c, view) });
}

function afterCardForm(c: Ctx, sourceId: string | null) {
  const view = c.s.view;
  if (c.s.pay.kind !== "cardForm" || !view) return;
  if (!sourceId) return release(c);
  c.s.pay = { kind: "fingerprint", turnstileToken: c.s.pay.turnstileToken, sourceId };
  c.fx.push({ type: "deviceFingerprint", ...cardCharge(c, view) });
}

function afterFingerprint(c: Ctx, fingerprint: string | null) {
  const view = c.s.view;
  if (c.s.pay.kind !== "fingerprint" || !view) return;
  const { sourceId, turnstileToken } = c.s.pay;
  const charge: Charge = { sourceId, turnstileToken, fingerprint };
  setStatus(c, "reservation.pay.sending");
  markSubmitted(c, view.quote.id);
  c.s.pay = { kind: "charging", charge };
  c.fx.push(startPaymentEffect(c, view.quote.id, charge));
}

function startPaymentEffect(c: Ctx, quoteId: string, charge: Charge): Effect {
  return {
    type: "startPayment",
    token: c.s.token,
    payment: {
      quoteId,
      sourceId: charge.sourceId,
      turnstileToken: charge.turnstileToken,
      ...(charge.fingerprint ? { deviceFingerprint: charge.fingerprint } : {}),
    },
  };
}

function finishCharge(c: Ctx, outcome: PaymentOutcome, charge: Charge) {
  c.fx.push({ type: "resetSecurityCheck" });
  rememberCreatedCard(c, outcome, charge.sourceId);
  settlePayment(c, outcome, true);
}

function abandonCharge(c: Ctx) {
  c.fx.push({ type: "resetSecurityCheck" });
  release(c);
}

function afterPaymentStarted(c: Ctx, outcome: PaymentOutcome) {
  const step = c.s.pay;
  if (step.kind === "charging") {
    if (!isRejectedCharge(outcome)) return finishCharge(c, outcome, step.charge);
    const reviewed = c.s.view ? offerKey(c.s.view) : "";
    c.s.pay = { kind: "recovering", charge: step.charge, reviewed };
    if (outcome.kind === "expired")
      c.fx.push({ type: "refreshQuote", token: c.s.token, after: { kind: "recover" } });
    else c.fx.push({ type: "readCheckout", token: c.s.token, after: { kind: "recover" } });
    return;
  }
  if (step.kind !== "retrying") return;
  if (!isRejectedCharge(outcome)) return finishCharge(c, outcome, step.charge);
  c.s.pay = { kind: "rechecking", reviewed: step.reviewed };
  c.fx.push({ type: "readCheckout", token: c.s.token, after: { kind: "recoverLatest" } });
}

function afterRecover(c: Ctx, outcome: CheckoutOutcome, now: number) {
  const step = c.s.pay;
  if (step.kind !== "recovering") return;
  const { charge, reviewed } = step;
  if (outcome.kind === "has_payment") {
    c.s.pay = { kind: "recoveringPayment", charge };
    c.fx.push({ type: "readPayment", token: c.s.token, after: { kind: "recovered" } });
    return;
  }
  if (outcome.kind === "limited") {
    keepCheckoutAtAgreementCap(c);
    return abandonCharge(c);
  }
  if (outcome.kind !== "ready") {
    settle(c, outcome);
    return abandonCharge(c);
  }
  if (!sameAcceptedOffer(outcome.view, reviewed, now)) {
    showChangedOffer(c, outcome);
    return abandonCharge(c);
  }
  keepRefreshedAgreement(c, outcome);
  markSubmitted(c, outcome.view.quote.id);
  c.s.pay = { kind: "retrying", charge, reviewed };
  c.fx.push(startPaymentEffect(c, outcome.view.quote.id, charge));
}

function afterRecoverLatest(c: Ctx, outcome: CheckoutOutcome, now: number) {
  const step = c.s.pay;
  if (step.kind !== "rechecking") return;
  if (outcome.kind === "ready" && sameAcceptedOffer(outcome.view, step.reviewed, now))
    keepRefreshedAgreement(c, outcome);
  else if (outcome.kind === "ready") showChangedOffer(c, outcome);
  else if (outcome.kind === "limited") keepCheckoutAtAgreementCap(c);
  else settle(c, outcome);
  abandonCharge(c);
}

function afterCheckout(
  c: Ctx,
  via: "read" | "start" | "refresh",
  after: CheckoutThen,
  outcome: CheckoutOutcome,
  now: number,
) {
  const opening = after.kind === "load" || after.kind === "acceptRecovery";
  if (via === "read" && opening && outcome.kind === "denied" && c.s.selection) {
    c.fx.push({ type: "startCheckout", selection: c.s.selection, lang: c.s.lang, after });
    return;
  }
  switch (after.kind) {
    case "load":
      return afterLoad(c, outcome, after.releasesPay);
    case "acceptRecovery":
      return afterAcceptRecovery(c, outcome);
    case "payRefresh":
      return afterPayRefresh(c, outcome, now);
    case "recover":
      return afterRecover(c, outcome, now);
    case "recoverLatest":
      return afterRecoverLatest(c, outcome, now);
  }
}

function afterPaymentRead(c: Ctx, after: PaymentThen, outcome: PaymentOutcome, now: number) {
  switch (after.kind) {
    case "confirm":
      return afterConfirm(c, outcome, now);
    case "sync":
      return afterSync(c, outcome, after);
    case "settled":
      showReadPayment(c, outcome);
      if (after.releasesPay) release(c);
      return;
    case "recovered": {
      const step = c.s.pay;
      if (step.kind === "recoveringPayment") finishCharge(c, outcome, step.charge);
      return;
    }
    case "authenticated":
      return showReadPayment(c, outcome);
  }
}

function handle(c: Ctx, event: Event) {
  switch (event.type) {
    case "started":
      c.s.lang = event.lang;
      c.s.paymentsEnabled = event.paymentsEnabled;
      c.s.selection = event.selection;
      c.s.key = event.selection ? selectionKey(event.selection) : "";
      restoreDraft(c, event.draft);
      if (!event.selection) return showProblem(c, { kind: "missing" });
      return load(c, false);
    case "pageShown":
      restoreDraft(c, event.draft);
      if (event.persisted && c.s.key) return load(c, false);
      return showCheckout(c);
    case "networkRestored":
      if (awaitingStatus(c.s)) syncPayment(c, false, false);
      return;
    case "pollElapsed":
      return syncPayment(c, false, false);
    case "statusCheckRequested":
      return syncPayment(c, true, false);
    case "contactEdited":
      c.s.contact = { ...c.s.contact, [event.field]: event.value };
      c.fx.push({ type: "storeContact", contact: c.s.contact });
      fieldError(c, event.field, null);
      return showCheckout(c);
    case "agreeToggled":
      c.s.agreed = event.agreed;
      if (c.s.stored && c.s.view)
        writeCheckout(c, {
          ...c.s.stored,
          agreedOffer: event.agreed ? offerKey(c.s.view) : null,
        });
      fieldError(c, "agree", null);
      return showCheckout(c);
    case "payRequested":
      return pay(c);
    case "loadRequested":
      return load(c, false);
    case "payAgainRequested":
      c.s.outcomeShown = false;
      showCheckout(c);
      return focus(c, "payButton");
    case "bankRequested":
      return openBank(c);
    case "accessCopyRequested":
      if (c.s.access.token) c.fx.push({ type: "copyAccessLink", token: c.s.access.token });
      return;
    case "accessCopied":
      c.s.access = { ...c.s.access, copied: event.copied };
      return;
    case "checkoutRead":
      return afterCheckout(c, "read", event.after, event.outcome, event.now);
    case "checkoutStarted":
      return afterCheckout(c, "start", event.after, event.outcome, event.now);
    case "quoteRefreshed":
      return afterCheckout(c, "refresh", event.after, event.outcome, event.now);
    case "quoteAccepted":
      return onQuoteAccepted(c, event.outcome);
    case "paymentRead":
      return afterPaymentRead(c, event.after, event.outcome, event.now);
    case "paymentStarted":
      return afterPaymentStarted(c, event.outcome);
    case "paymentContinued":
      return afterContinued(c, event.outcome);
    case "accessRead":
      return afterAccessRead(c, event.request, event.access);
    case "securityCheckFailed":
      c.s.securityCheck = "idle";
      c.s.formError = "reservation.pay.error.securityUnavailable";
      return;
    case "securityCheckErrored":
      c.s.formError = "reservation.pay.error.securityUnavailable";
      return;
    case "securityTokenRead":
      return afterSecurityToken(c, event.token);
    case "cardFormResolved":
      return afterCardForm(c, event.sourceId);
    case "cardFormFailed":
      if (c.s.pay.kind !== "cardForm") return;
      c.s.formError = "reservation.pay.error.card";
      return release(c);
    case "fingerprintRead":
      return afterFingerprint(c, event.fingerprint);
    case "bankParameters":
      return finishAuthentication(c, event.parameters);
    case "bankIncomplete":
      return showAuthenticationIncomplete(c);
  }
}

export function next(state: State, event: Event): Transition {
  const c: Ctx = { s: { ...state }, fx: [] };
  handle(c, event);
  return { state: c.s, effects: c.fx };
}
