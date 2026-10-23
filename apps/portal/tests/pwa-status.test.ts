import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
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
