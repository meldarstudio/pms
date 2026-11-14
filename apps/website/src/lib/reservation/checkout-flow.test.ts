import { describe, expect, it } from "vite-plus/test";
import { offerKey, type ContactDraft, type CheckoutSelection, type CheckoutView } from "./checkout";
import {
  initialState,
  next,
  type Draft,
  type Effect,
  type Event as FlowEvent,
  type State,
} from "./checkout-flow";
import { outcomePresentation } from "./checkout-copy";
import { formVisible, outcomeActions, payBusy, sendingPayment } from "./checkout-selectors";
import { contactKey } from "./draft";
import type { GuestPayment, PaymentOutcome } from "./payment";

const NOW = Date.parse("2026-10-10T15:00:00Z");
const TOKEN = "checkout-token";
const SOURCE = "tkn_live_abc123";
const ATTEMPT = "6f1f2b1e-8f0a-4c6e-9f43-0d1c2b3a4e5f";
const TURNSTILE = "turnstile-token";
const ACCESS_TOKEN = "a".repeat(43);

const selection: CheckoutSelection = {
  roomTypeId: "type-king",
  checkIn: "2026-10-20",
  checkOut: "2026-10-22",
  adults: 2,
  children: 0,
  ratePlan: "flexible",
};

const contact: ContactDraft = {
  fullName: "Ana Pérez",
  email: "ana@example.com",
  phone: { country: "PE", text: "999888777" },
  notes: "",
};

function quoteView(
  options: { quoteId?: string; total?: number; accepted?: boolean; expiresAt?: string } = {},
): CheckoutView {
  const {
    quoteId = "quote-1",
    total = 30000,
    accepted = true,
    expiresAt = "2026-10-10T16:00:00.000Z",
  } = options;
  return {
    ...selection,
    nights: 2,
    language: "es",
    currency: "PEN",
    quote: {
      id: quoteId,
      expired: false,
      expiresAt,
      nights: [
        { date: "2026-10-20", priceCents: total / 2 },
        { date: "2026-10-21", priceCents: total / 2 },
      ],
      totalCents: total,
      requiredInitialPaymentCents: total / 2,
      remainingScheduledCents: total / 2,
      cancellation: { freeCancellation: "available", freeUntil: "2026-10-18", chargeCents: 0 },
    },
    acceptance: accepted ? { quoteId, acceptedAt: "2026-10-10T14:00:00.000Z" } : null,
  };
}

const ready = (view: CheckoutView) => ({ kind: "ready" as const, view, token: TOKEN });

function draftFor(
  view: CheckoutView,
  options: { accepted?: boolean; agreed?: boolean; card?: boolean } = {},
): Draft {
  const { accepted = true, agreed = true, card = false } = options;
  return {
    contact,
    checkout: {
      token: TOKEN,
      agreedOffer: agreed ? offerKey(view) : null,
      accepted: accepted ? { quoteId: view.quote.id, contact: contactKey(contact) } : null,
      submitted: null,
    },
    card: card ? { sourceId: SOURCE, attemptId: ATTEMPT } : null,
  };
}

function payment(overrides: Partial<GuestPayment> = {}): GuestPayment {
  return {
    attemptId: ATTEMPT,
    state: "processing",
    amountCents: 15000,
    currency: "PEN",
    delayed: false,
    reservation: null,
    ...overrides,
  };
}

const paymentOutcome = (value: GuestPayment | null, created = false): PaymentOutcome => ({
  kind: "payment",
  payment: value,
  created,
});

const synced = (value: GuestPayment | null): FlowEvent => ({
  type: "paymentRead",
  after: { kind: "sync", announce: false, releasesPay: false },
  outcome: paymentOutcome(value),
  now: NOW,
});

const confirmRead = (value: GuestPayment | null): FlowEvent => ({
  type: "paymentRead",
  after: { kind: "confirm" },
  outcome: paymentOutcome(value),
  now: NOW,
});

const refreshed = (
  after: Extract<FlowEvent, { type: "quoteRefreshed" }>["after"],
  view: CheckoutView,
): FlowEvent => ({ type: "quoteRefreshed", after, outcome: ready(view), now: NOW });

function drive(state: State, ...events: FlowEvent[]) {
  const effects: Effect[] = [];
  let current = state;
  for (const event of events) {
    const transition = next(current, event);
    current = transition.state;
    effects.push(...transition.effects);
  }
  return { state: current, effects };
}

function ofType<T extends Effect["type"]>(effects: Effect[], type: T) {
  return effects.filter((effect): effect is Extract<Effect, { type: T }> => effect.type === type);
}

const types = (effects: Effect[]) => effects.map((effect) => effect.type);

function openReview(
  options: {
    view?: CheckoutView;
    draft?: Draft;
    lang?: "es" | "en";
    contact?: typeof contact;
  } = {},
) {
  const { view = quoteView(), lang = "es" } = options;
  const draft = options.draft ?? draftFor(view);
  const opened = drive(
    initialState,
    { type: "started", lang, paymentsEnabled: true, selection, draft },
    {
      type: "checkoutRead",
      after: { kind: "load", releasesPay: false },
      outcome: ready(view),
      now: NOW,
    },
    synced(null),
  );
  return opened.state;
}

const toSecurityCheck: FlowEvent[] = [{ type: "payRequested" }, confirmRead(null)];

const toCharging: FlowEvent[] = [
  ...toSecurityCheck,
  { type: "securityTokenRead", token: TURNSTILE },
  { type: "cardFormResolved", sourceId: SOURCE },
  { type: "fingerprintRead", fingerprint: "fp-1" },
];

describe("validating before paying", () => {
  it("shows every field error in order, focuses the first, and calls nothing", () => {
    const state = openReview({ view: quoteView({ accepted: false }) });
    const emptied = drive(
      state,
      { type: "contactEdited", field: "email", value: "ana@" },
      { type: "contactEdited", field: "fullName", value: "  " },
      { type: "phoneEdited", phone: { country: "PE", text: "" } },
      { type: "agreeToggled", agreed: false },
    );

    const paid = drive(emptied.state, { type: "payRequested" });

    expect(paid.state.fieldErrors).toEqual({
      fullName: "reservation.review.error.fullName",
      email: "reservation.review.error.email",
      phone: "reservation.review.error.phone",
      notes: null,
      agree: "reservation.review.error.agree",
    });
    expect(paid.effects).toEqual([{ type: "focus", target: "fullName" }]);
    expect(payBusy(paid.state)).toBe(false);
  });

  it("asks only for the agreement when the contact is valid", () => {
    const state = openReview();
    const paid = drive(state, { type: "agreeToggled", agreed: false }, { type: "payRequested" });

    expect(paid.state.fieldErrors).toEqual({
      fullName: null,
      email: null,
      phone: null,
      notes: null,
      agree: "reservation.review.error.agree",
    });
    expect(types(paid.effects)).not.toContain("acceptQuote");
    expect(types(paid.effects)).not.toContain("readPayment");
    expect(ofType(paid.effects, "focus")).toEqual([{ type: "focus", target: "agree" }]);
  });

  it("ignores a second pay while the first is running", () => {
    const state = openReview();
    const first = drive(state, { type: "payRequested" });
    const second = drive(first.state, { type: "payRequested" });

    expect(first.effects.map((effect) => effect.type)).toEqual(["readPayment"]);
    expect(second.effects).toEqual([]);
    expect(payBusy(second.state)).toBe(true);
  });
});

describe("recording the acceptance before paying", () => {
  it("accepts an edited note as a trimmed top-level reservation note", () => {
    const paid = drive(
      openReview(),
      { type: "contactEdited", field: "notes", value: "  Arriving at 9 pm  " },
      { type: "payRequested" },
    );
    expect(ofType(paid.effects, "acceptQuote")[0]?.acceptance).toEqual({
      quoteId: "quote-1",
      language: "es",
      contact: { fullName: "Ana Pérez", email: "ana@example.com", phone: "+51999888777" },
      notes: "Arriving at 9 pm",
    });
    expect(ofType(paid.effects, "storeContact")[0]?.contact.notes).toBe("  Arriving at 9 pm  ");
  });

  it("does not accept again for phone formatting or blank note changes", () => {
    const paid = drive(
      openReview(),
      { type: "phoneEdited", phone: { country: "PE", text: "+51 999 888 777" } },
      { type: "contactEdited", field: "notes", value: "  " },
      { type: "payRequested" },
    );
    expect(types(paid.effects)).not.toContain("acceptQuote");
    expect(types(paid.effects)).toContain("readPayment");
  });

  it("focuses an overlong note before starting acceptance or payment", () => {
    const paid = drive(
      openReview(),
      { type: "contactEdited", field: "notes", value: "x".repeat(2001) },
      { type: "payRequested" },
    );
    expect(paid.state.fieldErrors.notes).toBe("reservation.review.error.notesTooLong");
    expect(ofType(paid.effects, "focus")).toEqual([{ type: "focus", target: "notes" }]);
    expect(types(paid.effects)).not.toContain("acceptQuote");
    expect(types(paid.effects)).not.toContain("readPayment");
  });
  it("sends no acceptance when the stored one matches the quote and contact", () => {
    const paid = drive(openReview(), { type: "payRequested" });

    expect(types(paid.effects)).toEqual(["readPayment"]);
    expect(types(paid.effects)).not.toContain("acceptQuote");
  });

  it("accepts again with the current contact and language after the contact changed", () => {
    const state = openReview({ lang: "en" });
    const edited = drive(state, {
      type: "phoneEdited",
      phone: { country: "PE", text: "900000000" },
    });

    const paid = drive(edited.state, { type: "payRequested" });

    expect(ofType(edited.effects, "storeContact")[0]?.contact.phone).toEqual({
      country: "PE",
      text: "900000000",
    });
    expect(ofType(paid.effects, "acceptQuote")).toEqual([
      {
        type: "acceptQuote",
        token: TOKEN,
        acceptance: {
          quoteId: "quote-1",
          language: "en",
          contact: { fullName: contact.fullName, email: contact.email, phone: "+51900000000" },
        },
      },
    ]);
    expect(paid.state.status.key).toBe("reservation.review.saving");
  });

  it("refreshes an expired quote and accepts the unchanged offer again", () => {
    const view = quoteView({ accepted: false });
    const state = openReview({ view, draft: draftFor(view, { accepted: false }) });

    const { state: after, effects } = drive(
      state,
      { type: "payRequested" },
      { type: "quoteAccepted", outcome: { kind: "expired" }, now: NOW },
      refreshed({ kind: "acceptRecovery" }, quoteView({ quoteId: "quote-2", accepted: false })),
    );

    expect(ofType(effects, "refreshQuote")).toHaveLength(1);
    expect(ofType(effects, "acceptQuote").map((effect) => effect.acceptance.quoteId)).toEqual([
      "quote-1",
      "quote-2",
    ]);
    expect(after.pay).toEqual({ kind: "accepting", retried: true });
  });

  it("charges nothing and asks again when the refreshed offer has a new price", () => {
    const view = quoteView({ accepted: false });
    const state = openReview({ view, draft: draftFor(view, { accepted: false }) });

    const { state: after, effects } = drive(
      state,
      { type: "payRequested" },
      { type: "quoteAccepted", outcome: { kind: "expired" }, now: NOW },
      refreshed(
        { kind: "acceptRecovery" },
        quoteView({ quoteId: "quote-2", total: 36000, accepted: false }),
      ),
    );

    expect(after.agreed).toBe(false);
    expect(after.changed).toBe(true);
    expect(after.pay).toEqual({ kind: "idle" });
    expect(ofType(effects, "focus")).toEqual([{ type: "focus", target: "agree" }]);
    expect(ofType(effects, "acceptQuote")).toHaveLength(1);
    for (const charge of ["readPayment", "readSecurityToken", "openCardForm", "startPayment"])
      expect(types(effects)).not.toContain(charge);
  });

  it("reopens the checkout by token and falls back to a new one when the token is denied", () => {
    const view = quoteView({ accepted: false });
    const state = openReview({ view, draft: draftFor(view, { accepted: false }) });

    const { effects } = drive(
      state,
      { type: "payRequested" },
      { type: "quoteAccepted", outcome: { kind: "replaced" }, now: NOW },
      {
        type: "checkoutRead",
        after: { kind: "acceptRecovery" },
        outcome: { kind: "denied" },
        now: NOW,
      },
    );

    expect(ofType(effects, "readCheckout")).toEqual([
      { type: "readCheckout", token: TOKEN, after: { kind: "acceptRecovery" } },
    ]);
    expect(ofType(effects, "startCheckout")).toEqual([
      { type: "startCheckout", selection, lang: "es", after: { kind: "acceptRecovery" } },
    ]);
  });
});

describe("a valid quote the server has no acceptance for", () => {
  it("asks to pay again and opens no card form", () => {
    const view = quoteView({ accepted: false });
    const { state, effects } = drive(
      openReview({ view, draft: draftFor(view, { accepted: false }) }),
      { type: "payRequested" },
      { type: "quoteAccepted", outcome: ready(view), now: NOW },
      confirmRead(null),
    );

    expect(state.formError).toBe("reservation.pay.error.retry");
    expect(payBusy(state)).toBe(false);
    for (const charge of ["readSecurityToken", "openCardForm", "startPayment"])
      expect(types(effects)).not.toContain(charge);
  });
});

describe("an open payment", () => {
  it("is shown instead of opening the card form when it blocks a new payment", () => {
    const { state, effects } = drive(
      openReview(),
      { type: "payRequested" },
      confirmRead(payment({ state: "processing" })),
    );

    expect(state.payment?.state).toBe("processing");
    expect(state.outcomeShown).toBe(true);
    expect(payBusy(state)).toBe(false);
    expect(ofType(effects, "focus")).toEqual([{ type: "focus", target: "outcomeTitle" }]);
    for (const charge of ["readSecurityToken", "openCardForm", "startPayment", "refreshQuote"])
      expect(types(effects)).not.toContain(charge);
  });

  it.each([
    {
      name: "keeps checking on its own while verification is on time",
      delayed: false,
      poll: true,
      check: false,
      body: "reservation.outcome.processing.body",
    },
    {
      name: "stops checking and offers a status check once verification is delayed",
      delayed: true,
      poll: false,
      check: true,
      body: "reservation.outcome.processing.delayed",
    },
  ])("$name, without offering to pay again", ({ delayed, poll, check, body }) => {
    const { state, effects } = drive(
      openReview(),
      synced(payment({ state: "processing", delayed })),
    );

    expect(types(effects).includes("schedulePoll")).toBe(poll);
    expect(outcomeActions(state)).toEqual({ retry: false, bank: false, check });
    expect(outcomePresentation(state.payment!).bodyKey).toBe(body);
    expect(types(effects)).not.toContain("readCheckoutAccess");
  });

  it.each([undefined, "authentication_expired"] as const)(
    "lets a declined payment (%s) be retried with the card form",
    (declineReason) => {
      const { state, effects } = drive(
        openReview(),
        { type: "payRequested" },
        confirmRead(payment({ state: "declined", declineReason })),
      );

      expect(types(effects)).toContain("readSecurityToken");
      expect(state.pay).toEqual({ kind: "securing" });
    },
  );
});

describe("paying an expired quote", () => {
  const expired = quoteView({ expiresAt: "2026-10-10T14:00:00.000Z" });
  const stateWithExpiredQuote = () => openReview({ view: expired });

  it("charges the refreshed quote once without asking for acceptance again", () => {
    const { effects } = drive(
      stateWithExpiredQuote(),
      { type: "payRequested" },
      confirmRead(null),
      refreshed({ kind: "payRefresh" }, quoteView({ quoteId: "quote-2" })),
      { type: "securityTokenRead", token: TURNSTILE },
      { type: "cardFormResolved", sourceId: SOURCE },
      { type: "fingerprintRead", fingerprint: null },
    );

    expect(ofType(effects, "refreshQuote")).toHaveLength(1);
    expect(ofType(effects, "acceptQuote")).toEqual([]);
    expect(ofType(effects, "startPayment")).toEqual([
      {
        type: "startPayment",
        token: TOKEN,
        payment: { quoteId: "quote-2", sourceId: SOURCE, turnstileToken: TURNSTILE },
      },
    ]);
  });

  it.each([
    ["dearer", 36000],
    ["cheaper", 24000],
  ])("shows a %s refreshed offer for acceptance and charges nothing", (_name, total) => {
    const { state, effects } = drive(
      stateWithExpiredQuote(),
      { type: "payRequested" },
      confirmRead(null),
      refreshed({ kind: "payRefresh" }, quoteView({ quoteId: "quote-2", total, accepted: false })),
    );

    expect(state.agreed).toBe(false);
    expect(state.changed).toBe(true);
    expect(state.formError).toBe("reservation.pay.changed");
    expect(state.view?.quote.totalCents).toBe(total);
    expect(payBusy(state)).toBe(false);
    expect(ofType(effects, "focus")).toEqual([{ type: "focus", target: "agree" }]);
    for (const charge of ["readSecurityToken", "openCardForm", "startPayment"])
      expect(types(effects)).not.toContain(charge);
  });

  it("keeps the checkout and says the agreement limit was reached", () => {
    const { state, effects } = drive(
      stateWithExpiredQuote(),
      { type: "payRequested" },
      confirmRead(null),
      {
        type: "quoteRefreshed",
        after: { kind: "payRefresh" },
        outcome: { kind: "limited" },
        now: NOW,
      },
    );

    expect(state.formError).toBe("reservation.pay.error.limited");
    expect(state.reviewShown).toBe(true);
    expect(state.problem).toBeNull();
    expect(state.token).toBe(TOKEN);
    expect(ofType(effects, "storeCheckout").filter((write) => write.checkout.token === "")).toEqual(
      [],
    );
    expect(payBusy(state)).toBe(false);
  });
});

describe("the card form", () => {
  it("reports a missing security token and does not open the card form", () => {
    const { state, effects } = drive(openReview(), ...toSecurityCheck, {
      type: "securityTokenRead",
      token: "",
    });

    expect(state.formError).toBe("reservation.pay.error.security");
    expect(types(effects)).not.toContain("openCardForm");
    expect(payBusy(state)).toBe(false);
  });

  it("stops asking to wait for the security check once it passes", () => {
    const waiting = drive(openReview(), ...toSecurityCheck, {
      type: "securityTokenRead",
      token: "",
    });

    const { state } = drive(waiting.state, { type: "securityCheckPassed" });

    expect(state.formError).toBe("");
  });

  it("keeps saying the security check is unavailable when a later check passes", () => {
    const { state } = drive(
      openReview(),
      { type: "securityCheckErrored" },
      { type: "securityCheckPassed" },
    );

    expect(state.formError).toBe("reservation.pay.error.securityUnavailable");
  });

  it("charges nothing and frees the button when the card form closes without a card", () => {
    const { state, effects } = drive(
      openReview(),
      ...toSecurityCheck,
      { type: "securityTokenRead", token: TURNSTILE },
      { type: "cardFormResolved", sourceId: null },
    );

    expect(payBusy(state)).toBe(false);
    expect(types(effects)).not.toContain("deviceFingerprint");
    expect(types(effects)).not.toContain("startPayment");
  });

  it("shows a card error when the card form fails", () => {
    const { state } = drive(
      openReview(),
      ...toSecurityCheck,
      { type: "securityTokenRead", token: TURNSTILE },
      { type: "cardFormFailed" },
    );

    expect(state.formError).toBe("reservation.pay.error.card");
    expect(payBusy(state)).toBe(false);
  });

  it("keeps the button busy while the card form has not answered", () => {
    const { state } = drive(openReview(), ...toSecurityCheck, {
      type: "securityTokenRead",
      token: TURNSTILE,
    });

    expect(state.pay).toEqual({ kind: "cardForm", turnstileToken: TURNSTILE });
    expect(payBusy(state)).toBe(true);
  });

  it("sends the card, security token and device fingerprint for the accepted quote", () => {
    const { state, effects } = drive(openReview(), ...toCharging);

    expect(ofType(effects, "openCardForm")).toEqual([
      {
        type: "openCardForm",
        lang: "es",
        amountCents: 15000,
        currency: "PEN",
        email: "ana@example.com",
      },
    ]);
    expect(ofType(effects, "startPayment")).toEqual([
      {
        type: "startPayment",
        token: TOKEN,
        payment: {
          quoteId: "quote-1",
          sourceId: SOURCE,
          turnstileToken: TURNSTILE,
          deviceFingerprint: "fp-1",
        },
      },
    ]);
    expect(state.status.key).toBe("reservation.pay.sending");
    expect(sendingPayment(state)).toBe(true);
    expect(state.stored?.submitted).toBe("quote-1");
  });
});

describe("paused online payments", () => {
  it("keep the contact and acceptance, charge nothing, and free the pay button", () => {
    const { state, effects } = drive(openReview(), ...toCharging, {
      type: "paymentStarted",
      outcome: { kind: "paused" },
      now: NOW,
    });

    expect(state.formError).toBe("reservation.pay.error.paused");
    expect(ofType(effects, "startPayment")).toHaveLength(1);
    expect(state.payment).toBeNull();
    expect(state.outcomeShown).toBe(false);
    expect(state.contact).toEqual(contact);
    expect(state.agreed).toBe(true);
    expect(payBusy(state)).toBe(false);
  });
});

describe("a charge the server rejects as expired or replaced", () => {
  const charging = () => drive(openReview(), ...toCharging).state;
  const renewed = (overrides: Parameters<typeof quoteView>[0] = {}) =>
    quoteView({ quoteId: "quote-2", ...overrides });

  it.each([
    ["expired", "refreshQuote"],
    ["replaced", "readCheckout"],
  ] as const)("recovers a %s quote with %s", (kind, call) => {
    const { effects } = drive(charging(), {
      type: "paymentStarted",
      outcome: { kind },
      now: NOW,
    });

    expect(types(effects)).toEqual([call]);
  });

  it("retries once with the same card on the renewed quote the server kept accepted", () => {
    const { state, effects } = drive(
      charging(),
      { type: "paymentStarted", outcome: { kind: "expired" }, now: NOW },
      refreshed({ kind: "recover" }, renewed()),
    );

    expect(ofType(effects, "startPayment")).toEqual([
      {
        type: "startPayment",
        token: TOKEN,
        payment: {
          quoteId: "quote-2",
          sourceId: SOURCE,
          turnstileToken: TURNSTILE,
          deviceFingerprint: "fp-1",
        },
      },
    ]);
    expect(state.stored?.submitted).toBe("quote-2");
  });

  it("never charges a third time and shows the latest offer after a second rejection", () => {
    const { state, effects } = drive(
      openReview(),
      ...toCharging,
      { type: "paymentStarted", outcome: { kind: "expired" }, now: NOW },
      refreshed({ kind: "recover" }, renewed()),
      { type: "paymentStarted", outcome: { kind: "replaced" }, now: NOW },
      {
        type: "checkoutRead",
        after: { kind: "recoverLatest" },
        outcome: ready(renewed({ quoteId: "quote-3", total: 36000, accepted: false })),
        now: NOW,
      },
    );

    expect(ofType(effects, "startPayment")).toHaveLength(2);
    expect(state.agreed).toBe(false);
    expect(state.changed).toBe(true);
    expect(state.view?.quote.totalCents).toBe(36000);
    expect(state.formError).toBe("reservation.pay.changed");
    expect(state.status.key).toBe("");
    expect(types(effects)).toContain("resetSecurityCheck");
    expect(payBusy(state)).toBe(false);
  });

  it("asks to pay again without charging when a second rejection finds the same accepted offer", () => {
    const { state, effects } = drive(
      charging(),
      { type: "paymentStarted", outcome: { kind: "expired" }, now: NOW },
      refreshed({ kind: "recover" }, renewed()),
      { type: "paymentStarted", outcome: { kind: "replaced" }, now: NOW },
      {
        type: "checkoutRead",
        after: { kind: "recoverLatest" },
        outcome: ready(renewed()),
        now: NOW,
      },
    );

    expect(ofType(effects, "startPayment")).toHaveLength(1);
    expect(state.agreed).toBe(true);
    expect(state.changed).toBe(false);
    expect(state.formError).toBe("reservation.pay.error.retry");
    expect(state.status.key).toBe("");
    expect(payBusy(state)).toBe(false);
  });

  it("does not charge when the offer changed during recovery", () => {
    const { state, effects } = drive(
      charging(),
      { type: "paymentStarted", outcome: { kind: "expired" }, now: NOW },
      refreshed({ kind: "recover" }, renewed({ total: 24000, accepted: false })),
    );

    expect(ofType(effects, "startPayment")).toEqual([]);
    expect(state.formError).toBe("reservation.pay.changed");
    expect(state.status.key).toBe("");
    expect(state.agreed).toBe(false);
    expect(types(effects)).toContain("resetSecurityCheck");
    expect(payBusy(state)).toBe(false);
  });

  it("stops saying the payment is being sent when recovery reaches the agreement limit", () => {
    const { state, effects } = drive(
      charging(),
      { type: "paymentStarted", outcome: { kind: "expired" }, now: NOW },
      {
        type: "quoteRefreshed",
        after: { kind: "recover" },
        outcome: { kind: "limited" },
        now: NOW,
      },
    );

    expect(ofType(effects, "startPayment")).toEqual([]);
    expect(state.formError).toBe("reservation.pay.error.limited");
    expect(state.status.key).toBe("");
    expect(sendingPayment(state)).toBe(false);
    expect(payBusy(state)).toBe(false);
  });

  it("settles on the payment the server already has instead of charging again", () => {
    const { state, effects } = drive(
      charging(),
      { type: "paymentStarted", outcome: { kind: "expired" }, now: NOW },
      {
        type: "quoteRefreshed",
        after: { kind: "recover" },
        outcome: { kind: "has_payment" },
        now: NOW,
      },
      {
        type: "paymentRead",
        after: { kind: "recovered" },
        outcome: paymentOutcome(payment({ state: "processing" })),
        now: NOW,
      },
    );

    expect(ofType(effects, "startPayment")).toEqual([]);
    expect(state.payment?.state).toBe("processing");
    expect(payBusy(state)).toBe(false);
  });
});

describe("a charge whose answer was lost", () => {
  const unavailable = () =>
    drive(openReview(), ...toCharging, {
      type: "paymentStarted",
      outcome: { kind: "unavailable" },
      now: NOW,
    });

  it("reads the payment before deciding what to show", () => {
    const { state, effects } = unavailable();

    expect(ofType(effects, "readPayment").at(-1)).toEqual({
      type: "readPayment",
      token: TOKEN,
      after: { kind: "settled", releasesPay: true },
    });
    expect(state.status.key).toBe("");
  });

  it("shows the locally submitted placeholder when the server has no payment yet", () => {
    const { state } = drive(unavailable().state, {
      type: "paymentRead",
      after: { kind: "settled", releasesPay: true },
      outcome: paymentOutcome(null),
      now: NOW,
    });

    expect(state.payment).toEqual({
      attemptId: "",
      state: "submitted",
      amountCents: 15000,
      currency: "PEN",
      delayed: false,
      reservation: null,
    });
    expect(state.outcomeShown).toBe(true);
    expect(payBusy(state)).toBe(false);
    expect(state.stored?.submitted).toBe("quote-1");
  });

  it("schedules the status poll when a later check fails while still awaiting status", () => {
    const placeholder = drive(unavailable().state, {
      type: "paymentRead",
      after: { kind: "settled", releasesPay: true },
      outcome: paymentOutcome(null),
      now: NOW,
    }).state;

    const { effects } = drive(
      placeholder,
      { type: "statusCheckRequested" },
      {
        type: "paymentRead",
        after: { kind: "sync", announce: true, releasesPay: false },
        outcome: { kind: "unavailable" },
        now: NOW,
      },
    );

    expect(types(effects)).toEqual(["cancelPoll", "readPayment", "cancelPoll", "schedulePoll"]);
  });

  it("keeps checking on its own for a minute while the server has no payment", () => {
    let current = drive(unavailable().state, {
      type: "paymentRead",
      after: { kind: "settled", releasesPay: true },
      outcome: paymentOutcome(null),
      now: NOW,
    });
    let polls = 0;
    while (types(current.effects).includes("schedulePoll") && polls < 20) {
      polls += 1;
      current = drive(current.state, { type: "pollElapsed" }, synced(null));
    }

    expect(polls).toBe(12);
    expect(current.state.payment?.state).toBe("submitted");
    expect(outcomeActions(current.state).check).toBe(true);
  });

  it("stops checking once a poll finds the declined payment", () => {
    const placeholder = drive(unavailable().state, {
      type: "paymentRead",
      after: { kind: "settled", releasesPay: true },
      outcome: paymentOutcome(null),
      now: NOW,
    });

    const { state, effects } = drive(
      placeholder.state,
      { type: "pollElapsed" },
      synced(payment({ state: "declined" })),
    );

    expect(types(placeholder.effects)).toContain("schedulePoll");
    expect(state.payment?.state).toBe("declined");
    expect(state.stored?.submitted).toBeNull();
    expect(types(effects)).not.toContain("schedulePoll");
  });

  it("stops awaiting once the server reports the payment", () => {
    const { state, effects } = drive(unavailable().state, {
      type: "paymentRead",
      after: { kind: "settled", releasesPay: true },
      outcome: paymentOutcome(payment({ state: "processing" })),
      now: NOW,
    });

    expect(state.stored?.submitted).toBeNull();
    expect(types(effects)).toContain("schedulePoll");
  });
});

describe("the card source kept for bank authentication", () => {
  it("is stored with the attempt id of the payment this request created", () => {
    const { state, effects } = drive(openReview(), ...toCharging, {
      type: "paymentStarted",
      outcome: paymentOutcome(payment({ state: "authentication_required" }), true),
      now: NOW,
    });

    expect(ofType(effects, "storeCard")).toEqual([
      {
        type: "storeCard",
        key: expect.any(String),
        card: { sourceId: SOURCE, attemptId: ATTEMPT },
      },
    ]);
    expect(state.card).toEqual({ sourceId: SOURCE, attemptId: ATTEMPT });
  });

  it("is not stored for a payment that already existed", () => {
    const { effects } = drive(openReview(), ...toCharging, {
      type: "paymentStarted",
      outcome: paymentOutcome(payment({ state: "processing" }), false),
      now: NOW,
    });

    expect(ofType(effects, "storeCard")).toEqual([]);
  });

  it.each([
    "declined",
    "confirmed",
    "unfulfilled",
    "reservation_changed",
    "paid_awaiting_reservation",
  ] as const)("is cleared when the payment is %s", (paymentState) => {
    const state = openReview({ draft: draftFor(quoteView(), { card: true }) });

    const { state: after, effects } = drive(state, synced(payment({ state: paymentState })));

    expect(ofType(effects, "clearCardSource")).toHaveLength(1);
    expect(after.card).toBeNull();
  });

  it.each(["authentication_required", "processing", "submitted"] as const)(
    "is kept while the payment is %s",
    (paymentState) => {
      const state = openReview({ draft: draftFor(quoteView(), { card: true }) });

      const { state: after, effects } = drive(state, synced(payment({ state: paymentState })));

      expect(ofType(effects, "clearCardSource")).toEqual([]);
      expect(after.card).toEqual({ sourceId: SOURCE, attemptId: ATTEMPT });
    },
  );
});

describe("a saved payment outcome", () => {
  const reservation = {
    code: "HM-4821",
    paidCents: 15000,
    outstandingCents: 15000,
    refundDueCents: 0,
  };

  it("clears the contact on confirmation and offers access without leaving Review", () => {
    const confirmed = drive(openReview(), synced(payment({ state: "confirmed", reservation })));
    const request = ofType(confirmed.effects, "readCheckoutAccess")[0]!.request;

    const { state, effects } = drive(confirmed.state, {
      type: "accessRead",
      request,
      access: { token: ACCESS_TOKEN, expiresOn: "2026-12-01" },
    });

    expect(confirmed.effects).toContainEqual({ type: "clearContact" });
    expect(effects).toEqual([]);
    expect(state.access.token).toBe(ACCESS_TOKEN);
    expect(state.access.panel).toBe(true);
    expect(state.outcomeShown).toBe(true);
  });

  it.each(["unfulfilled", "reservation_changed"] as const)(
    "offers the copy-link panel without leaving the page when %s",
    (paymentState) => {
      const saved = drive(openReview(), synced(payment({ state: paymentState, reservation })));
      const request = ofType(saved.effects, "readCheckoutAccess")[0]!.request;

      const { state, effects } = drive(saved.state, {
        type: "accessRead",
        request,
        access: { token: ACCESS_TOKEN, expiresOn: "2026-12-01" },
      });

      expect(effects).toEqual([]);
      expect(state.access.panel).toBe(true);
      expect(state.access.token).toBe(ACCESS_TOKEN);
    },
  );

  it.each(["confirmed", "unfulfilled", "reservation_changed"] as const)(
    "recovers unavailable access manually without overlapping reads or another payment for %s",
    (paymentState) => {
      const savedPayment = payment({ state: paymentState, reservation });
      const saved = drive(openReview(), synced(savedPayment));
      const request = ofType(saved.effects, "readCheckoutAccess")[0]!.request;
      const failed = drive(saved.state, { type: "accessRead", request, access: null });
      expect(failed.state.access.kind).toBe("unavailable");
      expect(failed.state.payment?.reservation).toEqual(reservation);
      const automatic = drive(failed.state, { type: "networkRestored" }, synced(savedPayment));
      expect(ofType(automatic.effects, "readCheckoutAccess")).toEqual([]);
      const retry = drive(automatic.state, { type: "accessRetryRequested" });
      expect(retry.effects).toEqual([
        { type: "readCheckoutAccess", token: "checkout-token", request: request + 1 },
      ]);
      expect(drive(retry.state, { type: "accessRetryRequested" }).effects).toEqual([]);
      const recovered = drive(retry.state, {
        type: "accessRead",
        request: request + 1,
        access: { token: ACCESS_TOKEN, expiresOn: "2026-12-01" },
      });
      expect(recovered.effects).toEqual([]);
      expect(recovered.state.access.panel).toBe(true);
      expect(drive(recovered.state, { type: "accessCopyRequested" }).effects).toEqual([
        { type: "copyAccessLink", token: ACCESS_TOKEN },
      ]);
    },
  );

  it.each(["submitted", "processing", "paid_awaiting_reservation"] as const)(
    "ignores an outdated access answer once the outcome is %s, without confirming or offering to pay",
    (paymentState) => {
      const first = drive(openReview(), synced(payment({ state: "confirmed", reservation })));
      const staleRequest = ofType(first.effects, "readCheckoutAccess")[0]!.request;
      const later = drive(first.state, synced(payment({ state: paymentState })));

      const { state, effects } = drive(later.state, {
        type: "accessRead",
        request: staleRequest,
        access: { token: ACCESS_TOKEN, expiresOn: "2026-12-01" },
      });

      expect(effects).toEqual([]);
      expect(state.access).toMatchObject({ kind: "idle", token: null, panel: false });
      expect(outcomePresentation(state.payment!).titleKey).toBe(
        `reservation.outcome.${paymentState}.title`,
      );
      expect(outcomeActions(state).retry).toBe(false);
    },
  );

  it("keeps the unfulfilled assistance and offers no new payment while recovering access", () => {
    const unfulfilled = payment({ state: "unfulfilled", reservation });
    const saved = drive(openReview(), synced(unfulfilled));
    const request = ofType(saved.effects, "readCheckoutAccess")[0]!.request;
    const failed = drive(saved.state, { type: "accessRead", request, access: null });
    const retry = drive(failed.state, { type: "accessRetryRequested" });
    const recovered = drive(retry.state, {
      type: "accessRead",
      request: request + 1,
      access: { token: ACCESS_TOKEN, expiresOn: "2026-12-01" },
    });

    for (const { state } of [failed, retry, recovered]) {
      expect(outcomePresentation(state.payment!)).toMatchObject({
        titleKey: "reservation.outcome.unfulfilled.title",
        bodyKey: "reservation.outcome.unfulfilled.body",
        rows: [
          { labelKey: "reservation.outcome.supportReference", value: "HM-4821" },
          { labelKey: "reservation.outcome.received", value: { cents: 15000 } },
          { labelKey: "reservation.outcome.awaiting", value: { cents: 0 } },
        ],
      });
      expect(outcomeActions(state).retry).toBe(false);
    }
    for (const charge of ["readSecurityToken", "openCardForm", "startPayment"])
      expect(types([...retry.effects, ...recovered.effects])).not.toContain(charge);
  });
});

describe("bank authentication", () => {
  const authenticating = payment({ state: "authentication_required" });
  const withCard = () => openReview({ draft: draftFor(quoteView(), { card: true }) });

  it("opens the bank once for the stored card of this attempt", () => {
    const first = drive(withCard(), synced(authenticating));
    const again = drive(first.state, synced(authenticating));

    expect(ofType(first.effects, "openBank")).toEqual([
      {
        type: "openBank",
        sourceId: SOURCE,
        amountCents: 15000,
        currency: "PEN",
        email: "ana@example.com",
      },
    ]);
    expect(ofType(again.effects, "openBank")).toEqual([]);
  });

  it("does not open the bank for a different attempt than the stored card", () => {
    const other = payment({
      state: "authentication_required",
      attemptId: "11111111-2222-3333-4444-555555555555",
    });

    const { state, effects } = drive(withCard(), synced(other));

    expect(ofType(effects, "openBank")).toEqual([]);
    expect(outcomeActions(state).bank).toBe(false);
  });

  it("stays pending after a bank error and can open the bank again", () => {
    const opened = drive(withCard(), synced(authenticating));

    const { state, effects } = drive(opened.state, { type: "bankIncomplete" });
    const retried = drive(state, { type: "bankRequested" });

    expect(state.payment?.state).toBe("authentication_required");
    expect(outcomeActions(state).bank).toBe(true);
    expect(ofType(effects, "focus")).toEqual([{ type: "focus", target: "outcomeBank" }]);
    expect(ofType(retried.effects, "openBank")).toHaveLength(1);
  });

  it("reports a refused bank check for this attempt instead of keeping it pending", () => {
    const opened = drive(withCard(), synced(authenticating));

    const { state, effects } = drive(opened.state, { type: "bankRefused" });

    expect(ofType(effects, "reportAuthenticationFailure")).toEqual([
      { type: "reportAuthenticationFailure", token: TOKEN, attemptId: ATTEMPT },
    ]);
    expect(ofType(effects, "focus")).toEqual([]);
    expect(types(effects)).not.toContain("openCardForm");
    expect(state.stored?.submitted).toBeNull();
  });

  it.each([undefined, "authentication_expired"] as const)(
    "offers another card after decline (%s), keeping the contact and acceptance",
    (declineReason) => {
      const opened = drive(withCard(), synced(authenticating));
      const refused = drive(opened.state, { type: "bankRefused" });

      const { state, effects } = drive(refused.state, {
        type: "authenticationFailureReported",
        outcome: paymentOutcome(payment({ state: "declined", declineReason })),
      });

      expect(state.payment?.state).toBe("declined");
      expect(outcomeActions(state)).toEqual({ retry: true, bank: false, check: false });
      expect(state.card).toBeNull();
      expect(ofType(effects, "clearCardSource")).toEqual([
        { type: "clearCardSource", key: state.key },
      ]);
      expect(formVisible(state)).toBe(false);
      const retry = drive(state, { type: "payAgainRequested" });
      expect(formVisible(retry.state)).toBe(true);
      expect(retry.state.contact).toEqual(opened.state.contact);
      expect(state.contact).toEqual(opened.state.contact);
      expect(state.stored?.accepted).toEqual(opened.state.stored?.accepted);
      expect(types(effects)).not.toContain("clearContact");
    },
  );

  it("stays pending and can open the bank again when the refusal could not be reported", () => {
    const opened = drive(withCard(), synced(authenticating));
    const refused = drive(opened.state, { type: "bankRefused" });

    const unreported = drive(refused.state, {
      type: "authenticationFailureReported",
      outcome: { kind: "unavailable" },
    });
    const { state } = drive(unreported.state, {
      type: "paymentRead",
      after: { kind: "settled", releasesPay: false },
      outcome: paymentOutcome(authenticating),
      now: NOW,
    });

    expect(ofType(unreported.effects, "readPayment")).toHaveLength(1);
    expect(state.payment?.state).toBe("authentication_required");
    expect(outcomeActions(state).bank).toBe(true);
  });

  it("continues the same attempt with the bank parameters and no new card", () => {
    const opened = drive(withCard(), synced(authenticating));
    const parameters = {
      eci: "05",
      cavv: "cavv-1",
      protocolVersion: "2.2.0",
      directoryServerTransactionId: "ds-1",
    };

    const { state, effects } = drive(opened.state, { type: "bankParameters", parameters });

    expect(ofType(effects, "continuePayment")).toEqual([
      {
        type: "continuePayment",
        token: TOKEN,
        authentication: { ...parameters, attemptId: ATTEMPT },
      },
    ]);
    expect(types(effects)).not.toContain("openCardForm");
    expect(state.stored?.submitted).toBe("quote-1");
  });
});
