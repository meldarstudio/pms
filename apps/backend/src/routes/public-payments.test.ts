import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getDb } from "../db";
import worker, { app } from "../index";
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
  vi.restoreAllMocks();
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
  notes?: string,
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
    body: { quoteId: quote.id, language: "en", contact, agreed: true, notes },
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

const listed = () => culqi.requests.filter((request) => request.method === "GET");

async function runScheduled() {
  const scheduled: Promise<unknown>[] = [];
  worker.scheduled({} as ScheduledController, db.env, {
    waitUntil: (task: Promise<unknown>) => scheduled.push(task),
  } as unknown as ExecutionContext);
  await Promise.all(scheduled);
}

function failingLimiters() {
  const consumed: string[] = [];
  const counting = {
    limit: async ({ key }: { key: string }) => {
      consumed.push(key);
      return { success: false };
    },
  };
  db.env.PAYMENT_IP_LIMITER = counting;
  db.env.PAYMENT_CHECKOUT_LIMITER = counting;
  return consumed;
}

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
      attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
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
});

describe("payment outcomes", () => {
  it("lets the guest pay with another card after a definitive decline, under a fresh security check", async () => {
    const checkout = await acceptedCheckout();

    const declined = await pay(checkout, { sourceId: "tkn_test_decline" });
    expect(declined.status).toBe(201);
    expect(await declined.json()).toEqual({
      payment: {
        attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
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
      attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
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
    expect(rows("SELECT full_name, email, phone FROM guests")).toEqual([
      { full_name: "Ana Torres", email: "ana@example.com", phone: "+51987654321" },
    ]);
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
});

describe("payment limits", () => {
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
      "attemptId",
      "currency",
      "delayed",
      "reservation",
      "state",
    ]);
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
  it("does not charge a changed offer from a payment already being verified", async () => {
    const checkout = await acceptedCheckout();
    let second: Response | undefined;
    duringFirstSecurityCheck(async () => {
      db.sqlite.exec(
        "INSERT INTO room_type_rates (id, room_type_id, date, price_cents) VALUES ('rate-race', 'type-king', '2026-10-20', 8000)",
      );
      const refreshed = await guest("/public/checkout/quotes", {
        token: checkout.token,
        method: "POST",
      });
      const view = (await refreshed.json()) as {
        quote: { id: string };
        acceptance: { quoteId: string } | null;
      };
      expect(view.acceptance?.quoteId).not.toBe(view.quote.id);
      await guest("/public/checkout/acceptances", {
        token: checkout.token,
        body: { quoteId: view.quote.id, language: "en", contact, agreed: true },
      });
      second = await pay({ token: checkout.token, quoteId: view.quote.id });
    });

    const first = await pay(checkout);

    expect(second?.status).toBe(201);
    expect(first.status).toBe(409);
    expect(await first.json()).toEqual({ error: "quote was replaced by a newer quote" });
    expect(charges()).toHaveLength(1);
    expect(charges()[0]!.body).toMatchObject({ amount: 8000 });
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "saved" }]);
  });
});

const authentication = {
  eci: "05",
  xid: "02010000755f8c81a4db4c848b8c23f6b0196cfd",
  cavv: "63617264696e616c636f6d6d6572636561757468",
  protocolVersion: "2.2.0",
  directoryServerTransactionId: "755f8c81-a4db-4c84-8b8c-23f6b0196cfd",
};

const continueAuthentication = (token: string, body?: unknown) =>
  guest("/public/checkout/payment/authentication", {
    token,
    body: body ?? {
      ...authentication,
      attemptId: rows<{ id: string }>(
        "SELECT id FROM payment_attempts ORDER BY created_at DESC, rowid DESC",
      )[0]?.id,
    },
  });

describe("continuing bank authentication", () => {
  it("charges the original attempt and source after the quote expires, and a repeat does not charge again", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout, { sourceId: "tkn_test_3ds", deviceFingerprint: "device-1" });
    vi.advanceTimersByTime(11 * 60_000);

    const continued = await continueAuthentication(checkout.token);
    const again = await continueAuthentication(checkout.token);

    expect(continued.status).toBe(200);
    const payment = ((await continued.json()) as { payment: GuestPayment }).payment;
    expect(payment).toMatchObject({
      state: "confirmed",
      amountCents: 10000,
      currency: "PEN",
      reservation: { paidCents: 10000, outstandingCents: 10000 },
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ payment });
    expect(charges()).toHaveLength(2);
    const [{ id }] = rows<{ id: string }>("SELECT id FROM payment_attempts");
    expect(charges()[1]!.body).toMatchObject({
      amount: 10000,
      currency_code: "PEN",
      email: "ana@example.com",
      source_id: "tkn_test_3ds",
      capture: true,
      metadata: { attempt_id: id },
      authentication_3DS: authentication,
      antifraud_details: { device_finger_print_id: "device-1" },
    });
    expect(rows("SELECT id, status FROM payment_attempts")).toEqual([{ id, status: "saved" }]);
  });

  it("charges once when authentication is continued twice at the same time", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout, { sourceId: "tkn_test_3ds" });

    const responses = await Promise.all([
      continueAuthentication(checkout.token),
      continueAuthentication(checkout.token),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(charges()).toHaveLength(2);
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "saved" }]);
    expect(await status(checkout.token)).toMatchObject({ state: "confirmed" });
  });

  it("continues only the named review attempt, not an earlier or foreign card", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout, { sourceId: "tkn_test_decline" });
    await paid(checkout, { sourceId: "tkn_test_3ds_later" });
    const attempts = rows<{ id: string; status: string; source_id: string }>(
      "SELECT id, status, source_id FROM payment_attempts ORDER BY created_at, rowid",
    );
    const declined = attempts[0]!;
    const review = attempts[1]!;

    const replayed = await continueAuthentication(checkout.token, {
      ...authentication,
      attemptId: declined.id,
    });
    const foreign = await continueAuthentication(checkout.token, {
      ...authentication,
      attemptId: crypto.randomUUID(),
    });

    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toMatchObject({
      payment: { state: "authentication_required", attemptId: review.id },
    });
    expect(foreign.status).toBe(200);
    expect(await foreign.json()).toMatchObject({
      payment: { state: "authentication_required", attemptId: review.id },
    });
    expect(charges()).toHaveLength(2);
    expect(rows("SELECT id, status FROM payment_attempts ORDER BY created_at, rowid")).toEqual([
      { id: declined.id, status: "failed" },
      { id: review.id, status: "review" },
    ]);

    const continued = await continueAuthentication(checkout.token, {
      ...authentication,
      attemptId: review.id,
    });

    expect(continued.status).toBe(200);
    expect(await continued.json()).toMatchObject({
      payment: { state: "confirmed", attemptId: review.id },
    });
    expect(charges()).toHaveLength(3);
    expect(charges()[2]!.body).toMatchObject({
      source_id: "tkn_test_3ds_later",
      authentication_3DS: authentication,
    });
  });
});

const reportFailedAuthentication = (token: string, attemptId?: string) =>
  guest("/public/checkout/payment/authentication/failure", {
    token,
    body: {
      attemptId:
        attemptId ??
        rows<{ id: string }>(
          "SELECT id FROM payment_attempts ORDER BY created_at DESC, rowid DESC",
        )[0]?.id,
    },
  });

describe("a bank refusing authentication", () => {
  it("declines the attempt without charging, and the next card is charged on the same checkout", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout, { sourceId: "tkn_test_3ds" });

    const reported = await reportFailedAuthentication(checkout.token);

    expect(reported.status).toBe(200);
    expect(await reported.json()).toMatchObject({
      payment: { state: "declined", reservation: null },
    });
    expect(rows("SELECT status, failure_code, failure_message FROM payment_attempts")).toEqual([
      { status: "failed", failure_code: "authentication_failed", failure_message: null },
    ]);
    expect(charges()).toHaveLength(1);

    expect(await paid(checkout)).toMatchObject({ state: "confirmed" });
    expect(charges()).toHaveLength(2);
    expect(charges()[1]!.body?.source_id).not.toBe("tkn_test_3ds");
  });

  it.each([
    ["is still being charged", "timeout" as const, "processing", "unknown"],
    ["was paid", undefined, "confirmed", "saved"],
  ])(
    "changes nothing once authentication continued and the charge %s",
    async (_name, reply, state, stored) => {
      const checkout = await acceptedCheckout();
      await paid(checkout, { sourceId: "tkn_test_3ds" });
      if (reply) culqi.next("POST /charges", reply);
      expect((await continueAuthentication(checkout.token)).status).toBe(200);

      const reported = await reportFailedAuthentication(checkout.token);

      expect(reported.status).toBe(200);
      expect(await reported.json()).toMatchObject({ payment: { state } });
      expect(rows("SELECT status, failure_code FROM payment_attempts")).toEqual([
        { status: stored, failure_code: null },
      ]);
      expect(charges()).toHaveLength(2);
    },
  );

  it("does not charge a failed check that the bank later authenticates", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout, { sourceId: "tkn_test_3ds" });
    await reportFailedAuthentication(checkout.token);

    const continued = await continueAuthentication(checkout.token);

    expect(continued.status).toBe(200);
    expect(await continued.json()).toMatchObject({ payment: { state: "declined" } });
    expect(charges()).toHaveLength(1);
  });

  it("either charges or fails the attempt when both reach the server at once, never both", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout, { sourceId: "tkn_test_3ds" });

    const [continued, reported] = await Promise.all([
      continueAuthentication(checkout.token),
      reportFailedAuthentication(checkout.token),
    ]);

    expect([continued.status, reported.status]).toEqual([200, 200]);
    const [{ status: stored }] = rows<{ status: string }>("SELECT status FROM payment_attempts");
    expect(["saved", "failed"]).toContain(stored);
    expect(charges()).toHaveLength(stored === "saved" ? 2 : 1);
    expect(await status(checkout.token)).toMatchObject({
      state: stored === "saved" ? "confirmed" : "declined",
    });
  });
});

describe("recovering an interrupted payment", () => {
  it("declines bank verification nobody finished within a day, and the guest can pay with another card", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout, { sourceId: "tkn_test_3ds" });
    vi.advanceTimersByTime(24 * 60 * 60_000 + 1);

    await runScheduled();

    expect(await status(checkout.token)).toMatchObject({
      state: "declined",
      declineReason: "authentication_expired",
      reservation: null,
    });
    expect(rows("SELECT status, failure_code FROM payment_attempts")).toEqual([
      { status: "failed", failure_code: "authentication_expired" },
    ]);
    const late = await continueAuthentication(checkout.token);
    expect(await late.json()).toMatchObject({
      payment: { state: "declined", declineReason: "authentication_expired" },
    });
    expect(charges()).toHaveLength(1);

    const refreshed = await guest("/public/checkout/quotes", { token: checkout.token, body: {} });
    expect(refreshed.status).toBe(201);
    const { quote } = (await refreshed.json()) as { quote: { id: string } };
    const accepted = await guest("/public/checkout/acceptances", {
      token: checkout.token,
      body: { quoteId: quote.id, language: "en", contact, agreed: true },
    });
    expect(accepted.status).toBe(201);
    expect(await paid({ token: checkout.token, quoteId: quote.id })).toMatchObject({
      state: "confirmed",
    });
    expect(charges()).toHaveLength(2);
  });

  it("keeps an unresolved payment blocking after lookup ends, without charging again", async () => {
    const checkout = await acceptedCheckout();
    culqi.next("POST /charges", "timeout");
    await paid(checkout);
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(tasks);
    vi.advanceTimersByTime(48 * 60 * 60_000);
    const [{ id }] = rows<{ id: string }>("SELECT id FROM payment_attempts");
    culqi.charges.push({
      object: "charge",
      id: "chr_test_late",
      amount: 10000,
      currency_code: "PEN",
      email: "ana@example.com",
      source_id: "tkn_test_late",
      creation_date: Date.now(),
      outcome: { type: "venta_exitosa", code: "AUT0000" },
      metadata: { attempt_id: id },
      amount_refunded: 0,
    });
    const lookups = listed().length;
    const consumed = failingLimiters();

    await runScheduled();
    expect(await status(checkout.token)).toMatchObject({ state: "processing", delayed: true });
    const again = await pay(checkout);

    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ payment: { state: "processing" } });
    expect(listed()).toHaveLength(lookups);
    expect(consumed).toEqual([]);
    expect(charges()).toHaveLength(1);
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "unknown" }]);
    expect(rows("SELECT id FROM reservations")).toEqual([]);
  });

  it("does not confirm an unrelated charge for the same email and amount", async () => {
    const checkout = await acceptedCheckout();
    culqi.next("POST /charges", "timeout");
    await paid(checkout);
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(tasks);
    const [{ source_id, called_at }] = rows<{ source_id: string; called_at: string }>(
      "SELECT source_id, called_at FROM payment_attempts",
    );
    culqi.charges.push({
      object: "charge",
      id: "chr_test_other",
      amount: 10000,
      currency_code: "PEN",
      email: "ana@example.com",
      source_id: "tkn_test_other",
      creation_date: Date.parse(called_at),
      outcome: { type: "venta_exitosa", code: "AUT0000" },
      metadata: null,
      amount_refunded: 0,
    });

    await runScheduled();

    expect(source_id).not.toBe("tkn_test_other");
    expect(await status(checkout.token)).toMatchObject({ state: "processing", reservation: null });
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "unknown" }]);
    expect(rows("SELECT id FROM reservations")).toEqual([]);
    expect(charges()).toHaveLength(1);
  });

  it("confirms one reservation when a status read and the scheduled run find the same lost charge", async () => {
    const checkout = await acceptedCheckout();
    culqi.next("POST /charges", "lose");
    culqi.next("GET /charges", 500);
    await paid(checkout);
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(tasks);
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "unknown" }]);

    await Promise.all([status(checkout.token), runScheduled()]);

    expect(rows("SELECT status FROM reservations")).toEqual([{ status: "confirmed" }]);
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "saved" }]);
    expect(rows("SELECT id FROM payments")).toHaveLength(1);
    expect(rows("SELECT id FROM confirmation_emails")).toHaveLength(1);
    expect(charges()).toHaveLength(1);
    expect(await status(checkout.token)).toMatchObject({ state: "confirmed" });
  });

  it("keeps a saved charge awaiting its reservation when saving fails, then the scheduled run saves it once", async () => {
    const checkout = await acceptedCheckout();
    db.beforeCommit(() => {
      throw new Error("D1 is unavailable");
    });

    expect(await paid(checkout)).toMatchObject({
      state: "paid_awaiting_reservation",
      reservation: null,
    });
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "succeeded" }]);
    expect(rows("SELECT id FROM reservations")).toEqual([]);

    await runScheduled();
    await runScheduled();

    expect(rows("SELECT status FROM reservations")).toEqual([{ status: "confirmed" }]);
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "saved" }]);
    expect(charges()).toHaveLength(1);
    expect(await status(checkout.token)).toMatchObject({ state: "confirmed" });
  });
});
