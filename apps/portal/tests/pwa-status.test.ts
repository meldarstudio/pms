import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import { createElement } from "react";
import { PwaStatus } from "../src/components/pwa-status.tsx";
import { createBrowserTest, type BrowserPage, type BrowserTest } from "./browser.ts";

let browser: BrowserTest["window"];
let harness: BrowserTest;
let page: BrowserPage;
let container: BrowserPage["container"];
let act: BrowserTest["React"]["act"];

// PwaStatus is imported through the test runner so vi.stubEnv reaches import.meta.env.
beforeAll(async () => {
  harness = await createBrowserTest();
  ({ window: browser } = harness);
  ({ act } = harness.React);
});

beforeEach(() => {
  Object.defineProperty(browser.navigator, "onLine", { configurable: true, value: true });
  page = harness.createPage();
  ({ container } = page);
});

afterEach(async () => {
  await page.cleanup();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(browser.navigator, "serviceWorker");
  browser.sessionStorage.clear();
});

afterAll(async () => {
  await harness?.close();
});

it("shows an actionable offline message when connectivity is lost and clears it on recovery", async () => {
  await page.render(
    createElement(PwaStatus, null, createElement("p", null, "Reservation details")),
  );
  assert.match(container.textContent ?? "", /Reservation details/);

  await act(async () => browser.dispatchEvent(new browser.Event("offline")));
  assert.match(container.textContent ?? "", /Sin conexión a internet/);
  assert.match(container.textContent ?? "", /Reintentar/);
  assert.equal(container.querySelector("[hidden]")?.textContent, "Reservation details");

  await act(async () => browser.dispatchEvent(new browser.Event("online")));
  assert.match(container.textContent ?? "", /Reservation details/);
  assert.equal(container.querySelector("[hidden]"), null);
  assert.match(container.textContent ?? "", /Conexión restablecida/);
  assert.match(container.textContent ?? "", /Reintentar/);
});

it("keeps a dismissed update hidden for the current tab session", async () => {
  vi.stubEnv("PROD", true);
  const registration = Object.assign(new browser.EventTarget(), {
    waiting: {
      scriptURL: "http://localhost:5173/sw.js?build=next",
      postMessage() {},
    },
  });
  Object.defineProperty(browser.navigator, "serviceWorker", {
    configurable: true,
    value: Object.assign(new browser.EventTarget(), {
      register: async () => registration,
    }),
  });

  async function reopenPage() {
    await page.render(null);
    await page.render(createElement(PwaStatus, null, "Reservation details"));
  }

  for (const label of ["Ahora no", "Cerrar aviso"]) {
    // A new tab session can show the notice again; a reload in that session cannot.
    browser.sessionStorage.clear();
    await reopenPage();
    assert.match(container.textContent ?? "", /Nueva versión disponible/);
    const dismiss = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === label || button.getAttribute("aria-label") === label,
    );
    assert.ok(dismiss, `Missing dismissal action: ${label}`);
    await act(async () => dismiss.click());
    assert.doesNotMatch(container.textContent ?? "", /Nueva versión disponible/);

    await reopenPage();
    assert.doesNotMatch(container.textContent ?? "", /Nueva versión disponible/);
    assert.match(container.textContent ?? "", /Reservation details/);
  }
});
