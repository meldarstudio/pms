import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
import { createBrowserTest, type BrowserPage, type BrowserTest } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let window: BrowserTest["window"];
let React: BrowserTest["React"];
let auth: typeof import("../src/components/auth-gate.tsx");
let container: BrowserPage["container"];
let button: BrowserPage["button"];
let fill: BrowserPage["fill"];
let input: BrowserPage["field"];
let until: BrowserPage["until"];

beforeAll(async () => {
  browser = await createBrowserTest();
  ({ window, React } = browser);
  auth = (await browser.server.ssrLoadModule("/src/components/auth-gate.tsx")) as typeof auth;
});

beforeEach(() => {
  page = browser.createPage();
  ({ container, button, fill, field: input, until } = page);
});

afterEach(async () => {
  await page.cleanup();
  window.localStorage.removeItem("theme");
  window.happyDOM.settings.device.prefersColorScheme = "light";
});

afterAll(async () => {
  await browser?.close();
});

function mockApi(loginResponse: Response) {
  page.api.on("GET", "/session", () => Response.json({ error: "unauthorized" }, { status: 401 }));
  page.api.on("POST", "/login", () => loginResponse);
  return page.api.bodies<{ username: string; password: string }>("POST", "/login");
}

async function render() {
  await page.render(React.createElement(auth.AuthGate, null, "Signed-in app"));
  await until(
    () => !!container.querySelector("form"),
    "Login form appears for a signed-out session",
  );
}

async function setSystemTheme(theme: "light" | "dark") {
  await React.act(async () => {
    window.happyDOM.settings.device.prefersColorScheme = theme;
    window.dispatchEvent(new window.Event("resize"));
  });
}

function assertNotificationTheme(theme: "light" | "dark") {
  assert.ok(window.document.documentElement.classList.contains(theme));
  assert.equal(
    window.document.querySelector("[data-sonner-theme]")?.getAttribute("data-sonner-theme"),
    theme,
    "Notifications must follow the app's resolved theme",
  );
}

it("keeps entered credentials and translates a failed login", async () => {
  const logins = mockApi(Response.json({ error: "invalid credentials" }, { status: 401 }));
  await render();
  await fill("username", "hotelmanantial");
  await fill("password", "incorrect password");
  await React.act(async () => button("Iniciar sesión").click());
  await until(
    () => container.textContent.includes("Usuario o contraseña incorrectos."),
    "Invalid credentials appear in Spanish",
  );
  assert.equal(input("username").value, "hotelmanantial");
  assert.equal(input("password").value, "incorrect password");
  assert.equal(button("Iniciar sesión").disabled, false);
  assert.equal(logins.length, 1);
});

it("does not initialize the app before valid property configuration is loaded", async () => {
  const session = page.api.hold("GET", "/session");
  await page.render(React.createElement(auth.AuthGate, null, "Signed-in app"));
  assert.equal(container.textContent.includes("Signed-in app"), false);
  await React.act(async () => session.release(Response.json({ username: "hotelmanantial" })));
  await until(
    () => container.textContent.includes("zona horaria"),
    "Missing timezone is actionable",
  );
  assert.equal(container.textContent.includes("Signed-in app"), false);
});

it("keeps the sidebar usable after failed sign-out and returns to login after a successful retry", async () => {
  const { routing, server } = browser;
  const routes = (await server.ssrLoadModule(
    "/src/router.tsx",
  )) as typeof import("../src/router.tsx");
  let logout = page.api.hold("POST", "/logout");
  const router = routing.createRouter({
    routeTree: routes.router.routeTree,
    history: routing.createMemoryHistory({ initialEntries: ["/calendar"] }),
  });
  await React.act(async () => {
    await router.load();
    page.root.render(
      page.withClient(
        await browser.withToasts(
          React.createElement(
            auth.AuthGate,
            null,
            React.createElement(routing.RouterProvider, { router }),
          ),
        ),
      ),
    );
  });
  await until(
    () => container.textContent.includes("Configura tu alojamiento"),
    "Signed-in app must load",
  );
  const account = "Cuenta de hotelmanantial, Personal";
  assert.equal(button(account).textContent, "HhotelmanantialPersonal");
  await page.menuAction(account, "Salir");
  await until(
    () => !!logout.request && button(account).disabled,
    "Sign-out must disable repeat submissions",
  );
  await React.act(async () =>
    logout.release(Response.json({ error: "unavailable" }, { status: 503 })),
  );
  await until(
    () => page.notifications().includes("No se pudo cerrar la sesión"),
    "Failed sign-out must be visible",
  );
  assertNotificationTheme("light");
  await setSystemTheme("dark");
  assertNotificationTheme("dark");
  await React.act(async () =>
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "d" })),
  );
  assertNotificationTheme("light");
  await setSystemTheme("light");
  await setSystemTheme("dark");
  assertNotificationTheme("light");
  await React.act(async () =>
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "d" })),
  );
  assertNotificationTheme("dark");
  await setSystemTheme("light");
  assertNotificationTheme("dark");
  assert.equal(button(account).disabled, false);
  assert.ok(container.querySelector('nav[aria-label="Navegación principal"]'));
  logout = page.api.hold("POST", "/logout");
  await page.menuAction(account, "Salir");
  await until(() => !!logout.request, "Sign-out must be retryable");
  await React.act(async () => logout.release(Response.json({ ok: true })));
  await until(
    () => !!container.querySelector('input[name="password"]'),
    "Sign-out must return to login",
  );
  assert.equal(container.querySelector('nav[aria-label="Navegación principal"]'), null);
});
