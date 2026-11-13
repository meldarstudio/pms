import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createHmac } from "node:crypto";
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
const REPORT_SECRET = "whsec_dGVzdC1yZXBvcnQtc2lnbmluZy1zZWNyZXQ=";
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
  vi.restoreAllMocks();
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
  bookingContact = contact,
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
    body: { quoteId: quote.id, language, contact: bookingContact, agreed: true },
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
  acceptance_possible: number;
};

const submissions = () =>
  rows<SubmissionRow>(
    "SELECT id, intent_id, send_key, endpoint, request_json, status, provider_message_id, failure_code, first_possible_at, next_attempt_at, recipient_email, language, acceptance_possible FROM confirmation_submissions ORDER BY created_at",
  );

const posts = () => resend.requests.filter((request) => request.method === "POST");

function reportBody(type = "email.delivered", overrides: Record<string, unknown> = {}) {
  const request = JSON.parse(posts()[0]!.body) as { tags: { name: string; value: string }[] };
  return {
    type,
    created_at: "2026-10-09T12:00:00.000Z",
    data: {
      email_id: "email_1",
      message_id: "<synthetic@example.com>",
      from: FROM,
      to: [contact.email],
      tags: Object.fromEntries(request.tags.map((tag) => [tag.name, tag.value])),
      ...overrides,
    },
  };
}

async function callback(
  body: unknown,
  id = crypto.randomUUID(),
  options: { signature?: string; timestamp?: string; raw?: string } = {},
) {
  const raw = options.raw ?? JSON.stringify(body);
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(REPORT_SECRET.slice(6), "base64"))
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");
  return app.request(
    "/callbacks/resend",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": options.signature ?? `v1,${signature}`,
      },
      body: raw,
    },
    db.env,
  );
}

async function inspection(id: string) {
  const response = await db.request(`/reservations/${id}/confirmation`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return (await response.json()) as {
    submission: {
      status: string;
      providerMessageId: string | null;
      failureCode: string | null;
      delivery: {
        accepted: boolean;
        delivered: boolean;
        delayed: boolean;
        failed: boolean;
        bounced: boolean;
        permanentlyBounced: boolean;
        complained: boolean;
        suppressed: boolean;
        uncertain: boolean;
        conflict: boolean;
        recipientBlocked: boolean;
        history: {
          eventId: string;
          type: string;
          source: string;
          providerMessageId: string;
          messageId: string | null;
          details: unknown;
        }[];
      };
    };
  };
}

describe("authenticated delivery reports", () => {
  it("keeps terminal callbacks received during an older lookup and does not reopen polling", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    await runScheduled();
    await admitEmail(false);
    const callbackStatuses: number[] = [];
    resend.lookup({ id: "email_1", last_event: "sent", from: FROM, to: [contact.email] });
    resend.duringNextLookup(async () => {
      callbackStatuses.push((await callback(reportBody("email.delivered"))).status);
      callbackStatuses.push((await callback(reportBody("email.complained"))).status);
    });
    vi.setSystemTime(Date.now() + 15 * 60_000);
    await runScheduled();
    expect(callbackStatuses).toEqual([200, 200]);
    const view = await inspection(saved.id);
    expect(view.submission.delivery).toMatchObject({
      delivered: true,
      complained: true,
      recipientBlocked: true,
    });
    expect(view.submission.delivery.history).toContainEqual(
      expect.objectContaining({ source: "lookup", type: "sent" }),
    );
    vi.setSystemTime(Date.now() + 15 * 60_000);
    await runScheduled();
    expect(resend.requests.filter((request) => request.method === "GET")).toHaveLength(1);
    expect(posts()).toHaveLength(1);
  });

  it("bounds a stalled provider lookup to a small tick budget and retains its next safe observation without another send", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    await runScheduled();
    await admitEmail(false);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((delay) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException("Synthetic timeout", "TimeoutError")),
        delay,
      );
      return controller.signal;
    });
    const transport = globalThis.fetch;
    let gets = 0;
    let started!: () => void;
    const lookupStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "GET") return transport(input, init);
      gets++;
      started();
      const signal = init.signal!;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }) as typeof fetch);
    vi.setSystemTime(Date.now() + 15 * 60_000);
    let completed = false;
    const tick = runScheduled().then(() => {
      completed = true;
    });
    await lookupStarted;
    await vi.advanceTimersByTimeAsync(10_000);
    const completedWithinBudget = completed;
    await vi.advanceTimersByTimeAsync(20_000);
    await tick;
    expect(completedWithinBudget).toBe(true);
    expect((await inspection(saved.id)).submission.delivery).toMatchObject({
      accepted: true,
      delivered: false,
    });
    await runScheduled();
    expect(gets).toBe(1);
    expect(posts()).toHaveLength(1);
  });

  it("logs a safe failure instead of silently discarding an accepted POST whose persisted endpoint was lost", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    resend.duringNext(() => {
      db.sqlite.exec("UPDATE confirmation_submissions SET endpoint = NULL");
    });
    await runScheduled();
    expect(posts()).toHaveLength(1);
    expect(log.mock.calls).toEqual([["confirmation submission failed", saved.id]]);
    expect((await inspection(saved.id)).submission).toMatchObject({
      status: "uncertain",
      providerMessageId: null,
    });
  });

  it("sends queued confirmations before a stalled lookup and bounds lookup calls without losing older known-ID recovery", async () => {
    await confirmed();
    vi.setSystemTime(Date.now() + 1_000);
    await confirmed("en", { checkIn: "2026-10-23", checkOut: "2026-10-24" });
    vi.setSystemTime(Date.now() + 1_000);
    await confirmed("en", { checkIn: "2026-10-25", checkOut: "2026-10-26" });
    configureResend();
    await admitEmail(true);
    await runScheduled();
    db.sqlite.exec(
      "DELETE FROM confirmation_reports WHERE source = 'response'; UPDATE confirmation_submissions SET next_lookup_at = NULL;",
    );
    await confirmed("en", { checkIn: "2026-10-27", checkOut: "2026-10-28" });
    let release!: () => void;
    let started!: () => void;
    const stalled = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lookupStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    resend.duringNextLookup(async () => {
      started();
      await stalled;
    });
    const tick = runScheduled();
    await lookupStarted;
    const postedBeforeLookupCompleted = posts().length;
    release();
    await tick;
    expect(postedBeforeLookupCompleted).toBe(4);
    expect(resend.requests.filter((request) => request.method === "GET")).toHaveLength(2);
    await runScheduled();
    expect(resend.requests.filter((request) => request.method === "GET")).toHaveLength(3);
    expect(posts()).toHaveLength(4);
  });

  it.each([
    "email.delivered",
    "email.failed",
    "email.bounced",
    "email.complained",
    "email.suppressed",
  ])(
    "stops known-ID polling after authoritative %s facts without disabling later callbacks",
    async (type) => {
      const { saved } = await confirmed();
      configureResend();
      db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
      await admitEmail(true);
      await runScheduled();
      expect(
        (
          await callback(
            reportBody(type, {
              bounce:
                type === "email.bounced" ? { type: "Permanent", subType: "General" } : undefined,
            }),
          )
        ).status,
      ).toBe(200);
      await admitEmail(false);
      vi.setSystemTime(Date.now() + 15 * 60_000);
      await runScheduled();
      vi.setSystemTime(Date.now() + 24 * 60 * 60_000);
      await runScheduled();
      expect(resend.requests.filter((request) => request.method === "GET")).toHaveLength(0);
      expect((await callback(reportBody("email.complained"))).status).toBe(200);
      expect((await inspection(saved.id)).submission.delivery.complained).toBe(true);
      expect(posts()).toHaveLength(1);
    },
  );

  it("rejects missing verification configuration or headers without consuming an anonymous request stream", async () => {
    for (const mode of ["missing_secret", "malformed_secret", "missing_headers"]) {
      db.env.RESEND_WEBHOOK_SECRET =
        mode === "missing_secret"
          ? undefined
          : mode === "malformed_secret"
            ? "whsec_!"
            : REPORT_SECRET;
      let pulls = 0;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulls++;
            controller.enqueue(new TextEncoder().encode("anonymous private body"));
            controller.close();
          },
        },
        { highWaterMark: 0 },
      );
      const request = new Request("http://localhost/callbacks/resend", {
        method: "POST",
        body: stream,
        duplex: "half",
        headers:
          mode === "missing_headers"
            ? {}
            : {
                "svix-id": "msg_test",
                "svix-timestamp": String(Math.floor(Date.now() / 1000)),
                "svix-signature": `v1,${Buffer.alloc(32).toString("base64")}`,
              },
      } as RequestInit);
      const response = await app.fetch(request, db.env);
      expect(response.status).toBe(401);
      expect(pulls).toBe(0);
      expect(request.bodyUsed).toBe(false);
    }
  });

  it("enforces the raw streaming byte cap even without a trustworthy Content-Length", async () => {
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    const raw = JSON.stringify({
      type: "email.opened",
      created_at: "2026-10-10T15:00:00Z",
      data: { private: "x".repeat(512 * 1024) },
    });
    for (const contentLength of [undefined, "1"]) {
      const eventId = crypto.randomUUID();
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac("sha256", Buffer.from(REPORT_SECRET.slice(6), "base64"))
        .update(`${eventId}.${timestamp}.${raw}`)
        .digest("base64");
      const bytes = new TextEncoder().encode(raw);
      let offset = 0;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const chunk = bytes.slice(offset, offset + 32 * 1024);
            offset += chunk.length;
            controller.enqueue(chunk);
            if (offset === bytes.length) controller.close();
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      );
      const response = await app.fetch(
        new Request("http://localhost/callbacks/resend", {
          method: "POST",
          duplex: "half",
          body: stream,
          headers: {
            "svix-id": eventId,
            "svix-timestamp": timestamp,
            "svix-signature": `v1,${signature}`,
            ...(contentLength ? { "content-length": contentLength } : {}),
          },
        } as RequestInit),
        db.env,
      );
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: "invalid email report" });
      expect(offset).toBeLessThan(bytes.length);
      expect(cancelled).toBe(true);
    }
  });

  it("acknowledges authenticated unsupported envelopes without persisting incidental data or handling their semantics", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    await runScheduled();
    const before = await inspection(saved.id);
    db.sqlite.exec(
      "CREATE TRIGGER reject_ignored_report BEFORE INSERT ON confirmation_reports BEGIN SELECT RAISE(ABORT, 'unsupported event must not persist'); END;",
    );
    for (const type of [
      "email.scheduled",
      "email.opened",
      "email.clicked",
      "suppression.added",
      "suppression.removed",
      "domain.updated",
    ]) {
      const envelope = { type, created_at: "2026-10-10T15:00:00Z", data: { private: saved.token } };
      expect((await callback(envelope, crypto.randomUUID(), { signature: "v1,AAAA" })).status).toBe(
        401,
      );
      expect((await callback(envelope)).status).toBe(200);
    }
    expect(
      (await callback({ type: "email.delivered", created_at: "2026-10-10T15:00:00Z", data: {} }))
        .status,
    ).toBe(400);
    expect((await callback({ type: "email.opened", created_at: "invalid", data: {} })).status).toBe(
      400,
    );
    expect(await inspection(saved.id)).toEqual(before);
    await runScheduled();
    expect(posts()).toHaveLength(1);
  });

  it.each([
    ["a&b@Example.COM", "a&b@example.com"],
    ["José@Ejemplo.COM", "josé@ejemplo.com"],
    ["用户@例子.测试", "用户@例子.测试"],
    ["ana@XN--BCHER-KVA.EXAMPLE", "ana@xn--bcher-kva.example"],
  ])(
    "reconciles callback and lookup for the writer-accepted address %s",
    async (email, normalized) => {
      const checkout = await acceptedCheckout("en", {}, { ...contact, email });
      await paid(checkout);
      const saved = await reservationFor(checkout.token);
      configureResend();
      db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
      await admitEmail(true);
      await runScheduled();
      expect((await callback(reportBody("email.sent", { to: [normalized] }))).status).toBe(200);
      expect((await inspection(saved.id)).submission.delivery).toMatchObject({
        accepted: true,
        conflict: false,
      });
      await admitEmail(false);
      resend.lookup({ id: "email_1", last_event: "delivered", from: FROM, to: [normalized] });
      vi.setSystemTime(Date.now() + 15 * 60_000);
      await runScheduled();
      expect((await inspection(saved.id)).submission.delivery).toMatchObject({
        delivered: true,
        conflict: false,
      });
      expect(posts()).toHaveLength(1);
      expect(
        (
          await callback(
            reportBody("email.suppressed", {
              email_id: "unrelated",
              to: ["odd&local@例子.测试"],
              tags: undefined,
            }),
          )
        ).status,
      ).toBe(200);
    },
  );
  it("preserves a staff-cancelled terminal submission when later recipient suppression is reported", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    resend.next(429);
    await runScheduled();
    await command(saved.id, [{ type: "set-status", status: "cancelled" }]);
    vi.setSystemTime(Date.now() + 15 * 60_000);
    await runScheduled();
    const terminal = submissions()[0]!;
    expect(terminal).toMatchObject({
      status: "unsent",
      failure_code: "not_confirmed",
      next_attempt_at: null,
    });
    expect(
      (
        await callback(
          reportBody("email.suppressed", { email_id: "outside_application", tags: undefined }),
        )
      ).status,
    ).toBe(200);
    expect(submissions()[0]).toEqual(terminal);
    expect((await inspection(saved.id)).submission).toMatchObject({
      status: "unsent",
      failureCode: "not_confirmed",
      delivery: { recipientBlocked: true },
    });
    expect(posts()).toHaveLength(1);
  });

  it("does not overwrite cancellation when stale selected work is restored after recipient blocking", async () => {
    await confirmed();
    vi.setSystemTime(Date.now() + 1_000);
    const second = await confirmed("en", { checkIn: "2026-10-23", checkOut: "2026-10-24" });
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    resend.next(429, 429);
    await runScheduled();
    vi.setSystemTime(Date.now() + 15 * 60_000);
    let terminal: SubmissionRow | undefined;
    resend.duringNext(async () => {
      await command(second.saved.id, [{ type: "set-status", status: "cancelled" }]);
      await runScheduled();
      terminal = submissions()[1]!;
      expect(terminal).toMatchObject({
        status: "unsent",
        failure_code: "not_confirmed",
        next_attempt_at: null,
      });
      expect(
        (
          await callback(
            reportBody("email.suppressed", { email_id: "outside_application", tags: undefined }),
          )
        ).status,
      ).toBe(200);
      await command(second.saved.id, [{ type: "set-status", status: "confirmed" }]);
    });
    await runScheduled();
    expect(terminal).toBeDefined();
    expect(submissions()[1]).toEqual(terminal);
    expect((await inspection(second.saved.id)).submission).toMatchObject({
      status: "unsent",
      failureCode: "not_confirmed",
    });
  });

  it("verifies the exact non-ASCII HTTP bytes, not parsed JSON, and accepts a valid second rotation signature", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    await runScheduled();
    const eventId = crypto.randomUUID();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const raw = JSON.stringify({ ...reportBody(), subject: "Confirmación — Perú" }, null, 2);
    const signature = createHmac("sha256", Buffer.from(REPORT_SECRET.slice(6), "base64"))
      .update(`${eventId}.${timestamp}.${raw}`)
      .digest("base64");
    expect(
      (
        await callback({}, eventId, {
          raw: raw.replace("Perú", "Peru"),
          timestamp,
          signature: `v1,${signature}`,
        })
      ).status,
    ).toBe(401);
    expect(
      (await callback({}, eventId, { raw: `${raw}\n`, timestamp, signature: `v1,${signature}` }))
        .status,
    ).toBe(401);
    expect((await inspection(saved.id)).submission.delivery.delivered).toBe(false);
    expect(
      (
        await callback({}, eventId, {
          raw,
          timestamp,
          signature: `v2,ignored v1,AAAA v1,${signature}`,
        })
      ).status,
    ).toBe(200);
    expect((await inspection(saved.id)).submission.delivery.delivered).toBe(true);
  });

  it("rejects anonymous forgeries and fails closed without the separate signing secret", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    await runScheduled();
    const before = await inspection(saved.id);
    const body = reportBody();
    expect((await callback(body)).status).toBe(401);
    db.env.RESEND_WEBHOOK_SECRET = RESEND_TEST_KEY;
    expect((await callback(body)).status).toBe(401);
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    for (const options of [
      { signature: "v1,AAAA" },
      { timestamp: String(Math.floor(Date.now() / 1000) - 301) },
      { timestamp: "123oops" },
    ])
      expect((await callback(body, crypto.randomUUID(), options)).status).toBe(401);
    const missing = await app.request(
      "/callbacks/resend",
      { method: "POST", body: JSON.stringify(body) },
      db.env,
    );
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "invalid email report" });
    expect((await callback({}, crypto.randomUUID())).status).toBe(400);
    expect(await inspection(saved.id)).toEqual(before);
    for (const path of [
      "/callbacks/resend",
      "/callbacks/resend/other",
      `/reservations/${saved.id}/confirmation`,
    ])
      expect((await app.request(path, {}, db.env)).status).toBe(401);
  });

  it("persists an old delivered event with a fresh attempt signature before the POST response, and deduplicates it durably", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    const eventId = crypto.randomUUID();
    resend.duringNext(async () => {
      expect((await callback(reportBody(), eventId)).status).toBe(200);
      const beforeResponse = await inspection(saved.id);
      expect(beforeResponse.submission.status).toBe("accepted");
      expect(beforeResponse.submission.delivery.delivered).toBe(true);
    });
    await runScheduled();
    expect((await callback(reportBody(), eventId)).status).toBe(200);
    const view = await inspection(saved.id);
    expect(view.submission.providerMessageId).toBe("email_1");
    expect(view.submission.delivery).toMatchObject({
      accepted: true,
      delivered: true,
      uncertain: false,
      conflict: false,
    });
    expect(
      view.submission.delivery.history.filter((event) => event.eventId === eventId),
    ).toHaveLength(1);
    expect(view.submission.delivery.history).toContainEqual(
      expect.objectContaining({ type: "delivered", messageId: "<synthetic@example.com>" }),
    );
    await runScheduled();
    expect(posts()).toHaveLength(1);
  });

  it.each(["lose", 401, "invalid"] as const)(
    "keeps a signed acceptance when the later POST response is %s",
    async (outcome) => {
      const { saved } = await confirmed();
      configureResend();
      db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
      await admitEmail(true);
      resend.next(outcome);
      let callbackStatus = 0;
      resend.duringNext(async () => {
        callbackStatus = (await callback(reportBody("email.sent"))).status;
      });
      await runScheduled();
      expect(callbackStatus).toBe(200);
      const view = await inspection(saved.id);
      expect(view.submission.status).toBe("accepted");
      expect(view.submission.delivery).toMatchObject({
        accepted: true,
        delivered: false,
        uncertain: false,
      });
      vi.setSystemTime(Date.now() + 21 * 60 * 60 * 1000);
      await runScheduled();
      expect(posts()).toHaveLength(1);
    },
  );

  it("retains delivery, failure, permanent bounce and complaint/suppression despite reordered older facts, and blocks the recipient", async () => {
    const { saved, checkout } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    await runScheduled();
    const beforeSummary = await (await guest("/public/reservation", { token: saved.token })).json();
    const beforePayment = await (
      await guest("/public/checkout/payment", { token: checkout.token })
    ).json();
    for (const [type, details] of [
      ["email.delivered", {}],
      [
        "email.bounced",
        { bounce: { type: "Permanent", subType: "General", message: `private ${saved.token}` } },
      ],
      ["email.complained", {}],
      [
        "email.suppressed",
        { suppressed: { type: "OnAccountSuppressionList", message: `private ${saved.token}` } },
      ],
      ["email.failed", { failed: { reason: "reached_daily_quota" } }],
      ["email.delivery_delayed", {}],
      ["email.sent", {}],
    ] as const)
      expect((await callback(reportBody(type, details))).status).toBe(200);
    const view = await inspection(saved.id);
    expect(view.submission.delivery).toMatchObject({
      accepted: true,
      delivered: true,
      delayed: true,
      failed: true,
      bounced: true,
      permanentlyBounced: true,
      complained: true,
      suppressed: true,
      uncertain: false,
      recipientBlocked: true,
    });
    expect(view.submission.delivery.history).toContainEqual(
      expect.objectContaining({
        details: expect.objectContaining({
          bounceType: "Permanent",
          bounceSubType: "General",
          permanent: true,
        }),
      }),
    );
    expect(JSON.stringify(view)).not.toContain(saved.token);
    expect(JSON.stringify(view)).not.toContain("whsec_");
    expect(JSON.stringify(view)).not.toContain(RESEND_TEST_KEY);
    expect(await (await guest("/public/reservation", { token: saved.token })).json()).toEqual(
      beforeSummary,
    );
    expect(
      await (await guest("/public/checkout/payment", { token: checkout.token })).json(),
    ).toEqual(beforePayment);
    const next = await confirmed("es", { checkIn: "2026-10-23", checkOut: "2026-10-24" });
    await runScheduled();
    expect(posts()).toHaveLength(1);
    expect((await inspection(next.saved.id)).submission).toMatchObject({
      status: "attention",
      failureCode: "recipient_blocked",
      delivery: { recipientBlocked: true },
    });
  });

  it("quarantines conflicting provider IDs, recipients and tags instead of replacing the accepted history", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    let status = 0;
    resend.duringNext(async () => {
      status = (await callback(reportBody("email.delivered", { email_id: "email_other" }))).status;
    });
    await runScheduled();
    expect(status).toBe(200);
    for (const fields of [
      { to: ["different@example.com"] },
      { tags: { category: "other" } },
      { tags: { submission_id: "other" } },
    ])
      expect(
        (await callback(reportBody("email.delivered", { email_id: "email_other", ...fields })))
          .status,
      ).toBe(200);
    const view = await inspection(saved.id);
    expect(view.submission.providerMessageId).toBe("email_other");
    expect(view.submission.delivery).toMatchObject({ delivered: true, conflict: true });
    expect(view.submission.delivery.history).toContainEqual(
      expect.objectContaining({ providerMessageId: "email_1", conflict: true }),
    );
  });

  it.each(["respond", "lose"])(
    "retains tagless legacy reports until a known provider ID can attach them (%s)",
    async (outcome) => {
      const { saved } = await confirmed();
      db.sqlite.exec(
        `CREATE TRIGGER legacy_writer AFTER INSERT ON confirmation_submissions BEGIN UPDATE confirmation_submissions SET request_json = json_remove(request_json, '$.tags[1]') WHERE id = NEW.id; END;`,
      );
      configureResend();
      db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
      await admitEmail(true);
      if (outcome === "lose") resend.next("lose");
      let beforeResponse: unknown;
      resend.duringNext(async () => {
        expect((await callback(reportBody())).status).toBe(200);
        beforeResponse = (await inspection(saved.id)).submission.delivery;
      });
      await runScheduled();
      expect(beforeResponse).toMatchObject({ delivered: false, uncertain: true });
      const original = submissions()[0]!;
      if (outcome === "lose") {
        expect((await inspection(saved.id)).submission.delivery).toMatchObject({
          delivered: false,
          uncertain: true,
        });
        vi.setSystemTime(Date.now() + 60_000);
        await runScheduled();
        expect(posts()[1]!.body).toBe(posts()[0]!.body);
        expect(submissions()[0]!.first_possible_at).toBe(original.first_possible_at);
      }
      expect((await inspection(saved.id)).submission.delivery).toMatchObject({
        delivered: true,
        uncertain: false,
      });
    },
  );

  it.each(["INSERT ON confirmation_reports", "UPDATE ON confirmation_submissions"])(
    "rolls back failed %s without acknowledging or losing the retry, and detects reused IDs",
    async (failure) => {
      const { saved } = await confirmed();
      configureResend();
      db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
      await admitEmail(true);
      await runScheduled();
      db.sqlite.exec(
        `CREATE TRIGGER fail_report BEFORE ${failure} BEGIN SELECT RAISE(ABORT, 'synthetic persistence failure'); END;`,
      );
      const eventId = crypto.randomUUID();
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await callback(reportBody(), eventId)).status).toBe(500);
      expect((await inspection(saved.id)).submission.delivery.delivered).toBe(false);
      db.sqlite.exec("DROP TRIGGER fail_report");
      const results = await Promise.all([
        callback(reportBody(), eventId),
        callback(reportBody(), eventId),
      ]);
      expect(results.map((result) => result.status)).toEqual([200, 200]);
      expect(
        (await inspection(saved.id)).submission.delivery.history.filter(
          (event) => event.eventId === eventId,
        ),
      ).toHaveLength(1);
      expect((await callback(reportBody("email.sent"), eventId)).status).toBe(200);
      expect((await inspection(saved.id)).submission.delivery.conflict).toBe(true);
      expect((await inspection(saved.id)).submission.delivery.delivered).toBe(true);
      expect(log.mock.calls.flat()).toEqual(["confirmation report persistence failed"]);
    },
  );

  it("recovers positive known-ID evidence while submission is paused, bounds lookup rate and preserves stronger report facts", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    resend.next("lose");
    await runScheduled();
    expect((await callback(reportBody("email.delivery_delayed"))).status).toBe(200);
    expect((await inspection(saved.id)).submission).toMatchObject({
      status: "accepted",
      providerMessageId: "email_1",
      delivery: { delayed: true, delivered: false },
    });
    await admitEmail(false);
    resend.lookup({
      id: "email_1",
      last_event: "delivered",
      to: [contact.email],
      from: FROM,
      message_id: "<retrieved@example.com>",
      html: saved.token,
      text: saved.token,
    });
    vi.setSystemTime(Date.now() + 15 * 60_000);
    await runScheduled();
    const view = await inspection(saved.id);
    expect(view.submission.delivery).toMatchObject({
      accepted: true,
      delivered: true,
      delayed: true,
      uncertain: false,
    });
    expect(view.submission.delivery.history).toContainEqual(
      expect.objectContaining({
        source: "lookup",
        type: "delivered",
        occurredAt: null,
        messageId: "<retrieved@example.com>",
      }),
    );
    expect(JSON.stringify(view)).not.toContain(saved.token);
    await runScheduled();
    expect(resend.requests.filter((request) => request.method === "GET")).toHaveLength(1);
    expect(posts()).toHaveLength(1);
    expect((await callback(reportBody("email.complained"))).status).toBe(200);
    resend.lookup({ id: "email_1", last_event: "sent", to: [contact.email], from: FROM });
    vi.setSystemTime(Date.now() + 15 * 60_000);
    await runScheduled();
    expect((await inspection(saved.id)).submission.delivery).toMatchObject({
      delivered: true,
      delayed: true,
      complained: true,
      recipientBlocked: true,
    });
    expect(resend.requests.filter((request) => request.method === "GET")).toHaveLength(1);
    expect(posts()).toHaveLength(1);
  });

  it("never treats absent, unavailable or mismatched lookup evidence as permission to send, and keeps the frozen lookup context", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    resend.next("lose");
    await runScheduled();
    expect((await callback(reportBody("email.sent"))).status).toBe(200);
    await admitEmail(false);
    const original = submissions()[0]!;
    for (const [body, status] of [
      [null, 404],
      [{ name: "restricted_api_key" }, 401],
      [null, 429],
      [null, 500],
      [{ id: "different", last_event: "delivered", from: FROM, to: [contact.email] }, 200],
      [{ id: "email_1", from: FROM, to: [contact.email] }, 200],
      [{ id: "email_1", last_event: "future_status", from: FROM, to: [contact.email] }, 200],
    ] as const) {
      resend.lookup(body, status);
      vi.setSystemTime(Date.now() + 15 * 60_000);
      await runScheduled();
      expect((await inspection(saved.id)).submission.delivery).toMatchObject({
        accepted: true,
        failed: false,
        delivered: false,
      });
    }
    db.env.RESEND_API_URL = "http://localhost:88";
    resend.lookup({
      id: "email_1",
      last_event: "delivery_delayed",
      from: FROM,
      to: [contact.email],
    });
    vi.setSystemTime(Date.now() + 15 * 60_000);
    await runScheduled();
    expect(resend.requests.at(-1)!.url).toBe(`${RESEND_LOOPBACK}/emails/email_1`);
    expect((await inspection(saved.id)).submission.delivery).toMatchObject({
      accepted: true,
      delayed: true,
      failed: false,
      delivered: false,
    });
    const before = resend.requests.length;
    db.env.RESEND_API_KEY = "re_different_account";
    vi.setSystemTime(Date.now() + 15 * 60_000);
    await runScheduled();
    expect(resend.requests).toHaveLength(before);
    await admitEmail(true);
    await runScheduled();
    expect(posts()).toHaveLength(1);
    expect(submissions()[0]).toMatchObject({
      first_possible_at: original.first_possible_at,
      send_key: original.send_key,
      request_json: original.request_json,
      endpoint: original.endpoint,
    });
  });

  it("keeps uncorrelated lost-ID legacy work uncertain beyond the submission deadline and accepts reports without an API key while paused", async () => {
    const { saved } = await confirmed();
    db.sqlite.exec(
      `CREATE TRIGGER legacy_writer AFTER INSERT ON confirmation_submissions BEGIN UPDATE confirmation_submissions SET request_json = json_remove(request_json, '$.tags[1]') WHERE id = NEW.id; END;`,
    );
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    resend.next("lose");
    await runScheduled();
    const body = reportBody();
    await admitEmail(false);
    delete db.env.RESEND_API_KEY;
    vi.setSystemTime(Date.now() + 21 * 60 * 60_000);
    expect((await callback(body)).status).toBe(200);
    await runScheduled();
    expect((await inspection(saved.id)).submission.delivery).toMatchObject({
      accepted: false,
      delivered: false,
      uncertain: true,
    });
    configureResend();
    await admitEmail(true);
    await runScheduled();
    expect((await inspection(saved.id)).submission).toMatchObject({
      status: "attention",
      providerMessageId: null,
      delivery: { uncertain: true },
    });
    expect(posts()).toHaveLength(1);
  });

  it("blocks another queued recipient from an authenticated unmatched suppression report, including across pause/resume", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    resend.next(429);
    await runScheduled();
    const original = submissions()[0]!;
    await admitEmail(false);
    expect(
      (
        await callback(
          reportBody("email.suppressed", {
            email_id: "outside_application",
            tags: undefined,
            message_id: undefined,
            suppressed: { type: "OnAccountSuppressionList" },
          }),
        )
      ).status,
    ).toBe(200);
    await admitEmail(true);
    vi.setSystemTime(Date.now() + 15 * 60_000);
    await runScheduled();
    expect((await inspection(saved.id)).submission).toMatchObject({
      status: "attention",
      providerMessageId: null,
      delivery: { recipientBlocked: true, delivered: false },
    });
    expect(submissions()[0]).toMatchObject({
      request_json: original.request_json,
      send_key: original.send_key,
      first_possible_at: original.first_possible_at,
    });
    expect(posts()).toHaveLength(1);
  });

  it("matches the immutable sender mailbox rather than a provider-normalized display name", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    resend.next("lose");
    await runScheduled();
    expect(
      (
        await callback(
          reportBody("email.delivered", {
            from: "reservas@notificaciones.hotelmanantialchurin.com",
          }),
        )
      ).status,
    ).toBe(200);
    expect((await inspection(saved.id)).submission.delivery).toMatchObject({
      delivered: true,
      conflict: false,
    });
  });

  it("resolves a lost response with signed delivery while paused and without an API credential, but quarantines another endpoint context", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    resend.next("lose");
    await runScheduled();
    const original = submissions()[0]!;
    await admitEmail(false);
    delete db.env.RESEND_API_KEY;
    db.env.RESEND_API_URL = "http://localhost:88";
    expect((await callback(reportBody())).status).toBe(200);
    expect((await inspection(saved.id)).submission).toMatchObject({
      providerMessageId: null,
      delivery: { delivered: false, uncertain: true, conflict: true },
    });
    db.env.RESEND_API_URL = RESEND_LOOPBACK;
    expect((await callback(reportBody())).status).toBe(200);
    await runScheduled();
    expect((await inspection(saved.id)).submission).toMatchObject({
      providerMessageId: "email_1",
      delivery: { delivered: true, uncertain: false, conflict: true },
    });
    expect(submissions()[0]).toMatchObject({
      request_json: original.request_json,
      send_key: original.send_key,
      first_possible_at: original.first_possible_at,
    });
    expect(posts()).toHaveLength(1);
  });

  it("preserves a positive suppression lookup without treating it as delivery or starting another POST", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    await runScheduled();
    await admitEmail(false);
    resend.lookup({ id: "email_1", last_event: "suppressed", from: FROM, to: [contact.email] });
    vi.setSystemTime(Date.now() + 15 * 60_000);
    await runScheduled();
    expect((await inspection(saved.id)).submission.delivery).toMatchObject({
      accepted: true,
      delivered: false,
      suppressed: true,
      recipientBlocked: true,
    });
    await admitEmail(true);
    await runScheduled();
    expect(posts()).toHaveLength(1);
  });

  it("stops automatic retries on a signed correlation conflict without claiming acceptance or forgetting uncertainty", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    resend.next("lose");
    await runScheduled();
    expect(
      (await callback(reportBody("email.delivered", { to: ["other@example.com"] }))).status,
    ).toBe(200);
    vi.setSystemTime(Date.now() + 60_000);
    await runScheduled();
    expect(posts()).toHaveLength(1);
    expect((await inspection(saved.id)).submission).toMatchObject({
      status: "attention",
      providerMessageId: null,
      delivery: { accepted: false, delivered: false, uncertain: true, conflict: true },
    });
  });
});

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

describe("deliberate confirmation resends", () => {
  it("does not retry an expired private link from a pre-upgrade immutable request with no new expiry metadata", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next(429);
    await runScheduled();
    const frozen = submissions()[0]!;
    db.sqlite.exec("UPDATE confirmation_submissions SET link_expires_on = NULL");
    vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
    await runScheduled();
    expect(posts()).toHaveLength(1);
    expect(submissions()[0]).toMatchObject({
      status: "unsent",
      failure_code: "access_expired",
      request_json: frozen.request_json,
      send_key: frozen.send_key,
      first_possible_at: frozen.first_possible_at,
    });
    expect(frozen.request_json).toContain(saved.token);
  });

  it("requires explicit duplicate acknowledgement and keeps two independent queued messages for the same reservation distinct", async () => {
    const { saved } = await confirmed();
    const path = `/reservations/${saved.id}/confirmation/resends`;
    const first = { requestId: crypto.randomUUID(), recipientEmail: "first@example.com" };
    const refused = await db.request(path, "POST", first);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({
      error: "deliberate resend may duplicate earlier delivery; acknowledgement is required",
    });
    expect(
      (await db.request(path, "POST", { ...first, acknowledgePossibleDuplicate: true })).status,
    ).toBe(201);
    expect(
      (
        await db.request(path, "POST", {
          ...first,
          requestId: crypto.randomUUID(),
          recipientEmail: "second@example.com",
          acknowledgePossibleDuplicate: true,
        })
      ).status,
    ).toBe(201);
    configureResend();
    await admitEmail(true);
    await runScheduled();
    expect(posts()).toHaveLength(3);
    expect(
      posts()
        .map((post) => JSON.parse(post.body).to[0])
        .sort((a: string, b: string) => a.localeCompare(b)),
    ).toEqual([contact.email, "first@example.com", "second@example.com"]);
    await runScheduled();
    expect(posts()).toHaveLength(3);
  });

  it.each(["snapshot", "marker"] as const)(
    "rechecks deliberate stay drift after the %s commits and before network",
    async (boundary) => {
      const { saved } = await confirmed();
      configureResend();
      await admitEmail(true);
      await runScheduled();
      const input = {
        requestId: crypto.randomUUID(),
        recipientEmail: contact.email,
        acknowledgePossibleDuplicate: true,
      };
      expect(
        (await db.request(`/reservations/${saved.id}/confirmation/resends`, "POST", input)).status,
      ).toBe(201);
      db.sqlite
        .exec(`CREATE TRIGGER edit_during_snapshot AFTER ${boundary === "snapshot" ? "INSERT" : "UPDATE"} ON confirmation_submissions
      WHEN NEW.deliberate_work_id IS NOT NULL ${boundary === "marker" ? "AND NEW.acceptance_possible > OLD.acceptance_possible" : ""}
      BEGIN UPDATE reservations SET revision = revision + 1, check_out = '2026-10-23' WHERE id = '${saved.id}'; END;`);
      await runScheduled();
      expect(posts()).toHaveLength(1);
      expect(submissions()[1]).toMatchObject({
        status: "unsent",
        failure_code: "snapshot_changed",
        acceptance_possible: 0,
        next_attempt_at: null,
      });
    },
  );

  it("cannot open a possible-acceptance clock or POST when durable attempt recording fails", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    await runScheduled();
    const input = {
      requestId: crypto.randomUUID(),
      recipientEmail: contact.email,
      acknowledgePossibleDuplicate: true,
    };
    expect(
      (await db.request(`/reservations/${saved.id}/confirmation/resends`, "POST", input)).status,
    ).toBe(201);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.sqlite.exec(
      "CREATE TRIGGER fail_attempt BEFORE INSERT ON confirmation_submission_attempts BEGIN SELECT RAISE(ABORT, 'synthetic attempt failure'); END;",
    );
    await runScheduled();
    const frozen = submissions()[1]!;
    expect(frozen).toMatchObject({
      status: "unsent",
      first_possible_at: null,
      acceptance_possible: 0,
    });
    expect(posts()).toHaveLength(1);
    expect(log.mock.calls).toEqual([["confirmation submission failed", saved.id]]);
    db.sqlite.exec("DROP TRIGGER fail_attempt");
    await runScheduled();
    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.body).toBe(frozen.request_json);
    expect(posts()[1]!.headers.get("idempotency-key")).toBe(frozen.send_key);
  });

  it.each(["lose", 429] as const)(
    "keeps the independent deliberate retry context across a pause beyond twenty hours after %s",
    async (outcome) => {
      const { saved } = await confirmed();
      configureResend();
      await admitEmail(true);
      await runScheduled();
      const input = {
        requestId: crypto.randomUUID(),
        recipientEmail: contact.email,
        acknowledgePossibleDuplicate: true,
      };
      const path = `/reservations/${saved.id}/confirmation/resends`;
      expect((await db.request(path, "POST", input)).status).toBe(201);
      resend.next(outcome);
      await runScheduled();
      const frozen = submissions()[1]!;
      await admitEmail(false);
      vi.setSystemTime(Date.now() + WINDOW_MS + 60_000);
      await runScheduled();
      expect(posts()).toHaveLength(2);
      await admitEmail(true);
      await runScheduled();
      expect(posts()).toHaveLength(outcome === "lose" ? 2 : 3);
      expect(submissions()[1]).toMatchObject({
        request_json: frozen.request_json,
        send_key: frozen.send_key,
        first_possible_at: frozen.first_possible_at,
        status: outcome === "lose" ? "attention" : "accepted",
      });
      if (outcome === 429) {
        expect(posts()[2]!.body).toBe(frozen.request_json);
        expect(posts()[2]!.headers.get("idempotency-key")).toBe(frozen.send_key);
      }
      expect((await db.request(path, "POST", input)).status).toBe(200);
      expect(submissions()).toHaveLength(2);
    },
  );

  it("refuses non-established desk, unfulfilled and missing-access work without creating mail or credentials", async () => {
    const first = await confirmed();
    const unfulfilled = await confirmed();
    const desk = await db.request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      guest: { fullName: "Desk guest" },
      checkIn: "2026-11-01",
      checkOut: "2026-11-02",
      rooms: [{ roomTypeId: "type-king", adults: 1, children: 0 }],
    });
    expect(desk.status).toBe(201);
    const { id: deskId } = (await desk.json()) as { id: string };
    for (const id of [deskId, unfulfilled.saved.id]) {
      const response = await db.request(`/reservations/${id}/confirmation/resends`, "POST", {
        requestId: crypto.randomUUID(),
        recipientEmail: contact.email,
        acknowledgePossibleDuplicate: true,
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "confirmation was not established" });
    }
    db.sqlite
      .prepare("DELETE FROM reservation_access WHERE reservation_id = ?")
      .run(first.saved.id);
    const missing = await db.request(
      `/reservations/${first.saved.id}/confirmation/resends`,
      "POST",
      {
        requestId: crypto.randomUUID(),
        recipientEmail: contact.email,
        acknowledgePossibleDuplicate: true,
      },
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "reservation access was not established" });
    expect(rows("SELECT id FROM confirmation_resends")).toEqual([]);
    expect(rows("SELECT reservation_id FROM reservation_access")).toEqual([
      { reservation_id: unfulfilled.saved.id },
    ]);
    expect(posts()).toHaveLength(0);
  });

  it("rolls back the command receipt and audit together on a real database failure without posting or logging private SQL", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    await runScheduled();
    const input = {
      requestId: crypto.randomUUID(),
      recipientEmail: "corrected@example.com",
      acknowledgePossibleDuplicate: true,
    };
    const path = `/reservations/${saved.id}/confirmation/resends`;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.sqlite.exec(
      "CREATE TRIGGER fail_resend BEFORE INSERT ON confirmation_resends BEGIN SELECT RAISE(ABORT, 'synthetic resend failure'); END;",
    );
    db.beforeCommit(async () => {
      await runScheduled();
      expect(posts()).toHaveLength(1);
    });
    const failed = await db.request(path, "POST", input);
    expect(failed.status).toBe(500);
    expect(rows("SELECT id FROM reservation_requests")).toEqual([]);
    expect(rows("SELECT id FROM confirmation_resends")).toEqual([]);
    await runScheduled();
    expect(posts()).toHaveLength(1);
    expect(log.mock.calls).toEqual([["confirmation resend command failed", saved.id]]);
    db.sqlite.exec("DROP TRIGGER fail_resend");
    const responses = await Promise.all([
      db.request(path, "POST", input),
      db.request(path, "POST", input),
    ]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 201]);
    expect(rows("SELECT id FROM confirmation_resends")).toEqual([{ id: input.requestId }]);
    await runScheduled();
    expect(posts()).toHaveLength(2);
    const replay = await db.request(path, "POST", input);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      work: { id: input.requestId, submission: { providerMessageId: "email_2" } },
    });
    await runScheduled();
    expect(posts()).toHaveLength(2);
  });

  it("keeps suppression on the original address and allows only an explicitly corrected recipient", async () => {
    const { saved } = await confirmed();
    configureResend();
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    await admitEmail(true);
    await runScheduled();
    expect((await callback(reportBody("email.complained"))).status).toBe(200);
    const path = `/reservations/${saved.id}/confirmation/resends`;
    const input = {
      requestId: crypto.randomUUID(),
      recipientEmail: contact.email,
      acknowledgePossibleDuplicate: true,
    };
    expect((await db.request(path, "POST", input)).status).toBe(201);
    await runScheduled();
    expect(posts()).toHaveLength(1);
    expect(submissions()[1]).toMatchObject({
      status: "attention",
      failure_code: "recipient_blocked",
      first_possible_at: null,
    });
    vi.setSystemTime(Date.now() + 1_000);
    await db.signIn("owner");
    expect(
      (
        await db.request(path, "POST", {
          ...input,
          requestId: crypto.randomUUID(),
          recipientEmail: "corrected@example.com",
        })
      ).status,
    ).toBe(201);
    await runScheduled();
    expect(posts()).toHaveLength(2);
    expect(JSON.parse(posts()[1]!.body).to).toEqual(["corrected@example.com"]);
    const view = (await (await db.request(`/reservations/${saved.id}/confirmation`)).json()) as {
      history: { requestedBy: unknown; submission: unknown }[];
    };
    expect(view.history[0]!.submission).toMatchObject({
      delivery: { accepted: true, complained: true, recipientBlocked: true },
    });
    expect(view.history[1]!.submission).toMatchObject({
      failureCode: "recipient_blocked",
      delivery: { recipientBlocked: true },
    });
    expect(view.history[2]).toMatchObject({
      requestedBy: { role: "owner", username: "duena" },
      submission: { delivery: { accepted: true, recipientBlocked: false } },
    });
  });

  it.each(["unsent", "uncertain"] as const)(
    "stops a frozen deliberate %s summary after staff changes rather than altering its body, key or clock",
    async (outcome) => {
      const { saved } = await confirmed();
      configureResend();
      await admitEmail(true);
      await runScheduled();
      expect(
        (
          await db.request(`/reservations/${saved.id}/confirmation/resends`, "POST", {
            requestId: crypto.randomUUID(),
            recipientEmail: contact.email,
            acknowledgePossibleDuplicate: true,
          })
        ).status,
      ).toBe(201);
      resend.next(outcome === "unsent" ? 429 : "lose");
      await runScheduled();
      const frozen = submissions()[1]!;
      expect(posts()).toHaveLength(2);
      await command(saved.id, [{ type: "set-status", status: "cancelled" }]);
      vi.setSystemTime(Date.now() + 15 * 60_000);
      await runScheduled();
      expect(posts()).toHaveLength(2);
      expect(submissions()[1]).toMatchObject({
        status: outcome === "unsent" ? "unsent" : "attention",
        failure_code: "snapshot_changed",
        request_json: frozen.request_json,
        send_key: frozen.send_key,
        first_possible_at: frozen.first_possible_at,
        next_attempt_at: null,
      });
      await command(saved.id, [{ type: "set-status", status: "confirmed" }]);
      await runScheduled();
      expect(posts()).toHaveLength(2);
    },
  );

  it("stops a still-frozen usable link when property-calendar expiry passes without rewriting the request", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    await runScheduled();
    vi.setSystemTime(new Date("2026-11-22T04:59:00Z"));
    await db.signIn("staff");
    expect(
      (
        await db.request(`/reservations/${saved.id}/confirmation/resends`, "POST", {
          requestId: crypto.randomUUID(),
          recipientEmail: contact.email,
          acknowledgePossibleDuplicate: true,
        })
      ).status,
    ).toBe(201);
    resend.next("lose");
    await runScheduled();
    const frozen = submissions()[1]!;
    expect(frozen.request_json).toContain(saved.token);
    vi.setSystemTime(new Date("2026-11-22T05:00:00Z"));
    await runScheduled();
    expect(posts()).toHaveLength(2);
    expect(submissions()[1]).toMatchObject({
      status: "attention",
      failure_code: "access_expired",
      request_json: frozen.request_json,
      send_key: frozen.send_key,
      first_possible_at: frozen.first_possible_at,
    });
  });

  it("snapshots current cancelled money after real edits, refund and coupon work while the command was paused", async () => {
    const { saved } = await confirmed();
    const originalAccess = await (await db.request(`/reservations/${saved.id}/access`)).json();
    const input = {
      requestId: crypto.randomUUID(),
      recipientEmail: contact.email,
      acknowledgePossibleDuplicate: true,
    };
    expect(
      (await db.request(`/reservations/${saved.id}/confirmation/resends`, "POST", input)).status,
    ).toBe(201);
    await command(saved.id, [{ type: "dates", checkIn: "2026-10-24", checkOut: "2026-10-27" }]);
    await command(saved.id, [{ type: "set-status", status: "cancelled" }]);
    const detail = (await (await db.request(`/reservations/${saved.id}`)).json()) as {
      payments: { id: string }[];
    };
    await command(saved.id, [
      {
        type: "request-refund",
        paymentId: detail.payments[0]!.id,
        amountCents: 3000,
        method: "transfer",
        reason: "Agreed bank transfer",
        completed: { refundDate: "2026-10-10" },
      },
    ]);
    await command(saved.id, [{ type: "issue-coupon", amountCents: 2000, guestAccepted: true }]);
    await command(saved.id, [
      {
        type: "request-refund",
        paymentId: detail.payments[0]!.id,
        amountCents: 1000,
        method: "transfer",
        reason: "Remaining transfer",
      },
    ]);
    const moneyBeforeSend = await (await db.request(`/reservations/${saved.id}`)).json();
    configureResend();
    await admitEmail(true);
    await runScheduled();
    expect(posts()).toHaveLength(1);
    const message = JSON.parse(posts()[0]!.body) as { text: string; html: string; subject: string };
    for (const part of [message.text, message.html]) {
      for (const fact of [
        "Status: Cancelled",
        "2026-10-24",
        "2026-10-27",
        "Total: PEN 0.00",
        "Paid: PEN 100.00",
        "Outstanding balance: PEN 0.00",
        "Refund due: PEN 50.00",
        "Completed refunds: PEN 30.00",
        "Pending refunds (not returned): PEN 10.00",
        "Coupon settlement (not cash): PEN 0.00",
        "Converted into coupons (not refunded): PEN 20.00",
        "Accepted free-cancellation deadline: 2026-10-22",
        summaryLink("en", saved.token),
      ])
        expect(part).toContain(fact);
      expect(part).not.toContain("Paid in full");
      expect(part).not.toContain("Free cancellation until");
    }
    expect(message.subject).not.toContain("confirmation");
    expect(message.html).toContain("Your reservation summary");
    expect(message.html).not.toContain("Your reservation is confirmed");
    expect(message.html).not.toContain("We look forward to welcoming you");
    expect(await (await db.request(`/reservations/${saved.id}`)).json()).toEqual(moneyBeforeSend);
    expect(await (await db.request(`/reservations/${saved.id}/access`)).json()).toEqual(
      originalAccess,
    );
    expect(submissions().find((row) => row.failure_code === "not_confirmed")?.send_key).toBeNull();
  });

  it("uses assistance after fixed access expiry rather than emailing an expired or renewed link", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    await runScheduled();
    await admitEmail(false);
    const originalAccess = (await (
      await db.request(`/reservations/${saved.id}/access`)
    ).json()) as { token: string; expiresOn: string };
    vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
    await db.signIn("staff");
    expect(
      (
        await db.request(`/reservations/${saved.id}/confirmation/resends`, "POST", {
          requestId: crypto.randomUUID(),
          recipientEmail: contact.email,
          acknowledgePossibleDuplicate: true,
        })
      ).status,
    ).toBe(201);
    await admitEmail(true);
    await runScheduled();
    expect(posts()).toHaveLength(2);
    const message = JSON.parse(posts()[1]!.body) as { html: string; text: string };
    for (const part of [message.html, message.text]) {
      expect(part).not.toContain(saved.token);
      expect(part).not.toContain("/reservar/resumen/");
      expect(part).toContain(
        "Online access expired on 2026-11-21. Contact the hotel for assistance.",
      );
      expect(part).toContain(PHONE);
    }
    expect(await (await db.request(`/reservations/${saved.id}/access`)).json()).toEqual({
      ...originalAccess,
      expired: true,
    });
    expect((await guest("/public/reservation", { token: saved.token })).status).toBe(401);
  });

  it("sends deliberate corrected work independently without rewriting an uncertain original and exposes safe full history", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("lose");
    await runScheduled();
    const original = submissions()[0]!;
    const input = {
      requestId: crypto.randomUUID(),
      recipientEmail: "corrected@example.com",
      acknowledgePossibleDuplicate: true,
    };
    const requested = await db.request(
      `/reservations/${saved.id}/confirmation/resends`,
      "POST",
      input,
    );
    expect(requested.status).toBe(201);
    expect(posts()).toHaveLength(1);
    await runScheduled();
    expect(posts()).toHaveLength(2);
    const corrected = JSON.parse(posts()[1]!.body) as {
      to: string[];
      subject: string;
      text: string;
      html: string;
      tags: unknown;
    };
    expect(corrected.to).toEqual([input.recipientEmail]);
    expect(corrected.subject).toBe(`Reservation summary ${saved.code}`);
    expect(corrected.text).toContain("Status: Confirmed");
    expect(corrected.text).toContain("Summary as of 2026-10-10T15:00:00.000Z");
    expect(corrected.text).toContain("Outstanding balance: PEN 100.00");
    expect(corrected.text).toContain(summaryLink("en", saved.token));
    expect(posts()[1]!.headers.get("idempotency-key")).not.toBe(original.send_key);
    expect(submissions()[0]).toEqual(original);
    db.env.RESEND_WEBHOOK_SECRET = REPORT_SECRET;
    expect(
      (
        await callback(
          reportBody("email.delivered", {
            email_id: "email_2",
            to: [input.recipientEmail],
            tags: Object.fromEntries(
              (corrected.tags as { name: string; value: string }[]).map((tag) => [
                tag.name,
                tag.value,
              ]),
            ),
          }),
        )
      ).status,
    ).toBe(200);
    expect(submissions()[0]).toEqual(original);
    const response = await db.request(`/reservations/${saved.id}/confirmation`);
    const safe = await response.text();
    const view = JSON.parse(safe) as {
      history: {
        submission: {
          id: string;
          endpoint: string;
          attempts: unknown[];
          firstPossibleAt: string;
          delivery: unknown;
        };
      }[];
    };
    expect(view.history).toHaveLength(2);
    expect(view.history[0]!.submission).toMatchObject({
      id: original.id,
      firstPossibleAt: original.first_possible_at,
      delivery: { uncertain: true },
      attempts: [{ outcome: "uncertain", startedAt: "2026-10-10T15:00:00.000Z" }],
    });
    expect(view.history[1]!.submission).toMatchObject({
      endpoint: `${RESEND_LOOPBACK}/emails`,
      providerMessageId: "email_2",
      delivery: {
        accepted: true,
        delivered: true,
        history: expect.arrayContaining([
          expect.objectContaining({ messageId: "<synthetic@example.com>" }),
        ]),
      },
      attempts: [{ outcome: "accepted", providerMessageId: "email_2" }],
    });
    for (const secret of [
      saved.token,
      RESEND_TEST_KEY,
      "requestJson",
      "credentialFingerprint",
      "request_json",
      "tokenHash",
      "bodyDigest",
    ])
      expect(safe).not.toContain(secret);
    expect(corrected.html.replace(`href="${summaryLink("en", saved.token)}"`, "")).not.toContain(
      saved.token,
    );
    expect(
      JSON.stringify([
        corrected.subject,
        corrected.tags,
        posts()[1]!.headers.get("idempotency-key"),
      ]),
    ).not.toContain(saved.token);
    expect(await (await db.request(`/reservations/${saved.id}`)).json()).toMatchObject({
      guest: { email: contact.email },
    });
  });

  it("records account-attributed separate work while paused and replays the committed command before revalidating current state", async () => {
    const { saved, checkout } = await confirmed();
    const path = `/reservations/${saved.id}/confirmation/resends`;
    const input = {
      requestId: crypto.randomUUID(),
      recipientEmail: "corrected@example.com",
      acknowledgePossibleDuplicate: true,
    };
    for (const token of [undefined, checkout.token, saved.token]) {
      expect((await guest(path, { token, body: input })).status).toBe(401);
    }
    const requested = await db.request(path, "POST", input);
    expect(requested.status).toBe(201);
    expect(requested.headers.get("cache-control")).toBe("private, no-store");
    const result = await requested.json();
    expect(result).toMatchObject({
      mayDuplicateEarlierDelivery: true,
      work: {
        id: input.requestId,
        kind: "deliberate_resend",
        recipientEmail: input.recipientEmail,
        requestedBy: { username: "hotelmanantial", role: "staff" },
        submission: null,
      },
    });
    await command(saved.id, [{ type: "set-status", status: "cancelled" }]);
    vi.setSystemTime(Date.now() + 60_000);
    await db.signIn("owner");
    const replay = await db.request(path, "POST", input);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(result);
    const changed = await db.request(path, "POST", {
      ...input,
      recipientEmail: "different@example.com",
    });
    expect(changed.status).toBe(409);
    expect(await changed.json()).toEqual({ error: "request ID reused with a different payload" });
    const inspected = await db.request(`/reservations/${saved.id}/confirmation`);
    expect(await inspected.json()).toMatchObject({
      recipientEmail: contact.email,
      history: [
        { kind: "automatic", recipientEmail: contact.email },
        { kind: "deliberate_resend", recipientEmail: input.recipientEmail },
      ],
    });
    expect(posts()).toHaveLength(0);
  });
});

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
    attachments: { content: string; content_id: string; content_type: string }[];
  };
  const link = summaryLink(language, saved.token);
  expect(message.from).toBe(FROM);
  expect(message.to).toEqual(["ana@example.com"]);
  expect(message.reply_to).toBe(REPLY_TO);
  expect(message.cc).toBeUndefined();
  expect(message.bcc).toBeUndefined();
  expect(message.subject).toContain(saved.code);
  expect(message.html).toContain(
    language === "en" ? "Your reservation is confirmed" : "Tu reserva está confirmada",
  );
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
    expect(part).toContain("PEN 200.00");
    expect(part).toContain("PEN 100.00");
    expect(part).toContain(PHONE);
    expect(part).toContain(REPLY_TO);
    expect(part).toContain(link);
    expect(part.toLowerCase()).not.toContain("paid in full");
    expect(part.toLowerCase()).not.toContain("pagado en su totalidad");
  }
  expect(message.attachments).toHaveLength(1);
  expect(message.attachments[0]?.content_type).toBe("image/png");
  expect(Buffer.from(message.attachments[0]!.content, "base64").subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(message.html).toContain(`src="cid:${message.attachments[0]!.content_id}"`);
  expect(message.html.match(/<img\b/g)).toHaveLength(1);
  expect(message.html).toContain(`href="${link}"`);
  expect(message.html.replace(`href="${link}"`, "")).not.toContain(saved.token);
  expect(message.text.replace(link, "")).not.toContain(saved.token);
  return message;
}

describe("confirmation submissions", () => {
  it("escapes room names in HTML while preserving the plain-text booking details", async () => {
    await confirmed();
    db.sqlite
      .prepare("UPDATE room_types SET name = ? WHERE id = 'type-king'")
      .run('King & <img src="x" onerror="alert(1)">');
    configureResend();
    await admitEmail(true);

    await runScheduled();

    const message = JSON.parse(posts()[0]!.body) as { html: string; text: string };
    expect(message.html).toContain("King &amp; &lt;img src=&quot;x&quot;");
    expect(message.html).not.toContain('<img src="x"');
    expect(message.html).not.toContain('onerror="alert(1)"');
    expect(message.text).toContain('King & <img src="x" onerror="alert(1)">');
  });

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
    expect(first).toContain("PEN 200.00");
    expect(first).not.toContain("PEN 150.00");
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
    expect(posts()[1]!.body).not.toContain("PEN 150.00");
    expect(posts()[1]!.body).not.toContain("PEN 999.00");
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
      status: "unsent",
      failure_code: "quota",
      send_key: `confirmation/${submissions()[0]!.intent_id}`,
      provider_message_id: null,
      acceptance_possible: 0,
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

  it.each([429, "timeout", "accepted"] as const)(
    "does not retry a %s confirmation after staff cancel the reservation",
    async (outcome) => {
      const { saved } = await confirmed();
      configureResend();
      await admitEmail(true);
      if (outcome !== "accepted") resend.next(outcome);
      await runScheduled();
      const stored = submissions()[0]!;
      await command(saved.id, [{ type: "set-status", status: "cancelled" }]);
      vi.setSystemTime(new Date(Date.now() + 15 * 60_000));

      await runScheduled();

      expect(posts()).toHaveLength(1);
      expect(submissions()).toEqual([
        expect.objectContaining({
          id: stored.id,
          status:
            outcome === "accepted" ? "accepted" : outcome === "timeout" ? "attention" : "unsent",
          failure_code: outcome === "accepted" ? null : "not_confirmed",
          next_attempt_at: null,
          acceptance_possible: stored.acceptance_possible,
          provider_message_id: stored.provider_message_id,
          send_key: stored.send_key,
          request_json: stored.request_json,
          first_possible_at: stored.first_possible_at,
        }),
      ]);
      await command(saved.id, [{ type: "set-status", status: "confirmed" }]);
      await runScheduled();
      expect(posts()).toHaveLength(1);
    },
  );

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
    expect(submissions()).toEqual([
      expect.objectContaining({
        status: "attention",
        failure_code: "missing_access",
        send_key: null,
        request_json: null,
        first_possible_at: null,
        next_attempt_at: null,
        acceptance_possible: 0,
      }),
    ]);
    expect(rows("SELECT reservation_id FROM reservation_access")).toEqual([]);
    expect(rows("SELECT id FROM confirmation_intents")).toHaveLength(1);
    const inspected = await db.request(`/reservations/${saved.id}/confirmation`);
    expect(inspected.status).toBe(200);
    expect(await inspected.json()).toMatchObject({
      submission: { status: "attention", failureCode: "missing_access" },
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain(saved.token);
    expect(JSON.stringify(error.mock.calls)).not.toContain("ana@example.com");
    error.mockRestore();
  });

  it.each(["missing_access", "snapshot_failed"] as const)(
    "progresses beyond a full batch of %s intents without sending malformed work",
    async (failureCode) => {
      const malformed: string[] = [];
      for (let day = 1; day <= 11; day++) {
        const { saved } = await confirmed("en", {
          checkIn: `2026-11-${String(day).padStart(2, "0")}`,
          checkOut: `2026-11-${String(day + 1).padStart(2, "0")}`,
        });
        malformed.push(saved.id);
        vi.setSystemTime(new Date(Date.now() + 1_000));
      }
      if (failureCode === "missing_access") db.sqlite.exec("DELETE FROM reservation_access");
      else db.sqlite.exec("UPDATE reservations SET free_cancellation_days = 1000000000000000");
      const valid = await confirmed();
      configureResend();
      await admitEmail(true);

      await runScheduled();
      await runScheduled();

      expect(posts()).toHaveLength(1);
      expect(posts()[0]!.body).toContain(valid.saved.code);
      expect(submissions()).toHaveLength(12);
      for (const id of malformed) {
        const inspected = await db.request(`/reservations/${id}/confirmation`);
        expect(inspected.status).toBe(200);
        expect(await inspected.json()).toMatchObject({
          submission: {
            status: "attention",
            failureCode,
            sendKey: null,
            firstPossibleAt: null,
            nextAttemptAt: null,
          },
        });
      }
      await runScheduled();
      expect(posts()).toHaveLength(1);
      if (failureCode === "missing_access")
        expect(rows("SELECT reservation_id FROM reservation_access")).toEqual([
          { reservation_id: valid.saved.id },
        ]);
    },
  );

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

  it("does not post or log the access token when the submission insert fails", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    db.sqlite.exec(`
      CREATE TRIGGER fail_submission_insert BEFORE INSERT ON confirmation_submissions
      BEGIN
        SELECT RAISE(ABORT, 'submission insert failed');
      END;
    `);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await runScheduled();

    expect(posts()).toEqual([]);
    expect(submissions()).toEqual([]);
    const logged = error.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
    expect(logged).toContain(saved.id);
    expect(logged).not.toContain(saved.token);
    expect(logged).not.toContain("Failed query");
    expect(logged).not.toContain(RESEND_TEST_KEY);
    expect(error.mock.calls).toEqual([["confirmation submission failed", saved.id]]);
    error.mockRestore();
  });

  it("keeps a transient snapshot database failure pending, without inventing a terminal context", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const prepare = db.env.DB.prepare.bind(db.env.DB);
    const failure = vi.spyOn(db.env.DB, "prepare").mockImplementation((query) => {
      if (query.includes('from "room_types"'))
        throw new Error(`database unavailable ${saved.token}`);
      return prepare(query);
    });

    await runScheduled();

    expect(posts()).toEqual([]);
    expect(submissions()).toEqual([]);
    expect(error.mock.calls).toEqual([["confirmation submission failed", saved.id]]);
    failure.mockRestore();
    await runScheduled();
    expect(posts()).toHaveLength(1);
    expect(submissions()[0]!.status).toBe("accepted");
  });

  it("commits the submission before posting, then records a lost acceptance on the next tick", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    db.sqlite.exec(`
      CREATE TRIGGER fail_acceptance_update BEFORE UPDATE ON confirmation_submissions
      WHEN NEW.status = 'accepted'
      BEGIN
        SELECT RAISE(ABORT, 'acceptance update failed');
      END;
    `);
    resend.duringNext(() => {
      const posted = resend.requests.at(-1)!;
      const row = db.sqlite
        .prepare(
          "SELECT send_key, request_json, status, acceptance_possible, first_possible_at FROM confirmation_submissions",
        )
        .get() as {
        send_key: string;
        request_json: string;
        status: string;
        acceptance_possible: number;
        first_possible_at: string;
      };
      expect(row.status).toBe("uncertain");
      expect(row.acceptance_possible).toBe(1);
      expect(row.first_possible_at).toBe(new Date().toISOString());
      expect(row.send_key).toBe(posted.headers.get("idempotency-key"));
      expect(row.request_json).toBe(posted.body);
      expect(row.request_json).toContain(saved.code);
    });

    await runScheduled();

    const stored = submissions()[0]!;
    expect(stored.status).not.toBe("accepted");
    expect(stored.provider_message_id).toBeNull();
    expect(posts()).toHaveLength(1);
    expect(error.mock.calls).toEqual([["confirmation submission failed", saved.id]]);
    db.sqlite.exec("DROP TRIGGER fail_acceptance_update");

    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.headers.get("idempotency-key")).toBe(stored.send_key);
    expect(posts()[1]!.body).toBe(stored.request_json);
    expect(submissions()).toEqual([
      expect.objectContaining({
        id: stored.id,
        send_key: stored.send_key,
        status: "accepted",
        provider_message_id: "email_1",
      }),
    ]);
  });

  it.each([401, 403, 422, 429] as const)(
    "retries a received %s as known-unsent beyond 20 hours with the same key",
    async (status) => {
      await confirmed();
      configureResend();
      await admitEmail(true);
      resend.next(status);

      await runScheduled();

      const stored = submissions()[0]!;
      expect(stored).toMatchObject({
        status: "unsent",
        failure_code: status === 429 ? "quota" : status === 422 ? "rejected" : "configuration",
        acceptance_possible: 0,
        provider_message_id: null,
      });
      expect(stored.send_key).toBe(`confirmation/${stored.intent_id}`);
      expect(stored.first_possible_at).toEqual(expect.any(String));
      vi.setSystemTime(new Date(Date.parse(stored.first_possible_at!) + WINDOW_MS + 60_000));

      await runScheduled();

      expect(posts()).toHaveLength(2);
      expect(posts()[1]!.headers.get("idempotency-key")).toBe(stored.send_key);
      expect(posts()[1]!.body).toBe(stored.request_json);
      expect(submissions()[0]).toMatchObject({
        status: "accepted",
        send_key: stored.send_key,
        first_possible_at: stored.first_possible_at,
      });
    },
  );

  it("keeps a 401 after a timeout uncertain and stops at the window", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("timeout");
    await runScheduled();
    vi.setSystemTime(new Date(Date.now() + 60_000));
    resend.next(401);

    await runScheduled();

    expect(submissions()[0]).toMatchObject({
      status: "uncertain",
      failure_code: "configuration",
      acceptance_possible: 1,
    });
    const stored = submissions()[0]!;
    vi.setSystemTime(new Date(Date.parse(stored.first_possible_at!) + WINDOW_MS));

    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(submissions()[0]).toMatchObject({ status: "attention", send_key: stored.send_key });
  });

  it("does not send an uncertain submission after the window when Retry-After is longer", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("timeout");
    await runScheduled();
    vi.setSystemTime(new Date(Date.now() + 60_000));
    resend.retryAfter("90000");
    resend.next(429);

    await runScheduled();

    expect(submissions()[0]).toMatchObject({ status: "uncertain", acceptance_possible: 1 });
    const stored = submissions()[0]!;
    expect(Date.parse(stored.next_attempt_at!) - Date.now()).toBe(90_000_000);
    vi.setSystemTime(new Date(Date.parse(stored.first_possible_at!) + WINDOW_MS));
    await runScheduled();
    expect(posts()).toHaveLength(2);
    expect(submissions()[0]!.status).toBe("attention");
    vi.setSystemTime(new Date(Date.parse(stored.next_attempt_at!)));

    await runScheduled();

    expect(posts()).toHaveLength(2);
    expect(submissions()[0]).toMatchObject({
      status: "attention",
      send_key: stored.send_key,
      first_possible_at: stored.first_possible_at,
    });
  });

  it("waits at least Retry-After seconds before retrying a 429", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.retryAfter("1200");
    resend.next(429);

    await runScheduled();

    const stored = submissions()[0]!;
    expect(stored.status).toBe("unsent");
    expect(Date.parse(stored.next_attempt_at!) - Date.now()).toBeGreaterThanOrEqual(1200 * 1000);
    await runScheduled();
    expect(posts()).toHaveLength(1);
    vi.setSystemTime(new Date(Date.parse(stored.next_attempt_at!) - 1));
    await runScheduled();
    expect(posts()).toHaveLength(1);
    vi.setSystemTime(new Date(Date.parse(stored.next_attempt_at!)));
    resend.next("timeout");
    await runScheduled();
    expect(posts()).toHaveLength(2);
    expect(Date.parse(submissions()[0]!.next_attempt_at!) - Date.now()).toBe(60 * 60_000);
    expect(submissions()[0]!.first_possible_at).toBe(stored.first_possible_at);
  });

  it("waits for a Retry-After HTTP-date", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.retryAfter("Sat, 10 Oct 2026 15:25:00 GMT");
    resend.next(429);

    await runScheduled();

    expect(Date.parse(submissions()[0]!.next_attempt_at!)).toBeGreaterThanOrEqual(
      Date.parse("2026-10-10T15:25:00.000Z"),
    );
  });

  it("stops before the next intent when the first send pauses submission", async () => {
    await confirmed();
    await confirmed("en", { checkIn: "2026-11-02", checkOut: "2026-11-04" });
    configureResend();
    await admitEmail(true);
    resend.duringNext(async () => {
      await admitEmail(false);
    });

    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(submissions()).toHaveLength(1);
    expect(rows("SELECT id FROM confirmation_intents")).toHaveLength(2);
  });

  it("does not open the send clock if admission pauses after the snapshot commits but before POST", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    db.sqlite.exec(`
      CREATE TRIGGER pause_after_snapshot AFTER INSERT ON confirmation_submissions
      BEGIN
        UPDATE operation_controls SET email_submission_admitted = 0 WHERE id = 1;
      END;
    `);

    await runScheduled();

    expect(posts()).toEqual([]);
    const stored = submissions()[0]!;
    expect(stored).toMatchObject({
      status: "unsent",
      first_possible_at: null,
      acceptance_possible: 0,
    });
    db.sqlite.exec("DROP TRIGGER pause_after_snapshot");
    vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 60_000));
    await admitEmail(true);
    await runScheduled();
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body).toBe(stored.request_json);
    expect(posts()[0]!.headers.get("idempotency-key")).toBe(stored.send_key);
    expect(submissions()[0]).toMatchObject({
      status: "accepted",
      first_possible_at: new Date().toISOString(),
    });
  });

  it("stops remaining due work when the first retry pauses admission", async () => {
    await confirmed();
    await confirmed("en", { checkIn: "2026-11-02", checkOut: "2026-11-04" });
    configureResend();
    await admitEmail(true);
    resend.next("timeout", "timeout");
    await runScheduled();
    const stored = submissions();
    vi.setSystemTime(new Date(Date.now() + 60_000));
    resend.duringNext(async () => {
      await admitEmail(false);
    });
    const before = resend.requests.length;

    await runScheduled();

    expect(resend.requests).toHaveLength(before + 1);
    expect(resend.requests.at(-1)!.method).toBe("POST");
    expect(submissions()).toHaveLength(2);
    for (const row of stored)
      expect(submissions()).toContainEqual(
        expect.objectContaining({
          id: row.id,
          send_key: row.send_key,
          first_possible_at: row.first_possible_at,
          request_json: row.request_json,
        }),
      );
  });

  it.each(["pause", "expiry"] as const)(
    "rechecks %s after the possible-acceptance write, before POST",
    async (change) => {
      await confirmed();
      configureResend();
      await admitEmail(true);
      resend.next("timeout");
      await runScheduled();
      const stored = submissions()[0]!;
      vi.setSystemTime(new Date(Date.parse(stored.first_possible_at!) + WINDOW_MS - 1_000));
      db.sqlite.function("expire_send_window", () => {
        vi.setSystemTime(new Date(Date.parse(stored.first_possible_at!) + WINDOW_MS));
        return 1;
      });
      db.sqlite.exec(`
      CREATE TRIGGER change_during_attempt AFTER UPDATE ON confirmation_submissions
      WHEN NEW.acceptance_possible > OLD.acceptance_possible
      BEGIN
        ${change === "pause" ? "UPDATE operation_controls SET email_submission_admitted = 0 WHERE id = 1;" : "SELECT expire_send_window();"}
      END;
    `);

      await runScheduled();

      expect(posts()).toHaveLength(1);
      expect(submissions()[0]).toMatchObject({
        status: change === "pause" ? "uncertain" : "attention",
        send_key: stored.send_key,
        first_possible_at: stored.first_possible_at,
        request_json: stored.request_json,
      });
      if (change === "pause") expect(submissions()[0]!.acceptance_possible).toBe(1);
    },
  );

  it.each([401, 429] as const)(
    "preserves the previous %s failure when submission pauses before the retry reaches the network",
    async (status) => {
      await confirmed();
      configureResend();
      await admitEmail(true);
      resend.next(status);
      await runScheduled();
      const stored = submissions()[0]!;
      vi.setSystemTime(new Date(stored.next_attempt_at!));
      db.sqlite.exec(`
        CREATE TRIGGER pause_retry AFTER UPDATE ON confirmation_submissions
        WHEN NEW.acceptance_possible > OLD.acceptance_possible
        BEGIN
          UPDATE operation_controls SET email_submission_admitted = 0 WHERE id = 1;
        END;
      `);

      await runScheduled();

      expect(posts()).toHaveLength(1);
      expect(submissions()[0]).toMatchObject({
        status: "unsent",
        failure_code: stored.failure_code,
        acceptance_possible: 0,
        send_key: stored.send_key,
        request_json: stored.request_json,
        first_possible_at: stored.first_possible_at,
      });
    },
  );

  it.each(["snapshot", 429, "timeout"] as const)(
    "rechecks cancellation at the pre-POST boundary after %s commits",
    async (boundary) => {
      const { saved } = await confirmed();
      configureResend();
      await admitEmail(true);
      if (boundary !== "snapshot") {
        resend.next(boundary);
        await runScheduled();
        vi.setSystemTime(new Date(submissions()[0]!.next_attempt_at!));
      }
      const before = submissions()[0];
      db.sqlite.exec(`
        CREATE TRIGGER cancel_before_post AFTER ${boundary === "snapshot" ? "INSERT" : "UPDATE"} ON confirmation_submissions
        ${boundary === "snapshot" ? "" : "WHEN NEW.acceptance_possible > OLD.acceptance_possible"}
        BEGIN
          UPDATE reservations SET status = 'cancelled' WHERE id = '${saved.id}';
        END;
      `);

      await runScheduled();

      expect(posts()).toHaveLength(boundary === "snapshot" ? 0 : 1);
      expect(submissions()[0]).toMatchObject({
        status: boundary === "timeout" ? "attention" : "unsent",
        failure_code: "not_confirmed",
        next_attempt_at: null,
        acceptance_possible: before?.acceptance_possible ?? 0,
        first_possible_at: before?.first_possible_at ?? null,
      });
      if (before)
        expect(submissions()[0]).toMatchObject({
          send_key: before.send_key,
          request_json: before.request_json,
        });
    },
  );

  it("records positive acceptance even when cancellation stops a concurrent retry", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    resend.duringNext(async () => {
      await command(saved.id, [{ type: "set-status", status: "cancelled" }]);
      await runScheduled();
      expect(submissions()[0]!.status).toBe("attention");
    });

    await runScheduled();
    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(submissions()[0]).toMatchObject({
      status: "accepted",
      provider_message_id: "email_1",
      failure_code: null,
      next_attempt_at: null,
    });
  });

  it("does not let a late known-unsent response clear another concurrent timeout", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next(401);
    await runScheduled();
    const stored = submissions()[0]!;
    vi.setSystemTime(new Date(Date.now() + 60_000));
    resend.next(401, "timeout");
    resend.duringNext(async () => {
      await runScheduled();
    });

    await runScheduled();

    expect(posts()).toHaveLength(3);
    expect(submissions()[0]).toMatchObject({
      status: "uncertain",
      acceptance_possible: 1,
      first_possible_at: stored.first_possible_at,
    });
    vi.setSystemTime(new Date(Date.parse(stored.first_possible_at!) + WINDOW_MS));
    await runScheduled();
    expect(posts()).toHaveLength(3);
    expect(submissions()[0]!.status).toBe("attention");
  });

  it("does not shorten a concurrent Retry-After when an older timeout returns", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next(401);
    await runScheduled();
    vi.setSystemTime(new Date(Date.now() + 60_000));
    resend.next("timeout", 429);
    resend.retryAfter("0");
    resend.retryAfter("1200");
    resend.duringNext(async () => {
      await runScheduled();
    });

    await runScheduled();

    expect(posts()).toHaveLength(3);
    expect(submissions()[0]).toMatchObject({ status: "uncertain", acceptance_possible: 1 });
    expect(Date.parse(submissions()[0]!.next_attempt_at!) - Date.now()).toBeGreaterThanOrEqual(
      1_200_000,
    );
    vi.setSystemTime(new Date(Date.now() + 1_199_999));
    await runScheduled();
    expect(posts()).toHaveLength(3);
  });

  it("does not retry a submission after the Resend key changes", async () => {
    const { saved } = await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("timeout");
    await runScheduled();
    const fingerprint = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(RESEND_TEST_KEY)),
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    expect(
      db.sqlite.prepare("SELECT credential_fingerprint FROM confirmation_submissions").get(),
    ).toEqual({ credential_fingerprint: fingerprint });
    db.env.RESEND_API_KEY = "re_test_other";
    vi.setSystemTime(new Date(Date.now() + 60_000));

    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(resend.requests.filter((request) => request.method === "GET")).toEqual([]);
    expect(submissions()[0]).toMatchObject({
      status: "attention",
      failure_code: "credential_changed",
      send_key: `confirmation/${submissions()[0]!.intent_id}`,
    });
    const response = await db.request(`/reservations/${saved.id}/confirmation`);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("credential_changed");
    expect(text).not.toContain(RESEND_TEST_KEY);
    expect(text).not.toContain("re_test_other");
    expect(text).not.toContain(fingerprint);
  });

  it("retains legacy submissions without inventing the credential that opened them", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    resend.next("timeout");
    await runScheduled();
    const stored = submissions()[0]!;
    db.sqlite.exec("UPDATE confirmation_submissions SET credential_fingerprint = NULL");
    vi.setSystemTime(new Date(Date.now() + 60_000));

    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(submissions()[0]).toMatchObject({
      status: "attention",
      failure_code: "credential_changed",
      send_key: stored.send_key,
      request_json: stored.request_json,
      first_possible_at: stored.first_possible_at,
    });
    expect(
      db.sqlite.prepare("SELECT credential_fingerprint FROM confirmation_submissions").get(),
    ).toEqual({ credential_fingerprint: null });
  });

  it("sends a not-yet-opened intent with the current key", async () => {
    await confirmed();
    configureResend();
    db.env.RESEND_API_KEY = "re_test_other";
    await admitEmail(true);

    await runScheduled();

    expect(posts()).toHaveLength(1);
    expect(submissions()[0]!.status).toBe("accepted");
    expect(submissions()[0]!.failure_code).toBeNull();
  });

  it.each(["timeout", 401, "invalid"] as const)(
    "does not let a late %s overwrite a concurrent scheduled acceptance near the window",
    async (outcome) => {
      await confirmed();
      configureResend();
      await admitEmail(true);
      resend.next("timeout");
      await runScheduled();
      const stored = submissions()[0]!;
      vi.setSystemTime(new Date(Date.parse(stored.first_possible_at!) + WINDOW_MS - 60_000));
      resend.duringNext(async () => {
        await runScheduled();
        expect(submissions()[0]!.status).toBe("accepted");
        vi.setSystemTime(new Date(Date.now() + 2 * 60_000));
      });
      resend.next(outcome);

      await runScheduled();

      expect(submissions()[0]).toMatchObject({
        status: "accepted",
        provider_message_id: "email_1",
        send_key: stored.send_key,
        first_possible_at: stored.first_possible_at,
      });
      expect(posts()).toHaveLength(3);
      for (const posted of posts()) {
        expect(posted.headers.get("idempotency-key")).toBe(stored.send_key);
        expect(posted.body).toBe(stored.request_json);
        expect(posted.url).toBe(stored.endpoint);
      }
      await runScheduled();
      expect(posts()).toHaveLength(3);
    },
  );

  it("freezes the configured currency in the stored body", async () => {
    await confirmed();
    configureResend();
    await admitEmail(true);
    db.env.CURRENCY = "USD";
    resend.next("timeout");

    await runScheduled();

    expect(posts()[0]!.body).toContain("USD 200.00");
    expect(posts()[0]!.body).not.toContain("S/ 200.00");
    db.env.CURRENCY = "EUR";
    vi.setSystemTime(new Date(Date.now() + 60_000));

    await runScheduled();

    expect(posts()[1]!.body).toBe(posts()[0]!.body);
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
