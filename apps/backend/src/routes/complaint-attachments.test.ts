import { fakeTurnstile, TURNSTILE_TEST_SECRET } from "../test-support/turnstile";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vite-plus/test";
import { Miniflare } from "miniflare";
import { app } from "../index";
import { signIn, PORTAL_ORIGIN } from "../test-support/auth";
import { createTestDb, type TestDb } from "../test-support/d1";
import { complaintSubmission } from "../test-support/complaints";

let platform: Miniflare;
let attachments: R2Bucket;
let db: TestDb;
let cookie: string;
let token: string;
let complaintId: string;
let responseId: string;
const pdf = "%PDF-1.7\nTest refund receipt\n%%EOF";

beforeAll(async () => {
  platform = new Miniflare({
    workers: [
      {
        config: {
          name: "complaint-files-test",
          compatibilityDate: "2026-10-08",
          env: { COMPLAINT_ATTACHMENTS: { type: "r2", name: "complaint-files-test" } },
          manifest: {
            mainModule: "index.js",
            modules: { "index.js": { type: "esm", contents: "export default {}" } },
          },
        },
      },
    ],
  });
  ({ COMPLAINT_ATTACHMENTS: attachments } = await platform.getBindings<{
    COMPLAINT_ATTACHMENTS: R2Bucket;
  }>());
}, 30000);
afterAll(async () => platform?.dispose());
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
  db = await createTestDb();
  db.env.TURNSTILE_SECRET_KEY = TURNSTILE_TEST_SECRET;
  vi.stubGlobal("fetch", fakeTurnstile().fetch);
  db.env.COMPLAINT_ATTACHMENTS = attachments;
  token = crypto.randomUUID() + crypto.randomUUID();
  const filed = await app.request(
    "http://localhost/public/complaints",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(complaintSubmission),
    },
    db.env,
  );
  complaintId = ((await filed.json()) as { id: string }).id;
  await db.signIn("owner");
  cookie = await signIn(db.env, "owner");
  responseId = crypto.randomUUID();
  expect(
    (
      await db.request(`/complaints/${complaintId}/responses`, "POST", {
        requestId: responseId,
        text: "Refund confirmed by email",
        channel: "email",
        recipient: "ana@example.com",
        sentOn: "2026-11-14",
        evidence: "Sent email 123",
      })
    ).status,
  ).toBe(201);
});
afterEach(() => {
  db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const path = (id: string) => `/complaints/${complaintId}/responses/${responseId}/attachments/${id}`;
const upload = (
  id: string,
  content: string | ArrayBuffer = pdf,
  name = "Reembolso.pdf",
  contentType = "application/pdf",
) =>
  app.request(
    `http://localhost${path(id)}`,
    {
      method: "PUT",
      headers: {
        cookie,
        origin: PORTAL_ORIGIN,
        "content-type": contentType,
        "X-Attachment-Name": encodeURIComponent(name),
      },
      body: content,
    },
    db.env,
  );

it("preserves owner evidence once across retries and downloads the original file", async () => {
  const id = crypto.randomUUID();
  const saved = await upload(id);
  expect(saved.status).toBe(201);
  expect((await upload(id)).status).toBe(200);
  const sheet = (await (await db.request(`/complaints/${complaintId}`)).json()) as {
    responses: { attachments: { id: string; name: string; size: number; uploadedAt: string }[] }[];
  };
  expect(sheet.responses[0]!.attachments).toEqual([
    expect.objectContaining({ id, name: "Reembolso.pdf", size: 34 }),
  ]);
  const download = await db.request(path(id));
  expect(download.status).toBe(200);
  expect(download.headers.get("cache-control")).toBe("private, no-store");
  expect(download.headers.get("content-disposition")).toContain("attachment;");
  expect(download.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await download.text()).toBe(pdf);
});

it("keeps owner attachments out of public receipts and denies anonymous and staff access", async () => {
  const id = crypto.randomUUID();
  expect((await upload(id)).status).toBe(201);
  const receipt = await app.request(
    "http://localhost/public/complaints/receipt",
    { headers: { authorization: `Bearer ${token}` } },
    db.env,
  );
  expect((await receipt.json()) as unknown).toMatchObject({ responses: [] });
  expect((await db.request(path(id), "GET", undefined, { signedIn: false })).status).toBe(401);
  expect(
    (await app.request(`http://localhost${path(id)}`, { method: "PUT", body: pdf }, db.env)).status,
  ).toBe(401);
  await db.signIn("staff");
  expect((await db.request(path(id))).status).toBe(403);
  cookie = await signIn(db.env, "staff");
  expect((await upload(crypto.randomUUID())).status).toBe(403);
});

it.each([
  {
    name: "Empty.pdf",
    content: "",
    type: "application/pdf",
    error: "complaint attachment is empty",
  },
  {
    name: "Too large.pdf",
    content: "%PDF-" + "x".repeat(5 * 1024 * 1024),
    type: "application/pdf",
    error: "complaint attachment exceeds 5 MB",
  },
  {
    name: "Page.html",
    content: "<html>test</html>",
    type: "text/html",
    error: "unsupported complaint attachment type",
  },
  {
    name: "Fake.pdf",
    content: "<html>test</html>",
    type: "application/pdf",
    error: "unsupported complaint attachment type",
  },
  {
    name: "Mismatch.png",
    content: pdf,
    type: "application/pdf",
    error: "unsupported complaint attachment type",
  },
  {
    name: "../Receipt.pdf",
    content: pdf,
    type: "application/pdf",
    error: "invalid complaint attachment name",
  },
])("rejects $name without adding it to the reply", async ({ name, content, type, error }) => {
  const response = await upload(crypto.randomUUID(), content, name, type);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error });
  const sheet = (await (await db.request(`/complaints/${complaintId}`)).json()) as {
    responses: { attachments: unknown[] }[];
  };
  expect(sheet.responses[0]!.attachments).toEqual([]);
});

it("preserves attachment metadata against direct database edits and deletes", async () => {
  const id = crypto.randomUUID();
  expect((await upload(id)).status).toBe(201);
  for (const sql of [
    "UPDATE complaint_attachments SET name = 'Changed.pdf' WHERE id = ?",
    "DELETE FROM complaint_attachments WHERE id = ?",
  ])
    expect(() => db.sqlite.prepare(sql).run(id)).toThrow("filed complaint records are immutable");
  expect(await (await db.request(path(id))).text()).toBe(pdf);
});
