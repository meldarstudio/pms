import { createHash } from "node:crypto";
import type { PublicCheckoutCreateRequest } from "@pms/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getDb } from "../db";
import { app } from "../index";
import { createQuote } from "../quotes";
import { WEBSITE_ORIGIN } from "../test-support/auth";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "../test-support/d1";

type CheckoutView = {
  token?: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  ratePlan: string;
  language: string;
  currency: string;
  quote: {
    id: string;
    expired: boolean;
    expiresAt: string;
    nights: { date: string; priceCents: number }[];
    totalCents: number;
    requiredInitialPaymentCents: number;
    remainingScheduledCents: number;
    cancellation: { freeCancellation: string; freeUntil: string | null; chargeCents: number };
  };
  acceptance: { quoteId: string; acceptedAt: string } | null;
};

let db: TestDb;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type-king", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type-king", { "room-101": "101", "room-102": "102" });
  seedRoomType(db.sqlite, { id: "type-queen", name: "Queen", maxAdults: 2, baseRateCents: 9000 });
  seedRooms(db.sqlite, "type-queen", { "room-201": "201" });
  db.env.PUBLISHED_ROOM_TYPE_IDS = "type-king";
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

const selection: PublicCheckoutCreateRequest = {
  roomTypeId: "type-king",
  checkIn: "2026-10-20",
  checkOut: "2026-10-22",
  adults: 2,
  children: 0,
  ratePlan: "flexible",
  language: "es",
};

const contact = { fullName: " Ana Torres ", email: "ana@example.com", phone: "987 654 321" };

function guest(
  path: string,
  init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
) {
  return app.request(
    path,
    {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        origin: WEBSITE_ORIGIN,
        "cf-connecting-ip": "203.0.113.9",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
        ...init.headers,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    },
    db.env,
  );
}

const enterReview = (overrides: Record<string, unknown> = {}) =>
  guest("/public/checkouts", { body: { ...selection, ...overrides } });

async function started(overrides: Record<string, unknown> = {}) {
  const response = await enterReview(overrides);
  expect(response.status).toBe(201);
  const view = (await response.json()) as CheckoutView;
  return { ...view, token: view.token! };
}

const accept = (token: string, body: Record<string, unknown>) =>
  guest("/public/checkout/acceptances", {
    token,
    body: { language: "es", contact, agreed: true, ...body },
  });

const count = (table: string) =>
  (db.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

const closeKingRooms = () =>
  db.sqlite.exec(`INSERT INTO room_closures (id, room_id, starts, ends, created_at) VALUES
    ('c1', 'room-101', '2026-10-21', '2026-10-22', '2026-10-01'),
    ('c2', 'room-102', '2026-10-21', '2026-10-22', '2026-10-01')`);

describe("entering Review", () => {
  it("creates a private checkout with a ten-minute Flexible quote and the bill's amounts", async () => {
    db.sqlite.exec(
      "INSERT INTO room_type_rates (id, room_type_id, date, price_cents) VALUES ('rate', 'type-king', '2026-10-21', 12345)",
    );

    const response = await enterReview();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    const view = (await response.json()) as CheckoutView;
    expect(view).toEqual({
      token: expect.stringMatching(/^[\w-]{43}$/),
      roomTypeId: "type-king",
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
      nights: 2,
      adults: 2,
      children: 0,
      ratePlan: "flexible",
      language: "es",
      currency: "PEN",
      quote: {
        id: expect.any(String),
        expired: false,
        expiresAt: "2026-10-10T15:10:00.000Z",
        nights: [
          { date: "2026-10-20", priceCents: 10000 },
          { date: "2026-10-21", priceCents: 12345 },
        ],
        totalCents: 22345,
        requiredInitialPaymentCents: 10000,
        remainingScheduledCents: 12345,
        cancellation: {
          freeCancellation: "available",
          freeUntil: "2026-10-18",
          chargeCents: 10000,
        },
      },
      acceptance: null,
    });
    const stored = db.sqlite
      .prepare(
        "SELECT q.expires_at, c.token_hash FROM quotes q JOIN public_checkouts c ON c.id = q.checkout_id WHERE q.id = ?",
      )
      .get(view.quote.id) as { expires_at: string; token_hash: string };
    expect(stored.expires_at).toBe("2026-10-10T15:10:00.000Z");
    expect(stored.token_hash).toBe(createHash("sha256").update(view.token!).digest("hex"));
  });

  it.each([
    [
      "Non-refundable charges the discounted stay upfront and on cancellation",
      { ratePlan: "non_refundable" },
      {
        totalCents: 18000,
        requiredInitialPaymentCents: 18000,
        remainingScheduledCents: 0,
        cancellation: { freeCancellation: "none", freeUntil: null, chargeCents: 18000 },
      },
    ],
    [
      "a Flexible arrival tomorrow says free cancellation already ended",
      { checkIn: "2026-10-11", checkOut: "2026-10-12" },
      {
        totalCents: 10000,
        requiredInitialPaymentCents: 10000,
        remainingScheduledCents: 0,
        cancellation: { freeCancellation: "ended", freeUntil: "2026-10-09", chargeCents: 10000 },
      },
    ],
  ])("%s", async (_name, overrides, amounts) => {
    const view = await started(overrides);

    expect(view.quote).toMatchObject(amounts);
  });

  it.each([
    ["an unpublished type", { roomTypeId: "type-queen" }, 404, "room type not found"],
    ["an unknown type", { roomTypeId: "type-missing" }, 404, "room type not found"],
    [
      "an arrival today",
      { checkIn: "2026-10-10", checkOut: "2026-10-11" },
      400,
      "online check-in must be after today",
    ],
    ["61 nights", { checkOut: "2026-12-20" }, 400, "stay cannot be longer than 60 nights"],
    ["too many adults", { adults: 3 }, 400, "too many guests for this room type"],
    ["too many children", { children: 3 }, 400, "too many guests for this room type"],
  ])("refuses %s without creating a checkout", async (_name, overrides, status, error) => {
    const response = await enterReview(overrides);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(count("public_checkouts")).toBe(0);
    expect(count("quotes")).toBe(0);
  });

  it.each([
    ["a price", { totalCents: 1 }],
    ["a discount", { discountCents: 5000 }],
    ["a status", { status: "confirmed" }],
    ["a room", { roomId: "room-101" }],
    ["another language", { language: "fr" }],
  ])("rejects a guest-supplied %s", async (_name, extra) => {
    const response = await enterReview(extra);

    expect(response.status).toBe(400);
    expect(count("public_checkouts")).toBe(0);
  });

  it("reports availability loss instead of offering a sold-out room", async () => {
    closeKingRooms();

    const response = await enterReview();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no availability" });
    expect(count("public_checkouts")).toBe(0);
    expect(count("quotes")).toBe(0);
  });
});

describe("new-quote limit", () => {
  it("counts new checkouts and refreshed quotes per trusted source IP", async () => {
    const keys: string[] = [];
    db.env.QUOTE_LIMITER = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    };
    const { token } = await started();

    await guest("/public/checkout/quotes", { token, method: "POST" });
    await guest("/public/checkout", { token, headers: { "x-forwarded-for": "198.51.100.1" } });
    await accept(token, { quoteId: crypto.randomUUID() });

    expect(keys).toEqual(["203.0.113.9", "203.0.113.9"]);
  });

  it("answers 429 with a retry delay before validating or storing anything", async () => {
    db.env.QUOTE_LIMITER = { limit: async () => ({ success: false }) };

    const response = await enterReview({ checkIn: "not-a-date" });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({ error: "too many quotes" });
    expect(count("public_checkouts")).toBe(0);
  });
});

describe("checkout access", () => {
  it("reads the checkout only with its token", async () => {
    const view = await started();
    const { token, ...expected } = view;

    const response = await guest("/public/checkout", { token });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
  });

  it.each([
    ["no credential", () => ({})],
    ["a guessed token", () => ({ authorization: `Bearer ${"A".repeat(43)}` })],
    ["the quote ID", (quoteId: string) => ({ authorization: `Bearer ${quoteId}` })],
    ["the booking email", () => ({ authorization: `Bearer ${contact.email}` })],
    ["a non-bearer scheme", (_id: string, token: string) => ({ authorization: `Basic ${token}` })],
  ])("refuses %s", async (_name, credential) => {
    const { quote, token } = await started();

    const response = await guest("/public/checkout", { headers: credential(quote.id, token) });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid checkout token" });
  });

  it("accepts the bearer scheme in any letter case", async () => {
    const { token } = await started();

    const response = await guest("/public/checkout", {
      headers: { authorization: `bearer ${token}` },
    });

    expect(response.status).toBe(200);
  });

  it("keeps the token readable through 30 days after checkout, then refuses it as invalid", async () => {
    const { token } = await started();

    vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
    const lastDay = await guest("/public/checkout", { token });
    vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
    const expired = await guest("/public/checkout", { token });

    expect(lastDay.status).toBe(200);
    expect(expired.status).toBe(401);
    expect(await expired.json()).toEqual({ error: "invalid checkout token" });
  });

  it("refuses a new quote once arrival is no longer after the property date", async () => {
    const { token } = await started();
    vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));

    const response = await guest("/public/checkout/quotes", { token, method: "POST" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "online check-in must be after today" });
    expect(count("quotes")).toBe(1);
  });

  it("does not accept a staff session as checkout access", async () => {
    await started();
    const staff = await db.request("/public/checkout");

    expect(staff.status).toBe(401);
  });

  it("does not let a checkout token reach staff routes", async () => {
    const { token } = await started();

    const response = await guest("/reservations", { token });

    expect(response.status).toBe(401);
  });

  it("does not let one checkout accept another checkout's quote", async () => {
    const first = await started();
    const second = await started({ ratePlan: "non_refundable" });

    const response = await accept(second.token, { quoteId: first.quote.id });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "quote not found" });
    expect(count("checkout_acceptances")).toBe(0);
  });

  it("keeps quotes created outside a public checkout ineligible", async () => {
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
    const { token } = await started();

    const response = await accept(token, { quoteId: legacy.id });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "quote not found" });
    expect(count("checkout_acceptances")).toBe(0);
  });

  it("allows the website to send the token cross-origin without credentials", async () => {
    const response = await app.request(
      "/public/checkout/acceptances",
      {
        method: "OPTIONS",
        headers: {
          origin: WEBSITE_ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization, content-type",
        },
      },
      db.env,
    );

    expect(response.headers.get("access-control-allow-origin")).toBe(WEBSITE_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      "authorization",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

describe("accepting the agreement", () => {
  it("records the booking contact and acceptance for the reviewed quote", async () => {
    db.sqlite.exec(`INSERT INTO guests (id, full_name, email, phone, notes, created_at)
      VALUES ('existing', 'Ana Private', 'ana@example.com', '+51911111111', 'VIP notes', '2026-01-01')`);
    const { token, quote } = await started();

    const response = await accept(token, { quoteId: quote.id, language: "en" });

    expect(response.status).toBe(201);
    const text = await response.text();
    expect(text).not.toMatch(/Ana Private|VIP notes|911111111|existing/);
    expect(JSON.parse(text)).toMatchObject({
      quote: { id: quote.id, expired: false },
      acceptance: { quoteId: quote.id, acceptedAt: "2026-10-10T15:00:00.000Z" },
    });
    expect(
      db.sqlite
        .prepare("SELECT quote_id, full_name, email, phone, language FROM checkout_acceptances")
        .all(),
    ).toEqual([
      {
        quote_id: quote.id,
        full_name: "Ana Torres",
        email: "ana@example.com",
        phone: "+51987654321",
        language: "en",
      },
    ]);
    expect(count("guests")).toBe(1);
    expect(count("reservations")).toBe(0);
  });

  it("records a language change as a new acceptance of the same offer", async () => {
    const { token, quote } = await started();
    await accept(token, { quoteId: quote.id, language: "es" });

    const response = await accept(token, { quoteId: quote.id, language: "en" });

    expect(response.status).toBe(201);
    const view = (await response.json()) as CheckoutView;
    expect(view).toMatchObject({
      language: "en",
      quote: { id: quote.id, totalCents: quote.totalCents },
      acceptance: { quoteId: quote.id },
    });
    expect(
      db.sqlite.prepare("SELECT language FROM checkout_acceptances ORDER BY rowid").all(),
    ).toEqual([{ language: "es" }, { language: "en" }]);
    expect(count("quotes")).toBe(1);
  });

  it("treats an identical repeated acceptance as the same acceptance", async () => {
    const { token, quote } = await started();
    const first = await accept(token, { quoteId: quote.id });
    vi.setSystemTime(new Date("2026-10-10T15:01:00Z"));

    const repeated = await accept(token, {
      quoteId: quote.id,
      contact: { ...contact, phone: "+51 987654321" },
    });

    expect(repeated.status).toBe(201);
    expect(((await repeated.json()) as CheckoutView).acceptance).toEqual(
      ((await first.json()) as CheckoutView).acceptance,
    );
    expect(count("checkout_acceptances")).toBe(1);
  });

  it("caps changed acceptances per checkout while an identical retry still succeeds", async () => {
    const { token, quote } = await started();
    for (let attempt = 1; attempt <= 20; attempt++)
      expect(
        (
          await accept(token, {
            quoteId: quote.id,
            contact: { ...contact, fullName: `Ana ${attempt}` },
          })
        ).status,
      ).toBe(201);

    const changed = await accept(token, {
      quoteId: quote.id,
      contact: { ...contact, fullName: "Ana 21" },
    });
    const retried = await accept(token, {
      quoteId: quote.id,
      contact: { ...contact, fullName: "Ana 20" },
    });

    expect(changed.status).toBe(429);
    expect(await changed.json()).toEqual({ error: "too many acceptances for this checkout" });
    expect(retried.status).toBe(201);
    expect(count("checkout_acceptances")).toBe(20);
  });

  it("accepts only the checkout's latest quote", async () => {
    const { token, quote } = await started();
    await guest("/public/checkout/quotes", { token, method: "POST" });

    const response = await accept(token, { quoteId: quote.id });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "quote was replaced by a newer quote" });
    expect(count("checkout_acceptances")).toBe(0);
  });

  it("refuses acceptance once arrival is no longer after the property date", async () => {
    vi.setSystemTime(new Date("2026-10-11T04:58:00Z"));
    const { token, quote } = await started({ checkIn: "2026-10-11", checkOut: "2026-10-12" });
    vi.setSystemTime(new Date("2026-10-11T05:01:00Z"));

    const response = await accept(token, { quoteId: quote.id });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "online check-in must be after today" });
    expect(count("checkout_acceptances")).toBe(0);
  });

  it.each([
    ["no phone", { contact: { fullName: "Ana", email: "ana@example.com" } }, "phone is required"],
    ["no email", { contact: { fullName: "Ana", phone: "987654321" } }, "email is required"],
    ["a blank name", { contact: { ...contact, fullName: "  " } }, "full name is required"],
    ["an invalid email", { contact: { ...contact, email: "ana@" } }, "invalid email"],
    ["a phone with letters", { contact: { ...contact, phone: "abc" } }, "invalid phone number"],
    ["a short phone", { contact: { ...contact, phone: "12" } }, "phone number is too short"],
    [
      "a long phone",
      { contact: { ...contact, phone: "98765432198765432101" } },
      "phone number is too long",
    ],
    [
      "a phone extension",
      { contact: { ...contact, phone: "987654321 ext. 12" } },
      "phone extensions are not supported",
    ],
    ["an unchecked agreement", { agreed: false }, "agreement must be accepted"],
    [
      "extra guest details",
      { contact: { ...contact, documentNumber: "123" } },
      'Unrecognized key: "documentNumber"',
    ],
  ])("refuses %s", async (_name, body, error) => {
    const { token, quote } = await started();

    const response = await accept(token, { quoteId: quote.id, ...body });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(count("checkout_acceptances")).toBe(0);
  });

  it("refuses an expired quote and accepts its refreshed replacement at current prices", async () => {
    const { token, quote } = await started();
    vi.setSystemTime(new Date("2026-10-10T15:10:00Z"));
    db.sqlite.exec(
      "INSERT INTO room_type_rates (id, room_type_id, date, price_cents) VALUES ('rate', 'type-king', '2026-10-20', 15000)",
    );

    const expired = await accept(token, { quoteId: quote.id });
    const read = (await (await guest("/public/checkout", { token })).json()) as CheckoutView;
    const refreshed = await guest("/public/checkout/quotes", { token, method: "POST" });

    expect(expired.status).toBe(400);
    expect(await expired.json()).toEqual({ error: "quote has expired" });
    expect(read.quote).toMatchObject({ id: quote.id, expired: true });
    expect(refreshed.status).toBe(201);
    const replacement = ((await refreshed.json()) as CheckoutView).quote;
    expect(replacement).toMatchObject({ expired: false, totalCents: 25000 });
    expect(replacement.id).not.toBe(quote.id);
    expect((await accept(token, { quoteId: replacement.id })).status).toBe(201);
  });

  it("reports availability loss when refreshing a quote for a sold-out stay", async () => {
    const { token } = await started();
    closeKingRooms();

    const response = await guest("/public/checkout/quotes", { token, method: "POST" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no availability" });
    expect(count("quotes")).toBe(1);
  });
});
