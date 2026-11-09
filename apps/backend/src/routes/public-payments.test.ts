import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getDb } from "../db";
import worker, { app } from "../index";
import { paymentContext, reconcilePaymentAttempts, startPaymentAttempt } from "../payment-attempts";
import { createQuote } from "../quotes";
import { CULQI_TEST_KEY, fakeCulqi, type FakeCulqi } from "../test-support/culqi";
import { WEBSITE_ORIGIN } from "../test-support/auth";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "../test-support/d1";
import {
  externalServices,
  fakeTurnstile,
  TURNSTILE_PASS,
  TURNSTILE_TEST_SECRET,
  type FakeTurnstile,
} from "../test-support/turnstile";

type GuestPayment = {
  state: string;
  amountCents: number;
  currency: string;
  delayed: boolean;
  reservation: {
    code: string;
    paidCents: number;
    outstandingCents: number;
    refundDueCents: number;
  } | null;
};

let db: TestDb;
let culqi: FakeCulqi;
let turnstile: FakeTurnstile;
let tasks: Promise<unknown>[];

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type-king", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type-king", { "room-101": "101", "room-102": "102" });
  db.env.PUBLISHED_ROOM_TYPE_IDS = "type-king";
  db.env.CULQI_SECRET_KEY = CULQI_TEST_KEY;
  db.env.TURNSTILE_SECRET_KEY = TURNSTILE_TEST_SECRET;
  culqi = fakeCulqi();
  turnstile = fakeTurnstile();
  vi.stubGlobal("fetch", externalServices({ culqi, turnstile }));
  tasks = [];
  await admitPayments(true);
});

afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const contact = { fullName: "Ana Torres", email: "ana@example.com", phone: "987 654 321" };

function guest(
  path: string,
  init: { method?: string; body?: unknown; token?: string; ip?: string } = {},
) {
  return app.request(
    path,
    {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        origin: WEBSITE_ORIGIN,
        "cf-connecting-ip": init.ip ?? "203.0.113.9",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    },
    db.env,
    {
      waitUntil: (task: Promise<unknown>) => tasks.push(task),
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext,
  );
}

async function admitPayments(admitted: boolean) {
  await db.signIn("owner");
  const response = await db.request("/controls/public-payments", "PUT", { admitted });
  expect(response.status).toBe(200);
  await db.signIn("staff");
}

async function acceptedCheckout(
  selection: Record<string, unknown> = {},
): Promise<{ token: string; quoteId: string }> {
  const created = await guest("/public/checkouts", {
    body: {
      roomTypeId: "type-king",
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
      adults: 2,
      children: 0,
      ratePlan: "flexible",
      language: "en",
      ...selection,
    },
  });
  expect(created.status).toBe(201);
  const { token, quote } = (await created.json()) as { token: string; quote: { id: string } };
  const accepted = await guest("/public/checkout/acceptances", {
    token,
    body: { quoteId: quote.id, language: "en", contact, agreed: true },
  });
  expect(accepted.status).toBe(201);
  return { token, quoteId: quote.id };
}

const card = () => `tkn_test_${crypto.randomUUID()}`;

const pay = (
  checkout: { token: string; quoteId: string },
  body: Record<string, unknown> = {},
  ip?: string,
) =>
  guest("/public/checkout/payments", {
    token: checkout.token,
    ip,
    body: {
      quoteId: checkout.quoteId,
      sourceId: card(),
      turnstileToken: TURNSTILE_PASS,
      ...body,
    },
  });

async function paid(checkout: { token: string; quoteId: string }, body = {}) {
  const response = await pay(checkout, body);
  expect(response.status).toBe(201);
  return ((await response.json()) as { payment: GuestPayment }).payment;
}

async function status(token: string) {
  const response = await guest("/public/checkout/payment", { token });
  expect(response.status).toBe(200);
  return ((await response.json()) as { payment: GuestPayment | null }).payment;
}

const charges = () => culqi.requests.filter((request) => request.method === "POST");

const rows = <T>(sql: string) => db.sqlite.prepare(sql).all() as T[];

const acceptances = () =>
  rows<{ quote_id: string; full_name: string; email: string; phone: string; language: string }>(
    "SELECT quote_id, full_name, email, phone, language FROM checkout_acceptances ORDER BY rowid",
  );

const acceptanceRow = (quoteId: string) => ({
  quote_id: quoteId,
  full_name: "Ana Torres",
  email: "ana@example.com",
  phone: "+51987654321",
  language: "en",
});

describe("paying the accepted quote", () => {
  it("charges the Flexible first night and confirms the reservation with its outstanding balance", async () => {
    const checkout = await acceptedCheckout();

    const payment = await paid(checkout);

    expect(payment).toEqual({
      state: "confirmed",
      amountCents: 10000,
      currency: "PEN",
      delayed: false,
      reservation: {
        code: expect.stringMatching(/^[A-Z0-9]{6}$/),
        paidCents: 10000,
        outstandingCents: 10000,
        refundDueCents: 0,
      },
    });
    expect(charges()).toHaveLength(1);
    expect(charges()[0]!.body).toMatchObject({
      amount: 10000,
      currency_code: "PEN",
      email: "ana@example.com",
      capture: true,
    });
    expect(await status(checkout.token)).toEqual(payment);
  });

  it("charges the discounted Non-refundable total upfront and leaves nothing outstanding", async () => {
    const payment = await paid(await acceptedCheckout({ ratePlan: "non_refundable" }));

    expect(payment).toMatchObject({
      state: "confirmed",
      amountCents: 18000,
      reservation: { paidCents: 18000, outstandingCents: 0 },
    });
  });

  it("records the public checkout, its accepted agreement and language before calling Culqi", async () => {
    const checkout = await acceptedCheckout();
    let recorded: unknown[] = [];
    culqi.next("POST /charges", "timeout");
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      recorded = rows(
        "SELECT status, checkout_id IS NOT NULL AS checkout, acceptance_id IS NOT NULL AS acceptance, language, confirmation_email_eligible AS eligible FROM payment_attempts",
      );
      return original(input, init);
    }) as typeof fetch);

    await paid(checkout);

    expect(recorded).toEqual([
      { status: "unknown", checkout: 1, acceptance: 1, language: "en", eligible: 1 },
    ]);
  });

  it("carries the public checkout onto the reservation saved after a delayed lookup", async () => {
    const checkout = await acceptedCheckout();
    culqi.next("POST /charges", "lose");

    expect(await paid(checkout)).toMatchObject({ state: "processing", reservation: null });
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(tasks);

    expect(await status(checkout.token)).toMatchObject({ state: "confirmed" });
    expect(
      rows(
        "SELECT r.status, r.public_checkout_id = c.id AS linked, g.full_name, g.email, g.phone FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN public_checkouts c",
      ),
    ).toEqual([
      {
        status: "confirmed",
        linked: 1,
        full_name: "Ana Torres",
        email: "ana@example.com",
        phone: "+51987654321",
      },
    ]);
    expect(charges()).toHaveLength(1);
  });
});

describe("payment outcomes", () => {
  it("lets the guest pay with another card after a definitive decline, under a fresh security check", async () => {
    const checkout = await acceptedCheckout();

    const declined = await pay(checkout, { sourceId: "tkn_test_decline" });
    expect(declined.status).toBe(201);
    expect(await declined.json()).toEqual({
      payment: {
        state: "declined",
        amountCents: 10000,
        currency: "PEN",
        delayed: false,
        reservation: null,
      },
    });

    expect(await paid(checkout)).toMatchObject({ state: "confirmed" });
    expect(turnstile.verifications).toHaveLength(2);
    expect(charges()).toHaveLength(2);
  });

  it("keeps a required authentication pending instead of failing it or charging another card", async () => {
    const checkout = await acceptedCheckout();
    expect(await paid(checkout, { sourceId: "tkn_test_3ds" })).toMatchObject({
      state: "authentication_required",
      reservation: null,
    });

    const again = await pay(checkout);

    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ payment: { state: "authentication_required" } });
    expect(await status(checkout.token)).toMatchObject({ state: "authentication_required" });
    expect(charges()).toHaveLength(1);
    expect(turnstile.verifications).toHaveLength(1);
  });

  it.each([["timeout" as const], [500 as const], [429 as const]])(
    "keeps a %s from Culqi processing, never charges again, and reports the delay after two minutes",
    async (reply) => {
      const checkout = await acceptedCheckout();
      culqi.next("POST /charges", reply);

      expect(await paid(checkout)).toMatchObject({ state: "processing", delayed: false });
      const replayed = await pay(checkout);
      expect(replayed.status).toBe(200);
      expect(await replayed.json()).toMatchObject({ payment: { state: "processing" } });
      vi.advanceTimersByTime(2 * 60_000 + 1);

      expect(await status(checkout.token)).toMatchObject({ state: "processing", delayed: true });
      expect(charges()).toHaveLength(1);
    },
  );

  it("confirms a charge whose response was lost from the scheduled run, without the browser", async () => {
    const checkout = await acceptedCheckout();
    culqi.next("POST /charges", "lose");
    await paid(checkout);
    const scheduled: Promise<unknown>[] = [];

    worker.scheduled({} as ScheduledController, db.env, {
      waitUntil: (task: Promise<unknown>) => scheduled.push(task),
    } as unknown as ExecutionContext);
    await Promise.all(scheduled);

    expect(rows("SELECT status FROM reservations")).toEqual([{ status: "confirmed" }]);
    expect(await status(checkout.token)).toMatchObject({ state: "confirmed" });
    expect(charges()).toHaveLength(1);
  });

  it("charges once when the same payment is submitted twice at the same time", async () => {
    const checkout = await acceptedCheckout();

    const responses = await Promise.all([pay(checkout), pay(checkout)]);

    expect(responses.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
      200, 201,
    ]);
    expect(charges()).toHaveLength(1);
    expect(rows("SELECT id FROM payment_attempts")).toHaveLength(1);
    expect(await status(checkout.token)).toMatchObject({ state: "confirmed" });
  });

  it("refuses a new card for a checkout that is already paid", async () => {
    const checkout = await acceptedCheckout();
    const payment = await paid(checkout);

    const again = await pay(checkout);

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ payment });
    expect(charges()).toHaveLength(1);
  });

  it("keeps a charge for a room staff saved meanwhile as Unfulfilled with the money due back", async () => {
    const checkout = await acceptedCheckout();
    culqi.next("POST /charges", "lose");
    await paid(checkout);
    for (const fullName of ["Luis Rojas", "Eva Soto"]) {
      const saved = await db.request("/reservations", "POST", {
        requestId: crypto.randomUUID(),
        checkIn: "2026-10-21",
        checkOut: "2026-10-22",
        guest: { fullName },
        rooms: [{ roomTypeId: "type-king", adults: 1, children: 0 }],
      });
      expect(saved.status).toBe(201);
    }

    expect(await status(checkout.token)).toEqual({
      state: "unfulfilled",
      amountCents: 10000,
      currency: "PEN",
      delayed: false,
      reservation: {
        code: expect.stringMatching(/^[A-Z0-9]{6}$/),
        paidCents: 10000,
        outstandingCents: 0,
        refundDueCents: 10000,
      },
    });
    const refundDue = (await (await db.request("/reservations?refund=due")).json()) as {
      status: string;
    }[];
    expect(refundDue.map((row) => row.status)).toEqual(["unfulfilled"]);
    expect(rows("SELECT count(*) AS n FROM refunds")).toEqual([{ n: 0 }]);
  });

  it("refuses to charge once the room type sold out after acceptance", async () => {
    const checkout = await acceptedCheckout();
    db.sqlite.exec(`INSERT INTO room_closures (id, room_id, starts, ends, created_at) VALUES
      ('c1', 'room-101', '2026-10-20', '2026-10-21', '2026-10-01'),
      ('c2', 'room-102', '2026-10-20', '2026-10-21', '2026-10-01')`);

    const response = await pay(checkout);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no availability" });
    expect(charges()).toEqual([]);
  });
});

describe("what a payment can charge", () => {
  it("refuses an expired quote before the security check or Culqi", async () => {
    const checkout = await acceptedCheckout();
    vi.advanceTimersByTime(10 * 60_000);

    const response = await pay(checkout);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "quote has expired" });
    expect(turnstile.verifications).toEqual([]);
    expect(charges()).toEqual([]);
  });

  it("keeps the agreement when an expired quote is refreshed unchanged, and charges that replacement once", async () => {
    const checkout = await acceptedCheckout();
    vi.advanceTimersByTime(10 * 60_000);

    const refreshed = await guest("/public/checkout/quotes", {
      token: checkout.token,
      method: "POST",
    });
    const view = (await refreshed.json()) as {
      quote: { id: string; requiredInitialPaymentCents: number };
      acceptance: { quoteId: string } | null;
    };
    const stale = await pay(checkout);
    const payment = await paid({ token: checkout.token, quoteId: view.quote.id });

    expect(refreshed.status).toBe(201);
    expect(view.quote.id).not.toBe(checkout.quoteId);
    expect(view.quote.requiredInitialPaymentCents).toBe(10000);
    expect(view.acceptance).toEqual({ quoteId: view.quote.id, acceptedAt: expect.any(String) });
    expect(acceptances()).toEqual([acceptanceRow(checkout.quoteId), acceptanceRow(view.quote.id)]);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "quote was replaced by a newer quote" });
    expect(payment).toMatchObject({ state: "confirmed", amountCents: 10000 });
    expect(charges()).toHaveLength(1);
    expect(charges()[0]!.body).toMatchObject({ amount: 10000, currency_code: "PEN" });
  });

  it("requires a new acceptance when a refreshed quote is cheaper, and charges only that accepted amount", async () => {
    const checkout = await acceptedCheckout();
    vi.advanceTimersByTime(10 * 60_000);
    db.sqlite.exec(
      "INSERT INTO room_type_rates (id, room_type_id, date, price_cents) VALUES ('rate', 'type-king', '2026-10-20', 8000)",
    );

    const refreshed = await guest("/public/checkout/quotes", {
      token: checkout.token,
      method: "POST",
    });
    const view = (await refreshed.json()) as {
      quote: { id: string; totalCents: number; requiredInitialPaymentCents: number };
      acceptance: { quoteId: string } | null;
    };
    const refused = await pay({ token: checkout.token, quoteId: view.quote.id });

    expect(refreshed.status).toBe(201);
    expect(view.quote).toMatchObject({ totalCents: 18000, requiredInitialPaymentCents: 8000 });
    expect(view.acceptance).toMatchObject({ quoteId: checkout.quoteId });
    expect(acceptances()).toEqual([acceptanceRow(checkout.quoteId)]);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "quote has not been accepted" });
    expect(charges()).toEqual([]);

    const accepted = await guest("/public/checkout/acceptances", {
      token: checkout.token,
      body: { quoteId: view.quote.id, language: "en", contact, agreed: true },
    });
    expect(accepted.status).toBe(201);
    const payment = await paid({ token: checkout.token, quoteId: view.quote.id });

    expect(payment).toMatchObject({ state: "confirmed", amountCents: 8000 });
    expect(charges()).toHaveLength(1);
    expect(charges()[0]!.body).toMatchObject({ amount: 8000, currency_code: "PEN" });
  });

  it("does not keep acceptance when the refreshed quote's terms differ, and does not charge", async () => {
    const checkout = await acceptedCheckout();
    vi.advanceTimersByTime(10 * 60_000);
    db.sqlite
      .prepare(
        "UPDATE quotes SET terms = json_set(terms, '$.paymentSchedule', 'full_upfront') WHERE id = ?",
      )
      .run(checkout.quoteId);

    const refreshed = await guest("/public/checkout/quotes", {
      token: checkout.token,
      method: "POST",
    });
    const view = (await refreshed.json()) as {
      quote: { id: string };
      acceptance: { quoteId: string };
    };
    const refused = await pay({ token: checkout.token, quoteId: view.quote.id });

    expect(refreshed.status).toBe(201);
    expect(view.acceptance.quoteId).toBe(checkout.quoteId);
    expect(acceptances()).toEqual([acceptanceRow(checkout.quoteId)]);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "quote has not been accepted" });
    expect(charges()).toEqual([]);
  });

  it("stores nothing and charges nothing when the stay sold out before refresh", async () => {
    const checkout = await acceptedCheckout();
    vi.advanceTimersByTime(10 * 60_000);
    db.sqlite.exec(`INSERT INTO room_closures (id, room_id, starts, ends, created_at) VALUES
      ('c1', 'room-101', '2026-10-20', '2026-10-21', '2026-10-01'),
      ('c2', 'room-102', '2026-10-20', '2026-10-21', '2026-10-01')`);

    const refreshed = await guest("/public/checkout/quotes", {
      token: checkout.token,
      method: "POST",
    });
    const response = await pay(checkout);

    expect(refreshed.status).toBe(409);
    expect(await refreshed.json()).toEqual({ error: "no availability" });
    expect(rows("SELECT count(*) AS n FROM quotes")).toEqual([{ n: 1 }]);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "quote has expired" });
    expect(charges()).toEqual([]);
  });

  it.each([
    ["an unknown payment", "timeout"],
    ["a pending authentication", "tkn_test_3ds"],
  ] as const)(
    "does not refresh or charge again while %s is open, even after the quote expires",
    async (_label, outcome) => {
      const checkout = await acceptedCheckout();
      if (outcome === "timeout") culqi.next("POST /charges", "timeout");
      await paid(checkout, outcome === "timeout" ? {} : { sourceId: outcome });
      vi.advanceTimersByTime(11 * 60_000);

      const refreshed = await guest("/public/checkout/quotes", {
        token: checkout.token,
        method: "POST",
      });
      const again = await pay(checkout);

      expect(refreshed.status).toBe(409);
      expect(await refreshed.json()).toEqual({ error: "checkout already has a payment" });
      expect(again.status).toBe(200);
      expect(rows("SELECT count(*) AS n FROM quotes")).toEqual([{ n: 1 }]);
      expect(charges()).toHaveLength(1);
    },
  );

  it("refuses to carry an unchanged agreement onto a new quote once the checkout has 20 acceptances", async () => {
    const checkout = await acceptedCheckout();
    for (let attempt = 2; attempt <= 20; attempt++) {
      const accepted = await guest("/public/checkout/acceptances", {
        token: checkout.token,
        body: {
          quoteId: checkout.quoteId,
          language: "en",
          contact: { ...contact, fullName: `Ana ${attempt}` },
          agreed: true,
        },
      });
      expect(accepted.status).toBe(201);
    }
    vi.advanceTimersByTime(10 * 60_000);

    const refreshed = await guest("/public/checkout/quotes", {
      token: checkout.token,
      method: "POST",
    });
    const response = await pay(checkout);

    expect(refreshed.status).toBe(429);
    expect(await refreshed.json()).toEqual({ error: "too many acceptances for this checkout" });
    expect(rows("SELECT count(*) AS n FROM quotes")).toEqual([{ n: 1 }]);
    expect(rows("SELECT count(*) AS n FROM checkout_acceptances")).toEqual([{ n: 20 }]);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "quote has expired" });
    expect(charges()).toEqual([]);
  });

  it("does not charge another checkout's quote or a quote outside any checkout", async () => {
    const first = await acceptedCheckout();
    const second = await acceptedCheckout({ checkIn: "2026-10-24", checkOut: "2026-10-25" });
    const legacy = await createQuote(
      getDb(db.env.DB),
      {
        roomTypeId: "type-king",
        checkIn: "2026-10-20",
        checkOut: "2026-10-22",
        adults: 2,
        children: 0,
        ratePlan: "flexible",
      },
      { today: "2026-10-10", now: new Date() },
    );

    for (const quoteId of [first.quoteId, legacy.id]) {
      const response = await pay({ token: second.token, quoteId });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "quote not found" });
    }
    expect(charges()).toEqual([]);
  });

  it.each([
    ["an amount", { amountCents: 1 }],
    ["a status", { status: "saved" }],
    ["guest details", { guest: contact }],
  ])("rejects %s supplied by the guest", async (_label, extra) => {
    const response = await pay(await acceptedCheckout(), extra);

    expect(response.status).toBe(400);
    expect(charges()).toEqual([]);
  });

  it("accepts only card tokens", async () => {
    const response = await pay(await acceptedCheckout(), { sourceId: "ype_test_123" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "only card payments are accepted" });
    expect(charges()).toEqual([]);
  });

  it("keeps the checkout on its quote while a payment is unresolved, and allows a new quote after a decline", async () => {
    const pending = await acceptedCheckout();
    culqi.next("POST /charges", "timeout");
    await paid(pending);
    const declined = await acceptedCheckout({ checkIn: "2026-10-24", checkOut: "2026-10-25" });
    await paid(declined, { sourceId: "tkn_test_decline" });

    const blocked = await guest("/public/checkout/quotes", {
      token: pending.token,
      method: "POST",
    });
    const refreshed = await guest("/public/checkout/quotes", {
      token: declined.token,
      method: "POST",
    });

    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({ error: "checkout already has a payment" });
    expect(refreshed.status).toBe(201);
  });
});

describe("public payment admission", () => {
  it("starts paused and refuses an accepted checkout before the security check or Culqi", async () => {
    db.sqlite.exec("DELETE FROM operation_controls");
    await db.signIn("owner");
    expect(await (await db.request("/controls/public-payments")).json()).toEqual({
      admitted: false,
      updatedAt: null,
    });

    const response = await pay(await acceptedCheckout());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "online payments are paused" });
    expect(turnstile.verifications).toEqual([]);
    expect(charges()).toEqual([]);
  });

  it("stops an already-open checkout while its earlier payment keeps being verified and resolved", async () => {
    const waiting = await acceptedCheckout();
    culqi.next("POST /charges", "lose");
    await paid(waiting);
    const open = await acceptedCheckout({ checkIn: "2026-10-24", checkOut: "2026-10-25" });

    await admitPayments(false);

    const refused = await pay(open);
    expect(refused.status).toBe(503);
    expect(await status(waiting.token)).toMatchObject({ state: "confirmed" });
    expect(charges()).toHaveLength(1);
  });

  it("resumes without submitting anything on the guest's behalf", async () => {
    const checkout = await acceptedCheckout();
    await admitPayments(false);
    expect((await pay(checkout)).status).toBe(503);

    await admitPayments(true);

    expect(charges()).toEqual([]);
    expect(await status(checkout.token)).toBeNull();
    expect(await paid(checkout)).toMatchObject({ state: "confirmed" });
  });

  it("lets only the owner read or change admission", async () => {
    await db.signIn("staff");

    expect((await db.request("/controls/public-payments")).status).toBe(403);
    expect((await db.request("/controls/public-payments", "PUT", { admitted: false })).status).toBe(
      403,
    );
    expect(
      (await db.request("/controls/public-payments", "GET", undefined, { signedIn: false })).status,
    ).toBe(401);
  });
});

describe("payment security check", () => {
  it("sends the guest's challenge response and trusted source IP to Turnstile", async () => {
    await paid(await acceptedCheckout());

    expect(turnstile.verifications).toEqual([
      { secret: TURNSTILE_TEST_SECRET, response: TURNSTILE_PASS, remoteip: "203.0.113.9" },
    ]);
  });

  const unavailable = { status: 503, error: "payment security check is unavailable" };
  const securityFailures: {
    name: string;
    arrange: () => void;
    token?: string;
    status: number;
    error: string;
  }[] = [
    {
      name: "no secret is configured",
      arrange: () => {
        delete db.env.TURNSTILE_SECRET_KEY;
      },
      ...unavailable,
    },
    {
      name: "the response is invalid",
      arrange: () => {},
      token: "forged",
      status: 403,
      error: "payment security check failed",
    },
    { name: "Turnstile answers 500", arrange: () => turnstile.next(500), ...unavailable },
    { name: "the connection drops", arrange: () => turnstile.next("lose"), ...unavailable },
    {
      name: "Turnstile reports an internal error",
      arrange: () => turnstile.next("internal-error"),
      ...unavailable,
    },
  ];

  it.each(securityFailures)(
    "fails closed without charging when $name",
    async ({ arrange, token = TURNSTILE_PASS, status: code, error }) => {
      const checkout = await acceptedCheckout();
      arrange();

      const response = await pay(checkout, { turnstileToken: token });

      expect(response.status).toBe(code);
      expect(await response.json()).toEqual({ error });
      expect(charges()).toEqual([]);
      expect(rows("SELECT id FROM payment_attempts")).toEqual([]);
    },
  );

  it("requires a challenge response", async () => {
    const response = await pay(await acceptedCheckout(), { turnstileToken: undefined });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "payment security check is required" });
    expect(charges()).toEqual([]);
  });
});

describe("payment limits", () => {
  it("counts new payments per trusted source IP and per checkout, but not status reads or replays", async () => {
    const keys: Record<string, string[]> = { ip: [], checkout: [] };
    const counting = (into: string[]) => ({
      limit: async ({ key }: { key: string }) => {
        into.push(key);
        return { success: true };
      },
    });
    db.env.PAYMENT_IP_LIMITER = counting(keys.ip!);
    db.env.PAYMENT_CHECKOUT_LIMITER = counting(keys.checkout!);
    const checkout = await acceptedCheckout();
    const [{ id }] = rows<{ id: string }>("SELECT id FROM public_checkouts");

    await paid(checkout, { sourceId: "tkn_test_decline" });
    await pay(checkout, {}, "198.51.100.7");
    await status(checkout.token);
    await pay(checkout);

    expect(keys).toEqual({ ip: ["203.0.113.9", "198.51.100.7"], checkout: [id, id] });
  });

  it.each([["PAYMENT_IP_LIMITER" as const], ["PAYMENT_CHECKOUT_LIMITER" as const]])(
    "answers 429 from %s with a retry delay before the security check or Culqi",
    async (binding) => {
      const checkout = await acceptedCheckout();
      db.env[binding] = { limit: async () => ({ success: false }) };

      const response = await pay(checkout);

      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("60");
      expect(await response.json()).toEqual({ error: "too many payment attempts" });
      expect(turnstile.verifications).toEqual([]);
      expect(charges()).toEqual([]);
    },
  );
});

describe("payment access and privacy", () => {
  it.each([
    ["no token", undefined],
    ["a guessed token", "a".repeat(43)],
  ])("refuses payment and status with %s", async (_case, token) => {
    const { quoteId } = await acceptedCheckout();

    const started = await guest("/public/checkout/payments", {
      token,
      body: { quoteId, sourceId: card(), turnstileToken: TURNSTILE_PASS },
    });
    const read = await guest("/public/checkout/payment", { token });

    expect([started.status, read.status]).toEqual([401, 401]);
    expect(charges()).toEqual([]);
  });

  it("shows each checkout only its own payment", async () => {
    await paid(await acceptedCheckout());
    const other = await acceptedCheckout({ checkIn: "2026-10-24", checkOut: "2026-10-25" });

    expect(await status(other.token)).toBeNull();
  });

  it("reveals no contact, card, provider or staff details in the payment status", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout);

    const response = await guest("/public/checkout/payment", { token: checkout.token });
    const text = await response.text();

    expect(response.headers.get("cache-control")).toBe("no-store");
    for (const secret of ["ana@example.com", "Ana Torres", "987654321", "tkn_test_", "chr_test_"])
      expect(text).not.toContain(secret);
    expect(Object.keys(JSON.parse(text).payment).toSorted()).toEqual([
      "amountCents",
      "currency",
      "delayed",
      "reservation",
      "state",
    ]);
  });
});

describe("attempts started outside a public checkout", () => {
  it("are still reconciled and saved, but carry no checkout or confirmation eligibility", async () => {
    const quote = await createQuote(
      getDb(db.env.DB),
      {
        roomTypeId: "type-king",
        checkIn: "2026-10-20",
        checkOut: "2026-10-21",
        adults: 2,
        children: 0,
        ratePlan: "flexible",
      },
      { today: "2026-10-10", now: new Date() },
    );
    culqi.next("POST /charges", "lose");
    await startPaymentAttempt(
      getDb(db.env.DB),
      {
        quoteId: quote.id,
        sourceId: card(),
        guest: { fullName: "Luis Rojas", email: "luis@example.com" },
      },
      paymentContext(db.env),
    );

    await reconcilePaymentAttempts(getDb(db.env.DB), paymentContext(db.env));

    expect(
      rows(
        "SELECT a.status, a.checkout_id, a.acceptance_id, a.language, a.confirmation_email_eligible AS eligible, r.public_checkout_id FROM payment_attempts a JOIN reservations r ON r.id = a.reservation_id",
      ),
    ).toEqual([
      {
        status: "saved",
        checkout_id: null,
        acceptance_id: null,
        language: null,
        eligible: 0,
        public_checkout_id: null,
      },
    ]);
  });
});

describe("local service overrides", () => {
  it("ignores Culqi and Turnstile addresses that are not on this machine", async () => {
    db.env.CULQI_API_URL = "https://culqi.example.net/v2";
    db.env.TURNSTILE_VERIFY_URL = "https://turnstile.example.net/siteverify";

    expect(await paid(await acceptedCheckout())).toMatchObject({ state: "confirmed" });
    expect(turnstile.verifications).toHaveLength(1);
    expect(charges()).toHaveLength(1);
  });
});

function duringFirstSecurityCheck(run: () => Promise<void>) {
  const original = globalThis.fetch;
  let pending = true;
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (pending && url.origin === "https://challenges.cloudflare.com") {
      pending = false;
      await run();
    }
    return original(input, init);
  }) as typeof fetch);
}

describe("payments racing within one checkout", () => {
  it("charges the refreshed quote once when refresh keeps the agreement during an earlier payment check", async () => {
    const checkout = await acceptedCheckout();
    let second: Response | undefined;
    duringFirstSecurityCheck(async () => {
      const refreshed = await guest("/public/checkout/quotes", {
        token: checkout.token,
        method: "POST",
      });
      const view = (await refreshed.json()) as {
        quote: { id: string };
        acceptance: { quoteId: string };
      };
      expect(view.acceptance.quoteId).toBe(view.quote.id);
      second = await pay({ token: checkout.token, quoteId: view.quote.id });
    });

    const first = await pay(checkout);

    expect(second?.status).toBe(201);
    expect(first.status).toBe(409);
    expect(await first.json()).toEqual({ error: "quote was replaced by a newer quote" });
    expect(charges()).toHaveLength(1);
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "saved" }]);
  });

  it("charges once when the quote is replaced, accepted and paid while an earlier payment is being verified", async () => {
    const checkout = await acceptedCheckout();
    let second: Response | undefined;
    duringFirstSecurityCheck(async () => {
      const refreshed = await guest("/public/checkout/quotes", {
        token: checkout.token,
        method: "POST",
      });
      const { quote } = (await refreshed.json()) as { quote: { id: string } };
      await guest("/public/checkout/acceptances", {
        token: checkout.token,
        body: { quoteId: quote.id, language: "en", contact, agreed: true },
      });
      second = await pay({ token: checkout.token, quoteId: quote.id });
    });

    const first = await pay(checkout);

    expect(second?.status).toBe(201);
    expect(first.status).toBe(409);
    expect(await first.json()).toEqual({ error: "quote was replaced by a newer quote" });
    expect(charges()).toHaveLength(1);
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "saved" }]);
  });

  it("does not charge when payments are paused while the payment is being verified", async () => {
    const checkout = await acceptedCheckout();
    duringFirstSecurityCheck(() => admitPayments(false));

    const response = await pay(checkout);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "online payments are paused" });
    expect(charges()).toEqual([]);
    expect(rows("SELECT id FROM payment_attempts")).toEqual([]);
  });

  it("refuses a new acceptance while the checkout has a payment", async () => {
    const checkout = await acceptedCheckout();
    culqi.next("POST /charges", "timeout");
    await paid(checkout);

    const response = await guest("/public/checkout/acceptances", {
      token: checkout.token,
      body: { quoteId: checkout.quoteId, language: "es", contact, agreed: true },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "checkout already has a payment" });
  });
});

describe("payment outcomes over time", () => {
  it("keeps a required authentication pending after its quote expires, without allowing another card", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout, { sourceId: "tkn_test_3ds" });
    vi.advanceTimersByTime(11 * 60_000);
    await reconcilePaymentAttempts(getDb(db.env.DB), paymentContext(db.env));

    expect(await status(checkout.token)).toMatchObject({ state: "authentication_required" });
    const again = await pay(checkout);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ payment: { state: "authentication_required" } });
    expect(charges()).toHaveLength(1);
  });

  it("stops reporting a reservation as confirmed once staff cancel it", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout);
    const [{ id }] = rows<{ id: string }>("SELECT id FROM reservations");
    const cancelled = await db.request(`/reservations/${id}/commands`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [{ type: "set-status", status: "cancelled", reason: "Guest asked" }],
    });
    expect(cancelled.status).toBe(200);

    expect(await status(checkout.token)).toMatchObject({
      state: "reservation_changed",
      reservation: { code: expect.stringMatching(/^[A-Z0-9]{6}$/), paidCents: 10000 },
    });
  });
});
