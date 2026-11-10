import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import worker, { app } from "../index";
import { ACCOUNTS, WEBSITE_ORIGIN } from "../test-support/auth";
import { CULQI_TEST_KEY, fakeCulqi, type FakeCulqi } from "../test-support/culqi";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "../test-support/d1";
import {
  externalServices,
  fakeTurnstile,
  TURNSTILE_PASS,
  TURNSTILE_TEST_SECRET,
  type FakeTurnstile,
} from "../test-support/turnstile";

type Summary = {
  status: string;
  code: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  fullName: string;
  rooms: {
    roomTypeId: string;
    adults: number;
    children: number;
    nights: { date: string; priceCents: number }[];
  }[];
  ratePlan: string;
  cancellation?: {
    freeCancellation: string;
    freeUntil: string | null;
    chargeCents: number;
  };
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  refundDueCents: number;
  refundedCents: number;
};

type AccessLink = { token: string; expiresOn: string; expired?: boolean };

let db: TestDb;
let culqi: FakeCulqi;
let turnstile: FakeTurnstile;
let tasks: Promise<unknown>[];

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type-king", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRoomType(db.sqlite, { id: "type-twin", name: "Twin", maxAdults: 2, baseRateCents: 15000 });
  seedRooms(db.sqlite, "type-king", { "room-101": "101", "room-102": "102" });
  seedRooms(db.sqlite, "type-twin", { "room-201": "201" });
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
  init: { method?: string; body?: unknown; token?: string; cookie?: string; ip?: string } = {},
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
        ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
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

async function acceptedCheckout(selection: Record<string, unknown> = {}) {
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
  const body = (await created.json()) as { token: string; quote: { id: string } };
  const accepted = await guest("/public/checkout/acceptances", {
    token: body.token,
    body: { quoteId: body.quote.id, language: "en", contact, agreed: true },
  });
  expect(accepted.status).toBe(201);
  return { token: body.token, quoteId: body.quote.id };
}

const card = () => `tkn_test_${crypto.randomUUID()}`;

const pay = (checkout: { token: string; quoteId: string }, body: Record<string, unknown> = {}) =>
  guest("/public/checkout/payments", {
    token: checkout.token,
    body: {
      quoteId: checkout.quoteId,
      sourceId: card(),
      turnstileToken: TURNSTILE_PASS,
      ...body,
    },
  });

async function paid(checkout: { token: string; quoteId: string }) {
  const response = await pay(checkout);
  expect(response.status).toBe(201);
  return response.json();
}

const rows = <T>(sql: string) => db.sqlite.prepare(sql).all() as T[];

const accessRows = () =>
  rows<{ reservation_id: string; token: string; token_hash: string; expires_on: string }>(
    "SELECT reservation_id, token, token_hash, expires_on FROM reservation_access ORDER BY reservation_id",
  );

async function reservationId() {
  const [row] = rows<{ id: string }>(
    "SELECT id FROM reservations WHERE public_checkout_id IS NOT NULL ORDER BY created_at, rowid",
  );
  return row!.id;
}

async function staffDetail(id: string) {
  const response = await db.request(`/reservations/${id}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    id: string;
    code: string;
    rooms: { id: string }[];
    payments: { id: string }[];
    coupons: { code: string }[];
  }>;
}

async function command(id: string, actions: unknown[]) {
  const response = await db.request(`/reservations/${id}/commands`, "POST", {
    requestId: crypto.randomUUID(),
    actions,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json() as Promise<{
    coupons: { code: string }[];
    payments: { id: string }[];
    refunds: { id: string }[];
  }>;
}

async function summary(token: string) {
  const response = await guest("/public/reservation", { token });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json() as Promise<Summary>;
}

async function checkoutAccess(token: string) {
  const response = await guest("/public/checkout/access", { token });
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response;
}

async function staffAccess(id: string) {
  const response = await db.request(`/reservations/${id}/access`);
  return response;
}

async function staffCookie() {
  const login = await app.request(
    "/login",
    {
      method: "POST",
      headers: {
        origin: "https://app.hotelmanantialchurin.com",
        "content-type": "application/json",
      },
      body: JSON.stringify(ACCOUNTS.staff),
    },
    db.env,
  );
  expect(login.status).toBe(200);
  return login.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0]!)
    .join("; ");
}

const hidden = (body: unknown, secrets: string[]) => {
  const text = JSON.stringify(body);
  for (const secret of secrets) expect(text).not.toContain(secret);
};

describe("private reservation summary", () => {
  it("shows the saved stay, gross payment and accepted terms, and follows staff price edits rather than the live rate table", async () => {
    const checkout = await acceptedCheckout();
    expect((await checkoutAccess(checkout.token)).status).toBe(404);
    await paid(checkout);
    const link = (await (await checkoutAccess(checkout.token)).json()) as AccessLink;
    const id = await reservationId();
    const detail = await staffDetail(id);
    const saved = await summary(link.token);

    expect(link).toEqual({ token: expect.stringMatching(/^[\w-]{43}$/), expiresOn: "2026-11-21" });
    expect(saved).toEqual({
      status: "confirmed",
      code: detail.code,
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
      nights: 2,
      currency: "PEN",
      fullName: "Ana Torres",
      rooms: [
        {
          roomTypeId: "type-king",
          adults: 2,
          children: 0,
          nights: [
            { date: "2026-10-20", priceCents: 10000 },
            { date: "2026-10-21", priceCents: 10000 },
          ],
        },
      ],
      ratePlan: "flexible",
      cancellation: { freeCancellation: "available", freeUntil: "2026-10-18", chargeCents: 10000 },
      totalCents: 20000,
      paidCents: 10000,
      outstandingCents: 10000,
      refundDueCents: 0,
      refundedCents: 0,
    });
    hidden(saved, [
      link.token,
      checkout.token,
      checkout.quoteId,
      contact.email,
      "+51987654321",
      "room-101",
      "101",
      "hotelmanantial",
    ]);

    db.sqlite.exec("UPDATE room_types SET base_rate_cents = 99999 WHERE id = 'type-king'");
    expect(await summary(link.token)).toEqual(saved);

    await command(id, [
      {
        type: "edit-room",
        lineId: detail.rooms[0]!.id,
        room: { roomTypeId: "type-twin", adults: 2, children: 0, roomId: null },
      },
    ]);
    await command(id, [
      { type: "notes", notes: "VIP arrival" },
      {
        type: "set-guests",
        guests: [
          {
            id: crypto.randomUUID(),
            fullName: "Secret Guest",
            email: "secret@example.com",
            phone: null,
          },
        ],
      },
    ]);

    const edited = await summary(link.token);
    expect(edited.rooms).toEqual([
      {
        roomTypeId: "type-twin",
        adults: 2,
        children: 0,
        nights: [
          { date: "2026-10-20", priceCents: 15000 },
          { date: "2026-10-21", priceCents: 15000 },
        ],
      },
    ]);
    expect(edited).toMatchObject({
      totalCents: 30000,
      paidCents: 10000,
      outstandingCents: 20000,
      cancellation: { chargeCents: 15000, freeUntil: "2026-10-18" },
    });
    hidden(edited, ["VIP arrival", "Secret Guest", "secret@example.com", link.token]);
    expect(accessRows()).toHaveLength(1);
  });

  it("keeps a pending refund and a coupon out of money returned, then counts only a completed refund", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout);
    const link = (await (await checkoutAccess(checkout.token)).json()) as AccessLink;
    const id = await reservationId();
    const detail = await staffDetail(id);
    await command(id, [{ type: "set-status", status: "cancelled" }]);
    const requested = await command(id, [
      {
        type: "request-refund",
        paymentId: detail.payments[0]!.id,
        amountCents: 10000,
        method: "transfer",
        reason: "Guest asked",
      },
    ]);

    expect(await summary(link.token)).toMatchObject({
      status: "cancelled",
      paidCents: 10000,
      refundedCents: 0,
      refundDueCents: 10000,
      outstandingCents: 0,
      totalCents: 0,
    });
    expect(await summary(link.token)).not.toHaveProperty("cancellation");
    hidden(await summary(link.token), ["Guest asked"]);

    await command(id, [
      {
        type: "complete-refund",
        refundId: requested.refunds[0]!.id,
        refundDate: "2026-10-10",
        reference: "op-778",
      },
    ]);
    const refunded = await summary(link.token);
    expect(refunded).toMatchObject({
      paidCents: 10000,
      refundedCents: 10000,
      refundDueCents: 0,
      outstandingCents: 0,
    });
    hidden(refunded, ["OP-778", "op-778"]);

    const issuer = await db.request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-11-01",
      checkOut: "2026-11-02",
      guest: { fullName: "Coupon Source" },
      rooms: [{ roomTypeId: "type-king", adults: 1, children: 0 }],
    });
    expect(issuer.status).toBe(201);
    const source = (await issuer.json()) as { id: string; payments: { id: string }[] };
    await command(source.id, [
      {
        type: "add-payment",
        payment: { amountCents: 10000, method: "cash", paymentDate: "2026-10-10" },
      },
      { type: "set-status", status: "cancelled" },
    ]);
    const issued = await command(source.id, [
      { type: "issue-coupon", amountCents: 10000, guestAccepted: true },
    ]);
    const later = await acceptedCheckout({ checkIn: "2026-12-01", checkOut: "2026-12-03" });
    await paid(later);
    const laterLink = (await (await checkoutAccess(later.token)).json()) as AccessLink;
    const laterId = rows<{ id: string }>(
      "SELECT id FROM reservations WHERE public_checkout_id IS NOT NULL ORDER BY created_at DESC, rowid DESC",
    )[0]!.id;
    await command(laterId, [
      { type: "redeem-coupon", code: issued.coupons[0]!.code, amountCents: 10000 },
    ]);

    const settled = await summary(laterLink.token);
    expect(settled).toMatchObject({
      status: "confirmed",
      paidCents: 10000,
      refundedCents: 0,
      outstandingCents: 0,
      refundDueCents: 0,
      totalCents: 20000,
    });
    hidden(settled, [issued.coupons[0]!.code, "coupon"]);
  });

  it("refuses another reservation's credentials, a checkout token and a staff session, and the access token cannot pay or open staff routes", async () => {
    const first = await acceptedCheckout();
    await paid(first);
    const firstLink = (await (await checkoutAccess(first.token)).json()) as AccessLink;
    const second = await acceptedCheckout({ checkIn: "2026-11-10", checkOut: "2026-11-12" });
    await paid(second);
    const secondLink = (await (await checkoutAccess(second.token)).json()) as AccessLink;
    const secondDetail = await staffDetail(
      rows<{ id: string }>("SELECT id FROM reservations ORDER BY created_at DESC, rowid DESC")[0]!
        .id,
    );
    const opened = await summary(firstLink.token);
    expect(opened.code).not.toBe(secondDetail.code);
    hidden(opened, [secondLink.token, secondDetail.code, second.token]);

    const cookie = await staffCookie();
    for (const credential of [
      secondDetail.code,
      contact.email,
      "+51987654321",
      first.quoteId,
      first.token,
      "not-a-token",
    ]) {
      const refused = await guest("/public/reservation", { token: credential });
      expect(refused.status).toBe(401);
      expect(await refused.json()).toEqual({ error: "invalid reservation access" });
    }
    const session = await guest("/public/reservation", { cookie });
    expect(session.status).toBe(401);
    expect(await session.json()).toEqual({ error: "invalid reservation access" });
    const queried = await guest(`/public/reservation?token=${firstLink.token}`);
    expect(queried.status).toBe(401);
    expect(await queried.json()).toEqual({ error: "invalid reservation access" });

    const payWithAccess = await guest("/public/checkout/payments", {
      token: firstLink.token,
      body: { quoteId: first.quoteId, sourceId: card(), turnstileToken: TURNSTILE_PASS },
    });
    expect(payWithAccess.status).toBe(401);
    hidden(await payWithAccess.json(), [opened.code, contact.email, firstLink.token]);

    const commandWithAccess = await guest(`/reservations/${secondDetail.id}/commands`, {
      token: firstLink.token,
      body: {
        requestId: crypto.randomUUID(),
        actions: [{ type: "set-status", status: "cancelled" }],
      },
    });
    expect(commandWithAccess.status).toBe(401);
    const detailWithAccess = await guest(`/reservations/${secondDetail.id}`, {
      token: firstLink.token,
    });
    expect(detailWithAccess.status).toBe(401);
    hidden(await detailWithAccess.json(), [secondDetail.code, contact.email]);
    expect((await staffDetail(secondDetail.id)).code).toBe(secondDetail.code);
  });

  it("refuses an expired token the same way as an unknown one, without stopping payment recovery", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout);
    const link = (await (await checkoutAccess(checkout.token)).json()) as AccessLink;
    const before = accessRows();
    const code = (await summary(link.token)).code;

    vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
    expect((await summary(link.token)).code).toBe(code);

    vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
    const expired = await guest("/public/reservation", { token: link.token });
    const garbage = await guest("/public/reservation", { token: "a".repeat(43) });
    const expiredBody = await expired.json();
    expect(expired.status).toBe(401);
    expect(expiredBody).toEqual(await garbage.json());
    expect(expiredBody).toEqual({ error: "invalid reservation access" });
    expect(accessRows()).toEqual(before);

    const later = await acceptedCheckout({ checkIn: "2026-12-01", checkOut: "2026-12-03" });
    culqi.next("POST /charges", "lose");
    const lost = await pay(later);
    expect(lost.status).toBe(201);
    const blocked = await guest("/public/reservation", { token: link.token });
    expect(blocked.status).toBe(401);
    await runScheduled();
    const recovered = await guest("/public/checkout/payment", { token: later.token });
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({
      payment: { state: "confirmed", reservation: { paidCents: 10000 } },
    });
    expect((await (await checkoutAccess(later.token)).json()) as AccessLink).toMatchObject({
      expiresOn: "2027-01-02",
    });
  });

  it("keeps the established token and expiry when staff change the dates or the link is read again", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout);
    const first = (await (await checkoutAccess(checkout.token)).json()) as AccessLink;
    const id = await reservationId();
    await command(id, [{ type: "dates", checkIn: "2026-10-20", checkOut: "2026-10-25" }]);
    const again = (await (await checkoutAccess(checkout.token)).json()) as AccessLink;
    const staff = await staffAccess(id);
    await db.signIn("owner");
    const owner = await staffAccess(id);

    expect(again).toEqual(first);
    expect(staff.status).toBe(200);
    expect(staff.headers.get("cache-control")).toBe("private, no-store");
    expect(await staff.json()).toEqual({ ...first, expired: false });
    expect(owner.status).toBe(200);
    expect(await owner.json()).toEqual({ ...first, expired: false });
    expect(await summary(first.token)).toMatchObject({
      checkOut: "2026-10-25",
      nights: 5,
    });
    expect(accessRows()).toEqual([
      expect.objectContaining({ token: first.token, expires_on: "2026-11-21" }),
    ]);

    const status = await guest("/public/checkout/payment", { token: checkout.token });
    expect(status.status).toBe(200);
    expect((await (await checkoutAccess(checkout.token)).json()) as AccessLink).toEqual(first);
    expect(accessRows()).toHaveLength(1);
  });

  it("does not create access for a desk reservation or before the public reservation is saved", async () => {
    const checkout = await acceptedCheckout();
    const missing = await checkoutAccess(checkout.token);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "reservation access was not established" });

    const declined = await pay(checkout, { sourceId: "tkn_test_decline" });
    expect(declined.status).toBe(201);
    expect((await checkoutAccess(checkout.token)).status).toBe(404);
    expect(accessRows()).toEqual([]);

    const created = await db.request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-11-01",
      checkOut: "2026-11-03",
      guest: { fullName: "Walk-in" },
      rooms: [{ roomTypeId: "type-king", adults: 1, children: 0 }],
    });
    expect(created.status).toBe(201);
    const desk = (await created.json()) as { id: string };
    const before = accessRows();
    const retrieval = await staffAccess(desk.id);
    expect(retrieval.status).toBe(404);
    expect(await retrieval.json()).toEqual({ error: "reservation access was not established" });
    expect(retrieval.headers.get("cache-control")).toBe("private, no-store");
    expect(accessRows()).toEqual(before);

    const absent = await staffAccess("00000000-0000-4000-8000-000000000000");
    expect(absent.status).toBe(404);
    expect(await absent.json()).toEqual({ error: "reservation not found" });
  });

  it("returns checkout access without charging or consuming payment allowances, including an unfulfilled stay", async () => {
    const checkout = await acceptedCheckout();
    const consumed: string[] = [];
    const counting = {
      limit: async ({ key }: { key: string }) => {
        consumed.push(key);
        return { success: false };
      },
    };
    db.env.PAYMENT_IP_LIMITER = counting;
    db.env.PAYMENT_CHECKOUT_LIMITER = counting;
    expect((await guest("/public/checkout/payment", { token: checkout.token })).status).toBe(200);
    expect((await checkoutAccess(checkout.token)).status).toBe(404);
    expect(consumed).toEqual([]);

    db.env.PAYMENT_IP_LIMITER = { limit: async () => ({ success: true }) };
    db.env.PAYMENT_CHECKOUT_LIMITER = { limit: async () => ({ success: true }) };
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
    await runScheduled();
    consumed.length = 0;
    db.env.PAYMENT_IP_LIMITER = counting;
    db.env.PAYMENT_CHECKOUT_LIMITER = counting;

    const link = (await (await checkoutAccess(checkout.token)).json()) as AccessLink;
    const body = await summary(link.token);
    expect(body).toMatchObject({
      status: "unfulfilled",
      paidCents: 10000,
      outstandingCents: 0,
      refundDueCents: 10000,
      refundedCents: 0,
      totalCents: 0,
    });
    expect(body).not.toHaveProperty("cancellation");
    expect((await guest("/public/checkout/payment", { token: checkout.token })).status).toBe(200);
    expect(consumed).toEqual([]);
    expect(culqi.requests.filter((request) => request.method === "POST")).toHaveLength(1);
  });
});

async function runScheduled() {
  const scheduled: Promise<unknown>[] = [];
  worker.scheduled({} as ScheduledController, db.env, {
    waitUntil: (task: Promise<unknown>) => scheduled.push(task),
  } as unknown as ExecutionContext);
  await Promise.all(scheduled);
}
