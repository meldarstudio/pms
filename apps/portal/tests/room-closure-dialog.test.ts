import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLButtonElement } from "happy-dom";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";
let browser: BrowserTest;
let page: BrowserPage;
let React: BrowserTest["React"];
let window: BrowserTest["window"];
let render: BrowserPage["render"];
let until: BrowserPage["until"];

let closures: typeof import("../src/components/room-closure-dialog.tsx");
beforeAll(async () => {
  browser = await createBrowserTest();
  ({ React, window } = browser);
  closures = (await browser.server.ssrLoadModule(
    "/src/components/room-closure-dialog.tsx",
  )) as typeof closures;
  const calendar = (await browser.server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T01:00:00Z"));
  page = browser.createPage();
  ({ render, until } = page);
});
afterEach(async () => {
  await page.cleanup();
  vi.useRealTimers();
});
afterAll(async () => {
  await browser?.close();
});
const button = (label: string) => page.button(label);
it("round-trips saved closure dates through the picker and submitted request", async () => {
  const writes: unknown[] = [];
  const closure = {
    id: "closure",
    roomId: "room-1",
    starts: "2026-10-31",
    ends: "2026-11-02",
    reason: "Repairs",
  };
  page.api.on("PATCH", "*", ({ body }) => {
    writes.push(body);
    return { ...closure, starts: "2026-10-30" };
  });
  await render(
    React.createElement(closures.RoomClosureDialog, {
      target: { mode: "edit", closure, number: "101", typeName: "Doble" },
      onClose: () => {},
    }),
  );
  assert.ok(button("31 oct 2026"));
  assert.ok(button("2 nov 2026"));
  await React.act(async () => button("31 oct 2026").click());
  const selected = window.document.querySelector<HTMLButtonElement>(
    'button[data-day="30/10/2026"]',
  );
  assert.ok(selected);
  await React.act(async () => selected.click());
  assert.ok(button("30 oct 2026"));
  await React.act(async () => button("Guardar").click());
  await until(() => writes.length === 1, "Closure saves");
  assert.deepEqual(writes, [{ starts: "2026-10-30", ends: "2026-11-02", reason: "Repairs" }]);
});

it("opens an unselected picker in the property month and marks the property date as today", async () => {
  await render(
    React.createElement(closures.RoomClosureDialog, {
      target: { mode: "create", roomId: "room-1", number: "101", typeName: "Doble" },
      onClose: () => {},
    }),
  );
  await React.act(async () => button("Seleccionar fecha").click());
  assert.match(
    window.document.querySelector('[data-slot="calendar"]')!.textContent,
    /octubre 2026/,
  );
  const today = window.document.querySelector<HTMLButtonElement>('button[data-day="31/10/2026"]');
  assert.ok(today);
  assert.match(today.getAttribute("aria-label") ?? "", /hoy|today/i);
});
