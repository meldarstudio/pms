import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
import { Window, type HTMLDivElement, type HTMLInputElement } from "happy-dom";
import { createServer, type ViteDevServer } from "vite";
import type { Root } from "react-dom/client";
import type { QueryClient } from "@tanstack/react-query";

let window: Window;
let server: ViteDevServer;
let React: typeof import("react");
let createRoot: (typeof import("react-dom/client"))["createRoot"];
let query: typeof import("@tanstack/react-query");
let auth: typeof import("../src/components/auth-gate.tsx");
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  window = new Window({ url: "http://localhost:5173" });
  for (const name of [
    "window",
    "self",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "Element",
    "SVGElement",
    "HTMLButtonElement",
    "Node",
    "NodeFilter",
    "Text",
    "Document",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "PointerEvent",
    "MutationObserver",
    "ResizeObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ]) {
    const value = name === "window" ? window : Reflect.get(window, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: typeof value === "function" && /^[a-z]/.test(name) ? value.bind(window) : value,
    });
  }
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  React = await import("react");
  ({ createRoot } = await import("react-dom/client"));
  query = await import("@tanstack/react-query");
  server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    mode: "development",
  });
  auth = (await server.ssrLoadModule("/src/components/auth-gate.tsx")) as typeof auth;
});

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  client = new query.QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  client.clear();
  container.remove();
  globalThis.fetch = originalFetch;
});

afterAll(async () => {
  await server?.close();
  await window?.happyDOM.close();
});

function mockApi(loginResponse: Response) {
  const logins: { username: string; password: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    assert.equal(init?.credentials, "include");
    if (url.pathname === "/session")
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (url.pathname === "/login" && init?.method === "POST") {
      assert.ok(typeof init.body === "string");
      logins.push(JSON.parse(init.body) as { username: string; password: string });
      return loginResponse;
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  return logins;
}

async function until(condition: () => boolean, message: string) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.ok(condition(), message);
}

async function render() {
  await React.act(async () => {
    root.render(
      React.createElement(
        query.QueryClientProvider,
        { client },
        React.createElement(auth.AuthGate, null, "Signed-in app"),
      ),
    );
  });
  await until(
    () => !!container.querySelector("form"),
    "Login form appears for a signed-out session",
  );
}

function input(name: string) {
  const element = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  assert.ok(element, `Missing input ${name}`);
  return element;
}

async function fill(name: string, value: string) {
  await React.act(async () => {
    const element = input(name);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function button(label: string) {
  const element = Array.from(container.querySelectorAll("button")).find(
    (element) =>
      element.textContent.trim() === label || element.getAttribute("aria-label") === label,
  );
  assert.ok(element, `Missing button ${label}`);
  return element;
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
  let complete!: (response: Response) => void;
  globalThis.fetch = () =>
    new Promise<Response>((resolve) => {
      complete = resolve;
    });
  await React.act(async () => {
    root.render(
      React.createElement(
        query.QueryClientProvider,
        { client },
        React.createElement(auth.AuthGate, null, "Signed-in app"),
      ),
    );
  });
  assert.equal(container.textContent.includes("Signed-in app"), false);
  await React.act(async () => complete(Response.json({ username: "hotelmanantial" })));
  await until(
    () => container.textContent.includes("zona horaria"),
    "Missing timezone is actionable",
  );
  assert.equal(container.textContent.includes("Signed-in app"), false);
});

it("keeps the sidebar usable after failed sign-out and returns to login after a successful retry", async () => {
  const routing = await import("@tanstack/react-router");
  const routes = (await server.ssrLoadModule(
    "/src/router.tsx",
  )) as typeof import("../src/router.tsx");
  const { ToastProvider } = (await server.ssrLoadModule(
    "/src/components/ui/toast.tsx",
  )) as typeof import("../src/components/ui/toast.tsx");
  let finishLogout: ((response: Response) => void) | undefined;
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    assert.equal(init?.credentials, "include");
    if (url.pathname === "/session")
      return Response.json({ username: "hotelmanantial", propertyTimeZone: "America/Lima" });
    if (url.pathname === "/room-types" || url.pathname === "/rooms") return Response.json([]);
    if (url.pathname === "/logout" && init?.method === "POST")
      return new Promise<Response>((resolve) => {
        finishLogout = resolve;
      });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  const router = routing.createRouter({
    routeTree: routes.router.routeTree,
    history: routing.createMemoryHistory({ initialEntries: ["/calendar"] }),
  });
  await React.act(async () => {
    await router.load();
    root.render(
      React.createElement(
        query.QueryClientProvider,
        { client },
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
    () => !!finishLogout && button("Salir").disabled,
    "Sign-out must disable repeat submissions",
  );
  await React.act(async () =>
    finishLogout!(Response.json({ error: "unavailable" }, { status: 503 })),
  );
  await until(
    () => window.document.body.textContent.includes("No se pudo cerrar la sesión"),
    "Failed sign-out must be visible",
  );
  assert.equal(button("Salir").disabled, false);
  assert.ok(container.querySelector('nav[aria-label="Navegación principal"]'));
  finishLogout = undefined;
  await React.act(async () => button("Salir").click());
  await until(() => !!finishLogout, "Sign-out must be retryable");
  await React.act(async () => finishLogout!(Response.json({ ok: true })));
  await until(
    () => !!container.querySelector('input[name="password"]'),
    "Sign-out must return to login",
  );
  assert.equal(container.querySelector('nav[aria-label="Navegación principal"]'), null);
});
