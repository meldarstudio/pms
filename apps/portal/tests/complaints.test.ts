import assert from "node:assert/strict";
import { afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import { sharedBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let screen: typeof import("../src/components/complaints.tsx");
beforeAll(async () => {
  browser = await sharedBrowserTest();
  screen = (await browser.server.ssrLoadModule("/src/components/complaints.tsx")) as typeof screen;
});
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
