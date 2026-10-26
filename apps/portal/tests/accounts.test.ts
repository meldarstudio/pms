import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
import { createBrowserTest, type BrowserPage, type BrowserTest } from "./browser.ts";

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
}

function link(label: string) {
  return Array.from(page.container.querySelectorAll("a")).find(
    (element) => element.textContent.trim() === label,
  );
}

it("lets the owner set the staff password after confirming it", async () => {
  signedInAs("owner");
  const writes = page.api.bodies<{ password: string }>("PUT", "/accounts/staff-id/password");
  page.api.on("PUT", "/accounts/staff-id/password", () => ({ ok: true }));
  await render("/accounts");
  await page.until(() => !!link("Cuentas"), "The owner sees Cuentas in the sidebar");
  await page.until(
    () => page.container.textContent.includes("hotelmanantial"),
    "The staff account is listed",
  );

  await page.fill("staffPassword", "new staff password");
  await page.fill("staffPasswordConfirm", "a different password");
  await page.click("Cambiar contraseña del personal");
  await page.until(
    () => page.container.textContent.includes("Las contraseñas no coinciden."),
    "A mismatched confirmation is caught before sending",
  );
  assert.deepEqual(writes, []);

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

it("translates a wrong current password when the owner changes their own", async () => {
  signedInAs("owner");
  page.api.on("PUT", "/account/password", () =>
    Response.json(
      { error: "current password is incorrect" },
      { status: 400, headers: { "X-Error-Field": "currentPassword" } },
    ),
  );
  await render("/accounts");
  await page.until(() => !!page.container.querySelector('[name="currentPassword"]'));
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

it("hides account management from the staff account", async () => {
  signedInAs("staff");
  await render("/accounts");
  await page.until(
    () => page.container.textContent.includes("Solo la cuenta del propietario"),
    "Staff are told the page is owner-only",
  );
  assert.equal(link("Cuentas"), undefined);
  assert.equal(page.api.requests("GET", "/accounts").length, 0);
});
