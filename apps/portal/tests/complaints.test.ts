import assert from "node:assert/strict";
import type { HTMLElement, HTMLTextAreaElement } from "happy-dom";
import { afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import { sharedBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let screen: typeof import("../src/components/complaints.tsx");
beforeAll(async () => {
  browser = await sharedBrowserTest();
  screen = (await browser.server.ssrLoadModule("/src/components/complaints.tsx")) as typeof screen;
  const calendar = (await browser.server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
  page = browser.createPage();
});
afterEach(async () => {
  await page.cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("saves a response once across an uncertain retry and retries only its evidence upload after that fails", async () => {
  let saves = 0;
  const writes: string[] = [];
  const uploads: string[] = [];
  const response = {
    id: "response-1",
    text: "Respuesta enviada",
    channel: "email",
    recipient: "ana@example.com",
    sentOn: "2026-11-13",
    evidence: "Mensaje 123",
    recordedAt: "2026-11-13T16:00:00Z",
    recordedBy: "owner",
    voided: null,
    correctsId: null,
    attachments: [] as { id: string; name: string; size: number }[],
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
    emails: [],
    responses: [] as (typeof response)[],
  };
  page.client.setQueryData(["session"], { username: "owner", role: "owner" });
  globalThis.fetch = async (url, options) => {
    const path = new URL(url instanceof Request ? url.url : url instanceof URL ? url.href : url)
      .pathname;
    if (options?.method === "POST") {
      writes.push(typeof options.body === "string" ? options.body : "");
      if (++saves === 1) throw new TypeError("Network unavailable");
      response.id = JSON.parse(writes[0]!).requestId;
      sheet.responses = [response];
      return Response.json(sheet);
    }
    if (options?.method === "PUT") {
      uploads.push(path);
      if (uploads.length === 1)
        return Response.json(
          { error: "complaint attachment storage is unavailable" },
          { status: 503 },
        );
      response.attachments = [{ id: path.split("/").at(-1)!, name: "Envio.pdf", size: 9 }];
      return Response.json(sheet);
    }
    if (path === "/session") return Response.json({ username: "owner", role: "owner" });
    if (path === "/accounts") return Response.json([]);
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
  const body = () => browser.window.document.body.textContent;
  const responseText = () =>
    browser.window.document.querySelector("#complaint-response") as HTMLTextAreaElement | null;
  await page.renderRouter(
    browser.routing.createRouter({
      routeTree: browser.routing.createRootRoute({
        component: () => browser.React.createElement(screen.ComplaintPage, { id: "sheet-1" }),
      }),
      history: browser.routing.createMemoryHistory({ initialEntries: ["/"] }),
    }),
  );
  await page.until(() => page.container.textContent.includes("000000041-2026"));
  await page.click("Registrar respuesta");
  await page.until(() => Boolean(responseText()));
  await page.fill(responseText()!, "Respuesta enviada");
  await page.fill("evidence", "Mensaje 123");
  await page.click("Seleccionar fecha");
  const day = () =>
    browser.window.document.querySelector('button[data-day="13/11/2026"]') as HTMLElement | null;
  await page.until(() => Boolean(day()));
  await browser.React.act(async () => day()!.click());
  const file = new browser.window.File(["%PDF-1.7"], "Envio.pdf", { type: "application/pdf" });
  const select = () =>
    browser.React.act(async () => {
      const input = page.field("evidenceFile");
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(new browser.window.Event("change", { bubbles: true }));
    });
  await select();
  await page.until(() => body().includes("Envio.pdf"));
  await page.click("Guardar respuesta");
  await page.until(() => body().includes("No se pudo guardar"));
  assert.equal(responseText()!.value, "Respuesta enviada");
  assert.equal(uploads.length, 0);
  await page.click("Reintentar guardado");
  await page.until(() =>
    body().includes("La respuesta se guardó, pero no se pudo adjuntar la evidencia."),
  );
  assert.equal(writes[0], writes[1]);
  assert.equal(JSON.parse(writes[0]!).sentOn, "2026-11-13");
  assert.equal("sentAt" in JSON.parse(writes[0]!), false);
  await select();
  await page.click("Reintentar evidencia");
  await page.until(() => uploads.length === 2 && !body().includes("Reintentar evidencia"));
  assert.equal(uploads[0], uploads[1]);
  assert.equal(writes.length, 2);
  await page.until(() => !responseText());
  assert.ok(page.container.textContent.includes("1 archivo"));
});
