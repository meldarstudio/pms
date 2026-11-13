import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import worker, { app } from "../index";
import { PORTAL_ORIGIN, WEBSITE_ORIGIN } from "../test-support/auth";
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
const MINUTE = 60_000;

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const contact = { fullName: "Ana Torres", email: "ana@example.com", phone: "987 654 321" };

function guest(path: string, init: { body?: unknown; token?: string } = {}) {
  return app.request(
    path,
    {
      method: init.body === undefined ? "GET" : "POST",
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
  expect((await db.request("/controls/public-payments", "PUT", { admitted })).status).toBe(200);
  await db.signIn("staff");
}

async function admitEmail(admitted: boolean) {
  await db.signIn("owner");
  expect((await db.request("/controls/email-submission", "PUT", { admitted })).status).toBe(200);
  await db.signIn("staff");
}

function configureResend() {
  db.env.RESEND_API_KEY = RESEND_TEST_KEY;
  db.env.RESEND_API_URL = RESEND_LOOPBACK;
}

async function acceptedCheckout(language: "es" | "en" = "en") {
  const created = await guest("/public/checkouts", {
    body: {
      roomTypeId: "type-king",
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
      adults: 2,
      children: 0,
      ratePlan: "flexible",
      language,
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

const pay = (checkout: { token: string; quoteId: string }) =>
  guest("/public/checkout/payments", {
    token: checkout.token,
    body: {
      quoteId: checkout.quoteId,
      sourceId: `tkn_test_${crypto.randomUUID()}`,
      turnstileToken: TURNSTILE_PASS,
    },
  });

async function confirmed(language: "es" | "en" = "en") {
  const checkout = await acceptedCheckout(language);
  expect((await pay(checkout)).status).toBe(201);
  const access = await guest("/public/checkout/access", { token: checkout.token });
  expect(access.status).toBe(200);
  const { token } = (await access.json()) as { token: string };
  const saved = db.sqlite
    .prepare(
      "SELECT r.id, r.code FROM reservations r JOIN reservation_access a ON a.reservation_id = r.id WHERE a.token = ?",
    )
    .get(token) as { id: string; code: string };
  return { checkout, saved: { ...saved, token } };
}

async function runScheduled() {
  const scheduled: Promise<unknown>[] = [];
  worker.scheduled({} as ScheduledController, db.env, {
    waitUntil: (task: Promise<unknown>) => scheduled.push(task),
  } as unknown as ExecutionContext);
  await Promise.all(scheduled);
}

const rows = <T>(sql: string) => db.sqlite.prepare(sql).all() as T[];

type EmailRow = {
  id: string;
  kind: string;
  recipient: string;
  language: string;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  sent_at: string | null;
};

const emails = () =>
  rows<EmailRow>(
    "SELECT id, kind, recipient, language, status, attempts, next_attempt_at, provider_message_id, last_error, sent_at FROM confirmation_emails ORDER BY created_at, rowid",
  );

const posts = () => resend.requests.filter((request) => request.method === "POST");

function summaryLink(language: "es" | "en", token: string) {
  const path = language === "en" ? "/en/reservar/resumen/" : "/reservar/resumen/";
  return `https://www.hotelmanantialchurin.com${path}#${token}`;
}

type Message = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
  attachments: { content: string; content_id: string; content_type: string }[];
};

const message = (index: number) => JSON.parse(posts()[index]!.body) as Message;

async function command(id: string, actions: unknown[]) {
  const response = await db.request(`/reservations/${id}/commands`, "POST", {
    requestId: crypto.randomUUID(),
    actions,
  });
  expect(response.status, await response.clone().text()).toBe(200);
}

describe("automatic confirmation", () => {
  it.each(["es", "en"] as const)(
    "sends one %s confirmation to the booking contact in a scheduled run, and not again on the next",
    async (language) => {
      const { saved } = await confirmed(language);
      expect(emails()).toEqual([
        expect.objectContaining({
          kind: "automatic",
          recipient: "ana@example.com",
          language,
          status: "pending",
          attempts: 0,
        }),
      ]);
      configureResend();
      await admitEmail(true);

      await runScheduled();
      await runScheduled();

      expect(posts()).toHaveLength(1);
      const [email] = emails();
      expect(email).toMatchObject({
        status: "sent",
        attempts: 1,
        provider_message_id: "email_1",
        next_attempt_at: null,
        last_error: null,
        sent_at: "2026-10-10T15:00:00.000Z",
      });
      const posted = posts()[0]!;
      expect(posted.url).toBe(`${RESEND_LOOPBACK}/emails`);
      expect(posted.headers.get("idempotency-key")).toBe(email!.id);
      expect(posted.headers.get("authorization")).toBe(`Bearer ${RESEND_TEST_KEY}`);
      const sent = message(0);
      const link = summaryLink(language, saved.token);
      expect(sent).toMatchObject({ from: FROM, to: ["ana@example.com"], reply_to: REPLY_TO });
      expect(sent.subject).toBe(
        language === "en"
          ? `Reservation confirmation ${saved.code}`
          : `Confirmación de reserva ${saved.code}`,
      );
      expect(sent.html).toContain(
        language === "en" ? "Your reservation is confirmed" : "Tu reserva está confirmada",
      );
      for (const part of [sent.html, sent.text]) {
        for (const fact of [saved.code, "2026-10-20", "2026-10-22", "King", "Flexible"])
          expect(part).toContain(fact);
        for (const fact of ["2026-10-18", "PEN 200.00", "PEN 100.00", PHONE, REPLY_TO, link])
          expect(part).toContain(fact);
      }
      expect(sent.html).toContain(`href="${link}"`);
      expect(sent.html).toContain(`src="cid:${sent.attachments[0]!.content_id}"`);
      expect(sent.attachments[0]!.content_type).toBe("image/png");
      expect(sent.subject).not.toContain(saved.token);
    },
  );

  it("queues the confirmation in the same save as the reservation, so a failed save leaves neither, and the retry saves one of each", async () => {
    const checkout = await acceptedCheckout();
    db.beforeCommit(() => {
      db.sqlite.exec(`
        CREATE TRIGGER fail_email_insert BEFORE INSERT ON confirmation_emails
        BEGIN
          SELECT RAISE(ABORT, 'confirmation insert failed');
        END;
      `);
    });

    const response = await pay(checkout);
    expect(await response.json()).toMatchObject({
      payment: { state: "paid_awaiting_reservation", reservation: null },
    });
    expect(rows("SELECT id FROM reservations")).toEqual([]);
    expect(rows("SELECT id FROM payments")).toEqual([]);
    expect(emails()).toEqual([]);
    db.sqlite.exec("DROP TRIGGER fail_email_insert");

    await runScheduled();
    await runScheduled();

    expect(rows("SELECT status FROM reservations")).toEqual([{ status: "confirmed" }]);
    expect(rows("SELECT id FROM payments")).toHaveLength(1);
    expect(emails()).toEqual([
      expect.objectContaining({ kind: "automatic", recipient: "ana@example.com", language: "en" }),
    ]);
    expect(culqi.requests.filter((request) => request.method === "POST")).toHaveLength(1);
  });

  it("sends nothing for a desk reservation", async () => {
    const desk = await db.request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      guest: { fullName: "Desk Guest", email: "desk@example.com" },
      rooms: [{ roomTypeId: "type-king", adults: 1, children: 0 }],
    });
    expect(desk.status).toBe(201);
    configureResend();
    await admitEmail(true);

    await runScheduled();

    expect(emails()).toEqual([]);
    expect(posts()).toEqual([]);
  });

  it("retries a transient failure with the same idempotency key and backoff, then fails after five attempts", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next(500, "timeout", 429, 500, 500);

    await runScheduled();
    expect(emails()[0]).toMatchObject({
      status: "pending",
      attempts: 1,
      last_error: "api_error",
      next_attempt_at: "2026-10-10T15:01:00.000Z",
    });
    for (const [wait, attempts, error] of [
      [1, 2, "network_error"],
      [5, 3, "rate_limit_exceeded"],
      [15, 4, "api_error"],
    ] as const) {
      vi.advanceTimersByTime(wait * MINUTE - 1);
      await runScheduled();
      expect(posts()).toHaveLength(attempts - 1);
      vi.advanceTimersByTime(1);
      await runScheduled();
      expect(posts()).toHaveLength(attempts);
      expect(emails()[0]).toMatchObject({ status: "pending", attempts, last_error: error });
    }
    vi.advanceTimersByTime(60 * MINUTE);
    await runScheduled();

    expect(emails()[0]).toMatchObject({
      status: "failed",
      attempts: 5,
      last_error: "api_error",
      next_attempt_at: null,
      sent_at: null,
    });
    expect(new Set(posts().map((post) => post.headers.get("idempotency-key")))).toEqual(
      new Set([emails()[0]!.id]),
    );
    vi.advanceTimersByTime(24 * 60 * MINUTE);
    await runScheduled();
    expect(posts()).toHaveLength(5);
  });

  it("records the original message when Resend accepted a send whose response was lost", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("lose");

    await runScheduled();
    expect(emails()[0]).toMatchObject({ status: "pending", last_error: "network_error" });
    vi.advanceTimersByTime(MINUTE);
    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(resend.emails).toHaveLength(1);
    expect(emails()[0]).toMatchObject({
      status: "sent",
      attempts: 2,
      provider_message_id: "email_1",
      last_error: null,
    });
  });

  it("resends the first request after a lost response, even when the reservation changed meanwhile", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("lose");
    await runScheduled();
    await command(saved.id, [{ type: "set-discount", amountCents: 5000 }]);

    vi.advanceTimersByTime(MINUTE);
    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.body).toBe(posts()[0]!.body);
    expect(resend.emails).toHaveLength(1);
    expect(emails()[0]).toMatchObject({ status: "sent", provider_message_id: "email_1" });
    expect(rows("SELECT pending_request FROM confirmation_emails")).toEqual([
      { pending_request: null },
    ]);
  });

  it("posts once when two scheduled runs overlap", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);

    await Promise.all([runScheduled(), runScheduled()]);

    expect(posts()).toHaveLength(1);
    expect(emails()[0]).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("fails at once when Resend refuses the message", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next(422);

    await runScheduled();
    vi.advanceTimersByTime(60 * MINUTE);
    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(emails()[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      last_error: "validation_error",
      next_attempt_at: null,
    });
  });

  it("fails at once when Resend rejects the API key", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next(401);

    await runScheduled();
    vi.advanceTimersByTime(60 * MINUTE);
    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(emails()[0]).toMatchObject({ status: "failed", attempts: 1, next_attempt_at: null });
  });

  it("retries when Resend is still processing the same idempotency key", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("concurrent");

    await runScheduled();
    expect(emails()[0]).toMatchObject({
      status: "pending",
      attempts: 1,
      last_error: "concurrent_idempotent_requests",
    });
    vi.advanceTimersByTime(MINUTE);
    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(resend.emails).toHaveLength(1);
    expect(emails()[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("waits at least Retry-After before trying again", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.retryAfter("600");
    resend.next(429);

    await runScheduled();
    vi.advanceTimersByTime(10 * MINUTE - 1);
    await runScheduled();
    expect(posts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(emails()[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("keeps the confirmation pending while sending is paused or Resend has no key, and sends it once both allow", async () => {
    await confirmed();
    configureResend();

    await runScheduled();
    expect(emails()[0]).toMatchObject({ status: "pending", attempts: 0 });
    db.env.RESEND_API_KEY = undefined;
    await admitEmail(true);
    await runScheduled();
    expect(emails()[0]).toMatchObject({ status: "pending", attempts: 0 });
    expect(posts()).toEqual([]);

    configureResend();
    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(emails()[0]).toMatchObject({ status: "sent" });
  });

  it("does not send a confirmation once staff cancel the reservation", async () => {
    const { saved } = await confirmed();
    await command(saved.id, [{ type: "set-status", status: "cancelled" }]);
    configureResend();
    await admitEmail(true);

    await runScheduled();

    expect(posts()).toEqual([]);
    expect(emails()[0]).toMatchObject({ status: "failed", last_error: "not_confirmed" });
  });

  it("stops retrying a confirmation once staff cancel the reservation between attempts", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next(500);
    await runScheduled();
    await command(saved.id, [{ type: "set-status", status: "cancelled" }]);

    vi.advanceTimersByTime(MINUTE);
    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(emails()[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      last_error: "not_confirmed",
      next_attempt_at: null,
    });
  });

  it("escapes room names in HTML while keeping them in the plain text", async () => {
    await confirmed();
    db.sqlite
      .prepare("UPDATE room_types SET name = ? WHERE id = 'type-king'")
      .run('King & <img src="x" onerror="alert(1)">');
    configureResend();
    await admitEmail(true);

    await runScheduled();

    const sent = message(0);
    expect(sent.html).toContain("King &amp; &lt;img src=&quot;x&quot;");
    expect(sent.html).not.toContain('<img src="x"');
    expect(sent.text).toContain('King & <img src="x" onerror="alert(1)">');
  });

  it("sends an owed confirmation in the same scheduled run when payment reconciliation and the checkout purge fail", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.sqlite.exec("ALTER TABLE payment_attempts RENAME TO unavailable_attempts");

    await runScheduled();

    expect(log.mock.calls).toEqual([
      ["scheduled payment reconciliation failed"],
      ["scheduled abandoned checkout purge failed"],
    ]);
    expect(posts()).toHaveLength(1);
    expect(emails()[0]).toMatchObject({ status: "sent" });
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
    expect(emails()[0]).toMatchObject({ status: "sent", provider_message_id: "email_default" });
  });
});

describe("resending a confirmation", () => {
  it("queues a summary for an explicit recipient that the next run sends, and a replayed request queues it once", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    await runScheduled();
    const path = `/reservations/${saved.id}/confirmation/resends`;
    const request = { requestId: crypto.randomUUID(), recipientEmail: "eva@example.com" };

    const queued = await db.request(path, "POST", request);
    const replayed = await db.request(path, "POST", request);
    const reused = await db.request(path, "POST", {
      ...request,
      recipientEmail: "other@example.com",
    });

    expect(queued.status).toBe(201);
    expect(queued.headers.get("cache-control")).toBe("private, no-store");
    const body = (await queued.json()) as { email: unknown };
    expect(body).toEqual({
      email: {
        id: request.requestId,
        kind: "resend",
        recipient: "eva@example.com",
        language: "en",
        status: "pending",
        attempts: 0,
        nextAttemptAt: "2026-10-10T15:00:00.000Z",
        lastError: null,
        providerMessageId: null,
        requestedBy: { id: "staff-account", username: "hotelmanantial" },
        createdAt: "2026-10-10T15:00:00.000Z",
        sentAt: null,
      },
    });
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual(body);
    expect(reused.status).toBe(409);
    expect(await reused.json()).toEqual({ error: "request ID reused with a different payload" });

    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.headers.get("idempotency-key")).toBe(request.requestId);
    const summary = message(1);
    expect(summary.to).toEqual(["eva@example.com"]);
    expect(summary.subject).toBe(`Reservation summary ${saved.code}`);
    expect(summary.text).toContain("Summary as of 2026-10-10. This is not a new confirmation.");
    expect(summary.text).toContain(summaryLink("en", saved.token));
    expect(emails().map(({ kind, recipient, status }) => ({ kind, recipient, status }))).toEqual([
      { kind: "automatic", recipient: "ana@example.com", status: "sent" },
      { kind: "resend", recipient: "eva@example.com", status: "sent" },
    ]);
  });

  it("uses assistance copy after access expires instead of an expired or renewed link", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    await runScheduled();
    vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
    await db.signIn("staff");

    const queued = await db.request(`/reservations/${saved.id}/confirmation/resends`, "POST", {
      requestId: crypto.randomUUID(),
      recipientEmail: contact.email,
    });
    expect(queued.status).toBe(201);
    await runScheduled();

    expect(posts()).toHaveLength(2);
    const summary = message(1);
    for (const part of [summary.html, summary.text]) {
      expect(part).not.toContain(saved.token);
      expect(part).not.toContain("/reservar/resumen/");
      expect(part).toContain(
        "Online access expired on 2026-11-21. Contact the hotel for assistance.",
      );
    }
  });

  it("refuses a resend for a desk reservation or an unknown reservation", async () => {
    const desk = await db.request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      guest: { fullName: "Desk Guest" },
      rooms: [{ roomTypeId: "type-king", adults: 1, children: 0 }],
    });
    const { id } = (await desk.json()) as { id: string };
    const resendTo = (reservationId: string) =>
      db.request(`/reservations/${reservationId}/confirmation/resends`, "POST", {
        requestId: crypto.randomUUID(),
        recipientEmail: "desk@example.com",
      });

    const deskResend = await resendTo(id);
    const missing = await resendTo("00000000-0000-4000-8000-000000000000");

    expect(deskResend.status).toBe(404);
    expect(await deskResend.json()).toEqual({ error: "reservation access was not established" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "reservation not found" });
    expect(emails()).toEqual([]);
  });
});

describe("confirmation history", () => {
  it("shows staff and the owner a reservation's emails newest first, and hides them from guests and bearers", async () => {
    const { checkout, saved } = await confirmed();
    const requestId = crypto.randomUUID();
    await db.request(`/reservations/${saved.id}/confirmation/resends`, "POST", {
      requestId,
      recipientEmail: "eva@example.com",
    });

    const staff = await db.request(`/reservations/${saved.id}/confirmation`);
    expect(staff.status).toBe(200);
    expect(staff.headers.get("cache-control")).toBe("private, no-store");
    const history = (await staff.json()) as { id: string; kind: string }[];
    expect(history.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: requestId, kind: "resend" },
      { id: emails()[0]!.id, kind: "automatic" },
    ]);
    expect(JSON.stringify(history)).not.toContain(saved.token);
    await db.signIn("owner");
    expect(await (await db.request(`/reservations/${saved.id}/confirmation`)).json()).toEqual(
      history,
    );

    const missing = await db.request("/reservations/missing/confirmation");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
    expect(await missing.json()).toEqual({ error: "reservation not found" });

    for (const authorization of [undefined, `Bearer ${saved.token}`, `Bearer ${checkout.token}`]) {
      const hidden = await app.request(
        `/reservations/${saved.id}/confirmation`,
        {
          headers: {
            origin: PORTAL_ORIGIN,
            ...(authorization === undefined ? {} : { authorization }),
          },
        },
        db.env,
      );
      expect(hidden.status).toBe(401);
    }
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
    expect((await db.request("/controls/public-payments", "PUT", { admitted: true })).status).toBe(
      200,
    );
    const email = await db.request("/controls/email-submission", "PUT", { admitted: true });
    expect(await email.json()).toMatchObject({ admitted: true });
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
