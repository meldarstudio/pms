import {
  fakeTurnstile,
  TURNSTILE_ORIGIN,
  TURNSTILE_PASS,
  TURNSTILE_TEST_SECRET,
  COMPLAINT_TURNSTILE_PASS,
} from "../test-support/turnstile";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { ComplaintSheet } from "../complaint-book";
import { getDb } from "../db";
import { sendComplaintEmails } from "../complaint-emails";
import { fakeResend, RESEND_TEST_KEY, RESEND_LOOPBACK } from "../test-support/resend";
import { app } from "../index";
import { createTestDb, type TestDb } from "../test-support/d1";

import { complaintBook } from "../complaint-config";
import { complaintInput, complaintSubmission } from "../test-support/complaints";

type Sheet = ComplaintSheet;
let db: TestDb;
function stubServices(mail?: { fetch: typeof fetch }) {
  const security = fakeTurnstile();
  vi.stubGlobal("fetch", ((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    return (url.origin === TURNSTILE_ORIGIN ? security : (mail ?? security)).fetch(input, init);
  }) as typeof fetch);
  return security;
}
beforeEach(async () => {
  db = await createTestDb();
  db.env.TURNSTILE_SECRET_KEY = TURNSTILE_TEST_SECRET;
  stubServices();
});
afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("stores an unreserved foreign-document sheet once across retries, numbered in its property-time filing year, and keeps receipts private", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-01-01T04:30:00Z"));
  const token = crypto.randomUUID() + crypto.randomUUID();
  const send = (body = complaintInput, bearer = token) =>
    app.request(
      "http://localhost/public/complaints",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ ...body, turnstileToken: COMPLAINT_TURNSTILE_PASS }),
      },
      db.env,
    );
  const response = await send();
  expect(response.status).toBe(201);
  const sheet = (await response.json()) as Sheet;
  expect(sheet).toMatchObject({
    bookId: "LR",
    reference: "000000001-2026",
    input: complaintInput,
    email: { status: "pending" },
    provider: complaintBook.provider,
  });
  expect(await (await send()).json()).toEqual(sheet);
  expect((await send({ ...complaintInput, description: "Changed text" })).status).toBe(409);
  expect(
    (await app.request("http://localhost/public/complaints/000000001-2026", {}, db.env)).status,
  ).toBe(404);
  const read = await app.request(
    "http://localhost/public/complaints/receipt",
    { headers: { authorization: `Bearer ${token}` } },
    db.env,
  );
  expect(await read.json()).toEqual(sheet);
  expect((await app.request("http://localhost/public/complaints/receipt", {}, db.env)).status).toBe(
    401,
  );
});

it.each([
  ["missing", undefined, 400],
  ["invalid", "forged-token", 403],
  ["payment action", TURNSTILE_PASS, 403],
] as const)(
  "rejects a %s security token before recording or queuing a sheet",
  async (_name, turnstileToken, status) => {
    const response = await app.request(
      "http://localhost/public/complaints",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
        },
        body: JSON.stringify({ ...complaintInput, turnstileToken }),
      },
      db.env,
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "complaint security check failed" });
    expect(db.sqlite.prepare("SELECT count(*) AS count FROM complaint_sheets").get()).toEqual({
      count: 0,
    });
    expect(db.sqlite.prepare("SELECT count(*) AS count FROM complaint_emails").get()).toEqual({
      count: 0,
    });
  },
);

it("survives concurrent filing with unique consecutive references and one replayed sheet", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
  const tokens = [
    crypto.randomUUID() + crypto.randomUUID(),
    crypto.randomUUID() + crypto.randomUUID(),
  ];
  const responses = await Promise.all(
    [tokens[0], tokens[1], tokens[0]].map(async (token) =>
      app.request(
        "http://localhost/public/complaints",
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(complaintSubmission),
        },
        db.env,
      ),
    ),
  );
  for (const response of responses) expect(response.status).toBeLessThan(300);
  const sheets = await Promise.all(
    responses.map(async (response) => (await response.json()) as Sheet),
  );
  expect(sheets[0].reference).toBe(sheets[2].reference);
  expect(new Set(sheets.map((sheet) => sheet.reference))).toEqual(
    new Set(["000000001-2026", "000000002-2026"]),
  );
});

it("transcribes a physical backup sheet once when its retry commits first, numbered after the virtual sheets", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
  const file = () =>
    app.request(
      "http://localhost/public/complaints",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
        },
        body: JSON.stringify(complaintSubmission),
      },
      db.env,
    );
  expect(await (await file()).json()).toMatchObject({ reference: "000000001-2026" });
  await db.signIn("owner");
  const backup = {
    requestId: crypto.randomUUID(),
    originalReference: "RESPALDO-0007",
    filedAt: "2026-11-10T15:00:00.000Z",
    restoredAt: "2026-11-12T15:00:00.000Z",
    input: complaintInput,
  };
  const transcribe = () => db.request("/complaints/backups", "POST", backup);
  let retry: Promise<Response> | undefined;
  db.beforeCommit(() => (retry = transcribe()));
  const first = await transcribe();
  const committed = await retry!;
  expect([committed.status, first.status]).toEqual([201, 200]);
  const saved = (await committed.json()) as Sheet;
  const replayed = (await first.json()) as Sheet;
  expect(saved).toMatchObject({
    reference: "000000002-2026",
    source: "physical",
    originalReference: backup.originalReference,
    filedAt: backup.filedAt,
  });
  expect(replayed).toEqual(saved);
  expect((await transcribe()).status).toBe(200);
  expect(await (await file()).json()).toMatchObject({ reference: "000000003-2026" });
});

it("lets only the owner record responses and void each once with a reason, after which it no longer answers the sheet", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T02:00:00Z"));
  const token = crypto.randomUUID() + crypto.randomUUID();
  const filed = await app.request(
    "http://localhost/public/complaints",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(complaintSubmission),
    },
    db.env,
  );
  const sheet = (await filed.json()) as Sheet;
  const response = {
    requestId: crypto.randomUUID(),
    text: "Written response sent",
    channel: "email",
    recipient: "ana@example.com",
    sentOn: "2026-11-14",
    evidence: "Owner mailbox / sent message 123",
  };
  const voiding = { reason: "Recorded on the wrong sheet" };
  const voidPath = `/complaints/${sheet.id}/responses/${response.requestId}/void`;
  expect((await db.request("/complaints")).status).toBe(403);
  expect((await db.request(voidPath, "POST", voiding)).status).toBe(403);
  await db.signIn("owner");
  expect((await db.request(`/complaints/${sheet.id}/responses`, "POST", response)).status).toBe(
    201,
  );
  expect((await db.request(`/complaints/${sheet.id}/responses`, "POST", response)).status).toBe(
    200,
  );
  expect(await (await db.request("/complaints")).json()).toMatchObject([
    { id: sheet.id, responseStatus: "recorded" },
  ]);
  expect((await db.request(voidPath, "POST", voiding)).status).toBe(201);
  expect((await db.request(voidPath, "POST", voiding)).status).toBe(200);
  expect((await db.request(voidPath, "POST", { reason: "Another reason" })).status).toBe(409);
  expect(await (await db.request("/complaints")).json()).toMatchObject([
    { id: sheet.id, dueDate: sheet.dueDate, responseStatus: "pending" },
  ]);
  const detail = (await (await db.request(`/complaints/${sheet.id}`)).json()) as Sheet;
  expect(detail.input).toEqual(complaintInput);
  expect(detail.responses).toMatchObject([
    {
      text: response.text,
      sentOn: "2026-11-14",
      voided: { reason: voiding.reason },
    },
  ]);
  expect(
    db.sqlite
      .prepare("SELECT sent_on FROM complaint_responses WHERE id = ?")
      .get(response.requestId),
  ).toEqual({ sent_on: "2026-11-14" });
  const receipt = await app.request(
    "http://localhost/public/complaints/receipt",
    { headers: { authorization: `Bearer ${token}` } },
    db.env,
  );
  expect(await receipt.json()).toMatchObject({ responses: [] });
});

async function fileWithReceipt() {
  db.env.RESEND_API_KEY = RESEND_TEST_KEY;
  db.env.RESEND_API_URL = RESEND_LOOPBACK;
  const provider = fakeResend();
  stubServices(provider);
  const filed = await app.request(
    "http://localhost/public/complaints",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
      },
      body: JSON.stringify(complaintSubmission),
    },
    db.env,
  );
  return { provider, sheet: (await filed.json()) as Sheet };
}
const sendDue = () => sendComplaintEmails(getDb(db.env.DB), db.env);

it("flags a refused receipt and sends one explicit copy of the same saved sheet under a new key", async () => {
  const { provider, sheet } = await fileWithReceipt();
  provider.next(422);
  await sendDue();
  await sendDue();
  expect(provider.requests).toHaveLength(1);
  await db.signIn("owner");
  expect(await (await db.request(`/complaints/${sheet.id}`)).json()).toMatchObject({
    reference: sheet.reference,
    filedAt: sheet.filedAt,
    email: { status: "failed" },
  });
  const copy = { requestId: crypto.randomUUID() };
  expect((await db.request(`/complaints/${sheet.id}/email-copies`, "POST", copy)).status).toBe(201);
  expect((await db.request(`/complaints/${sheet.id}/email-copies`, "POST", copy)).status).toBe(200);
  expect(
    (
      await db.request(`/complaints/${sheet.id}/email-copies`, "POST", {
        requestId: crypto.randomUUID(),
      })
    ).status,
  ).toBe(409);
  await sendDue();
  await sendDue();
  const detail = (await (await db.request(`/complaints/${sheet.id}`)).json()) as Sheet;
  expect(detail).toMatchObject({
    reference: sheet.reference,
    filedAt: sheet.filedAt,
    dueDate: sheet.dueDate,
    email: { status: "sent" },
  });
  expect(detail.emails.map((email) => email.status)).toEqual(["sent", "failed"]);
  expect(await (await db.request("/complaints")).json()).toMatchObject([
    { id: sheet.id, responseStatus: "pending" },
  ]);
  expect(provider.requests).toHaveLength(2);
  expect(provider.requests[1].headers.get("idempotency-key")).not.toBe(
    provider.requests[0].headers.get("idempotency-key"),
  );
  expect(provider.requests[1].body).toBe(provider.requests[0].body);
  expect(provider.emails).toHaveLength(1);
  expect(
    (
      await db.request(`/complaints/${sheet.id}/email-copies`, "POST", {
        requestId: crypto.randomUUID(),
      })
    ).status,
  ).toBe(409);
});

it.each([
  { outcomes: ["lose", 500] as const, requests: 3, status: "sent" },
  { outcomes: [500, 500, 500, 500, 500] as const, requests: 5, status: "failed" },
])(
  "retries a temporary handoff failure with the same key and message until it ends $status",
  async ({ outcomes, requests, status }) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
    const { provider, sheet } = await fileWithReceipt();
    provider.next(...outcomes);
    for (let tick = 0; tick < 12; tick++) {
      await sendDue();
      vi.setSystemTime(Date.now() + 60 * 60_000);
    }
    expect(provider.requests).toHaveLength(requests);
    expect(new Set(provider.requests.map((request) => request.body)).size).toBe(1);
    expect(
      new Set(provider.requests.map((request) => request.headers.get("idempotency-key"))).size,
    ).toBe(1);
    await db.signIn("owner");
    expect(await (await db.request(`/complaints/${sheet.id}`)).json()).toMatchObject({
      email: { status },
    });
  },
);

it("stops automatic retries once the provider's deduplication window may have passed, leaving an explicit copy", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
  const { provider, sheet } = await fileWithReceipt();
  provider.next("lose");
  await sendDue();
  vi.setSystemTime(new Date("2026-11-15T14:00:00Z"));
  await sendDue();
  expect(provider.requests).toHaveLength(1);
  await db.signIn("owner");
  expect(await (await db.request(`/complaints/${sheet.id}`)).json()).toMatchObject({
    email: { status: "failed" },
  });
  const copy = { requestId: crypto.randomUUID() };
  expect((await db.request(`/complaints/${sheet.id}/email-copies`, "POST", copy)).status).toBe(201);
  await sendDue();
  expect(provider.requests).toHaveLength(2);
  expect(provider.requests[1].body).toBe(provider.requests[0].body);
  expect(await (await db.request(`/complaints/${sheet.id}`)).json()).toMatchObject({
    email: { status: "sent" },
  });
});

it("rolls back the sheet and number if its email work cannot be stored", async () => {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const send = () =>
    app.request(
      "http://localhost/public/complaints",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(complaintSubmission),
      },
      db.env,
    );
  db.sqlite.exec(
    "CREATE TRIGGER fail_email BEFORE INSERT ON complaint_emails BEGIN SELECT RAISE(ABORT, 'storage failure'); END;",
  );
  expect((await send()).status).toBe(500);
  await db.signIn("owner");
  expect(await (await db.request("/complaints")).json()).toEqual([]);
  db.sqlite.exec("DROP TRIGGER fail_email;");
  expect(await (await send()).json()).toMatchObject({
    reference: expect.stringMatching(/^000000001-\d{4}$/),
    email: { status: "pending" },
  });
});

it.each(["complaint_sheets", "complaint_responses", "complaint_response_voids"])(
  "preserves filed %s against direct updates and deletion",
  async (table) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
    const filed = await app.request(
      "http://localhost/public/complaints",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
        },
        body: JSON.stringify(complaintSubmission),
      },
      db.env,
    );
    const sheet = (await filed.json()) as Sheet;
    await db.signIn("owner");
    const requestId = crypto.randomUUID();
    expect(
      (
        await db.request(`/complaints/${sheet.id}/responses`, "POST", {
          requestId,
          text: "Original written response",
          channel: "email",
          recipient: "ana@example.com",
          sentOn: "2026-11-14",
          evidence: "Original evidence",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await db.request(`/complaints/${sheet.id}/responses/${requestId}/void`, "POST", {
          reason: "Recorded by mistake",
        })
      ).status,
    ).toBe(201);
    const id = table === "complaint_sheets" ? sheet.id : requestId;
    const key = table === "complaint_response_voids" ? "response_id" : "id";
    const original = db.sqlite.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).get(id);
    expect(original).toBeDefined();
    expect(() =>
      db.sqlite.prepare(`UPDATE ${table} SET ${key} = 'replacement' WHERE ${key} = ?`).run(id),
    ).toThrow("filed complaint records are immutable");
    expect(() => db.sqlite.prepare(`DELETE FROM ${table} WHERE ${key} = ?`).run(id)).toThrow(
      "filed complaint records are immutable",
    );
    expect(db.sqlite.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).get(id)).toEqual(original);
  },
);
