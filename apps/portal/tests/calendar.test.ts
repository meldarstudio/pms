import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLButtonElement, HTMLElement, HTMLInputElement } from "happy-dom";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";
import {
  calendarResponse,
  calendarWindow,
  sampleWeek,
  sampleWeekWith,
  type CalendarFixtureStay,
} from "./calendar-window.ts";
import type { FakeRequest, HeldRequest } from "./fake-backend.ts";

let browser: BrowserTest;
let page: BrowserPage;
let window: BrowserTest["window"];
let React: BrowserTest["React"];
let calendars: typeof import("../src/components/room-calendar.tsx");
let queries: typeof import("../src/lib/queries.ts");
let container: BrowserPage["container"];
let render: BrowserPage["render"];
let until: BrowserPage["until"];
let click: BrowserPage["click"];
/** Every request the page sent, in order. */
let requests: FakeRequest[];

beforeAll(async () => {
  browser = await createBrowserTest();
  ({ React, window } = browser);
  calendars = (await browser.server.ssrLoadModule(
    "/src/components/room-calendar.tsx",
  )) as typeof calendars;
  queries = (await browser.server.ssrLoadModule("/src/lib/queries.ts")) as typeof queries;
  const calendar = (await browser.server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  page = browser.createPage();
  ({ container, render, until, click } = page);
  page.api.catalog.roomTypes = [
    { id: "double", name: "Doble", maxAdults: 2, maxChildren: 1, baseRateCents: 15000 },
    { id: "suite", name: "Suite", maxAdults: 4, maxChildren: 2, baseRateCents: 25000 },
  ];
  page.api.catalog.rooms = [
    { id: "room-2", number: "2", roomTypeId: "double" },
    { id: "room-10", number: "10", roomTypeId: "suite" },
    { id: "room-101", number: "101", roomTypeId: "double" },
  ];
  page.api.on("GET", "/calendar", ({ url }) => calendarWindow(url, sampleWeek));
  requests = page.api.requests();
});

afterEach(async () => {
  await page.cleanup();
  vi.useRealTimers();
});

afterAll(async () => {
  await browser?.close();
});

function failCalendar(status: number, error: string) {
  return page.api.on("GET", "/calendar", () => Response.json({ error }, { status }));
}

/** The sample week with one more stay on a room, from 22 to 24 Oct unless given. */
function stayIn(roomId: string, stay: Partial<CalendarFixtureStay> & { guestName: string }) {
  return sampleWeekWith(roomId, (room) => ({
    ...room,
    stays: [
      ...room.stays,
      {
        id: "line-saved",
        reservationId: "res-new",
        status: "confirmed",
        checkIn: "2026-10-22",
        checkOut: "2026-10-24",
        ...stay,
      },
    ],
  }));
}

function renderCalendar(span: 7 | 14 = 7) {
  return React.createElement(calendars.RoomCalendar, {
    start: new Date(2026, 9, 20),
    span,
    onStartChange: () => {},
    onSpanChange: () => {},
    onOpenReservation: () => {},
  });
}

function CalendarSession() {
  const [start, setStart] = React.useState(new Date(2026, 9, 20));
  const [span, setSpan] = React.useState<7 | 14>(7);
  return React.createElement(calendars.RoomCalendar, {
    start,
    span,
    onStartChange: setStart,
    onSpanChange: setSpan,
    onOpenReservation: () => {},
  });
}

function expectIdleRefresh(disabled = false) {
  const button = container.querySelector<HTMLButtonElement>('[aria-label="Actualizar"]');
  assert.ok(button, "Refresh must have its idle name");
  assert.equal(button.disabled, disabled);
  assert.notEqual(button.getAttribute("aria-busy"), "true");
}

function expectManualRefresh() {
  const button = container.querySelector<HTMLButtonElement>('[aria-label="Actualizando…"]');
  assert.ok(button, "The clicked refresh must announce that it is in flight");
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute("aria-busy"), "true");
  return button;
}

it("keeps day navigation, Hoy, and the date picker available on mobile", async () => {
  page.mobile();

  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "The mobile calendar must load");
  await click("Día siguiente");
  assert.ok(page.button("21 oct 2026"));
  await click("Día anterior");
  assert.ok(page.button("20 oct 2026"));
  await click("Día anterior");
  assert.ok(page.button("19 oct 2026"));
  assert.equal(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent?.trim() === "Hoy",
    ),
    false,
    "Hoy belongs inside the date picker on mobile",
  );
  await React.act(async () => page.button("19 oct 2026").click());
  assert.ok(window.document.querySelector('button[data-day="20/10/2026"]'));
  await React.act(async () => page.button("Hoy").click());
  assert.ok(page.button("20 oct 2026"));
  await until(
    () => !window.document.querySelector('button[data-day="20/10/2026"]'),
    "Hoy must dismiss the date picker",
  );

  await React.act(async () => page.button("20 oct 2026").click());
  const date = window.document.querySelector<HTMLElement>('button[data-day="22/10/2026"]');
  assert.ok(date, "The date picker must remain available on mobile");
  await React.act(async () => date.click());
  assert.ok(page.button("22 oct 2026"));
});

it("shows pending reserved-room counts only within the displayed mobile dates", async () => {
  page.mobile();
  const initial = page.api.hold("GET", "/calendar");

  await render(React.createElement(CalendarSession));
  assert.equal(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar"]')
      ?.textContent,
    "",
    "No count is shown before the calendar loads",
  );
  initial.release(calendarResponse(initial.request!.url, sampleWeek));
  await until(() => !!adaBar(), "The mobile calendar must load");
  assert.equal(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]')
      ?.textContent,
    "1",
  );
  await React.act(async () => page.button("20 oct 2026").click());
  const afterStay = window.document.querySelector<HTMLElement>('button[data-day="25/10/2026"]');
  assert.ok(afterStay);
  await React.act(async () => afterStay.click());
  assert.equal(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 0"]')
      ?.textContent,
    "",
    "The badge disappears when the displayed dates have no unassigned reserved rooms",
  );
  await openMobileUnassigned(0);
  assert.ok(
    window.document
      .querySelector('[role="dialog"]')
      ?.textContent.includes("Todas las habitaciones reservadas en estas fechas están asignadas."),
  );
});

it.each(["mobile", "desktop"])(
  "opens reservation creation from the %s calendar's action location",
  async (viewport) => {
    const mobile = viewport === "mobile";
    if (mobile) page.mobile();
    answerAvailability();
    const routes = (await browser.server.ssrLoadModule(
      "/src/router.tsx",
    )) as typeof import("../src/router.tsx");
    const router = browser.routing.createRouter({
      routeTree: routes.router.routeTree,
      history: browser.routing.createMemoryHistory({
        initialEntries: ["/calendar?from=2026-10-20"],
      }),
    });

    await page.renderRouter(router);
    await until(() => !!adaBar(), "The calendar must load inside the app shell");
    const create = page.button("Nueva reserva");
    assert.equal(!!create.closest("header"), mobile, "Only mobile creation belongs in the header");
    assert.equal(
      [...container.querySelectorAll("button")].filter(
        (button) => button.textContent?.trim() === "Nueva reserva",
      ).length,
      1,
      "Reservation creation must have a single entry point outside calendar cells",
    );
    assert.equal(!!container.querySelector('[role="combobox"]'), !mobile);
    for (const label of ["Período anterior", "Período siguiente", "Colores de reservas"]) {
      assert.equal(!!container.querySelector(`[aria-label="${label}"]`), !mobile);
    }

    await React.act(async () => create.click());
    await until(
      () => !!window.document.querySelector('[role="dialog"] [name="fullName"]'),
      "The calendar action must open the new-reservation form",
    );
  },
);

it("opens a week of 20 Oct from one wider read and draws only 20–26 Oct", async () => {
  const initial = page.api.hold("GET", "/calendar");

  await render(renderCalendar());
  await page.flush();

  const loading = container.querySelector('[role="region"][aria-label="Cargando calendario"]');
  assert.ok(loading, "The unloaded calendar must be named for screen readers");
  assert.equal(loading.getAttribute("aria-busy"), "true");
  assert.ok(loading.textContent.includes("20"));
  assert.ok(loading.textContent.includes("26"));
  assert.ok(loading.textContent.includes("oct"));
  assert.equal(loading.textContent.includes("Ada Lovelace"), false);
  assert.equal(loading.textContent.includes("Mantenimiento"), false);
  assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
  expectIdleRefresh(true);
  assert.equal(page.button("Nueva reserva").disabled, false);
  for (const label of ["Día anterior", "Día siguiente", "Período anterior", "Período siguiente"]) {
    assert.equal(
      container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.disabled,
      false,
    );
  }
  assert.equal(page.button("Hoy").disabled, false);
  assert.equal(page.button("20 oct 2026").disabled, false);
  assert.equal(container.querySelector('[role="combobox"]')?.getAttribute("aria-disabled"), null);
  assert.ok(container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar"]'));
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.path, "/calendar");
  assert.equal(requests[0]!.url.searchParams.get("from"), "2026-10-13");
  assert.equal(requests[0]!.url.searchParams.get("to"), "2026-11-02");

  initial.release(
    calendarResponse(requests[0]!.url, {
      ...sampleWeek,
      unassigned: [
        ...sampleWeek.unassigned,
        {
          id: "line-margin",
          reservationId: "res-margin",
          guestName: "Margin Only",
          status: "confirmed",
          checkIn: "2026-10-14",
          checkOut: "2026-10-16",
          roomId: null,
          roomTypeId: "double",
          roomIndex: 1,
          roomCount: 1,
        },
        {
          id: "line-dawn",
          reservationId: "res-dawn",
          guestName: "Dawn Checkout",
          status: "confirmed",
          checkIn: "2026-10-18",
          checkOut: "2026-10-20",
          roomId: null,
          roomTypeId: "double",
          roomIndex: 1,
          roomCount: 1,
        },
      ],
    }),
  );
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Stay must appear with the calendar",
  );

  assert.equal(requests.length, 1);
  assert.equal(container.querySelector('[aria-label="Cargando calendario"]'), null);
  assert.equal(
    container.querySelector('[aria-label="Nueva reserva para habitación 101 el 13 oct 2026"]'),
    null,
  );
  assert.ok(
    container.querySelector('[aria-label="Nueva reserva para habitación 101 el 26 oct 2026"]'),
  );
  assert.equal(
    container.querySelector('[aria-label="Nueva reserva para habitación 101 el 2 nov 2026"]'),
    null,
  );
  assert.equal(container.textContent.includes("Margin Only"), false);
  assert.ok(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
  );
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
  assert.ok(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
  );
  assert.equal(requests[0]!.url.searchParams.has("today"), false);
  assert.ok(container.textContent.includes("Hoy"));
});

it("opens a 14-day calendar from one wider read and draws only that span", async () => {
  await render(renderCalendar(14));
  await until(
    () =>
      !!container.querySelector('[aria-label="Nueva reserva para habitación 101 el 2 nov 2026"]'),
    "14-day calendar must draw the last morning",
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.url.searchParams.get("from"), "2026-10-13");
  assert.equal(requests[0]!.url.searchParams.get("to"), "2026-11-09");
  assert.equal(
    container.querySelector('[aria-label="Nueva reserva para habitación 101 el 13 oct 2026"]'),
    null,
  );
});

it("shows the next day without another read", async () => {
  page.api.on("GET", "/calendar", ({ url }) =>
    calendarWindow(
      url,
      stayIn("room-101", {
        id: "line-next",
        reservationId: "res-next",
        guestName: "Next Day",
        status: "confirmed",
        checkIn: "2026-10-27",
        checkOut: "2026-10-28",
      }),
    ),
  );

  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before stepping",
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Next Day · Confirmada"]'),
    null,
  );
  assert.equal(requests.length, 1);

  await click("Día siguiente");
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Next Day · Confirmada"]'),
    "Next day must appear from the hold",
  );

  assert.equal(requests.length, 1);
  assert.ok(container.textContent.includes("21 oct 2026"));
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    null,
  );
});

it("shows the previous day without another read", async () => {
  page.api.on("GET", "/calendar", ({ url }) =>
    calendarWindow(
      url,
      stayIn("room-101", {
        id: "line-prev",
        reservationId: "res-prev",
        guestName: "Previous Day",
        status: "checked_out",
        checkIn: "2026-10-18",
        checkOut: "2026-10-19",
      }),
    ),
  );

  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before stepping",
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Previous Day · Check-out"]'),
    null,
  );
  assert.equal(requests.length, 1);

  await click("Día anterior");
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Previous Day · Check-out"]'),
    "Previous day must appear from the hold",
  );

  assert.equal(requests.length, 1);
  assert.ok(container.textContent.includes("19 oct 2026"));
  const checkout = container.querySelector<HTMLButtonElement>(
    '[aria-label="Editar reserva de Previous Day · Check-out"]',
  );
  assert.equal(
    checkout?.getAttribute("title"),
    "Previous Day · Check-out, 2026-10-18 al 2026-10-19",
  );
});

it("switches from 7 days to 14 without another read", async () => {
  page.api.on("GET", "/calendar", ({ url }) =>
    calendarWindow(
      url,
      stayIn("room-101", {
        id: "line-fortnight",
        reservationId: "res-fortnight",
        guestName: "Fortnight",
        status: "confirmed",
        checkIn: "2026-11-01",
        checkOut: "2026-11-02",
      }),
    ),
  );

  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before widening",
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Fortnight · Confirmada"]'),
    null,
  );
  assert.equal(requests.length, 1);

  const span = container.querySelector<HTMLElement>('[data-slot="select-trigger"]');
  assert.ok(span, "Missing span control");
  await React.act(async () => span.click());
  await until(
    () =>
      [...container.ownerDocument.querySelectorAll('[role="option"]')].some(
        (option) => option.textContent.trim() === "14 días",
      ),
    "14-day option must open",
  );
  const fortnight = [
    ...container.ownerDocument.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((option) => option.textContent.trim() === "14 días");
  assert.ok(fortnight);
  await React.act(async () => fortnight.click());
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Fortnight · Confirmada"]'),
    "14-day stay must appear from the hold",
  );

  assert.equal(requests.length, 1);
  assert.ok(
    container.querySelector('[aria-label="Nueva reserva para habitación 101 el 2 nov 2026"]'),
  );
  assert.equal(
    container.querySelector('[aria-label="Nueva reserva para habitación 101 el 3 nov 2026"]'),
    null,
  );
});

it("shows loading instead of the previous bars when a jump leaves the held days", async () => {
  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before jumping",
  );

  await click("Período siguiente");
  await until(
    () => container.textContent.includes("27 oct 2026"),
    "First period stays inside the hold",
  );
  assert.equal(requests.length, 1);
  assert.ok(container.textContent.includes("101"));

  page.api.hold("GET", "/calendar");
  await click("Período siguiente");
  await page.flush();

  assert.equal(requests.length, 2);
  assert.equal(requests[1]!.url.searchParams.get("from"), "2026-10-27");
  assert.equal(requests[1]!.url.searchParams.get("to"), "2026-11-16");
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    null,
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'),
    null,
  );
  assert.ok(container.textContent.includes("3 nov 2026"));
  const loading = container.querySelector('[role="region"][aria-label="Cargando calendario"]');
  assert.equal(loading?.getAttribute("aria-busy"), "true");
  assert.ok(loading?.textContent.includes("nov"));
  assert.ok(loading?.textContent.includes("3"));
  assert.ok(loading?.textContent.includes("9"));
  assert.equal(container.textContent.includes("Mantenimiento"), false);
  expectIdleRefresh(true);
});

it("shows loading on the eighth day-step instead of a partial edge", async () => {
  page.api.on("GET", "/calendar", ({ url }) =>
    calendarWindow(
      url,
      stayIn("room-101", {
        id: "line-edge",
        reservationId: "res-edge",
        guestName: "Edge Night",
        status: "confirmed",
        checkIn: "2026-10-28",
        checkOut: "2026-10-29",
      }),
    ),
  );

  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before stepping",
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Edge Night · Confirmada"]'),
    null,
  );

  for (let step = 0; step < 7; step++) await click("Día siguiente");
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Edge Night · Confirmada"]'),
    "Seventh step must still draw from the hold",
  );
  assert.equal(requests.length, 1);
  assert.ok(container.textContent.includes("27 oct 2026"));

  page.api.hold("GET", "/calendar");
  await click("Día siguiente");
  await page.flush();

  assert.equal(requests.length, 2);
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Edge Night · Confirmada"]'),
    null,
  );
  assert.ok(container.textContent.includes("28 oct 2026"));
  const loading = container.querySelector('[role="region"][aria-label="Cargando calendario"]');
  assert.equal(loading?.getAttribute("aria-busy"), "true");
  assert.ok(loading?.textContent.includes("28"));
  expectIdleRefresh(true);
});

it("draws a checkout on the first morning at the edge of the hold", async () => {
  page.api.on("GET", "/calendar", ({ url }) =>
    calendarWindow(
      url,
      stayIn("room-101", {
        id: "line-edge-out",
        reservationId: "res-edge-out",
        guestName: "Hold Edge",
        status: "checked_out",
        checkIn: "2026-10-12",
        checkOut: "2026-10-13",
      }),
    ),
  );

  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before stepping back to the hold edge",
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Hold Edge · Check-out"]'),
    null,
  );
  assert.equal(requests.length, 1);

  for (let step = 0; step < 7; step++) await click("Día anterior");
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Hold Edge · Check-out"]'),
    "Checkout on the hold's first morning must still draw",
  );

  assert.equal(requests.length, 1);
  assert.ok(container.textContent.includes("13 oct 2026"));
  assert.equal(
    container
      .querySelector('[aria-label="Editar reserva de Hold Edge · Check-out"]')
      ?.getAttribute("title"),
    "Hold Edge · Check-out, 2026-10-12 al 2026-10-13",
  );
});

it("does not read again on a timer while the tab stays open and staff only step", async () => {
  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before time passes",
  );
  await click("Día siguiente");
  await until(() => container.textContent.includes("21 oct 2026"), "Step must stay on screen");
  await page.flush(50);

  assert.equal(requests.length, 1);
  assert.ok(container.textContent.includes("101"));
});

it("shows an error and no rooms when the first load fails", async () => {
  failCalendar(500, "calendar window is incomplete");

  await render(renderCalendar());
  await until(
    () => container.textContent.includes("La ventana del calendario está incompleta"),
    "Failed load must show the Spanish error",
  );

  assert.ok(container.textContent.includes("Reintentar"));
  assert.equal(container.querySelector('[aria-label="Cargando calendario"]'), null);
  expectIdleRefresh(true);
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
  assert.equal(container.textContent.includes("Aún no hay habitaciones"), false);
});

it("shows an error and no rooms when the read returns an incomplete window", async () => {
  page.api.on("GET", "/calendar", ({ url }) => ({
    ...calendarWindow(url, sampleWeek),
    from: "2026-10-21",
    to: "2026-10-26",
  }));

  await render(renderCalendar());
  await until(
    () => container.textContent.includes("La ventana del calendario está incompleta"),
    "Incomplete window must fail closed",
  );

  assert.equal(container.textContent.includes("101"), false);
  assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
});

/** The sample week after someone else books room 101 for 22–24 Oct. */
function bookedElsewhere(guestName: string) {
  return stayIn("room-101", { id: "line-elsewhere", reservationId: "res-elsewhere", guestName });
}

function returnToTab() {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  window.dispatchEvent(new window.Event("visibilitychange"));
}

it("refreshes the calendar when staff return to the tab and keeps the current bars until that window arrives", async () => {
  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before leaving the tab",
  );
  const focusRead = page.api.hold("GET", "/calendar");
  assert.equal(requests.length, 1);
  assert.ok(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
  );

  await React.act(async () => returnToTab());
  await page.flush();

  assert.equal(requests.length, 2);
  assert.equal(requests[1]!.path, "/calendar");
  assert.equal(requests[1]!.url.searchParams.get("from"), "2026-10-13");
  assert.equal(requests[1]!.url.searchParams.get("to"), "2026-11-02");
  assert.ok(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Current bars stay up while the focus refresh is in flight",
  );
  assert.ok(container.textContent.includes("101"));
  assert.ok(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Katherine Johnson · Confirmada"]'),
    null,
  );
  expectIdleRefresh();
  assert.equal(container.querySelector('[aria-label="Actualizando…"]'), null);
  assert.equal(container.querySelector('[aria-label="Cargando calendario"]'), null);
  const bookNight = container.querySelector<HTMLButtonElement>(
    '[aria-label="Nueva reserva para habitación 2 el 22 oct 2026"]',
  );
  assert.ok(bookNight, "Returning to the tab must keep free nights bookable");
  assert.equal(bookNight.disabled, false);

  focusRead.release(calendarResponse(requests[1]!.url, bookedElsewhere("Katherine Johnson")));
  await until(
    () =>
      !!container.querySelector('[aria-label="Editar reserva de Katherine Johnson · Confirmada"]'),
    "A reservation made elsewhere must appear after returning to the tab",
  );
  assert.equal(requests.length, 2);
  assert.ok(container.textContent.includes("20 oct 2026"));
});

function CalendarWithOtherReads() {
  queries.useSession();
  queries.useReservations("2026-10-20", "2026-10-27");
  queries.useInventory("2026-10-20", "2026-10-26");
  return React.createElement(CalendarSession);
}

it("reloads only the calendar from mobile refresh and keeps the current bars up", async () => {
  page.mobile();

  await render(React.createElement(CalendarWithOtherReads));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before refreshing",
  );
  const beforeRefresh = requests.length;
  assert.ok(requests.some((request) => request.path === "/session"));
  assert.ok(requests.some((request) => request.path === "/reservations"));
  assert.ok(requests.some((request) => request.path === "/inventory"));

  const refresh = page.api.hold("GET", "/calendar");
  await click("Actualizar");
  await page.flush();

  const refreshed = requests.slice(beforeRefresh);
  assert.deepEqual(
    refreshed.map((request) => request.path),
    ["/calendar"],
  );
  assert.ok(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Current bars stay up while the calendar reloads",
  );
  assert.ok(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
  );
  assert.ok(container.textContent.includes("20 oct 2026"));

  const refreshing = expectManualRefresh();
  assert.equal(container.querySelector('[aria-label="Cargando calendario"]'), null);
  const bookNight = container.querySelector<HTMLButtonElement>(
    '[aria-label="Nueva reserva para habitación 2 el 22 oct 2026"]',
  );
  assert.ok(bookNight, "A free night must stay bookable while refreshing");
  assert.equal(bookNight.disabled, false);
  assert.equal(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Editar reserva de Ada Lovelace · Confirmada"]',
    )?.disabled,
    false,
  );
  assert.equal(page.button("Mantenimiento").disabled, false);
  await React.act(async () => refreshing.click());
  assert.equal(requests.length, beforeRefresh + 1, "A pending refresh must not stack another read");
  await openMobileUnassigned(1);
  assert.ok(
    window.document.body.textContent.includes("Mary Jackson"),
    "Unassigned reserved rooms stay available",
  );

  await React.act(async () =>
    window.document
      .querySelector<HTMLElement>('[aria-label="Cerrar habitaciones reservadas sin asignar"]')!
      .click(),
  );
  await until(() => !window.document.querySelector('[role="dialog"]'), "The sheet must close");
  refresh.release(calendarResponse(refreshed[0]!.url, sampleWeek));
  await until(
    () => !!container.querySelector('[aria-label="Actualizar"]'),
    "Refresh must finish even when the calendar has not changed",
  );
  expectIdleRefresh();
  assert.ok(adaBar());
  assert.equal(requests.length, beforeRefresh + 1);
});

it("ignores a refresh that finishes after staff have left that day", async () => {
  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before refreshing",
  );

  const refresh = page.api.hold("GET", "/calendar");
  await click("Actualizar");
  await page.flush();
  assert.equal(requests.length, 2);

  await click("Día siguiente");
  await until(
    () => container.textContent.includes("21 oct 2026"),
    "A day-step stays inside the hold",
  );
  assert.equal(requests.length, 2);
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'));
  expectManualRefresh();
  assert.equal(container.querySelector('[aria-label="Cargando calendario"]'), null);

  page.api.hold("GET", "/calendar");
  await click("Período siguiente");
  await page.flush();
  assert.equal(requests.length, 3);
  assert.equal(requests[2]!.url.searchParams.get("from"), "2026-10-21");
  assert.ok(container.textContent.includes("28 oct 2026"));
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    null,
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'),
    null,
  );
  assert.equal(container.querySelector('[aria-label="Actualizando…"]'), null);
  expectIdleRefresh(true);
  const loading = container.querySelector('[role="region"][aria-label="Cargando calendario"]');
  assert.equal(loading?.getAttribute("aria-busy"), "true");
  assert.ok(loading?.textContent.includes("28"));

  refresh.release(calendarResponse(requests[1]!.url, bookedElsewhere("Katherine Johnson")));
  await page.flush();

  assert.ok(container.textContent.includes("28 oct 2026"));
  assert.equal(container.textContent.includes("20 oct 2026"), false);
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    null,
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Katherine Johnson · Confirmada"]'),
    null,
  );
  assert.equal(requests.length, 3);
  assert.equal(container.querySelector('[aria-label="Actualizando…"]'), null);
  assert.ok(container.querySelector('[aria-label="Cargando calendario"]'));
});

it("keeps the held window and shows one Spanish banner when a refresh fails", async () => {
  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before a failed refresh",
  );
  assert.ok(container.textContent.includes("Mantenimiento"));

  failCalendar(500, "calendar window is incomplete");
  await click("Actualizar");
  await until(
    () => container.textContent.includes("La ventana del calendario está incompleta"),
    "Failed refresh must show the Spanish banner",
  );

  assert.equal(container.textContent.includes("calendar window is incomplete"), false);
  assert.ok(container.textContent.includes("Reintentar"));
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.ok(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
  );
  assert.equal(container.textContent.includes("Aún no hay habitaciones"), false);
  assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
  assert.equal(requests.length, 2);
  assert.equal(container.querySelector('[aria-label="Cargando calendario"]'), null);
  assert.equal(container.querySelector('[aria-label="Actualizando…"]'), null);
  expectIdleRefresh();
  assert.equal(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Nueva reserva para habitación 2 el 22 oct 2026"]',
    )?.disabled,
    false,
  );
});

it("shows an error and no rooms when a step has no complete window and that read fails", async () => {
  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before leaving the hold",
  );

  await click("Período siguiente");
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'),
    "First period stays inside the hold",
  );
  assert.equal(requests.length, 1);
  assert.ok(container.textContent.includes("27 oct 2026"));

  failCalendar(400, "calendar range is too wide");
  await click("Período siguiente");
  await until(
    () => container.textContent.includes("El rango del calendario es demasiado amplio"),
    "A failed step outside the hold must show the Spanish error",
  );

  assert.equal(container.textContent.includes("calendar range is too wide"), false);
  assert.ok(container.textContent.includes("3 nov 2026"));
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'),
    null,
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    null,
  );
  assert.equal(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
    null,
  );
  assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
  assert.equal(container.textContent.includes("Aún no hay habitaciones"), false);
  assert.equal(requests.length, 2);
  assert.equal(container.querySelector('[aria-label="Cargando calendario"]'), null);
  assert.equal(container.querySelector('[aria-label="Actualizando…"]'), null);
  expectIdleRefresh(true);
});

it("keeps an open unassigned list when a refresh fails, with the same banner as the grid", async () => {
  await render(React.createElement(CalendarSession));
  await until(
    () =>
      !!container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
    "Unassigned count must paint with the week",
  );
  await click("Mostrar habitaciones reservadas sin asignar, 1");
  await until(
    () => container.textContent.includes("Mary Jackson"),
    "Unassigned stay must be listed",
  );

  failCalendar(500, "calendar window is incomplete");
  await click("Actualizar");
  await until(
    () => container.textContent.includes("La ventana del calendario está incompleta"),
    "Failed refresh must show one Spanish banner",
  );

  assert.ok(container.textContent.includes("Mary Jackson"));
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.equal(container.textContent.includes("calendar window is incomplete"), false);
  assert.equal(
    container.querySelectorAll('[role="alert"]').length,
    0,
    "The held list must not be replaced by a second error",
  );
});

it("retries a failed calendar refresh without reloading the reservation list, inventory, or session", async () => {
  await render(React.createElement(CalendarWithOtherReads));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before a failed refresh",
  );
  failCalendar(500, "calendar window is incomplete");
  await click("Actualizar");
  await until(
    () => container.textContent.includes("La ventana del calendario está incompleta"),
    "Failed refresh must show the banner before retry",
  );
  const beforeRetry = requests.length;

  const retry = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Reintentar"),
  );
  assert.ok(retry, "Missing Reintentar");
  await React.act(async () => retry.click());
  await page.flush();

  assert.deepEqual(
    requests.slice(beforeRetry).map((request) => request.path),
    ["/calendar"],
  );
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
});

it.each(["mobile", "desktop"])(
  "retries a failed first load from the %s unassigned list without reloading unrelated reads",
  async (viewport) => {
    if (viewport === "mobile") page.mobile();
    failCalendar(500, "calendar window is incomplete");

    await render(React.createElement(CalendarWithOtherReads));
    await until(
      () => container.textContent.includes("La ventana del calendario está incompleta"),
      "Failed load must show the Spanish error",
    );
    if (viewport === "mobile") await openMobileUnassigned(0);
    else await click("Mostrar habitaciones reservadas sin asignar, 0");
    const panelRetry = window.document.querySelector<HTMLElement>(
      viewport === "mobile"
        ? '[role="dialog"] [role="alert"] button'
        : '[aria-label="Habitaciones reservadas sin asignar"] [role="alert"] button',
    );
    assert.ok(panelRetry, "Missing unassigned retry");
    const beforeRetry = requests.length;

    await React.act(async () => panelRetry.click());
    await page.flush();

    assert.deepEqual(
      requests.slice(beforeRetry).map((request) => request.path),
      ["/calendar"],
    );
    assert.equal(container.textContent.includes("101"), false);
  },
);

function adaBar() {
  return container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]');
}

async function openRoomActions(number: string) {
  const trigger = container.querySelector<HTMLElement>(
    `[aria-label="Acciones de habitación ${number}"]`,
  );
  assert.ok(trigger, `Missing room actions ${number}`);
  await React.act(async () => {
    trigger.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
    trigger.click();
  });
  await until(
    () => window.document.querySelector('[role="menuitem"]') !== null,
    "Room actions must open",
  );
}

async function chooseMenuItem(label: string) {
  const item = [...window.document.querySelectorAll('[role="menuitem"]')].find(
    (element) => element.textContent?.trim() === label,
  );
  assert.ok(item, `Missing menu item ${label}`);
  await React.act(async () => (item as HTMLElement).click());
}

async function openMobileUnassigned(count: number) {
  await click(`Mostrar habitaciones reservadas sin asignar, ${count}`);
  await until(
    () => !!window.document.querySelector('[role="dialog"]'),
    "Selecting unassigned must open the sheet",
  );
}

async function pickDate(id: string, day: string) {
  const trigger = window.document.getElementById(id);
  assert.ok(trigger, `Missing ${id}`);
  await React.act(async () => (trigger as HTMLElement).click());
  const selected = [...window.document.querySelectorAll("button")].find(
    (button) => button.getAttribute("data-day") === day,
  );
  assert.ok(selected, `Missing day ${day}`);
  await React.act(async () => (selected as HTMLElement).click());
}

function answerAvailability() {
  page.api.on("GET", "/availability", ({ url }) => ({
    checkIn: url.searchParams.get("checkIn"),
    checkOut: url.searchParams.get("checkOut"),
    nights: 1,
    currency: "PEN",
    roomTypes: [
      {
        id: "double",
        name: "Doble",
        maxAdults: 2,
        maxChildren: 1,
        free: 2,
        totalCents: 15000,
        nights: [],
      },
    ],
  }));
}

async function expectHeldRefresh(options: {
  refresh: HeldRequest;
  before: number;
  whileHeld: () => boolean;
  next: (url: URL) => Response;
  arrived: () => boolean;
  after?: () => void;
}) {
  const refreshed = requests
    .slice(options.before)
    .filter((request) => request.path === "/calendar");
  assert.equal(refreshed.length, 1, "The save must drop the held days");
  assert.equal(refreshed[0]!.url.searchParams.get("from"), "2026-10-13");
  assert.equal(refreshed[0]!.url.searchParams.get("to"), "2026-11-02");
  assert.ok(options.whileHeld(), "The grid must stay up while the refresh is in flight");
  options.refresh.release(options.next(refreshed[0]!.url));
  await until(options.arrived, "The saved change must appear");
  options.after?.();
  assert.equal(requests.filter((request) => request.path === "/calendar").length, 2);
}

function stayOn(roomId: string, guestName: string) {
  return (url: URL) => calendarResponse(url, stayIn(roomId, { guestName }));
}

it("shows a new reservation on its room without blanking the calendar", async () => {
  answerAvailability();
  page.api.on("POST", "/reservations", () => ({ id: "res-new" }));
  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "Week must paint before the new reservation");
  const refresh = page.api.hold("GET", "/calendar");
  await click("Nueva reserva para habitación 2 el 22 oct 2026");
  await until(
    () => window.document.querySelector('[name="fullName"]') !== null,
    "New reservation dialog must open",
  );
  await page.fill("fullName", "Rosalind Franklin");
  await until(() => !page.button("Crear reserva").disabled, "The quote must load");
  assert.ok(
    requests.some((request) => request.path === "/availability"),
    "The new-reservation dialog keeps its availability read",
  );
  const before = requests.length;

  await React.act(async () => page.button("Crear reserva").click());
  await until(
    () => requests.slice(before).some((request) => request.path === "/calendar"),
    "Creating a reservation must drop the held days",
  );

  await expectHeldRefresh({
    refresh,
    before,
    whileHeld: () =>
      !!adaBar() &&
      !container.querySelector('[aria-label="Editar reserva de Rosalind Franklin · Confirmada"]'),
    next: stayOn("room-2", "Rosalind Franklin"),
    arrived: () =>
      !!container.querySelector('[aria-label="Editar reserva de Rosalind Franklin · Confirmada"]'),
    after: () => {
      assert.ok(adaBar());
      assert.ok(
        container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'),
      );
      assert.ok(container.textContent.includes("101"));
      assert.ok(container.textContent.includes("Mantenimiento"));
    },
  });
});

function closureOn(roomId: string, reason: string) {
  return (url: URL) =>
    calendarResponse(
      url,
      sampleWeekWith(roomId, (room) => ({
        ...room,
        closures: [
          ...room.closures,
          { id: "closure-saved", roomId, starts: "2026-10-22", ends: "2026-10-24", reason },
        ],
      })),
    );
}

it("shows a saved room closure without blanking the calendar", async () => {
  page.api.on("POST", "/room-closures", () => ({
    id: "closure-saved",
    roomId: "room-2",
    starts: "2026-10-22",
    ends: "2026-10-24",
    reason: "Pintura",
  }));
  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "Week must paint before the closure save");
  const refresh = page.api.hold("GET", "/calendar");
  assert.equal(container.textContent.includes("Pintura"), false);
  await openRoomActions("2");
  await chooseMenuItem("Cerrar habitación");
  await until(
    () => window.document.getElementById("closure-start") !== null,
    "Closure form must open",
  );
  await pickDate("closure-start", "22/10/2026");
  await pickDate("closure-end", "24/10/2026");
  await page.fill("reason", "Pintura");
  const submit = window.document.querySelector<HTMLButtonElement>(
    "#room-closure-form button[type='submit']",
  );
  assert.ok(submit, "Missing closure save");
  await until(() => !submit.disabled, "Closure save must be ready");
  const before = requests.length;

  await React.act(async () => submit.click());
  await until(
    () => requests.slice(before).some((request) => request.path === "/calendar"),
    "Saving a closure must drop the held days",
  );

  await expectHeldRefresh({
    refresh,
    before,
    whileHeld: () => !!adaBar() && container.textContent.includes("Mantenimiento"),
    next: closureOn("room-2", "Pintura"),
    arrived: () => container.textContent.includes("Pintura"),
    after: () => {
      assert.ok(container.textContent.includes("Mantenimiento"));
      assert.ok(adaBar());
      assert.ok(container.textContent.includes("101"));
    },
  });
});

function withoutClosure(url: URL) {
  return calendarResponse(
    url,
    sampleWeekWith("room-10", (room) => ({ ...room, closures: [] })),
  );
}

it("removes a deleted room closure without blanking the calendar", async () => {
  page.api.on("DELETE", "/room-closures/closure-1", () => ({ ok: true }));
  await render(React.createElement(CalendarSession));
  await until(
    () => container.textContent.includes("Mantenimiento"),
    "The closure must paint before it is deleted",
  );
  const refresh = page.api.hold("GET", "/calendar");
  const closure = [...container.querySelectorAll("button")].find((button) =>
    button.getAttribute("title")?.startsWith("Mantenimiento"),
  );
  assert.ok(closure, "Missing closure bar");
  await React.act(async () => closure.click());
  await until(
    () => window.document.body.textContent?.includes("Editar cierre") ?? false,
    "Closure editor must open",
  );
  const before = requests.length;

  await React.act(async () => page.button("Eliminar").click());
  await until(
    () => requests.slice(before).some((request) => request.path === "/calendar"),
    "Deleting a closure must drop the held days",
  );

  await expectHeldRefresh({
    refresh,
    before,
    whileHeld: () => container.textContent.includes("Mantenimiento") && !!adaBar(),
    next: withoutClosure,
    arrived: () => !container.textContent.includes("Mantenimiento"),
    after: () => {
      assert.ok(adaBar());
      assert.ok(
        container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'),
      );
      assert.ok(container.textContent.includes("101"));
    },
  });
});

function renamedRoom(url: URL) {
  return calendarResponse(
    url,
    sampleWeekWith("room-2", (room) => ({ ...room, number: "8", roomTypeName: "Familiar" })),
  );
}

it("shows a new room number after a room edit without blanking the calendar", async () => {
  page.api.catalog.roomTypes = [
    { id: "double", name: "Doble", maxAdults: 2, maxChildren: 1, baseRateCents: 15000 },
    { id: "family", name: "Familiar", maxAdults: 4, maxChildren: 2, baseRateCents: 20000 },
  ];
  page.api.on("PATCH", "/rooms/room-2", () => ({
    id: "room-2",
    number: "8",
    roomTypeId: "double",
  }));
  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Acciones de habitación 2"]'),
    "Room 2 must paint before the edit",
  );
  const refresh = page.api.hold("GET", "/calendar");
  await openRoomActions("2");
  await chooseMenuItem("Editar habitación");
  await until(() => {
    const input = window.document.querySelector<HTMLInputElement>('[name="number"]');
    return !!input && !input.disabled;
  }, "Room edit form must load");
  await page.fill("number", "8");
  const save = window.document.querySelector<HTMLButtonElement>(
    "#room-edit-form button[type='submit']",
  );
  assert.ok(save, "Missing room save");
  await until(() => !save.disabled, "Room save must be ready");
  const before = requests.length;

  await React.act(async () => save.click());
  await until(
    () => requests.slice(before).some((request) => request.path === "/calendar"),
    "Editing a room must drop the held days",
  );

  await expectHeldRefresh({
    refresh,
    before,
    whileHeld: () =>
      !!container.querySelector('[aria-label="Acciones de habitación 2"]') &&
      !container.querySelector('[aria-label="Acciones de habitación 8"]') &&
      !!adaBar(),
    next: renamedRoom,
    arrived: () => !!container.querySelector('[aria-label="Acciones de habitación 8"]'),
    after: () => {
      assert.ok(container.textContent.includes("Familiar"));
      assert.equal(container.querySelector('[aria-label="Acciones de habitación 2"]'), null);
      assert.ok(adaBar());
      assert.ok(container.textContent.includes("Mantenimiento"));
    },
  });
});

function assignedWindow(url: URL) {
  return calendarResponse(url, {
    ...stayIn("room-2", {
      id: "line-open",
      reservationId: "res-open",
      guestName: "Mary Jackson",
    }),
    unassigned: [],
  });
}

const maryList = {
  id: "res-open",
  guestName: "Mary Jackson",
  status: "confirmed",
  checkIn: "2026-10-22",
  checkOut: "2026-10-24",
  rooms: [{ id: "line-open", roomTypeId: "double", roomId: null }],
};

function assignmentDetail() {
  return {
    id: "res-open",
    status: "confirmed",
    rooms: [{ id: "line-open", roomTypeId: "double", roomId: null, adults: 1, children: 0 }],
  };
}

function answerAssignmentReads() {
  page.api.on("GET", "/reservations", () => [maryList]);
  page.api.on("GET", "/reservations/res-open", assignmentDetail);
}

async function offerMaryRoom2() {
  await click("Mostrar habitaciones reservadas sin asignar, 1");
  await until(() => container.textContent.includes("Mary Jackson"), "Mary must be listed");
  const maryButton = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Mary Jackson"),
  );
  assert.ok(maryButton, "Missing Mary Jackson");
  await React.act(async () => maryButton.click());
  const assignLabel = "Asignar Mary Jackson a habitación 2, 2026-10-22 al 2026-10-24";
  await until(
    () => !!container.querySelector(`[aria-label="${assignLabel}"]`),
    "Room 2 must be offered for the whole stay",
  );
  assert.equal(
    container.querySelector('[aria-label^="Nueva reserva para habitación"]'),
    null,
    "Night-level reservation controls must stay hidden during room assignment",
  );
  return assignLabel;
}

it("assigns a reserved room from the mobile sheet without selecting a calendar bar", async () => {
  page.mobile();
  answerAssignmentReads();
  const availability = page.api.hold("GET", "/reservations");
  const assignment = page.api.hold("POST", "/reservations/res-open/commands");
  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "The mobile calendar must load");
  const refresh = page.api.hold("GET", "/calendar");
  await openMobileUnassigned(1);
  const mary = [...window.document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find(
    (button) => button.textContent.includes("Mary Jackson"),
  );
  assert.ok(mary, "Mary's reserved room must be listed");
  await React.act(async () => mary.click());
  await until(
    () =>
      window.document.body.textContent.includes("Consultando habitaciones para toda la estancia…"),
    "The picker must wait for whole-stay availability",
  );
  assert.equal(
    window.document.querySelector('[role="dialog"] [aria-label^="Asignar Mary Jackson"]'),
    null,
  );
  availability.release(Response.json([maryList]));
  const label = "Asignar Mary Jackson a habitación 2, 2026-10-22 al 2026-10-24";
  await until(
    () => !!window.document.querySelector(`[role="dialog"] [aria-label="${label}"]`),
    "Room 2 must be offered inside the sheet",
  );
  assert.equal(
    container.querySelector(`[aria-label="${label}"]`),
    null,
    "Mobile assignment must not also render a calendar assignment bar",
  );
  assert.equal(
    window.document.querySelector('[role="dialog"] [aria-label*="habitación 10,"]'),
    null,
    "A different room type must not be offered",
  );
  const before = requests.length;
  const assign = window.document.querySelector<HTMLButtonElement>(
    `[role="dialog"] [aria-label="${label}"]`,
  )!;
  await React.act(async () => assign.click());
  await until(
    () => window.document.body.textContent.includes("Asignando habitación…"),
    "The sheet must announce the pending write",
  );
  assert.ok(container.querySelector<HTMLButtonElement>('[aria-label="Día siguiente"]')?.disabled);
  expectIdleRefresh(true);
  assert.ok(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]',
    )?.disabled,
    "Assignment entry must be disabled during a save",
  );
  const close = window.document.querySelector<HTMLButtonElement>(
    '[aria-label="Cerrar habitaciones reservadas sin asignar"]',
  );
  assert.ok(close?.disabled, "Dismissal must be blocked during assignment");
  await React.act(async () =>
    window.document.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  assert.ok(
    window.document.querySelector('[role="dialog"]'),
    "Escape must not dismiss a pending assignment",
  );
  assert.equal(typeof assignment.request?.init?.body, "string");
  assert.deepEqual((assignment.request!.body as { actions: unknown[] }).actions, [
    {
      type: "edit-room",
      lineId: "line-open",
      room: { roomTypeId: "double", roomId: "room-2", adults: 1, children: 0 },
    },
  ]);
  assignment.release(Response.json({ id: "res-open" }));
  await until(
    () => requests.slice(before).some((request) => request.path === "/calendar"),
    "Assignment must refresh the calendar",
  );
  refresh.release(assignedWindow(refresh.request!.url));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Mary Jackson · Confirmada"]'),
    "The assigned room must appear in the calendar",
  );
  await until(
    () =>
      window.document.body.textContent.includes(
        "Todas las habitaciones reservadas en estas fechas están asignadas.",
      ),
    "The sheet must return to the updated list after success",
  );
  assert.equal(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 0"]')
      ?.textContent,
    "",
    "A successful assignment clears the pending-work badge",
  );
});

it("keeps the mobile picker open after an assignment conflict and offers another room", async () => {
  page.mobile();
  let conflicted = false;
  answerAssignmentReads();
  page.api.on("POST", "/reservations/res-open/commands", () => {
    conflicted = true;
    return Response.json({ error: "room is already assigned for those dates" }, { status: 409 });
  });
  page.api.on("GET", "/reservations", () =>
    conflicted
      ? [
          maryList,
          {
            id: "res-other",
            guestName: "Another contact",
            status: "confirmed",
            checkIn: "2026-10-22",
            checkOut: "2026-10-24",
            rooms: [{ id: "other-line", roomId: "room-2", roomTypeId: "double" }],
          },
        ]
      : undefined,
  );
  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "Calendar must load");
  await openMobileUnassigned(1);
  const mary = [...window.document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find(
    (button) => button.textContent.includes("Mary Jackson"),
  );
  assert.ok(mary);
  await React.act(async () => mary.click());
  const roomButton = (number: string) =>
    window.document.querySelector<HTMLButtonElement>(
      `[role="dialog"] [aria-label="Asignar Mary Jackson a habitación ${number}, 2026-10-22 al 2026-10-24"]`,
    );
  await until(() => !!roomButton("2"), "Room 2 must initially be available");
  await React.act(async () => roomButton("2")!.click());
  await until(
    () => !!window.document.querySelector('[role="dialog"] [role="alert"]'),
    "The conflict must remain visible in the picker, not only a toast",
  );
  assert.ok(
    window.document
      .querySelector('[role="dialog"] [role="alert"]')
      ?.textContent.includes("Esta habitación está ocupada para esas fechas"),
  );
  await until(
    () => !roomButton("2") && !!roomButton("101") && !roomButton("101")!.disabled,
    "Availability must refresh, hide the occupied room, and offer another matching room",
  );
  assert.ok(window.document.querySelector('[role="dialog"]')?.textContent.includes("Mary Jackson"));
});

it("checks the entire mobile stay, hides unavailable rooms, and cancels without writing", async () => {
  page.mobile();
  const unassigned = [1, 2].map((index) => ({
    ...sampleWeek.unassigned[0]!,
    id: `line-open-${index}`,
    checkIn: "2026-10-18",
    checkOut: "2026-11-20",
    roomIndex: index,
    roomCount: 2,
  }));
  let writes = 0;
  page.api.on("GET", "/calendar", ({ url }) => calendarWindow(url, { ...sampleWeek, unassigned }));
  page.api.on("GET", "/reservations", () => [
    {
      ...maryList,
      checkIn: "2026-10-18",
      checkOut: "2026-11-20",
      rooms: unassigned.map((stay) => ({ id: stay.id, roomTypeId: "double", roomId: null })),
    },
    {
      id: "res-later",
      guestName: "Later stay",
      status: "checked_out",
      checkIn: "2026-11-15",
      checkOut: "2026-11-18",
      rooms: [{ id: "line-later", roomId: "room-101", roomTypeId: "double" }],
    },
  ]);
  page.api.on("GET", "/room-closures", () => [
    {
      id: "closure-later",
      roomId: "room-2",
      starts: "2026-11-16",
      ends: "2026-11-17",
      reason: "Maintenance",
    },
  ]);
  page.api.on("*", "*", ({ method }) => {
    if (method === "GET") return undefined;
    writes++;
    throw new Error("Cancellation must not write");
  });
  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "Calendar must load");
  assert.equal(
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 2"]')
      ?.textContent,
    "2",
    "Two unassigned reserved rooms in one reservation contribute two to the badge",
  );
  await openMobileUnassigned(2);
  const selectReservedRoom = async (index: number) => {
    const item = [...window.document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find(
      (button) => button.textContent.includes(`Habitación ${index} de 2`),
    );
    assert.ok(item, "Each reserved room must remain distinguishable");
    await React.act(async () => item.click());
  };
  await selectReservedRoom(1);
  await until(
    () => window.document.body.textContent.includes("Sin habitaciones disponibles"),
    "Conflicts outside the visible calendar must make both matching rooms unavailable",
  );
  const dialog = window.document.querySelector('[role="dialog"]')!;
  for (const number of ["2", "101"]) {
    const button = dialog.querySelector<HTMLButtonElement>(
      `[aria-label="Asignar Mary Jackson a habitación ${number}, 2026-10-18 al 2026-11-20"]`,
    );
    assert.equal(button, null, `Unavailable room ${number} must not be listed`);
  }
  assert.equal(dialog.querySelector('[aria-label^="Asignar Mary Jackson"]'), null);
  assert.ok(dialog.textContent.includes("Habitación 1 de 2"));
  const reservationRead = requests.find((request) => request.path === "/reservations")!.url;
  assert.equal(reservationRead.searchParams.get("from"), "2026-10-18");
  assert.equal(reservationRead.searchParams.get("to"), "2026-11-20");
  const closureRead = requests.find((request) => request.path === "/room-closures")!.url;
  assert.equal(closureRead.searchParams.get("from"), "2026-10-18");
  assert.equal(closureRead.searchParams.get("to"), "2026-11-20");
  await React.act(async () =>
    window.document
      .querySelector<HTMLElement>('[aria-label="Volver a habitaciones reservadas sin asignar"]')!
      .click(),
  );
  await selectReservedRoom(2);
  const escape = () =>
    React.act(async () =>
      window.document.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
  await escape();
  await until(
    () =>
      !!window.document.querySelector('[role="dialog"]')?.textContent.includes("Sin asignar · 2"),
    "Escape on the picker must step back to the list, like the back button",
  );
  await escape();
  await until(
    () => !window.document.querySelector('[role="dialog"]'),
    "Escape on the list must dismiss the sheet",
  );
  await until(
    () =>
      window.document.activeElement ===
      container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 2"]'),
    "Dismissal must return focus to the assignment button",
  );
  await openMobileUnassigned(2);
  assert.ok(
    window.document.querySelector('[role="dialog"]')?.textContent.includes("Habitación 1 de 2"),
  );
  assert.ok(
    window.document.querySelector('[role="dialog"]')?.textContent.includes("Habitación 2 de 2"),
  );
  assert.equal(
    window.document.querySelector('[role="dialog"]')?.textContent.includes("Elegir habitación"),
    false,
    "Reopening must start at the list, not a cancelled selection",
  );
  assert.equal(writes, 0);
});

it("assigns a group from the desktop list and continues with its next reserved room", async () => {
  const lines = [1, 2].map((index) => ({
    ...sampleWeek.unassigned[0]!,
    id: `line-group-${index}`,
    roomIndex: index,
    roomCount: 2,
  }));
  let assigned = false;
  const commands = page.api.bodies("POST", "/reservations/res-open/commands");
  page.api.on("GET", "/calendar", ({ url }) =>
    calendarWindow(url, { ...sampleWeek, unassigned: assigned ? lines.slice(1) : lines }),
  );
  page.api.on("GET", "/reservations", () => [
    {
      ...maryList,
      rooms: lines.map((line, index) => ({
        id: line.id,
        roomTypeId: "double",
        roomId: assigned && index === 0 ? "room-2" : null,
      })),
    },
  ]);
  page.api.on("GET", "/reservations/res-open", () => ({
    id: "res-open",
    status: "confirmed",
    rooms: lines.map((line) => ({
      id: line.id,
      roomTypeId: "double",
      roomId: null,
      adults: 1,
      children: 0,
    })),
  }));
  page.api.on("POST", "/reservations/res-open/commands", () => {
    assigned = true;
    return { id: "res-open" };
  });
  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "Calendar must load");
  assert.equal(
    container.querySelector('[aria-label="Habitaciones reservadas sin asignar"]'),
    null,
    "The panel stays closed until the toolbar button opens it",
  );
  await click("Mostrar habitaciones reservadas sin asignar, 2");
  const panel = () =>
    container.querySelector<HTMLElement>('[aria-label="Habitaciones reservadas sin asignar"]')!;
  const first = [...panel().querySelectorAll<HTMLElement>("button")].find((button) =>
    button.textContent.includes("Habitación 1 de 2"),
  );
  assert.ok(first, "Each reserved room of the group must be listed");
  await React.act(async () => first.click());
  const roomButton = (number: string) =>
    panel().querySelector<HTMLButtonElement>(
      `[aria-label="Asignar Mary Jackson a habitación ${number}, 2026-10-22 al 2026-10-24"]`,
    );
  await until(() => !!roomButton("2") && !!roomButton("101"), "Both doubles must be offered");
  assert.equal(roomButton("10"), null, "A different room type must not be offered");
  assert.ok(
    container.textContent.includes("Asignando habitación a Mary Jackson · Habitación 1 de 2"),
    "The calendar must say that it is in assignment mode",
  );
  const rowHighlighted = (id: string) =>
    !!container.querySelector(`[data-room-id="${id}"]`)?.classList.contains("ring-1");
  await React.act(async () => roomButton("2")!.focus());
  assert.ok(rowHighlighted("room-2"), "Focusing a room must highlight its calendar row");

  await React.act(async () => roomButton("2")!.click());
  await until(
    () => panel().textContent.includes("Habitación 1 → 2"),
    "The next reserved room must open with the group's assignment for reference",
  );
  assert.equal(commands.length, 1);
  assert.deepEqual((commands[0] as { actions: unknown[] }).actions, [
    {
      type: "edit-room",
      lineId: "line-group-1",
      room: { roomTypeId: "double", roomId: "room-2", adults: 1, children: 0 },
    },
  ]);
  assert.ok(container.textContent.includes("Habitación 2 de 2"));
  await until(() => !!roomButton("101"), "Room 101 must remain available for the next room");
  assert.equal(roomButton("2"), null, "The room just given to the group must not be offered");
  const room2Label = container.querySelector('[data-room-id="room-2"]');
  assert.ok(
    room2Label?.textContent.includes("Ocupada"),
    "The calendar must explain why room 2 is missing from the list",
  );
  assert.equal(
    rowHighlighted("room-2"),
    false,
    "The assigned room's highlight must not carry over to the next reserved room",
  );

  await React.act(async () =>
    container
      .querySelector<HTMLElement>('[aria-label="Cerrar habitaciones reservadas sin asignar"]')!
      .click(),
  );
  assert.equal(container.textContent.includes("Asignando habitación a"), false);
  assert.equal(
    window.document.activeElement,
    container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
    "Closing the panel cancels the selection and returns focus to the toolbar",
  );
});

it("moves the desktop calendar to show a selected stay that runs past the window", async () => {
  answerAssignmentReads();
  page.api.on("GET", "/calendar", ({ url }) =>
    calendarWindow(url, {
      ...sampleWeek,
      unassigned: [{ ...sampleWeek.unassigned[0]!, checkIn: "2026-10-25", checkOut: "2026-10-29" }],
    }),
  );
  page.api.on("GET", "/reservations", () => [
    { ...maryList, checkIn: "2026-10-25", checkOut: "2026-10-29" },
  ]);
  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "Calendar must load");
  await click("Mostrar habitaciones reservadas sin asignar, 1");
  const mary = [...container.querySelectorAll<HTMLElement>("button")].find((button) =>
    button.textContent.includes("Mary Jackson"),
  );
  assert.ok(mary, "Mary's reserved room must be listed");
  await React.act(async () => mary.click());
  await until(
    () =>
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "23 oct 2026",
      ),
    "The window must end on the checkout morning so the whole stay is visible",
  );
  await until(
    () =>
      !!container.querySelector(
        '[aria-label="Asignar Mary Jackson a habitación 2, 2026-10-25 al 2026-10-29"]',
      ),
    "Moving the dates must keep the selection",
  );
});

it("moves a reserved room onto its room after assignment without blanking the calendar", async () => {
  answerAssignmentReads();
  const assignment = page.api.hold("POST", "/reservations/res-open/commands");
  await render(React.createElement(CalendarSession));
  await until(
    () =>
      !!container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
    "The unassigned stay must paint before assignment",
  );
  const assignLabel = await offerMaryRoom2();
  assert.ok(requests.some((request) => request.path === "/reservations"));
  assert.ok(requests.some((request) => request.path === "/room-closures"));
  const before = requests.length;
  const refresh = page.api.hold("GET", "/calendar");

  await click(assignLabel);
  await until(
    () => page.button("Nueva reserva").disabled,
    "Reservation creation must be disabled while room assignment is saving",
  );
  expectIdleRefresh(true);
  assignment.release(Response.json({ id: "res-open" }));
  await until(
    () => requests.slice(before).some((request) => request.path === "/calendar"),
    "Assigning a room must drop the held days",
  );

  await expectHeldRefresh({
    refresh,
    before,
    whileHeld: () =>
      container.textContent.includes("Ada Lovelace") &&
      container.textContent.includes("101") &&
      container.textContent.includes("Mantenimiento") &&
      !!container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]') &&
      !container.querySelector('[aria-label="Editar reserva de Mary Jackson · Confirmada"]'),
    next: assignedWindow,
    arrived: () =>
      !!container.querySelector('[aria-label="Editar reserva de Mary Jackson · Confirmada"]'),
    after: () => {
      assert.ok(container.textContent.includes("Sin asignar · 0"));
      assert.ok(adaBar());
      assert.ok(container.textContent.includes("101"));
      assert.ok(container.textContent.includes("Mantenimiento"));
    },
  });
});

function conflictWindow(url: URL) {
  return calendarResponse(
    url,
    stayIn("room-2", {
      id: "line-conflict",
      reservationId: "res-conflict",
      guestName: "Katherine Johnson",
    }),
  );
}

it("refreshes the calendar after a failed room assignment without keeping the contradicted bars", async () => {
  answerAssignmentReads();
  page.api.on("POST", "/reservations/res-open/commands", () =>
    Response.json({ error: "room is already assigned for those dates" }, { status: 409 }),
  );
  await render(React.createElement(CalendarSession));
  await until(
    () =>
      !!container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
    "The unassigned stay must paint before assignment",
  );
  const assignLabel = await offerMaryRoom2();
  const before = requests.length;
  const refresh = page.api.hold("GET", "/calendar");

  await click(assignLabel);
  await until(
    () => requests.slice(before).some((request) => request.path === "/calendar"),
    "A failed assignment must drop the held days",
  );

  assert.ok(
    requests.slice(before).some((request) => request.path === "/reservations"),
    "Assignment availability keeps its reservation read",
  );
  assert.ok(
    requests.slice(before).some((request) => request.path === "/room-closures"),
    "Assignment availability keeps its room-closure read",
  );
  await expectHeldRefresh({
    refresh,
    before,
    whileHeld: () =>
      container.textContent.includes("Ada Lovelace") &&
      container.textContent.includes("101") &&
      container.textContent.includes("Mantenimiento") &&
      !container.textContent.includes("Katherine Johnson"),
    next: conflictWindow,
    arrived: () => container.textContent.includes("Katherine Johnson"),
    after: () => {
      assert.ok(container.textContent.includes("Ada Lovelace"));
      assert.ok(container.textContent.includes("101"));
      assert.ok(container.textContent.includes("Mantenimiento"));
      assert.ok(container.textContent.includes("20 oct 2026"));
    },
  });
});

function mountedWriter(save: (() => Promise<unknown>) | null) {
  if (!save) throw new Error("Writer must be mounted with the calendar");
  return save;
}

async function expectOffCalendarWriter(options: {
  useWriter: () => { save: () => Promise<unknown> };
  respond: (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;
  dropsHold: boolean;
  ready?: () => boolean;
  whileHeld?: () => boolean;
  next?: (url: URL) => Response;
  arrived?: () => boolean;
  after?: () => void;
  initial?: (url: URL) => Response;
  withRouter?: boolean;
}) {
  const { initial } = options;
  if (initial) page.api.once("GET", "/calendar", ({ url }) => initial(url));
  page.api.on("*", "*", ({ url, init }) => options.respond(url, init));
  let save: (() => Promise<unknown>) | null = null;
  function Probe() {
    const writer = options.useWriter();
    save = () => writer.save();
    return React.createElement(CalendarSession);
  }
  if (options.withRouter) {
    const rootRoute = browser.routing.createRootRoute({ component: Probe });
    const setupRoute = browser.routing.createRoute({
      getParentRoute: () => rootRoute,
      path: "/setup",
    });
    const router = browser.routing.createRouter({
      routeTree: rootRoute.addChildren([setupRoute]),
      history: browser.routing.createMemoryHistory({ initialEntries: ["/"] }),
    });
    await page.renderRouter(router);
  } else {
    await render(React.createElement(Probe));
  }
  await until(options.ready ?? (() => !!adaBar()), "Calendar must paint before the save");
  const before = requests.length;
  const refresh = options.dropsHold ? page.api.hold("GET", "/calendar") : undefined;
  void mountedWriter(save)();
  if (options.dropsHold) {
    await until(
      () => requests.filter((request) => request.path === "/calendar").length >= 2,
      "The save must drop the held days",
    );
    const refreshed = requests.slice(before).filter((request) => request.path === "/calendar");
    assert.equal(refreshed.length, 1);
    assert.equal(refreshed[0]!.url.searchParams.get("from"), "2026-10-13");
    assert.equal(refreshed[0]!.url.searchParams.get("to"), "2026-11-02");
    assert.ok(
      options.whileHeld?.() ?? !!adaBar(),
      "The grid must stay up while the refresh is in flight",
    );
    refresh!.release(options.next!(refreshed[0]!.url));
    if (options.arrived) await until(options.arrived, "The saved change must appear");
    options.after?.();
    assert.equal(requests.filter((request) => request.path === "/calendar").length, 2);
  } else {
    await page.flush();
    assert.equal(
      requests.slice(before).some((request) => request.path === "/calendar"),
      false,
      "This save must not reload the calendar",
    );
    assert.ok(adaBar(), "The grid must stay up");
  }
}

it("updates the calendar after a reservation save without blanking the grid", async () => {
  await expectOffCalendarWriter({
    useWriter: () => {
      queries.useReservationList({
        sort: "checkIn",
        direction: "asc",
        limit: 25,
        offset: 0,
      });
      const save = queries.useWorkflowCommand("res-new");
      return {
        save: () =>
          save.mutateAsync({
            id: "res-new",
            command: {
              requestId: "save-new-stay",
              actions: [
                {
                  type: "add-room",
                  room: {
                    roomTypeId: "double",
                    roomId: "room-2",
                    adults: 1,
                    children: 0,
                  },
                },
              ],
            },
          }),
      };
    },
    respond: (url) => {
      if (url.pathname === "/reservations/res-new/commands")
        return Response.json({ id: "res-new" });
      if (url.pathname === "/reservations" && url.searchParams.get("paginated") === "true") {
        return Response.json({ rows: [], total: 0, limit: 25, offset: 0 });
      }
      return undefined;
    },
    dropsHold: true,
    next: stayOn("room-2", "Rosalind Franklin"),
    arrived: () =>
      !!container.querySelector('[aria-label="Editar reserva de Rosalind Franklin · Confirmada"]'),
    after: () => {
      assert.ok(adaBar());
      assert.ok(
        container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'),
      );
      assert.ok(container.textContent.includes("101"));
      assert.ok(container.textContent.includes("Mantenimiento"));
    },
  });
  assert.ok(
    requests.filter(
      (request) =>
        request.path === "/reservations" && request.url.searchParams.get("paginated") === "true",
    ).length >= 2,
    "The reservation list stays on its current read",
  );
});

function renamedContact(url: URL, guestName: string) {
  return calendarResponse(url, {
    ...sampleWeek,
    rooms: sampleWeek.rooms.map((room) => ({
      ...room,
      stays: room.stays.map((stay) =>
        stay.reservationId === "res-ada" ? { ...stay, guestName } : stay,
      ),
    })),
  });
}

it("updates the name on the stay after a booking-contact rename without blanking the calendar", async () => {
  await expectOffCalendarWriter({
    useWriter: () => {
      const save = queries.useWorkflowCommand("res-ada");
      return {
        save: () =>
          save.mutateAsync({
            id: "res-ada",
            command: {
              requestId: "rename-contact",
              actions: [
                {
                  type: "contact",
                  contact: { fullName: "Ada Byron", email: null, phone: null },
                },
              ],
            },
          }),
      };
    },
    respond: (url) =>
      url.pathname === "/reservations/res-ada/commands"
        ? Response.json({ id: "res-ada" })
        : undefined,
    dropsHold: true,
    whileHeld: () =>
      !!adaBar() &&
      !container.querySelector('[aria-label="Editar reserva de Ada Byron · Confirmada"]'),
    next: (url) => renamedContact(url, "Ada Byron"),
    arrived: () =>
      !!container.querySelector('[aria-label="Editar reserva de Ada Byron · Confirmada"]'),
    after: () => {
      assert.equal(adaBar(), null);
      assert.ok(
        container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'),
      );
      assert.ok(container.textContent.includes("101"));
      assert.ok(container.textContent.includes("Mantenimiento"));
    },
  });
});

it("clears missing setup and shows the new room after property setup without a flash", async () => {
  await expectOffCalendarWriter({
    withRouter: true,
    useWriter: () => {
      const save = queries.useSavePropertySetup();
      return {
        save: () =>
          save.mutateAsync({
            name: "Doble",
            maxAdults: 2,
            maxChildren: 1,
            baseRateCents: 15000,
            rooms: [{ number: "1" }],
          }),
      };
    },
    respond: (url, init) => {
      if (url.pathname === "/setup" && init?.method === "POST") {
        return Response.json({
          roomType: {
            id: "double",
            name: "Doble",
            maxAdults: 2,
            maxChildren: 1,
            baseRateCents: 15000,
          },
          rooms: [{ id: "room-1", number: "1", roomTypeId: "double" }],
        });
      }
      return undefined;
    },
    dropsHold: true,
    initial: (url) => calendarResponse(url, { missingSetup: "rooms" }),
    ready: () => container.textContent.includes("Aún no hay habitaciones"),
    whileHeld: () =>
      container.textContent.includes("Aún no hay habitaciones") &&
      !container.querySelector('[aria-label="Acciones de habitación 1"]'),
    next: (url) =>
      calendarResponse(url, {
        rooms: [{ id: "room-1", number: "1", roomTypeId: "double", roomTypeName: "Doble" }],
      }),
    arrived: () => !!container.querySelector('[aria-label="Acciones de habitación 1"]'),
    after: () => {
      assert.equal(container.textContent.includes("Aún no hay habitaciones"), false);
      assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
      assert.ok(container.textContent.includes("Doble"));
    },
  });
});

it("does not reload the calendar when a rate changes", async () => {
  await expectOffCalendarWriter({
    dropsHold: false,
    useWriter: () => {
      queries.useInventory("2026-10-20", "2026-10-26");
      const save = queries.usePutRoomTypeRates();
      return {
        save: () =>
          save.mutateAsync({
            id: "double",
            from: "2026-10-20",
            to: "2026-10-26",
            priceCents: 18000,
          }),
      };
    },
    respond: (url, init) => {
      if (url.pathname === "/inventory") return Response.json({ roomTypes: [] });
      if (url.pathname === "/room-types/double/rates" && init?.method === "PUT") {
        return Response.json({ updated: 7 });
      }
      return undefined;
    },
  });
  assert.ok(
    requests.filter((request) => request.path === "/inventory").length >= 2,
    "A rate change still reloads inventory",
  );
  assert.equal(requests.filter((request) => request.path === "/calendar").length, 1);
});

it("drops the held calendar after a guest edit without blanking the grid", async () => {
  await expectOffCalendarWriter({
    useWriter: () => {
      const patch = queries.usePatchGuest();
      return {
        save: () => patch.mutateAsync({ id: "guest-ada", body: { fullName: "Augusta Ada" } }),
      };
    },
    respond: (url, init) => {
      if (url.pathname === "/guests/guest-ada" && init?.method === "PATCH") {
        return Response.json({
          id: "guest-ada",
          fullName: "Augusta Ada",
          email: null,
          phone: null,
          notes: null,
        });
      }
      return undefined;
    },
    dropsHold: true,
    whileHeld: () =>
      !!adaBar() &&
      !container.querySelector('[aria-label="Editar reserva de Augusta Ada · Confirmada"]'),
    next: (url) => renamedContact(url, "Augusta Ada"),
    arrived: () =>
      !!container.querySelector('[aria-label="Editar reserva de Augusta Ada · Confirmada"]'),
    after: () => {
      assert.equal(adaBar(), null);
      assert.ok(
        container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'),
      );
      assert.ok(container.textContent.includes("101"));
      assert.ok(container.textContent.includes("Mantenimiento"));
    },
  });
});

it("updates calendar past-day restrictions at property midnight without changing its explicit range", async () => {
  vi.setSystemTime(new Date("2026-11-01T04:59:59.990Z"));
  page.api.catalog.rooms = [{ id: "room-1", number: "101", roomTypeId: "double" }];
  page.api.on("GET", "/calendar", ({ url }) =>
    calendarWindow(url, {
      rooms: [
        {
          id: "room-1",
          number: "101",
          roomTypeId: "double",
          roomTypeName: "Doble",
          stays: [],
          closures: [],
        },
      ],
      unassigned: [],
    }),
  );
  const changes: string[] = [];
  await render(
    React.createElement(calendars.RoomCalendar, {
      start: new Date(2026, 9, 30),
      span: 7,
      onStartChange: (date) => {
        changes.push(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`);
      },
      onSpanChange: () => {},
      onOpenReservation: () => {},
    }),
  );
  const slot = (day: string) => {
    const element = window.document.querySelector<HTMLButtonElement>(
      `button[aria-label="Nueva reserva para habitación 101 el ${day}"]`,
    );
    assert.ok(element, `Missing booking day ${day}`);
    return element;
  };
  await until(
    () => !!container.querySelector('button[aria-label*="habitación 101 el"]'),
    "Calendar loads",
  );
  assert.equal(slot("30 oct 2026").disabled, true);
  assert.equal(slot("31 oct 2026").disabled, false);
  vi.setSystemTime(new Date("2026-11-01T05:00:00Z"));
  await until(
    () => slot("31 oct 2026").disabled,
    "Property midnight disables yesterday without focus or sign-in",
  );
  assert.ok(page.button("30 oct 2026"));
  assert.deepEqual(changes, []);
  await React.act(async () => page.button("Hoy").click());
  assert.deepEqual(changes, ["2026-11-1"]);
});

it("uses the property date for arrival badges and refreshes them on resume", async () => {
  vi.setSystemTime(new Date("2026-11-01T01:00:00Z"));
  const saved = {
    id: "reservation-1",
    status: "confirmed",
    checkIn: "2026-10-31",
    checkOut: "2026-11-02",
    guestName: "Ada Lovelace",
    rooms: [{ id: "line-1", roomTypeId: "double" }],
  };

  const line = saved.rooms[0]!;
  page.api.on("GET", "/calendar", ({ url }) => ({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    missingSetup: null,
    rooms: [
      {
        id: "room-1",
        number: "101",
        roomTypeId: "double",
        roomTypeName: "Doble",
        stays: [],
        closures: [],
      },
    ],
    unassigned: [
      {
        id: line.id,
        reservationId: saved.id,
        guestName: saved.guestName,
        status: saved.status,
        checkIn: saved.checkIn,
        checkOut: saved.checkOut,
        roomId: null,
        roomTypeId: line.roomTypeId,
        roomIndex: 1,
        roomCount: saved.rooms.length,
      },
    ],
  }));
  await render(
    React.createElement(calendars.RoomCalendar, {
      start: new Date(2026, 9, 31),
      span: 7,
      onStartChange: () => {},
      onSpanChange: () => {},
      onOpenReservation: () => {},
    }),
  );
  await until(
    () =>
      !!container.querySelector(
        'button[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]',
      ),
    "Unassigned arrival loads",
  );
  await React.act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]',
      )!
      .click(),
  );
  assert.match(container.textContent, /Llega hoy/);
  vi.setSystemTime(new Date("2026-11-01T05:00:00Z"));
  await React.act(async () => window.document.dispatchEvent(new window.Event("visibilitychange")));
  assert.equal(container.textContent.includes("Llega hoy"), false);
});
