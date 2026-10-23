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
let container: BrowserPage["container"];
let inventories: typeof import("../src/components/inventory.tsx");
beforeAll(async () => {
  browser = await createBrowserTest();
  ({ React, window } = browser);
  inventories = (await browser.server.ssrLoadModule(
    "/src/components/inventory.tsx",
  )) as typeof inventories;
  const calendar = (await browser.server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T01:00:00Z"));
  page = browser.createPage();
  ({ render, until, container } = page);
});
afterEach(async () => {
  await page.cleanup();
  vi.useRealTimers();
});
afterAll(async () => {
  await browser?.close();
});
const button = (label: string) => page.button(label);
const fill = (target: Parameters<BrowserPage["fill"]>[0], value: string) =>
  page.fill(target, value);
const doubleType = {
  id: "double",
  name: "Doble",
  maxAdults: 2,
  maxChildren: 2,
  baseRateCents: 15000,
};
it("keeps inventory rate labels and submitted date ranges unchanged", async () => {
  page.api.catalog.roomTypes = [doubleType];
  page.api.on("GET", "/inventory", ({ url }) => ({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    currency: "PEN",
    roomTypes: [
      {
        ...doubleType,
        baseRateCents: 15000,
        capacity: 1,
        nights: [
          { date: "2026-10-31", priceCents: 18000, override: true, free: 1, booked: 0, closed: 0 },
        ],
      },
    ],
  }));
  // Only a write to the edited type's rates is recorded.
  const writes = page.api.bodies("PUT", "/room-types/double/rates");
  page.api.on("PUT", "/room-types/double/rates", () => ({ updated: 1 }));
  await render(
    React.createElement(inventories.Inventory, {
      start: new Date(2026, 9, 31),
      span: 7,
      onStartChange: () => {},
      onSpanChange: () => {},
    }),
  );
  await until(
    () => !!container.querySelector('button[aria-label^="Doble, 31 oct 2026"]'),
    "Saved rate loads",
  );
  await React.act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label^="Doble, 31 oct 2026"]')!.click(),
  );
  await until(() => !!window.document.querySelector('[name="price"]'), "Rate editor opens");
  assert.equal(page.field("price").value, "180.00");
  assert.match(window.document.querySelector('[role="dialog"]')!.textContent, /31 oct 2026/);
  await fill("price", "200");
  await React.act(async () => button("Guardar").click());
  await until(() => writes.length === 1, "Rate saves");
  assert.deepEqual(writes, [{ from: "2026-10-31", to: "2026-10-31", priceCents: 20000 }]);
});
