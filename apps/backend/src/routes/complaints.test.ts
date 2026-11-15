import {
  fakeTurnstile,
  TURNSTILE_ORIGIN,
  TURNSTILE_PASS,
  TURNSTILE_TEST_SECRET,
  COMPLAINT_TURNSTILE_PASS,
} from "../test-support/turnstile";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { complaintView } from "../complaints";
import { getDb } from "../db";
import { sendComplaintEmails } from "../complaint-emails";
import { fakeResend, RESEND_TEST_KEY, RESEND_LOOPBACK } from "../test-support/resend";
import { app } from "../index";
import { createTestDb, type TestDb } from "../test-support/d1";

import { complaintBook } from "../complaint-config";
import { complaintInput, complaintSubmission } from "../test-support/complaints";

type Sheet = Awaited<ReturnType<typeof complaintView>>;
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

it("lets only the owner read and append actual responses and correction evidence", async () => {
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
  expect((await db.request("/complaints")).status).toBe(403);
  await db.signIn("owner");
  const list = await (await db.request("/complaints")).json();
  expect(list).toMatchObject([
    { id: sheet.id, reference: sheet.reference, responseStatus: "pending" },
  ]);
  const response = {
    requestId: crypto.randomUUID(),
    text: "Written response sent",
    channel: "email",
    recipient: "ana@example.com",
    sentAt: new Date().toISOString(),
    evidence: "Owner mailbox / sent message 123",
    correctsId: null,
  };
  expect((await db.request(`/complaints/${sheet.id}/responses`, "POST", response)).status).toBe(
    201,
  );
  expect((await db.request(`/complaints/${sheet.id}/responses`, "POST", response)).status).toBe(
    200,
  );
  const correction = {
    ...response,
    requestId: crypto.randomUUID(),
    correctsId: response.requestId,
    text: "Corrected response evidence",
    evidence: "Owner mailbox / sent message 124",
  };
  expect((await db.request(`/complaints/${sheet.id}/responses`, "POST", correction)).status).toBe(
    201,
  );
  const detail = (await (await db.request(`/complaints/${sheet.id}`)).json()) as Sheet;
  expect(detail.input).toEqual(complaintInput);
  expect(detail.responses.map((entry: { text: string }) => entry.text)).toEqual([
    response.text,
    correction.text,
  ]);
  expect(
    (
      await db.request(`/complaints/${sheet.id}/responses`, "POST", {
        ...response,
        requestId: crypto.randomUUID(),
        sentAt: "2099-01-01T00:00:00Z",
      })
    ).status,
  ).toBe(400);
});

it("keeps registration after receipt failure and retries the same saved email safely", async () => {
  db.env.RESEND_API_KEY = RESEND_TEST_KEY;
  db.env.RESEND_API_URL = RESEND_LOOPBACK;
  const provider = fakeResend();
  stubServices(provider);
  provider.next(422);
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
  await sendComplaintEmails(getDb(db.env.DB), db.env);
  await db.signIn("owner");
  expect(await (await db.request(`/complaints/${sheet.id}`)).json()).toMatchObject({
    reference: sheet.reference,
    filedAt: sheet.filedAt,
    email: { status: "failed" },
  });
  const retry = { requestId: crypto.randomUUID() };
  expect((await db.request(`/complaints/${sheet.id}/email-retry`, "POST", retry)).status).toBe(200);
  await sendComplaintEmails(getDb(db.env.DB), db.env);
  expect((await db.request(`/complaints/${sheet.id}/email-retry`, "POST", retry)).status).toBe(200);
  await sendComplaintEmails(getDb(db.env.DB), db.env);
  const detail = (await (await db.request(`/complaints/${sheet.id}`)).json()) as Sheet;
  expect(detail.email.status).toBe("sent");
  expect(provider.emails).toHaveLength(1);
  expect(provider.requests[0].body).toBe(provider.requests[1].body);
  const email = JSON.parse(provider.emails[0].body);
  expect(email.subject).toBe(`Libro de Reclamaciones — Complaint sheet No. ${sheet.reference}`);
  expect(email.text).toContain(`HOJA DE RECLAMACIÓN (complaint sheet) No. ${sheet.reference}`);
  expect(email.text).toContain("Identification code: LR");
  expect(email.text).toContain(complaintInput.description);
  expect(email.text).toContain("Recipient: consumer");
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

it.each(["complaint_sheets", "complaint_responses"])(
  "preserves filed %s against direct updates and deletion",
  async (table) => {
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
          sentAt: new Date().toISOString(),
          evidence: "Original evidence",
          correctsId: null,
        })
      ).status,
    ).toBe(201);
    const id = table === "complaint_sheets" ? sheet.id : requestId;
    const original = db.sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    expect(() =>
      db.sqlite.prepare(`UPDATE ${table} SET id = 'replacement' WHERE id = ?`).run(id),
    ).toThrow("filed complaint records are immutable");
    expect(() => db.sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)).toThrow(
      "filed complaint records are immutable",
    );
    expect(db.sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)).toEqual(original);
  },
);
