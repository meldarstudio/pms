import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLButtonElement } from "happy-dom";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let React: BrowserTest["React"];
let housekeeping: typeof import("../src/components/housekeeping.tsx");

beforeAll(async () => {
  browser = await createBrowserTest();
  ({ React } = browser);
  housekeeping = (await browser.server.ssrLoadModule(
    "/src/components/housekeeping.tsx",
  )) as typeof housekeeping;
  const calendar = (await browser.server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  page = browser.createPage();
});
afterEach(async () => {
  await page.cleanup();
  vi.useRealTimers();
});
afterAll(async () => {
  await browser?.close();
});

const room = (id: string, number: string, housekeepingStatus: "dirty" | "clean") => ({
  id,
  number,
  roomTypeId: "double",
  roomTypeName: "Doble",
  housekeepingStatus,
  housekeepingChangedAt: null,
  closed: false,
  inHouse: false,
  departure: null,
  arriving: housekeepingStatus === "dirty",
});

const rows = () =>
  Array.from(page.container.querySelectorAll("li")).map(
    (row) =>
      `${row.textContent.slice(0, 3)}:${row.textContent.includes("Sucia") ? "dirty" : "clean"}`,
  );

const saving = () =>
  Array.from(page.container.querySelectorAll<HTMLButtonElement>("li button")).some(
    (button) => button.disabled,
  );

it("marks rooms in place without reordering and restores a status the server rejects", async () => {
  page.api.on("GET", "/housekeeping", () => ({
    date: "2026-10-20",
    rooms: [room("room-101", "101", "dirty"), room("room-102", "102", "clean")],
  }));
  const writes: unknown[] = [];
  page.api.on<{ status: string }>("PUT", "/housekeeping/:id", ({ params, body }) => {
    writes.push([params.id, body]);
    return {
      id: params.id,
      number: "101",
      roomTypeId: "double",
      housekeepingStatus: body.status,
      housekeepingChangedAt: "2026-10-20T15:00:00.000Z",
    };
  });
  await page.render(React.createElement(housekeeping.Housekeeping));
  await page.until(() => rows().length === 2, "The board must load");
  assert.deepEqual(rows(), ["101:dirty", "102:clean"]);

  await page.click("Marcar habitación 101 como limpia");
  await page.until(() => writes.length === 1 && rows()[0] === "101:clean" && !saving());
  assert.deepEqual(writes, [["room-101", { status: "clean" }]]);
  // The housekeeper's next tap must not land on a row that just moved.
  assert.deepEqual(rows(), ["101:clean", "102:clean"]);
  assert.equal(page.api.requests("GET", "/housekeeping").length, 1);

  const rejected = page.api.hold("PUT", "/housekeeping/:id");
  await page.click("Marcar habitación 102 como sucia");
  await page.until(() => rejected.request !== undefined && rows()[1] === "102:dirty");
  await React.act(async () =>
    rejected.release(Response.json({ error: "room not found" }, { status: 404 })),
  );
  await page.until(() => rows()[1] === "102:clean", "A rejected mark must restore the status");
});
