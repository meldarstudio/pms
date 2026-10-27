import assert from "node:assert/strict";
import type { HTMLElement } from "happy-dom";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import { createBrowserTest, type BrowserPage, type BrowserTest } from "./browser.ts";
import { reservationsSearch } from "../src/lib/route-search.ts";

let browser: BrowserTest;
let page: BrowserPage;
let routes: typeof import("../src/router.tsx");

const accounts = [
  { id: "owner-id", username: "propietario", role: "owner" },
  { id: "staff-id", username: "hotelmanantial", role: "staff" },
];

beforeAll(async () => {
  browser = await createBrowserTest();
  routes = (await browser.server.ssrLoadModule("/src/router.tsx")) as typeof routes;
  const calendar = (await browser.server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});

beforeEach(() => {
  page = browser.createPage();
  page.api.on("GET", "/accounts", () => accounts);
});

afterEach(async () => {
  await page.cleanup();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await browser?.close();
});

function signedInAs(role: "owner" | "staff") {
  const username = role === "owner" ? "propietario" : "hotelmanantial";
  page.api.on("GET", "/session", () => ({ username, role, propertyTimeZone: "America/Lima" }));
}

async function render(path: string) {
  const router = browser.routing.createRouter({
    routeTree: routes.router.routeTree,
    history: browser.routing.createMemoryHistory({ initialEntries: [path] }),
  });
  await page.renderRouter(router);
  return router;
}

async function renderPassword(kind: "personal" | "propietario" = "personal") {
  const router = await render("/accounts");
  await page.until(() => page.container.textContent.includes("hotelmanantial"));
  await page.click(`Cambiar contraseña de ${kind}`);
  return router;
}

async function sectionOptions() {
  const trigger = page.container.querySelector(
    '[role="combobox"][aria-label="Secciones de configuración"]',
  );
  assert.ok(trigger);
  await browser.React.act(async () => (trigger as HTMLElement).click());
  await page.until(() => !!browser.window.document.querySelector('[role="option"]'));
  return Array.from(browser.window.document.querySelectorAll('[role="option"]'));
}

it("redirects old account links to Configuración instead of a sidebar destination", async () => {
  signedInAs("owner");
  const router = await render("/accounts");
  await page.until(() => page.container.textContent.includes("hotelmanantial"));
  assert.equal(router.state.location.pathname, "/setup");
  assert.equal(router.state.location.search.section, "accounts");
  assert.equal(
    page.container
      .querySelector('nav[aria-label="Navegación principal"]')
      ?.textContent.includes("Cuentas"),
    false,
  );
});

it("lets the owner set the staff password after confirming it", async () => {
  signedInAs("owner");
  const writes = page.api.bodies<{ password: string }>("PUT", "/accounts/staff-id/password");
  page.api.on("PUT", "/accounts/staff-id/password", () => ({ ok: true }));
  await renderPassword();

  await page.fill("staffPassword", "new staff password");
  await page.fill("staffPasswordConfirm", "a different password");
  await page.click("Cambiar contraseña del personal");
  await page.until(
    () => page.container.textContent.includes("Las contraseñas no coinciden."),
    "A mismatched confirmation is caught before sending",
  );
  assert.deepEqual(writes, []);
  assert.equal(page.field("staffPassword").getAttribute("aria-invalid"), "true");

  await page.fill("staffPasswordConfirm", "new staff password");
  await page.click("Cambiar contraseña del personal");
  await page.until(() => writes.length === 1, "The new staff password is sent");
  assert.deepEqual(writes, [{ password: "new staff password" }]);
  await page.until(
    () => page.container.textContent.includes("Se cerró la sesión del personal"),
    "The owner is told staff must sign in again",
  );
  assert.equal(page.field("staffPassword").value, "");
});

it("keeps the section and role headings available while the first account read loads", async () => {
  page.mobile();
  signedInAs("owner");
  const read = page.api.hold("GET", "/accounts");
  await render("/accounts");
  await page.until(() => !!read.request);
  const loading = page.container.querySelector('[aria-label="Cargando cuentas"]');
  assert.equal(loading?.getAttribute("aria-busy"), "true");
  assert.equal(page.container.querySelector("main h1")?.textContent, "Cuentas");
  assert.deepEqual(
    Array.from(loading!.querySelectorAll("h2"), (heading) => heading.textContent),
    ["Personal", "Propietario"],
  );
  read.release(Response.json(accounts));
  await page.until(() => page.container.textContent.includes("hotelmanantial"));
  assert.equal(page.container.querySelector('[aria-label="Cargando cuentas"]'), null);
});

it("lets the owner leave and return to Cuentas through the mobile section select", async () => {
  page.mobile();
  signedInAs("owner");
  await render("/accounts");
  await page.until(() => page.container.textContent.includes("hotelmanantial"));
  const rooms = (await sectionOptions()).find(
    (option) => option.textContent.trim() === "Habitaciones",
  );
  assert.ok(rooms);
  await browser.React.act(async () => (rooms as HTMLElement).click());
  await page.until(() => page.container.querySelector("main h1")?.textContent === "Habitaciones");
  const accountSection = (await sectionOptions()).find(
    (option) => option.textContent.trim() === "Cuentas",
  );
  assert.ok(accountSection, "Owner can return to accounts through the section select");
  await browser.React.act(async () => (accountSection as HTMLElement).click());
  await page.until(() => page.container.textContent.includes("hotelmanantial"));
});

it("warns when refreshing accounts fails and retries without losing password drafts", async () => {
  signedInAs("owner");
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  await renderPassword();
  await page.fill("staffPassword", "unfinished staff password");
  page.api.failOnce("GET", "/accounts", 500);
  await browser.React.act(async () => {
    await page.client.invalidateQueries({ queryKey: ["accounts"] });
  });
  await page.until(() =>
    page.container.textContent.includes("Los datos pueden estar desactualizados."),
  );
  assert.ok(logged.mock.calls.length > 0, "An unexplained refresh failure is logged");
  assert.equal(page.field("staffPassword").value, "unfinished staff password");
  await page.click("Reintentar");
  await page.until(
    () => !page.container.textContent.includes("Los datos pueden estar desactualizados."),
  );
  assert.equal(page.field("staffPassword").value, "unfinished staff password");
});

it("rejects overlong new passwords before sending a staff reset", async () => {
  signedInAs("owner");
  const writes = page.api.bodies("PUT", "/accounts/staff-id/password");
  await renderPassword();
  await page.fill("staffPassword", "a".repeat(129));
  await page.fill("staffPasswordConfirm", "a".repeat(129));
  await page.click("Cambiar contraseña del personal");
  await page.until(() => page.container.textContent.includes("como máximo 128 caracteres"));
  assert.deepEqual(writes, []);
  assert.equal(page.field("staffPassword").value.length, 129);
});

it("translates a wrong current password when the owner changes their own", async () => {
  signedInAs("owner");
  page.api.on("PUT", "/account/password", () =>
    Response.json(
      { error: "current password is incorrect" },
      { status: 400, headers: { "X-Error-Field": "currentPassword" } },
    ),
  );
  await renderPassword("propietario");
  await page.fill("currentPassword", "wrong password");
  await page.fill("newPassword", "a new owner password");
  await page.fill("newPasswordConfirm", "a new owner password");
  await page.click("Cambiar mi contraseña");
  await page.until(
    () => page.container.textContent.includes("La contraseña actual no es correcta."),
    "The error appears in Spanish",
  );
  assert.equal(page.field("newPassword").value, "a new owner password");
});

it("sends the staff account from account management to Habitaciones", async () => {
  page.mobile();
  signedInAs("staff");
  const router = await render("/accounts");
  await page.until(
    () => page.container.querySelector("main h1")?.textContent === "Habitaciones",
    "Staff land on a section they can use",
  );
  assert.equal(router.state.location.search.section, undefined);
  const options = await sectionOptions();
  assert.deepEqual(
    options.map((option) => option.textContent.trim()),
    ["Habitaciones", "Apariencia"],
  );
  assert.equal(page.api.requests("GET", "/accounts").length, 0);
});

it("protects a password draft and blocks edits and navigation during the real password write", async () => {
  signedInAs("owner");
  const save = page.api.hold("PUT", "/accounts/staff-id/password");
  const router = await renderPassword();
  await page.fill("staffPassword", "new staff password");
  await page.fill("staffPasswordConfirm", "new staff password");
  await page.click("Cuentas");
  await page.until(() => !!browser.window.document.querySelector('[role="alertdialog"]'));
  await page.click("Seguir editando");
  assert.equal(page.field("staffPassword").value, "new staff password");
  await page.click("Cambiar contraseña del personal");
  await page.until(() => !!save.request);
  assert.equal(page.field("staffPassword").disabled, true);
  await browser.React.act(async () => {
    void router.navigate({
      to: "/reservations",
      search: reservationsSearch({ day: "2026-10-27" }),
    });
  });
  await page.until(() => browser.window.document.body.textContent.includes("Guardando cambios"));
  assert.equal(page.button("Descartar cambios").disabled, true);
  await browser.React.act(async () => save.release(Response.json({ ok: true })));
  await page.until(() => page.container.textContent.includes("Se cerró la sesión del personal"));
  assert.equal(
    router.state.location.pathname,
    "/setup",
    "A navigation attempted during saving is not replayed",
  );
  assert.equal(page.field("staffPassword").value, "");
});
