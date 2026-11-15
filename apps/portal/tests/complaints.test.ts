import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let screen: typeof import("../src/components/complaints.tsx");
beforeAll(async () => {
  browser = await createBrowserTest();
  screen = (await browser.server.ssrLoadModule("/src/components/complaints.tsx")) as typeof screen;
});
afterAll(async () => browser.close());
beforeEach(() => {
  page = browser.createPage();
});
afterEach(async () => {
  await page.cleanup();
  vi.unstubAllGlobals();
});

it("retains a response draft after network failure and retries its evidence with the same request id", async () => {
  let attempts = 0;
  const writes: string[] = [];
  const response = {
    id: "response-1",
    text: "Respuesta enviada",
    channel: "email",
    recipient: "ana@example.com",
    sentAt: "2026-11-13T15:00:00Z",
    evidence: "Mensaje 123",
    recordedAt: "2026-11-13T16:00:00Z",
    recordedBy: "owner",
    correctsId: null,
    attachments: [],
  };
  const sheet = {
    id: "sheet-1",
    bookId: "DEMO",
    reference: "000000041-2026",
    provider: {
      legalName: "Development operator",
      ruc: "00000000000",
      address: "Development address",
    },
    establishmentId: "DEMO",
    filedAt: "2026-11-13T14:00:00Z",
    registeredAt: "2026-11-13T14:00:00Z",
    dueDate: "2026-12-04",
    timeZone: "America/Lima",
    currency: "PEN",
    input: {
      fullName: "Ana",
      email: "ana@example.com",
      description: "Servicio no disponible",
      responseChannel: "email",
    },
    email: { status: "failed" },
    responses: [] as (typeof response)[],
  };
  page.client.setQueryData(["session"], { username: "owner", role: "owner" });
  globalThis.fetch = async (url, options) => {
    const path = new URL(url instanceof Request ? url.url : url instanceof URL ? url.href : url)
      .pathname;
    if (options?.method === "POST") {
      writes.push(typeof options.body === "string" ? options.body : "");
      if (++attempts === 1) throw new TypeError("Network unavailable");
      sheet.responses = [response];
      return Response.json(sheet);
    }
    if (path === "/session") return Response.json({ username: "owner", role: "owner" });
    if (path === "/complaints")
      return Response.json([
        {
          ...sheet,
          fullName: "Ana",
          category: "reclamo",
          responseStatus: "pending",
          overdue: true,
        },
      ]);
    return Response.json(sheet);
  };
  await page.render(browser.React.createElement(screen.Complaints));
  await page.until(() => page.container.textContent.includes("000000041-2026"));
  await page.click("000000041-2026");
  await page.until(() => Boolean(page.container.querySelector("textarea")));
  await page.fill(page.container.querySelector("textarea")!, "Respuesta enviada");
  await page.fill("evidence", "Mensaje 123");
  await page.fill("sentAt", "2026-11-13T10:00");
  await page.click("Registrar respuesta enviada");
  await page.until(() => page.container.textContent.includes("No se pudo"));
  assert.equal(page.container.querySelector("textarea")!.value, "Respuesta enviada");
  await page.click("Reintentar registro");
  await page.until(() => page.container.textContent.includes("Respuesta registrada"));
  assert.equal(writes[0], writes[1]);
  assert.ok(page.container.textContent.includes("Mensaje 123"));
});

it("starts a new logical email retry after an acknowledged attempt fails again", async () => {
  const ids: string[] = [];
  const sheet = {
    id: "sheet-1",
    bookId: "DEMO",
    reference: "000000041-2026",
    provider: { legalName: "Demo", ruc: "00000000000", address: "Demo" },
    establishmentId: "DEMO",
    filedAt: "2026-11-13T14:00:00Z",
    registeredAt: "2026-11-13T14:00:00Z",
    dueDate: "2026-12-04",
    timeZone: "America/Lima",
    currency: "PEN",
    input: { fullName: "Ana", email: "ana@example.com", responseChannel: "email" },
    email: { status: "failed" },
    responses: [],
  };
  page.client.setQueryData(["session"], { username: "owner", role: "owner" });
  globalThis.fetch = async (url, options) => {
    const path = new URL(url instanceof Request ? url.url : url instanceof URL ? url.href : url)
      .pathname;
    if (options?.method === "POST") {
      ids.push((JSON.parse(options.body as string) as { requestId: string }).requestId);
      return Response.json({ ...sheet, email: { status: "pending" } });
    }
    if (path === "/session") return Response.json({ username: "owner", role: "owner" });
    if (path === "/complaints")
      return Response.json([
        {
          ...sheet,
          fullName: "Ana",
          category: "reclamo",
          responseStatus: "pending",
          overdue: true,
        },
      ]);
    return Response.json(sheet);
  };
  await page.render(browser.React.createElement(screen.Complaints));
  await page.until(() => page.container.textContent.includes("000000041-2026"));
  await page.click("000000041-2026");
  await page.until(() => page.container.textContent.includes("Reintentar correo de constancia"));
  await page.click("Reintentar correo de constancia");
  await page.until(() => !page.button("Reintentar correo de constancia").disabled);
  await page.click("Reintentar correo de constancia");
  await page.until(() => ids.length === 2);
  assert.notEqual(ids[0], ids[1]);
});

it("keeps a backup draft editable when its original reference was already imported", async () => {
  vi.stubGlobal("FormData", browser.window.FormData);
  const { ComplaintBackupForm } = (await browser.server.ssrLoadModule(
    "/src/components/complaint-backup-form.tsx",
  )) as typeof import("../src/components/complaint-backup-form.tsx");
  globalThis.fetch = async (_url, options) =>
    options?.method === "POST"
      ? Response.json({ error: "physical complaint reference already imported" }, { status: 409 })
      : Response.json({
          policyVersion: "development-1",
          monitoredBy: "Demo",
          backupProcedure: "Demo",
          retentionAndDisposal: "Demo",
        });
  await page.render(
    browser.React.createElement(ComplaintBackupForm, {
      onSaved: () => assert.fail("rejected sheet must not be saved"),
    }),
  );
  await page.until(() => !page.button("Registrar transcripción").disabled);
  for (const name of [
    "originalReference",
    "fullName",
    "address",
    "documentType",
    "documentNumber",
    "product",
    "description",
    "requestedRemedy",
  ])
    await page.fill(name, "Original data");
  await page.fill("email", "ana@example.com");
  await page.fill("filedAt", "2026-11-13T09:00");
  await page.fill("restoredAt", "2026-11-13T10:00");
  await page.click("Registrar transcripción");
  await page.until(() => page.container.textContent.includes("ya fue transcrita"));
  assert.equal(page.field("description").value, "Original data");
  assert.equal(page.field("originalReference").disabled, false);
  await page.fill("originalReference", "Corrected reference");
  assert.equal(page.field("originalReference").value, "Corrected reference");
});

it("keeps selected evidence and the next reply draft after upload failure and retries the same file", async () => {
  const response = {
    id: "response-1",
    text: "Respuesta enviada",
    channel: "email",
    recipient: "ana@example.com",
    sentAt: "2026-11-13T15:00:00Z",
    evidence: "Mensaje 123",
    recordedAt: "2026-11-13T16:00:00Z",
    recordedBy: "owner",
    correctsId: null,
    attachments: [] as {
      id: string;
      name: string;
      size: number;
      uploadedAt: string;
      uploadedBy: string;
      contentType: string;
    }[],
  };
  const sheet = {
    id: "sheet-1",
    bookId: "DEMO",
    reference: "000000041-2026",
    provider: { legalName: "Demo", ruc: "00000000000", address: "Demo" },
    establishmentId: "DEMO",
    filedAt: "2026-11-13T14:00:00Z",
    registeredAt: "2026-11-13T14:00:00Z",
    dueDate: "2026-12-04",
    timeZone: "America/Lima",
    currency: "PEN",
    input: { fullName: "Ana", email: "ana@example.com", responseChannel: "email" },
    email: { status: "sent" },
    responses: [response],
  };
  const writes: { path: string; file: Blob }[] = [];
  page.client.setQueryData(["session"], { username: "owner", role: "owner" });
  globalThis.fetch = async (url, options) => {
    const path = new URL(url instanceof Request ? url.url : url instanceof URL ? url.href : url)
      .pathname;
    if (options?.method === "PUT") {
      assert.equal(new Headers(options.headers).get("content-type"), "application/pdf");
      writes.push({ path, file: options.body as Blob });
      if (writes.length === 1) throw new TypeError("Connection lost after upload");
      response.attachments = [
        {
          id: "file-1",
          name: "Reembolso.pdf",
          size: 34,
          contentType: "application/pdf",
          uploadedAt: "2026-11-13T16:00:00Z",
          uploadedBy: "owner",
        },
      ];
      return Response.json(sheet);
    }
    if (path === "/complaints")
      return Response.json([{ ...sheet, fullName: "Ana", responseStatus: "recorded" }]);
    return Response.json(sheet);
  };
  await page.render(browser.React.createElement(screen.Complaints));
  await page.until(() => page.container.textContent.includes("000000041-2026"));
  await page.click("000000041-2026");
  await page.until(() => Boolean(page.container.querySelector('input[type="file"]')));
  await page.fill(page.container.querySelector("textarea")!, "Borrador de seguimiento");
  const input = page.container.querySelector('input[type="file"]')!;
  const file = new File(["%PDF-1.7\nTest refund receipt\n%%EOF"], "Reembolso.pdf");
  await browser.React.act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new browser.window.Event("change", { bubbles: true }));
  });
  await page.click("Adjuntar archivo");
  await page.until(() => page.container.textContent.includes("No se pudo adjuntar"));
  assert.equal(page.container.querySelector("textarea")!.value, "Borrador de seguimiento");
  assert.ok(page.container.textContent.includes("Reembolso.pdf"));
  await page.click("Reintentar archivo");
  await page.until(() => page.container.textContent.includes("Archivo adjuntado"));
  assert.equal(writes[0]!.path, writes[1]!.path);
  assert.equal(await writes[0]!.file.text(), await writes[1]!.file.text());
  assert.equal(page.container.querySelector("textarea")!.value, "Borrador de seguimiento");
  await page.until(
    () => Boolean(page.container.querySelector('button[aria-label="Descargar Reembolso.pdf"]')),
    "Saved evidence becomes downloadable",
  );
});
