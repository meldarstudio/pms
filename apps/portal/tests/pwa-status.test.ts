import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
import { createElement } from "react";
import type { HTMLMetaElement } from "happy-dom";
import { PwaStatus } from "../src/components/pwa-status.tsx";
import { ThemeProvider } from "../src/components/theme-provider.tsx";
import { createBrowserTest, type BrowserPage, type BrowserTest } from "./browser.ts";

let browser: BrowserTest["window"];
let harness: BrowserTest;
let page: BrowserPage;
let container: BrowserPage["container"];
let act: BrowserTest["React"]["act"];
let themeColor: HTMLMetaElement;

// PwaStatus is imported through the test runner so vi.stubEnv reaches import.meta.env.
beforeAll(async () => {
  harness = await createBrowserTest();
  ({ window: browser } = harness);
  ({ act } = harness.React);
  const style = browser.document.createElement("style");
  style.textContent = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  browser.document.head.append(style);
});

beforeEach(() => {
  Object.defineProperty(browser.navigator, "onLine", { configurable: true, value: true });
  browser.happyDOM.settings.device.prefersColorScheme = "light";
  themeColor = browser.document.createElement("meta");
  themeColor.setAttribute("name", "theme-color");
  themeColor.setAttribute("content", "#ffffff");
  browser.document.head.append(themeColor);
  page = harness.createPage();
  ({ container } = page);
});

afterEach(async () => {
  await page.cleanup();
  Reflect.deleteProperty(browser.navigator, "serviceWorker");
  browser.sessionStorage.clear();
  browser.localStorage.clear();
  browser.document.documentElement.classList.remove("light", "dark");
  themeColor.remove();
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
  assert.match(container.textContent ?? "", /Las operaciones requieren conexión/);
  assert.match(container.textContent ?? "", /Reintentar/);
  assert.equal(container.querySelector("[hidden]")?.textContent, "Reservation details");

  await act(async () => browser.dispatchEvent(new browser.Event("online")));
  assert.match(container.textContent ?? "", /Reservation details/);
  assert.equal(container.querySelector("[hidden]"), null);
  assert.equal(container.querySelector('[role="status"]'), null);
});

it("matches browser chrome to the saved theme, shortcut changes, and changes from another window", async () => {
  browser.localStorage.setItem("theme", "dark");
  await page.render(createElement(ThemeProvider, null, "Reservation details"));
  assert.equal(themeColor.getAttribute("content"), "#0c0a09");

  await act(async () => browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "d" })));
  assert.equal(themeColor.getAttribute("content"), "#ffffff");

  await act(async () =>
    browser.dispatchEvent(
      new browser.StorageEvent("storage", {
        key: "theme",
        newValue: "dark",
        storageArea: browser.localStorage,
      }),
    ),
  );
  assert.equal(themeColor.getAttribute("content"), "#0c0a09");
});

it("keeps browser chrome in sync with system appearance until an explicit theme is chosen", async () => {
  await page.render(createElement(ThemeProvider, null, "Reservation details"));
  assert.equal(themeColor.getAttribute("content"), "#ffffff");

  await act(async () => {
    browser.happyDOM.settings.device.prefersColorScheme = "dark";
    // happy-dom reevaluates media-query listeners on resize.
    browser.dispatchEvent(new browser.Event("resize"));
  });
  assert.equal(themeColor.getAttribute("content"), "#0c0a09");

  await act(async () => browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "d" })));
  assert.equal(themeColor.getAttribute("content"), "#ffffff");

  await act(async () => {
    browser.happyDOM.settings.device.prefersColorScheme = "light";
    browser.dispatchEvent(new browser.Event("resize"));
    browser.happyDOM.settings.device.prefersColorScheme = "dark";
    browser.dispatchEvent(new browser.Event("resize"));
  });
  assert.equal(themeColor.getAttribute("content"), "#ffffff");
});
