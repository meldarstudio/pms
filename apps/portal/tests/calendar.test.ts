import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLButtonElement } from "happy-dom";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let React: BrowserTest["React"];
let calendars: typeof import("../src/components/room-calendar.tsx");
let container: BrowserPage["container"];
let render: BrowserPage["render"];
let until: BrowserPage["until"];

beforeAll(async () => {
  browser = await createBrowserTest();
  ({ React } = browser);
  calendars = (await browser.server.ssrLoadModule(
    "/src/components/room-calendar.tsx",
  )) as typeof calendars;
  const calendar = (await browser.server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  page = browser.createPage();
  ({ container, render, until } = page);
});

afterEach(async () => {
  await page.cleanup();
  vi.useRealTimers();
});

afterAll(async () => {
  await browser?.close();
});

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}

const windowPayload = {
  from: "2026-10-20",
  to: "2026-10-26",
  missingSetup: null,
  rooms: [
    {
      id: "room-2",
      number: "2",
      roomTypeId: "double",
      roomTypeName: "Doble",
      stays: [],
      closures: [],
    },
    {
      id: "room-10",
      number: "10",
      roomTypeId: "suite",
      roomTypeName: "Suite",
      stays: [],
      closures: [
        {
          id: "closure-1",
          roomId: "room-10",
          starts: "2026-10-18",
          ends: "2026-10-20",
          reason: "Mantenimiento",
        },
      ],
    },
    {
      id: "room-101",
      number: "101",
      roomTypeId: "double",
      roomTypeName: "Doble",
      stays: [
        {
          id: "line-ada",
          reservationId: "res-ada",
          guestName: "Ada Lovelace",
          status: "confirmed",
          checkIn: "2026-10-18",
          checkOut: "2026-10-20",
          roomTypeId: "double",
          roomIndex: 1,
          roomCount: 1,
        },
        {
          id: "line-long",
          reservationId: "res-long",
          guestName: "Grace Hopper",
          status: "checked_out",
          checkIn: "2026-10-21",
          checkOut: "2026-11-04",
          roomTypeId: "double",
          roomIndex: 1,
          roomCount: 1,
        },
      ],
      closures: [],
    },
  ],
  unassigned: [
    {
      id: "line-open",
      reservationId: "res-open",
      guestName: "Mary Jackson",
      status: "confirmed",
      checkIn: "2026-10-22",
      checkOut: "2026-10-24",
      roomId: null,
      roomTypeId: "double",
      roomIndex: 1,
      roomCount: 1,
    },
  ],
};

function renderCalendar(span: 7 | 14 = 7) {
  return React.createElement(calendars.RoomCalendar, {
    start: new Date(2026, 9, 20),
    span,
    onStartChange: () => {},
    onSpanChange: () => {},
    onOpenReservation: () => {},
  });
}

it("opens the visible week from one read and shows rooms, stays, closures, and unassigned reserved rooms", async () => {
  const requests: URL[] = [];
  let release: (response: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    return pending;
  };

  await render(renderCalendar());
  await page.flush();

  assert.equal(container.textContent.includes("101"), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.pathname, "/calendar");
  assert.equal(requests[0]!.searchParams.get("from"), "2026-10-20");
  assert.equal(requests[0]!.searchParams.get("to"), "2026-10-26");

  release(Response.json(windowPayload));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Stay must appear with the calendar",
  );

  assert.equal(requests.length, 1);
  const labels = [...container.querySelectorAll("[title]")].map((element) =>
    element.getAttribute("title"),
  );
  const room2 = labels.indexOf("2");
  const room10 = labels.indexOf("10");
  const room101 = labels.indexOf("101");
  assert.ok(room2 !== -1 && room10 !== -1 && room101 !== -1);
  assert.ok(room2 < room10 && room10 < room101);
  assert.ok(container.textContent.includes("Doble"));
  assert.ok(container.textContent.includes("Suite"));
  assert.ok(container.textContent.includes("Mantenimiento"));
  const departing = container.querySelector<HTMLButtonElement>(
    '[aria-label="Editar reserva de Ada Lovelace · Confirmada"]',
  );
  assert.equal(
    departing?.getAttribute("title"),
    "Ada Lovelace · Confirmada, 2026-10-18 al 2026-10-20",
  );
  const extended = container.querySelector<HTMLButtonElement>(
    '[aria-label="Editar reserva de Grace Hopper · Check-out"]',
  );
  assert.equal(
    extended?.getAttribute("title"),
    "Grace Hopper · Check-out, 2026-10-21 al 2026-11-04",
  );
  const checkoutMorning = container.querySelector<HTMLButtonElement>(
    '[aria-label="Nueva reserva para habitación 101 el 20 oct 2026"]',
  );
  assert.ok(checkoutMorning);
  assert.equal(checkoutMorning.disabled, false);
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
  assert.equal(requests[0]!.searchParams.has("today"), false);
  assert.ok(container.textContent.includes("Hoy"));
});

it("opens a 14-day calendar from the inclusive mornings of that span", async () => {
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    return Response.json({
      ...windowPayload,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
  };

  await render(renderCalendar(14));
  await until(
    () =>
      !!container.querySelector('[aria-label="Nueva reserva para habitación 101 el 2 nov 2026"]'),
    "14-day calendar must draw the last morning",
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.searchParams.get("from"), "2026-10-20");
  assert.equal(requests[0]!.searchParams.get("to"), "2026-11-02");
});

it("shows an error and no rooms when the first load fails", async () => {
  globalThis.fetch = async (input) => {
    if (requestUrl(input).pathname !== "/calendar")
      throw new Error(`Unexpected request ${requestUrl(input).pathname}`);
    return Response.json({ error: "calendar window is incomplete" }, { status: 500 });
  };

  await render(renderCalendar());
  await until(
    () => container.textContent.includes("La ventana del calendario está incompleta"),
    "Failed load must show the Spanish error",
  );

  assert.ok(container.textContent.includes("Reintentar"));
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
  assert.equal(container.textContent.includes("Aún no hay habitaciones"), false);
});

it("shows an error and no rooms when the read returns an incomplete window", async () => {
  globalThis.fetch = async (input) => {
    if (requestUrl(input).pathname !== "/calendar")
      throw new Error(`Unexpected request ${requestUrl(input).pathname}`);
    return Response.json({ ...windowPayload, from: "2026-10-21", to: "2026-10-26" });
  };

  await render(renderCalendar());
  await until(
    () => container.textContent.includes("La ventana del calendario está incompleta"),
    "Incomplete window must fail closed",
  );

  assert.equal(container.textContent.includes("101"), false);
  assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
});
