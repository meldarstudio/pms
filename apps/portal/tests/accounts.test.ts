import assert from "node:assert/strict";
import { afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import { sharedBrowserTest, type BrowserPage, type BrowserTest } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let routes: typeof import("../src/router.tsx");

const accounts = [
  { id: "owner-id", username: "propietario", role: "owner" },
  { id: "staff-id", username: "hotelmanantial", role: "staff" },
];

beforeAll(async () => {
  browser = await sharedBrowserTest();
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
