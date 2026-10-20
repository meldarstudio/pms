import assert from "node:assert/strict";
import { afterEach, beforeEach, it, vi } from "vite-plus/test";
import { Window, type HTMLDivElement } from "happy-dom";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import { PwaStatus } from "../src/components/pwa-status.tsx";

let browser: Window;
let container: HTMLDivElement;
let root: Root;
const originalGlobals = new Map<string, PropertyDescriptor | undefined>();

beforeEach(() => {
  browser = new Window({ url: "http://localhost:5173" });
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Event",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: Reflect.get(browser, key),
    });
  }
  Object.defineProperty(browser.navigator, "onLine", { configurable: true, value: true });
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = browser.document.createElement("div");
  browser.document.body.append(container);
  root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await browser.happyDOM.close();
  vi.unstubAllEnvs();
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  originalGlobals.clear();
});

it("shows an actionable offline message when connectivity is lost and clears it on recovery", async () => {
  await act(async () =>
    root.render(createElement(PwaStatus, null, createElement("p", null, "Reservation details"))),
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
    await act(async () => root.unmount());
    root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
    await act(async () => root.render(createElement(PwaStatus, null, "Reservation details")));
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
