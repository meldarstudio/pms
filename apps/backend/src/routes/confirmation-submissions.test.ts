import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import worker, { app } from "../index";
import { WEBSITE_ORIGIN } from "../test-support/auth";
import { CULQI_TEST_KEY, fakeCulqi, type FakeCulqi } from "../test-support/culqi";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "../test-support/d1";
import { fakeResend, RESEND_LOOPBACK, RESEND_TEST_KEY } from "../test-support/resend";
import {
  externalServices,
  fakeTurnstile,
  TURNSTILE_PASS,
  TURNSTILE_TEST_SECRET,
  type FakeTurnstile,
} from "../test-support/turnstile";

const FROM = "Hotel Manantial <reservas@notificaciones.hotelmanantialchurin.com>";
const REPLY_TO = "hotelmanantialchurinperu@gmail.com";
const PHONE = "+51 992 755 015";
const WINDOW_MS = 20 * 60 * 60 * 1000;

let db: TestDb;
let culqi: FakeCulqi;
let turnstile: FakeTurnstile;
let resend: ReturnType<typeof fakeResend>;

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
  resend = fakeResend();
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "127.0.0.1") return resend.fetch(input, init);
    return externalServices({ culqi, turnstile })(input, init);
  }) as typeof fetch);
  await admitPayments(true);
});

afterEach(() => {
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

async function admitEmail(admitted: boolean) {
  await db.signIn("owner");
  const response = await db.request("/controls/email-submission", "PUT", { admitted });
  expect(response.status).toBe(200);
  await db.signIn("staff");
}

function configureResend() {
  db.env.RESEND_API_KEY = RESEND_TEST_KEY;
  db.env.RESEND_API_URL = RESEND_LOOPBACK;
}

async function acceptedCheckout(
  language: "es" | "en" = "en",
  selection: Record<string, unknown> = {},
) {
  const created = await guest("/public/checkouts", {
    body: {
      roomTypeId: "type-king",
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
      adults: 2,
      children: 0,
      ratePlan: "flexible",
      language,
      ...selection,
    },
  });
  expect(created.status).toBe(201);
  const { token, quote } = (await created.json()) as { token: string; quote: { id: string } };
  const accepted = await guest("/public/checkout/acceptances", {
    token,
    body: { quoteId: quote.id, language, contact, agreed: true },
  });
  expect(accepted.status).toBe(201);
  return { token, quoteId: quote.id };
}

async function paid(checkout: { token: string; quoteId: string }) {
  const response = await guest("/public/checkout/payments", {
    token: checkout.token,
    body: {
      quoteId: checkout.quoteId,
      sourceId: `tkn_test_${crypto.randomUUID()}`,
      turnstileToken: TURNSTILE_PASS,
    },
  });
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

type SubmissionRow = {
  id: string;
  intent_id: string;
  send_key: string | null;
  endpoint: string | null;
  request_json: string | null;
  status: string;
  provider_message_id: string | null;
  failure_code: string | null;
  first_possible_at: string | null;
  next_attempt_at: string | null;
  recipient_email: string;
  language: string;
};

const submissions = () =>
  rows<SubmissionRow>(
    "SELECT id, intent_id, send_key, endpoint, request_json, status, provider_message_id, failure_code, first_possible_at, next_attempt_at, recipient_email, language FROM confirmation_submissions ORDER BY created_at",
  );

const posts = () => resend.requests.filter((request) => request.method === "POST");

async function reservationFor(checkoutToken: string) {
  const access = await guest("/public/checkout/access", { token: checkoutToken });
  expect(access.status).toBe(200);
  const { token } = (await access.json()) as { token: string };
  return db.sqlite
    .prepare(
      "SELECT r.id, r.code, a.token FROM reservations r JOIN reservation_access a ON a.reservation_id = r.id WHERE a.token = ?",
    )
    .get(token) as { id: string; code: string; token: string };
}

async function confirmed(language: "es" | "en" = "en", selection: Record<string, unknown> = {}) {
  const checkout = await acceptedCheckout(language, selection);
  await paid(checkout);
  return { checkout, saved: (await reservationFor(checkout.token))! };
}

async function command(id: string, actions: unknown[]) {
  const response = await db.request(`/reservations/${id}/commands`, "POST", {
    requestId: crypto.randomUUID(),
    actions,
  });
  expect(response.status, await response.clone().text()).toBe(200);
}

function summaryLink(language: "es" | "en", token: string) {
  const path = language === "en" ? "/en/reservar/resumen/" : "/reservar/resumen/";
  return `https://www.hotelmanantialchurin.com${path}#${token}`;
}

function expectMessage(
  posted: { headers: Headers; body: string },
  saved: { code: string; token: string },
  language: "es" | "en",
) {
  const message = JSON.parse(posted.body) as {
    from: string;
    to: string[];
    reply_to: string;
    subject: string;
    html: string;
    text: string;
    cc?: unknown;
    bcc?: unknown;
    tags?: unknown;
  };
  const link = summaryLink(language, saved.token);
  expect(message.from).toBe(FROM);
  expect(message.to).toEqual(["ana@example.com"]);
  expect(message.reply_to).toBe(REPLY_TO);
  expect(message.cc).toBeUndefined();
  expect(message.bcc).toBeUndefined();
  expect(message.subject).toContain(saved.code);
  expect(posted.headers.get("idempotency-key")).toBe(`confirmation/${submissions()[0]?.intent_id}`);
  expect(posted.headers.get("authorization")).toBe(`Bearer ${RESEND_TEST_KEY}`);
  for (const hidden of [
    message.subject,
    posted.headers.get("idempotency-key"),
    JSON.stringify(message.tags),
  ]) {
    expect(hidden).not.toContain(saved.token);
  }
  for (const part of [message.html, message.text]) {
    expect(part).toContain(saved.code);
    expect(part).toContain("2026-10-20");
    expect(part).toContain("2026-10-22");
    expect(part).toContain("King");
    expect(part).toContain("Flexible");
    expect(part).toContain("2026-10-18");
    expect(part).toContain("S/ 200.00");
    expect(part).toContain("S/ 100.00");
    expect(part).toContain(PHONE);
    expect(part).toContain(REPLY_TO);
    expect(part).toContain(link);
    expect(part.toLowerCase()).not.toContain("paid in full");
    expect(part.toLowerCase()).not.toContain("pagado en su totalidad");
    expect(part).not.toContain("<img");
  }
  expect(message.html).toContain(`href="${link}"`);
  expect(message.html.replace(`href="${link}"`, "")).not.toContain(saved.token);
  expect(message.text.replace(link, "")).not.toContain(saved.token);
  return message;
}

describe("confirmation submissions", () => {
  it.each(["es", "en"] as const)(
    "sends one %s confirmation to the booking contact and does not post again once accepted",
    async (language) => {
      const { saved } = await confirmed(language);
      configureResend();
      await admitEmail(true);

      await runScheduled();
      await runScheduled();

      expect(posts()).toHaveLength(1);
      expect(posts()[0]!.url).toBe(`${RESEND_LOOPBACK}/emails`);
      expectMessage(posts()[0]!, saved, language);
      expect(submissions()).toEqual([
        expect.objectContaining({
          status: "accepted",
          send_key: `confirmation/${submissions()[0]?.intent_id}`,
          endpoint: `${RESEND_LOOPBACK}/emails`,
          provider_message_id: "email_1",
          recipient_email: "ana@example.com",
          language,
          request_json: posts()[0]!.body,
        }),
      ]);
      expect(rows("SELECT status FROM reservations")).toEqual([{ status: "confirmed" }]);
    },
  );

  it("retries the snapshotted body after a live rate change and a staff price edit", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("timeout");

    await runScheduled();
    const first = posts()[0]!.body;
    expect(first).toContain("S/ 200.00");
    expect(first).not.toContain("S/ 150.00");
    vi.setSystemTime(new Date(Date.now() + 60_000));
    const rates = await db.request("/room-types/type-king/rates", "PUT", {
      from: "2026-10-20",
      to: "2026-10-21",
      priceCents: 99900,
    });
    expect(rates.status).toBe(200);
    await command(saved.id, [{ type: "set-discount", amountCents: 5000 }]);

    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.body).toBe(first);
    expect(posts()[1]!.headers.get("idempotency-key")).toBe(
      posts()[0]!.headers.get("idempotency-key"),
    );
    expect(posts()[1]!.url).toBe(posts()[0]!.url);
    expect(posts()[1]!.body).not.toContain("S/ 150.00");
    expect(posts()[1]!.body).not.toContain("S/ 999.00");
    expect(submissions()).toHaveLength(1);
    expect(submissions()[0]!.request_json).toBe(first);
  });

  it("records the original id when the accepted response was lost, without a second submission", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("lose");

    await runScheduled();
    expect(posts()).toHaveLength(1);
    expect(submissions()[0]).toMatchObject({ status: "uncertain", provider_message_id: null });
    const stored = submissions()[0]!;
    db.env.RESEND_API_URL = "http://127.0.0.1:8";
    vi.setSystemTime(new Date(Date.now() + 60_000));

    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.body).toBe(posts()[0]!.body);
    expect(posts()[1]!.body).toBe(stored.request_json);
    expect(posts()[1]!.url).toBe(stored.endpoint);
    expect(posts()[1]!.headers.get("idempotency-key")).toBe(stored.send_key);
    expect(submissions()).toEqual([
      expect.objectContaining({
        id: stored.id,
        send_key: stored.send_key,
        endpoint: stored.endpoint,
        request_json: stored.request_json,
        first_possible_at: stored.first_possible_at,
        status: "accepted",
        provider_message_id: "email_1",
      }),
    ]);
    expect(resend.emails).toHaveLength(1);
  });

  it("creates one submission and one key when two scheduled runs overlap", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);

    await Promise.all([runScheduled(), runScheduled()]);

    expect(submissions()).toHaveLength(1);
    expect(new Set(posts().map((post) => post.headers.get("idempotency-key")))).toEqual(
      new Set([submissions()[0]!.send_key]),
    );
    expect(submissions()[0]!.send_key).toBe(`confirmation/${submissions()[0]!.intent_id}`);
  });

  it("does not send while paused, still reconciles a lost charge, and sends that confirmation on resume", async () => {
    const checkout = await acceptedCheckout();
    culqi.next("POST /charges", "lose");
    await paid(checkout);
    configureResend();

    await runScheduled();

    expect(rows("SELECT status FROM reservations")).toEqual([{ status: "confirmed" }]);
    expect(rows("SELECT id FROM payments")).toHaveLength(1);
    expect(rows("SELECT id FROM confirmation_intents")).toHaveLength(1);
    expect(submissions()).toEqual([]);
    expect(posts()).toEqual([]);

    await admitEmail(true);
    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(submissions()[0]).toMatchObject({ status: "accepted" });
    expect(rows("SELECT id FROM payments")).toHaveLength(1);
  });

  it("keeps an uncertain window while paused and resumes the same key", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("timeout");
    await runScheduled();
    const stored = submissions()[0]!;
    expect(stored.status).toBe("uncertain");

    await admitEmail(false);
    vi.setSystemTime(new Date(Date.now() + 60_000));
    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(submissions()[0]!.first_possible_at).toBe(stored.first_possible_at);
    expect(submissions()[0]!.send_key).toBe(stored.send_key);

    await admitEmail(true);
    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.headers.get("idempotency-key")).toBe(stored.send_key);
    expect(posts()[1]!.body).toBe(stored.request_json);
    expect(submissions()[0]!.first_possible_at).toBe(stored.first_possible_at);
  });

  it("stops an uncertain submission after 20 hours without a new key or another post", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("timeout");
    await runScheduled();
    const stored = submissions()[0]!;
    vi.setSystemTime(new Date(Date.parse(stored.first_possible_at!) + WINDOW_MS));

    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(submissions()[0]).toMatchObject({
      status: "attention",
      send_key: stored.send_key,
      first_possible_at: stored.first_possible_at,
      request_json: stored.request_json,
    });
  });

  it("keeps the reservation, payment, and access row when Resend returns 429", async () => {
    await confirmed();
    const before = {
      reservation: rows("SELECT id, status, code FROM reservations"),
      payment: rows("SELECT id, amount_cents FROM payments"),
      access: rows("SELECT reservation_id, token FROM reservation_access"),
      refunds: rows("SELECT id FROM refunds"),
    };
    configureResend();
    await admitEmail(true);
    resend.next(429);

    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(submissions()[0]).toMatchObject({
      status: "uncertain",
      failure_code: "quota",
      send_key: `confirmation/${submissions()[0]!.intent_id}`,
      provider_message_id: null,
    });
    expect(Date.parse(submissions()[0]!.next_attempt_at!) - Date.now()).toBeGreaterThanOrEqual(
      15 * 60 * 1000,
    );
    expect(rows("SELECT id, status, code FROM reservations")).toEqual(before.reservation);
    expect(rows("SELECT id, amount_cents FROM payments")).toEqual(before.payment);
    expect(rows("SELECT reservation_id, token FROM reservation_access")).toEqual(before.access);
    expect(rows("SELECT id FROM refunds")).toEqual(before.refunds);
    await runScheduled();
    expect(posts()).toHaveLength(1);
  });

  it("leaves the intent pending when the Resend key is missing", async () => {
    await confirmed();
    db.env.RESEND_API_URL = RESEND_LOOPBACK;
    await admitEmail(true);

    await runScheduled();

    expect(posts()).toEqual([]);
    expect(submissions()).toEqual([]);
    expect(rows("SELECT id FROM confirmation_intents")).toHaveLength(1);
  });

  it("records a cancelled reservation as unsent and does not send it after resume or restoration", async () => {
    const { saved } = await confirmed();
    await command(saved.id, [{ type: "set-status", status: "cancelled" }]);
    configureResend();
    await admitEmail(true);

    await runScheduled();

    expect(posts()).toEqual([]);
    expect(submissions()).toEqual([
      expect.objectContaining({
        status: "unsent",
        failure_code: "not_confirmed",
        send_key: null,
        first_possible_at: null,
        endpoint: null,
        request_json: null,
      }),
    ]);

    await admitEmail(false);
    await admitEmail(true);
    await command(saved.id, [{ type: "set-status", status: "confirmed" }]);
    await runScheduled();

    expect(posts()).toEqual([]);
    expect(submissions()).toHaveLength(1);
    expect(submissions()[0]!.status).toBe("unsent");
  });

  it("does not send for a desk reservation or a historical reservation with no intent", async () => {
    const legacy = await confirmed();
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
    configureResend();
    await admitEmail(true);

    await runScheduled();

    expect(posts()).toEqual([]);
    expect(submissions()).toEqual([]);
    expect(rows("SELECT id FROM confirmation_intents")).toEqual([]);
    expect(legacy.saved.id).toEqual(expect.any(String));
  });

  it("does not invent an access link or send when the token row is missing", async () => {
    const { saved } = await confirmed();
    db.sqlite.exec("DELETE FROM reservation_access");
    configureResend();
    await admitEmail(true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await runScheduled();

    expect(posts()).toEqual([]);
    expect(submissions()).toEqual([]);
    expect(rows("SELECT reservation_id FROM reservation_access")).toEqual([]);
    expect(rows("SELECT id FROM confirmation_intents")).toHaveLength(1);
    expect(JSON.stringify(error.mock.calls)).toContain(saved.id);
    expect(JSON.stringify(error.mock.calls)).not.toContain(saved.token);
    expect(JSON.stringify(error.mock.calls)).not.toContain("ana@example.com");
    error.mockRestore();
  });

  it("shows accepted, uncertain, and attention to staff without the body, link, or token", async () => {
    const acceptedStay = await confirmed("en");
    configureResend();
    await admitEmail(true);
    await runScheduled();
    const uncertainStay = await confirmed("en", { checkIn: "2026-11-02", checkOut: "2026-11-04" });
    resend.next("timeout");
    await runScheduled();
    const attentionStay = await confirmed("en", { checkIn: "2026-11-08", checkOut: "2026-11-10" });
    resend.next("timeout");
    await runScheduled();
    db.sqlite
      .prepare(
        `UPDATE confirmation_submissions SET first_possible_at = '2026-10-09T15:00:00.000Z', next_attempt_at = '2026-10-10T15:00:00.000Z'
         WHERE intent_id = (SELECT id FROM confirmation_intents WHERE reservation_id = ?)`,
      )
      .run(attentionStay.saved.id);
    await runScheduled();

    const read = async (id: string) => {
      const response = await db.request(`/reservations/${id}/confirmation`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      return response.json() as Promise<Record<string, unknown>>;
    };
    const accepted = await read(acceptedStay.saved.id);
    const uncertain = await read(uncertainStay.saved.id);
    const held = await read(attentionStay.saved.id);

    expect(accepted.submission).toMatchObject({ status: "accepted", providerMessageId: "email_1" });
    expect(uncertain.submission).toMatchObject({ status: "uncertain", providerMessageId: null });
    expect(held.submission).toMatchObject({ status: "attention" });
    const posted = posts().length;
    await read(acceptedStay.saved.id);
    expect(posts()).toHaveLength(posted);
    expect(submissions()).toHaveLength(3);
    for (const body of [accepted, uncertain, held]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain(acceptedStay.saved.token);
      expect(text).not.toContain(uncertainStay.saved.token);
      expect(text).not.toContain(attentionStay.saved.token);
      expect(text).not.toContain("requestJson");
      expect(text).not.toContain("reservar/resumen");
      expect(text).not.toContain(RESEND_TEST_KEY);
    }

    const payment = await guest("/public/checkout/payment", { token: acceptedStay.checkout.token });
    const summary = await guest("/public/reservation", { token: acceptedStay.saved.token });
    expect(payment.status).toBe(200);
    expect(summary.status).toBe(200);
    for (const body of [
      JSON.stringify(await payment.json()),
      JSON.stringify(await summary.json()),
    ]) {
      expect(body).not.toContain("providerMessageId");
      expect(body).not.toContain("sendKey");
    }
  });

  it("ignores a Resend address that is not on this machine", async () => {
    await confirmed();
    db.env.RESEND_API_KEY = RESEND_TEST_KEY;
    db.env.RESEND_API_URL = "https://resend.example.net";
    await admitEmail(true);
    const seen: string[] = [];
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === "api.resend.com" || url.hostname === "resend.example.net") {
        seen.push(url.href);
        return Response.json({ id: "email_default" });
      }
      return original(input, init);
    }) as typeof fetch);

    await runScheduled();

    expect(seen).toEqual(["https://api.resend.com/emails"]);
    expect(submissions()[0]!.endpoint).toBe("https://api.resend.com/emails");
    expect(submissions()[0]!.status).toBe("accepted");
  });
});

describe("email submission admission", () => {
  it("starts paused and does not change public payment admission", async () => {
    db.sqlite.exec("DELETE FROM operation_controls");
    await db.signIn("owner");

    expect(await (await db.request("/controls/email-submission")).json()).toEqual({
      admitted: false,
      updatedAt: null,
    });

    const paused = await db.request("/controls/email-submission", "PUT", { admitted: false });
    expect(paused.status).toBe(200);
    expect(await paused.json()).toMatchObject({ admitted: false });
    const payments = await db.request("/controls/public-payments", "PUT", { admitted: true });
    expect(payments.status).toBe(200);
    const email = await db.request("/controls/email-submission", "PUT", { admitted: true });
    expect(await email.json()).toMatchObject({ admitted: true });
    expect(await (await db.request("/controls/public-payments")).json()).toMatchObject({
      admitted: true,
    });
    const stopped = await db.request("/controls/email-submission", "PUT", { admitted: false });
    expect(await stopped.json()).toMatchObject({ admitted: false });
    expect(await (await db.request("/controls/public-payments")).json()).toMatchObject({
      admitted: true,
    });
  });

  it("lets only the owner read or change email submission", async () => {
    await db.signIn("staff");

    expect((await db.request("/controls/email-submission")).status).toBe(403);
    expect((await db.request("/controls/email-submission", "PUT", { admitted: true })).status).toBe(
      403,
    );
    expect(
      (await db.request("/controls/email-submission", "GET", undefined, { signedIn: false }))
        .status,
    ).toBe(401);
  });
});
