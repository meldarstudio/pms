import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  resetConfirmationHooks,
  skipNextConfirmationIntent,
  whenRepairingConfirmation,
} from "../confirmation-intents";
import worker, { app } from "../index";
import { PORTAL_ORIGIN, WEBSITE_ORIGIN } from "../test-support/auth";
import { CULQI_TEST_KEY, fakeCulqi, type FakeCulqi } from "../test-support/culqi";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "../test-support/d1";
import {
  externalServices,
  fakeTurnstile,
  TURNSTILE_PASS,
  TURNSTILE_TEST_SECRET,
  type FakeTurnstile,
} from "../test-support/turnstile";

let db: TestDb;
let culqi: FakeCulqi;
let turnstile: FakeTurnstile;

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
  await admitPayments(true);
});

afterEach(() => {
  resetConfirmationHooks();
  db.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const contact = { fullName: "Ana Torres", email: "ana@example.com", phone: "987 654 321" };

function guest(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  return app.request(
    path,
    {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        origin: WEBSITE_ORIGIN,
        "cf-connecting-ip": "203.0.113.9",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    },
    db.env,
    {
      waitUntil: () => {},
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
  const { token, quote } = (await created.json()) as { token: string; quote: { id: string } };
  const accepted = await guest("/public/checkout/acceptances", {
    token,
    body: { quoteId: quote.id, language: "en", contact, agreed: true },
  });
  expect(accepted.status).toBe(201);
  return { token, quoteId: quote.id };
}

const pay = (checkout: { token: string; quoteId: string }, body: Record<string, unknown> = {}) =>
  guest("/public/checkout/payments", {
    token: checkout.token,
    body: {
      quoteId: checkout.quoteId,
      sourceId: `tkn_test_${crypto.randomUUID()}`,
      turnstileToken: TURNSTILE_PASS,
      ...body,
    },
  });

async function paid(checkout: { token: string; quoteId: string }) {
  const response = await pay(checkout);
  expect(response.status).toBe(201);
  return response;
}

async function runScheduled() {
  const scheduled: Promise<unknown>[] = [];
  worker.scheduled({} as ScheduledController, db.env, {
    waitUntil: (task: Promise<unknown>) => scheduled.push(task),
  } as unknown as ExecutionContext);
  await Promise.all(scheduled);
}

const rows = <T>(sql: string) => db.sqlite.prepare(sql).all() as T[];

type IntentRow = {
  id: string;
  reservation_id: string;
  attempt_id: string;
  acceptance_id: string;
  recipient_email: string;
  language: string;
};

const intents = () =>
  rows<IntentRow>(
    "SELECT id, reservation_id, attempt_id, acceptance_id, recipient_email, language FROM confirmation_intents ORDER BY id",
  );

const charges = () => culqi.requests.filter((request) => request.method === "POST");
const listed = () => culqi.requests.filter((request) => request.method === "GET");

function bare(path: string, authorization?: string) {
  return app.request(
    path,
    {
      headers: {
        origin: PORTAL_ORIGIN,
        ...(authorization === undefined ? {} : { authorization }),
      },
    },
    db.env,
  );
}

async function command(id: string, actions: unknown[]) {
  const response = await db.request(`/reservations/${id}/commands`, "POST", {
    requestId: crypto.randomUUID(),
    actions,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json() as Promise<{
    payments: { id: string }[];
    coupons: { code: string }[];
    refunds: { id: string }[];
  }>;
}

async function reservationFor(checkoutToken: string) {
  const access = await guest("/public/checkout/access", { token: checkoutToken });
  expect(access.status).toBe(200);
  const { token } = (await access.json()) as { token: string };
  return db.sqlite
    .prepare(
      "SELECT r.id, r.code FROM reservations r JOIN reservation_access a ON a.reservation_id = r.id WHERE a.token = ?",
    )
    .get(token) as { id: string; code: string };
}

describe("confirmation intents", () => {
  it("records one intent from the attempt email and acceptance language when a public charge confirms", async () => {
    const checkout = await acceptedCheckout();

    await paid(checkout);

    const [attempt] = rows<{ id: string; acceptance_id: string; email: string; language: string }>(
      "SELECT id, acceptance_id, email, language FROM payment_attempts",
    );
    expect(intents()).toEqual([
      {
        id: expect.any(String),
        reservation_id: expect.any(String),
        attempt_id: attempt!.id,
        acceptance_id: attempt!.acceptance_id,
        recipient_email: "ana@example.com",
        language: "en",
      },
    ]);
    expect(attempt!.email).toBe("ana@example.com");
    expect(rows("SELECT confirmation_owed FROM reservations")).toEqual([{ confirmation_owed: 1 }]);
    expect(rows("SELECT id FROM payments")).toHaveLength(1);
  });

  it("records that same intent once when the scheduled worker confirms a lost charge", async () => {
    const checkout = await acceptedCheckout();
    culqi.next("POST /charges", "lose");
    await paid(checkout);

    await runScheduled();
    await runScheduled();

    expect(intents()).toEqual([
      expect.objectContaining({ recipient_email: "ana@example.com", language: "en" }),
    ]);
    expect(rows("SELECT status FROM reservations")).toEqual([{ status: "confirmed" }]);
    expect(rows("SELECT id FROM payments")).toHaveLength(1);
    expect(charges()).toHaveLength(1);
  });

  it("uses Spanish only when the stored attempt language is null", async () => {
    const checkout = await acceptedCheckout();
    culqi.next("POST /charges", "lose");
    await paid(checkout);
    db.sqlite.exec("UPDATE payment_attempts SET language = NULL");

    await runScheduled();

    expect(intents()).toEqual([
      expect.objectContaining({ recipient_email: "ana@example.com", language: "es" }),
    ]);
    expect(rows<{ language: null }>("SELECT language FROM payment_attempts")).toEqual([
      { language: null },
    ]);
  });

  it("creates no intent and no owed flag for an unfulfilled, declined, unknown, or unsaved charge", async () => {
    const unfulfilled = await acceptedCheckout();
    culqi.next("POST /charges", "lose");
    await paid(unfulfilled);
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
    const resolved = await guest("/public/checkout/payment", { token: unfulfilled.token });
    expect(resolved.status).toBe(200);
    expect(await resolved.json()).toMatchObject({ payment: { state: "unfulfilled" } });

    const declined = await pay(
      await acceptedCheckout({ checkIn: "2026-11-01", checkOut: "2026-11-03" }),
      {
        sourceId: "tkn_test_decline",
      },
    );
    expect(declined.status).toBe(201);

    const unknown = await acceptedCheckout({ checkIn: "2026-12-01", checkOut: "2026-12-03" });
    culqi.next("POST /charges", "timeout");
    expect((await pay(unknown)).status).toBe(201);

    const unsaved = await acceptedCheckout({ checkIn: "2027-01-01", checkOut: "2027-01-03" });
    db.beforeCommit(() => {
      throw new Error("D1 is unavailable");
    });
    expect((await pay(unsaved)).status).toBe(201);

    expect(intents()).toEqual([]);
    expect(rows("SELECT status, confirmation_owed FROM reservations ORDER BY status")).toEqual([
      { status: "confirmed", confirmation_owed: 0 },
      { status: "confirmed", confirmation_owed: 0 },
      { status: "unfulfilled", confirmation_owed: 0 },
    ]);
    expect(rows("SELECT status FROM payment_attempts ORDER BY status")).toEqual([
      { status: "failed" },
      { status: "saved" },
      { status: "succeeded" },
      { status: "unknown" },
    ]);
  });

  it("does not give a desk reservation or a pre-migration eligible reservation an intent when scheduled runs", async () => {
    const legacy = await acceptedCheckout();
    await paid(legacy);
    db.sqlite.exec("DELETE FROM confirmation_intents");
    db.sqlite.exec("UPDATE reservations SET confirmation_owed = 0");
    const desk = await db.request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      guest: { fullName: "Desk Guest" },
      rooms: [{ roomTypeId: "type-king", adults: 1, children: 0 }],
    });
    expect(desk.status).toBe(201);

    await runScheduled();

    expect(intents()).toEqual([]);
    expect(rows("SELECT source, confirmation_owed FROM reservations ORDER BY source")).toEqual([
      { source: "desk", confirmation_owed: 0 },
      { source: "online", confirmation_owed: 0 },
    ]);
    expect(charges()).toHaveLength(1);
    expect(listed()).toEqual([]);
  });

  it("does not add an intent when staff cancel, restore, refund, or issue a coupon", async () => {
    const stay = await acceptedCheckout();
    await paid(stay);
    const id = (await reservationFor(stay.token))!.id;
    await command(id, [{ type: "set-status", status: "cancelled" }]);
    await command(id, [{ type: "set-status", status: "confirmed" }]);

    const refunded = await acceptedCheckout({ checkIn: "2026-11-01", checkOut: "2026-11-03" });
    await paid(refunded);
    const refundId = (await reservationFor(refunded.token))!.id;
    const detail = (await (await db.request(`/reservations/${refundId}`)).json()) as {
      payments: { id: string }[];
    };
    await command(refundId, [{ type: "set-status", status: "cancelled" }]);
    await command(refundId, [
      {
        type: "request-refund",
        paymentId: detail.payments[0]!.id,
        amountCents: 10000,
        method: "transfer",
        reason: "Guest asked",
      },
    ]);

    const source = await db.request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      guest: { fullName: "Coupon Source" },
      rooms: [{ roomTypeId: "type-king", adults: 1, children: 0 }],
    });
    expect(source.status).toBe(201);
    const sourceId = ((await source.json()) as { id: string }).id;
    await command(sourceId, [
      {
        type: "add-payment",
        payment: { amountCents: 10000, method: "cash", paymentDate: "2026-10-10" },
      },
      { type: "set-status", status: "cancelled" },
    ]);
    const issued = await command(sourceId, [
      { type: "issue-coupon", amountCents: 10000, guestAccepted: true },
    ]);
    const later = await acceptedCheckout({ checkIn: "2026-12-01", checkOut: "2026-12-03" });
    await paid(later);
    await command((await reservationFor(later.token))!.id, [
      { type: "redeem-coupon", code: issued.coupons[0]!.code, amountCents: 10000 },
    ]);

    expect(intents()).toHaveLength(3);
    expect(
      rows<{ source: string; n: number }>(
        "SELECT r.source, count(i.id) AS n FROM reservations r LEFT JOIN confirmation_intents i ON i.reservation_id = r.id GROUP BY r.source ORDER BY r.source",
      ),
    ).toEqual([
      { source: "desk", n: 0 },
      { source: "online", n: 3 },
    ]);
  });

  it("repairs one skipped intent after the reservation and attempt are already saved, without another payment", async () => {
    const checkout = await acceptedCheckout();
    skipNextConfirmationIntent();
    await paid(checkout);
    expect(intents()).toEqual([]);
    expect(rows("SELECT status, confirmation_owed FROM reservations")).toEqual([
      { status: "confirmed", confirmation_owed: 1 },
    ]);
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "saved" }]);
    db.sqlite.exec("UPDATE guests SET email = 'later@example.com'");
    const listedBefore = listed().length;

    await runScheduled();
    const [intent] = intents();
    await runScheduled();
    const replay = await pay(checkout);
    db.sqlite.exec("UPDATE payment_attempts SET status = 'succeeded'");
    await runScheduled();

    expect(replay.status).toBe(200);
    expect(intents()).toEqual([
      {
        ...intent,
        recipient_email: "ana@example.com",
        language: "en",
      },
    ]);
    expect(rows("SELECT id FROM payments")).toHaveLength(1);
    expect(rows("SELECT status FROM payment_attempts")).toEqual([{ status: "saved" }]);
    expect(charges()).toHaveLength(1);
    expect(listed()).toHaveLength(listedBefore);
  });

  it("inserts one row when two repairs overlap", async () => {
    const checkout = await acceptedCheckout();
    skipNextConfirmationIntent();
    await paid(checkout);
    let entered = 0;
    let release: () => void = () => {};
    const both = new Promise<void>((resolve) => {
      release = resolve;
    });
    whenRepairingConfirmation(async () => {
      entered += 1;
      if (entered === 2) release();
      await both;
    });

    await Promise.all([runScheduled(), runScheduled()]);

    expect(entered).toBe(2);
    expect(intents()).toHaveLength(1);
    expect(rows("SELECT id FROM payments")).toHaveLength(1);
    expect(charges()).toHaveLength(1);
  });

  it("shows the intent to staff and the owner, and hides it from guests and bearers", async () => {
    const checkout = await acceptedCheckout();
    await paid(checkout);
    const saved = (await reservationFor(checkout.token))!;
    const [intent] = intents();
    const [attempt] = rows<{ id: string; acceptance_id: string }>(
      "SELECT id, acceptance_id FROM payment_attempts",
    );
    const expected = {
      id: intent!.id,
      recipientEmail: "ana@example.com",
      language: "en",
      attemptId: attempt!.id,
      acceptanceId: attempt!.acceptance_id,
      createdAt: "2026-10-10T15:00:00.000Z",
      reservation: { id: saved.id, code: saved.code, status: "confirmed" },
    };

    const staff = await db.request(`/reservations/${saved.id}/confirmation`);
    expect(staff.status).toBe(200);
    expect(staff.headers.get("cache-control")).toBe("private, no-store");
    expect(await staff.json()).toEqual(expected);
    await db.signIn("owner");
    const owner = await db.request(`/reservations/${saved.id}/confirmation`);
    expect(owner.status).toBe(200);
    expect(await owner.json()).toEqual(expected);

    const missing = await db.request("/reservations/missing/confirmation");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
    expect(await missing.json()).toEqual({ error: "reservation not found" });

    const desk = await db.request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      guest: { fullName: "Desk Guest" },
      rooms: [{ roomTypeId: "type-king", adults: 1, children: 0 }],
    });
    const deskId = ((await desk.json()) as { id: string }).id;
    const absent = await db.request(`/reservations/${deskId}/confirmation`);
    expect(absent.status).toBe(404);
    expect(absent.headers.get("cache-control")).toBe("private, no-store");
    expect(await absent.json()).toEqual({ error: "confirmation was not established" });
    expect(intents()).toHaveLength(1);

    const [access] = rows<{ token: string }>("SELECT token FROM reservation_access");
    for (const authorization of [
      undefined,
      `Bearer ${access!.token}`,
      `Bearer ${checkout.token}`,
    ]) {
      const hidden = await bare(`/reservations/${saved.id}/confirmation`, authorization);
      expect(hidden.status).toBe(401);
      expect(await hidden.json()).toEqual({ error: "unauthorized" });
    }
    expect(intents()).toHaveLength(1);

    const payment = await guest("/public/checkout/payment", { token: checkout.token });
    const summary = await guest("/public/reservation", { token: access!.token });
    expect(payment.status).toBe(200);
    expect(summary.status).toBe(200);
    for (const body of [
      JSON.stringify(await payment.json()),
      JSON.stringify(await summary.json()),
    ]) {
      expect(body).not.toContain("recipientEmail");
      expect(body).not.toContain(intent!.id);
      expect(body).not.toContain("ana@example.com");
    }
  });
});
