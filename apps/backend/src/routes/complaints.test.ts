import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { complaintView } from "../complaints";
import { getDb } from "../db";
import { sendComplaintEmails } from "../complaint-emails";
import { fakeResend, RESEND_TEST_KEY, RESEND_LOOPBACK } from "../test-support/resend";
import { app } from "../index";
import { createTestDb, type TestDb } from "../test-support/d1";

import { developmentBook, complaintInput } from "../test-support/complaints";

type Sheet = Awaited<ReturnType<typeof complaintView>>;
let db: TestDb;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps the development book unavailable without configuration and on production hosts", async () => {
  for (const url of [
    "http://localhost/public/complaints/config",
    "https://api.hotelmanantialchurin.com/public/complaints/config",
  ]) {
    const response = await app.request(url, {}, db.env);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
});

it("stores an unreserved foreign-document sheet once across retries and keeps receipts private", async () => {
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
  const token = crypto.randomUUID() + crypto.randomUUID();
  const send = (body = complaintInput, bearer = token) =>
    app.request(
      "http://localhost/public/complaints",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
        body: JSON.stringify(body),
      },
      db.env,
    );
  const response = await send();
  expect(response.status).toBe(201);
  const sheet = (await response.json()) as Sheet;
  expect(sheet).toMatchObject({
    reference: "DEMO-000041",
    input: complaintInput,
    email: { status: "pending" },
    provider: developmentBook.provider,
  });
  expect(await (await send()).json()).toEqual(sheet);
  expect((await send({ ...complaintInput, description: "Changed text" })).status).toBe(409);
  expect(
    (await app.request("http://localhost/public/complaints/DEMO-000041", {}, db.env)).status,
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

it("survives concurrent filing with unique consecutive references and one replayed sheet", async () => {
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
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
          body: JSON.stringify(complaintInput),
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
    new Set(["DEMO-000041", "DEMO-000042"]),
  );
});

it("lets only the owner read and append actual responses and correction evidence", async () => {
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
  const filed = await app.request(
    "http://localhost/public/complaints",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
      },
      body: JSON.stringify(complaintInput),
    },
    db.env,
  );
  const sheet = (await filed.json()) as Sheet;
  expect((await db.request("/complaints")).status).toBe(403);
  await db.signIn("owner");
  const list = await (await db.request("/complaints")).json();
  expect(list).toMatchObject([
    { id: sheet.id, reference: "DEMO-000041", responseStatus: "pending" },
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

it("counts configured holidays and weekends in property time and preserves physical filing history", async () => {
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
  await db.signIn("owner");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-07T14:00:00Z"));
  const body = {
    requestId: crypto.randomUUID(),
    originalReference: "PAPER-2026-17",
    filedAt: "2026-12-05T02:00:00Z",
    restoredAt: "2026-12-07T13:00:00Z",
    input: {
      ...complaintInput,
      minor: true,
      representative: "Parent: Rosa Torres, passport AA222, Lima, +51 999999999",
      category: "queja",
    },
  };
  const result = await db.request("/complaints/backups", "POST", body);
  expect(result.status).toBe(201);
  const saved = (await result.json()) as Sheet;
  expect(saved).toMatchObject({
    filedAt: body.filedAt,
    originalReference: body.originalReference,
    source: "physical",
    dueDate: "2026-12-30",
    email: { status: "not_requested" },
  });
  expect(((await (await db.request("/complaints/backups", "POST", body)).json()) as Sheet).id).toBe(
    saved.id,
  );
});

it("keeps registration after receipt failure and retries the same saved email safely", async () => {
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
  db.env.RESEND_API_KEY = RESEND_TEST_KEY;
  db.env.RESEND_API_URL = RESEND_LOOPBACK;
  const provider = fakeResend();
  vi.stubGlobal("fetch", provider.fetch);
  provider.next(422);
  const filed = await app.request(
    "http://localhost/public/complaints",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
      },
      body: JSON.stringify(complaintInput),
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
  expect(JSON.parse(provider.emails[0].body).text).toContain(sheet.reference);
  expect(JSON.parse(provider.emails[0].body).text).toContain(complaintInput.description);
});

it("rejects incomplete minor details accessibly and refuses filing beyond the configured calendar", async () => {
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
  const send = (input: unknown) =>
    app.request(
      "http://localhost/public/complaints",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
        },
        body: JSON.stringify(input),
      },
      db.env,
    );
  const invalid = await send({ ...complaintInput, minor: true });
  expect(invalid.status).toBe(400);
  expect(invalid.headers.get("X-Error-Field")).toBe("representative");
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify({
    ...developmentBook,
    calendar: { ...developmentBook.calendar, through: "2026-01-02" },
  });
  expect((await send(complaintInput)).status).toBe(503);
  expect(
    (await app.request("https://api.hotelmanantialchurin.com/public/complaints/config", {}, db.env))
      .status,
  ).toBe(503);
});

it("rolls back the sheet and number if its email work cannot be stored", async () => {
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
  const token = crypto.randomUUID() + crypto.randomUUID();
  const send = () =>
    app.request(
      "http://localhost/public/complaints",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(complaintInput),
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
    reference: "DEMO-000041",
    email: { status: "pending" },
  });
});

it("recovers an accepted email after a provider response is lost without duplicating it", async () => {
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
  db.env.RESEND_API_KEY = RESEND_TEST_KEY;
  db.env.RESEND_API_URL = RESEND_LOOPBACK;
  const provider = fakeResend();
  vi.stubGlobal("fetch", provider.fetch);
  provider.next("lose");
  const filed = await app.request(
    "http://localhost/public/complaints",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
      },
      body: JSON.stringify(complaintInput),
    },
    db.env,
  );
  const sheet = (await filed.json()) as Sheet;
  await Promise.all([
    sendComplaintEmails(getDb(db.env.DB), db.env),
    sendComplaintEmails(getDb(db.env.DB), db.env),
  ]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.now() + 120000));
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify({
    ...developmentBook,
    provider: { ...developmentBook.provider, legalName: "Changed development operator" },
  });
  await sendComplaintEmails(getDb(db.env.DB), db.env);
  await db.signIn("owner");
  expect(await (await db.request(`/complaints/${sheet.id}`)).json()).toMatchObject({
    provider: developmentBook.provider,
    filedAt: sheet.filedAt,
    email: { status: "sent" },
  });
  expect(provider.emails).toHaveLength(1);
  expect(provider.requests[0].body).toBe(provider.requests[1].body);
});

it("sends a previously untouched receipt after a day-long outage and retries a definitive rejection", async () => {
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
  db.env.RESEND_API_KEY = RESEND_TEST_KEY;
  db.env.RESEND_API_URL = RESEND_LOOPBACK;
  const provider = fakeResend();
  vi.stubGlobal("fetch", provider.fetch);
  const filed = await app.request(
    "http://localhost/public/complaints",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
      },
      body: JSON.stringify(complaintInput),
    },
    db.env,
  );
  const sheet = (await filed.json()) as Sheet;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.now() + 25 * 3600000));
  provider.next(422);
  await sendComplaintEmails(getDb(db.env.DB), db.env);
  expect(provider.requests).toHaveLength(1);
  vi.setSystemTime(new Date(Date.now() + 25 * 3600000));
  await db.signIn("owner");
  expect(
    (
      await db.request(`/complaints/${sheet.id}/email-retry`, "POST", {
        requestId: crypto.randomUUID(),
      })
    ).status,
  ).toBe(200);
  await sendComplaintEmails(getDb(db.env.DB), db.env);
  expect(await (await db.request(`/complaints/${sheet.id}`)).json()).toMatchObject({
    email: { status: "sent" },
    filedAt: sheet.filedAt,
  });
});

it.each(["complaint_sheets", "complaint_responses"])(
  "preserves filed %s against direct updates and deletion",
  async (table) => {
    db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
    const filed = await app.request(
      "http://localhost/public/complaints",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
        },
        body: JSON.stringify(complaintInput),
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

it("holds an uncertain email for manual handling after provider deduplication expires", async () => {
  db.env.COMPLAINT_BOOK_DEVELOPMENT = JSON.stringify(developmentBook);
  db.env.RESEND_API_KEY = RESEND_TEST_KEY;
  db.env.RESEND_API_URL = RESEND_LOOPBACK;
  const provider = fakeResend();
  vi.stubGlobal("fetch", provider.fetch);
  provider.next("lose");
  const filed = await app.request(
    "http://localhost/public/complaints",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${crypto.randomUUID() + crypto.randomUUID()}`,
      },
      body: JSON.stringify(complaintInput),
    },
    db.env,
  );
  const sheet = (await filed.json()) as Sheet;
  await sendComplaintEmails(getDb(db.env.DB), db.env);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.now() + 25 * 3600000));
  await sendComplaintEmails(getDb(db.env.DB), db.env);
  await db.signIn("owner");
  expect(
    (
      await db.request(`/complaints/${sheet.id}/email-retry`, "POST", {
        requestId: crypto.randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect(await (await db.request(`/complaints/${sheet.id}`)).json()).toMatchObject({
    filedAt: sheet.filedAt,
    email: { status: "failed", lastError: "retry_window_expired" },
  });
  expect(provider.requests).toHaveLength(1);
  expect(provider.emails).toHaveLength(1);
});
