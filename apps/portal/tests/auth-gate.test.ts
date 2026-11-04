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
  Object.defineProperty(window.navigator, "maxTouchPoints", { configurable: true, value: 0 });
});

afterEach(async () => {
  await page.cleanup();
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

async function renderApp() {
  const { routing, server } = browser;
  const routes = (await server.ssrLoadModule(
    "/src/router.tsx",
  )) as typeof import("../src/router.tsx");
  const { ToastProvider } = (await server.ssrLoadModule(
    "/src/components/ui/toast.tsx",
  )) as typeof import("../src/components/ui/toast.tsx");
  const router = routing.createRouter({
    routeTree: routes.router.routeTree,
    history: routing.createMemoryHistory({ initialEntries: ["/calendar"] }),
  });
  await React.act(async () => {
    await router.load();
    page.root.render(
      page.withClient(
        React.createElement(
          ToastProvider,
          null,
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
}

it("keeps the sidebar usable after failed sign-out and returns to login after a successful retry", async () => {
  let logout = page.api.hold("POST", "/logout");
  await renderApp();
  await React.act(async () => button("Salir").click());
  await until(
    () => !!logout.request && button("Salir").disabled,
    "Sign-out must disable repeat submissions",
  );
  await React.act(async () =>
    logout.release(Response.json({ error: "unavailable" }, { status: 503 })),
  );
  await until(
    () => window.document.body.textContent.includes("No se pudo cerrar la sesión"),
    "Failed sign-out must be visible",
  );
  assert.equal(button("Salir").disabled, false);
  assert.ok(container.querySelector('nav[aria-label="Navegación principal"]'));
  logout = page.api.hold("POST", "/logout");
  await React.act(async () => button("Salir").click());
  await until(() => !!logout.request, "Sign-out must be retryable");
  await React.act(async () => logout.release(Response.json({ ok: true })));
  await until(
    () => !!container.querySelector('input[name="password"]'),
    "Sign-out must return to login",
  );
  assert.equal(container.querySelector('nav[aria-label="Navegación principal"]'), null);
});

it("keeps phone navigation in a dismissible drawer when rotated to landscape", async () => {
  page.mobile();
  Object.defineProperty(window.navigator, "maxTouchPoints", { configurable: true, value: 5 });
  await renderApp();
  await React.act(async () => window.happyDOM.setWindowSize({ width: 956, height: 440 }));
  assert.equal(button("Alternar navegación").getAttribute("aria-expanded"), "false");
  await React.act(async () => button("Alternar navegación").click());
  await until(
    () => !!window.document.querySelector('[role="dialog"] nav[aria-label="Navegación principal"]'),
    "Landscape phone must open navigation as a drawer",
  );
  assert.equal(button("Alternar navegación").getAttribute("aria-expanded"), "true");
  await React.act(async () => button("Cerrar").click());
  await until(
    () => button("Alternar navegación").getAttribute("aria-expanded") === "false",
    "Landscape navigation must close",
  );
});
