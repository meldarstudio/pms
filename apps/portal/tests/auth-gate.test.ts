import assert from "node:assert/strict";
import { afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
import { sharedBrowserTest, type BrowserPage, type BrowserTest } from "./browser.ts";

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
  browser = await sharedBrowserTest();
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
