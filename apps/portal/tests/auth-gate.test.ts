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

it("reveals and hides the password without submitting or changing the credentials", async () => {
  const logins = mockApi(
    Response.json({ username: "hotelmanantial", propertyTimeZone: "America/Lima" }),
  );
  await render();
  assert.equal(button("Iniciar sesión").disabled, true);
  assert.equal(input("password").type, "password");

  await fill("username", "  hotelmanantial  ");
  await fill("password", "  test password  ");
  assert.equal(button("Iniciar sesión").disabled, false);
  await React.act(async () => button("Mostrar contraseña").click());
  assert.equal(input("password").type, "text");
  assert.equal(button("Ocultar contraseña").getAttribute("aria-pressed"), "true");
  assert.equal(input("password").value, "  test password  ");
  assert.deepEqual(logins, []);

  await React.act(async () => button("Ocultar contraseña").click());
  assert.equal(input("password").type, "password");
  assert.equal(button("Mostrar contraseña").getAttribute("aria-pressed"), "false");
  assert.deepEqual(logins, []);

  await React.act(async () => button("Iniciar sesión").click());
  await until(
    () => container.textContent.includes("Signed-in app"),
    "Successful login opens the app",
  );
  assert.deepEqual(logins, [{ username: "hotelmanantial", password: "  test password  " }]);
});

it("keeps entered credentials and translates a failed login while allowing password reveal", async () => {
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
  await React.act(async () => button("Mostrar contraseña").click());
  assert.equal(input("password").type, "text");
  assert.equal(input("password").value, "incorrect password");
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
  const { ToastProvider } = (await server.ssrLoadModule(
    "/src/components/ui/toast.tsx",
  )) as typeof import("../src/components/ui/toast.tsx");
  // The default session is signed in and the default empty catalog asks for setup.
  let logout = page.api.hold("POST", "/logout");
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
