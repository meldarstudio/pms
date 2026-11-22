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
import { outcomeActions, payBusy, sendingPayment } from "./checkout-selectors";
import { contactKey } from "./draft";
import type { GuestPayment, PaymentOutcome } from "./payment";

const NOW = Date.parse("2026-10-10T15:00:00Z");
const TOKEN = "checkout-token";
const SOURCE = "tkn_live_abc123";
const ATTEMPT = "6f1f2b1e-8f0a-4c6e-9f43-0d1c2b3a4e5f";
const TURNSTILE = "turnstile-token";
const ACCESS_TOKEN = "a".repeat(43);

const selection: CheckoutSelection = {
  checkIn: "2026-10-20",
  checkOut: "2026-10-22",
  ratePlan: "flexible",
  rooms: [{ roomTypeId: "type-king", adults: 2, children: 0 }],
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
    rooms: selection.rooms.map((room) => ({
      ...room,
      nights: [
        { date: "2026-10-20", priceCents: total / 2 },
        { date: "2026-10-21", priceCents: total / 2 },
      ],
    })),
    nights: 2,
    language: "es",
    currency: "PEN",
    quote: {
      id: quoteId,
      expired: false,
      expiresAt,
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
});

describe("the card form", () => {
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

  it("offers only cards when the initial payment is above Yape's S/ 2,000 limit", () => {
    const { effects } = drive(
      openReview({ view: quoteView({ total: 400002 }) }),
      ...toSecurityCheck,
      { type: "securityTokenRead", token: TURNSTILE },
    );

    expect(ofType(effects, "openCardForm")).toMatchObject([{ amountCents: 200001, yape: false }]);
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
        yape: true,
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
