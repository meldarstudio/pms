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
const ratePlans = [
  {
    plan: "flexible",
    cancellationPolicy: { chargeBasis: "first_night", freeUntilDaysBeforeCheckIn: 2 },
    paymentSchedule: "first_night_deposit",
    priceAdjustmentPercent: 0,
  },
  {
    plan: "non_refundable",
    cancellationPolicy: { chargeBasis: "final_total", freeUntilDaysBeforeCheckIn: null },
    paymentSchedule: "full_upfront",
    priceAdjustmentPercent: -10,
  },
];
it("keeps inventory rate labels and submitted date ranges unchanged", async () => {
  page.api.catalog.roomTypes = [doubleType];
  page.api.on("GET", "/inventory", ({ url }) => ({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    currency: "PEN",
    ratePlans,
    roomTypes: [
      {
        ...doubleType,
        baseRateCents: 15000,
        capacity: 1,
        nights: [
          {
            date: "2026-10-31",
            priceCents: 18000,
            override: true,
            free: 1,
            booked: 0,
            closed: 0,
            planPrices: { flexible: 18000, non_refundable: 16200 },
          },
        ],
      },
    ],
  }));
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
  await React.act(async () => {
    container
      .querySelector<HTMLButtonElement>('button[aria-label^="Doble, 31 oct 2026"]')!
      .dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new window.PointerEvent("pointercancel", { bubbles: true }));
  });
  assert.equal(window.document.querySelector('[name="price"]'), null);
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
it("shows derived plan prices read-only and edits them only through the Flexible price", async () => {
  page.api.catalog.roomTypes = [doubleType];
  let saved = false;
  page.api.on("GET", "/inventory", ({ url }) => ({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    currency: "PEN",
    ratePlans,
    roomTypes: [
      {
        ...doubleType,
        capacity: 4,
        nights: [
          {
            date: "2026-10-31",
            priceCents: saved ? 20000 : 10005,
            override: saved,
            free: 0,
            booked: 4,
            closed: 0,
            planPrices: saved
              ? { flexible: 20000, non_refundable: 18000 }
              : { flexible: 10005, non_refundable: 9005 },
          },
        ],
      },
    ],
  }));
  page.api.on("PUT", "/room-types/double/rates", () => {
    saved = true;
    return { updated: 1 };
  });
  await render(
    React.createElement(inventories.Inventory, {
      start: new Date(2026, 9, 31),
      span: 7,
      onStartChange: () => {},
      onSpanChange: () => {},
    }),
  );
  const editable = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Doble"]'));
  await until(() => editable().length === 1, "Only the Flexible price is editable");
  assert.match(container.textContent, /Libres/);
  assert.doesNotMatch(container.textContent, /Libres de/);
  assert.match(container.textContent, /No reembolsable\s*−10%/);
  assert.match(container.textContent, /S\/\s*90\.05/);
  assert.equal(editable()[0]!.textContent, "100.05");
  assert.match(editable()[0]!.getAttribute("aria-label")!, /S\/\s*100\.05/);
  assert.doesNotMatch(editable()[0]!.getAttribute("aria-label")!, /precio modificado/);

  await React.act(async () => editable()[0]!.click());
  await until(() => !!window.document.querySelector('[name="price"]'), "Rate editor opens");
  const dialog = window.document.querySelector('[role="dialog"]')!;
  assert.match(dialog.textContent, /Precio Flexible \(PEN\)/);
  assert.match(dialog.textContent, /No reembolsable se actualiza automáticamente: 10% menos\./);

  await fill("price", "200");
  await React.act(async () => button("Guardar").click());
  await until(() => /S\/\s*180(?!\.)/.test(container.textContent), "Derived price refreshes");
  assert.match(editable()[0]!.getAttribute("aria-label")!, /precio modificado para esta fecha/);
});
