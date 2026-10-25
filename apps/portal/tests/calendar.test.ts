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
let housekeeping: typeof import("../src/components/housekeeping.tsx");
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
  housekeeping = (await browser.server.ssrLoadModule(
    "/src/components/housekeeping.tsx",
  )) as typeof housekeeping;
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
  vi.restoreAllMocks();
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

it.each([
  { span: 7 as const, lastDay: "26 oct 2026", outsideDay: "2 nov 2026", holdEnd: "2026-11-02" },
  { span: 14 as const, lastDay: "2 nov 2026", outsideDay: "9 nov 2026", holdEnd: "2026-11-09" },
])(
  "draws only the $span-day span from one wider read",
  async ({ span, lastDay, outsideDay, holdEnd }) => {
    const initial = page.api.hold("GET", "/calendar");

    await render(renderCalendar(span));
    await page.flush();

    assert.ok(container.querySelector('[aria-label="Cargando calendario"]'));
    assert.equal(container.textContent.includes("101"), false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.path, "/calendar");
    assert.equal(requests[0]!.url.searchParams.get("from"), "2026-10-13");
    assert.equal(requests[0]!.url.searchParams.get("to"), holdEnd);

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
      container.querySelector(`[aria-label="Nueva reserva para habitación 101 el ${lastDay}"]`),
    );
    assert.equal(
      container.querySelector(`[aria-label="Nueva reserva para habitación 101 el ${outsideDay}"]`),
      null,
    );
    assert.equal(container.textContent.includes("Margin Only"), false);
    assert.ok(
      container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
    );
    assert.ok(container.textContent.includes("Mantenimiento"));
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
  },
);

it.each([
  {
    direction: "next",
    action: "Día siguiente",
    checkIn: "2026-10-27",
    checkOut: "2026-10-28",
    day: "21 oct 2026",
  },
  {
    direction: "previous",
    action: "Día anterior",
    checkIn: "2026-10-18",
    checkOut: "2026-10-19",
    day: "19 oct 2026",
  },
])(
  "shows the $direction day from the held window without another read",
  async ({ action, checkIn, checkOut, day }) => {
    page.api.on("GET", "/calendar", ({ url }) =>
      calendarWindow(url, stayIn("room-101", { guestName: "Held Stay", checkIn, checkOut })),
    );
    await render(React.createElement(CalendarSession));
    await until(() => !!adaBar());
    const label = '[aria-label="Editar reserva de Held Stay · Confirmada"]';
    assert.equal(container.querySelector(label), null);
    await click(action);
    await until(() => !!container.querySelector(label));
    assert.equal(requests.length, 1);
    assert.ok(container.textContent.includes(day));
  },
);

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
  assert.equal(requests[0]!.url.searchParams.get("from"), "2026-10-13");
  assert.equal(requests[0]!.url.searchParams.get("to"), "2026-11-02");

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

it.each([
  {
    navigation: "period jump",
    action: "Período siguiente",
    heldSteps: 1,
    day: "3 nov 2026",
    from: "2026-10-27",
    to: "2026-11-16",
  },
  {
    navigation: "eighth day step",
    action: "Día siguiente",
    heldSteps: 7,
    day: "28 oct 2026",
    from: "2026-10-21",
    to: "2026-11-10",
  },
])(
  "shows loading when a $navigation leaves the hold",
  async ({ action, heldSteps, day, from, to }) => {
    await render(React.createElement(CalendarSession));
    await until(() => !!adaBar());
    for (let step = 0; step < heldSteps; step++) await click(action);
    assert.equal(requests.length, 1);
    assert.ok(container.textContent.includes("101"));
    page.api.hold("GET", "/calendar");
    await click(action);
    await page.flush();
    assert.equal(requests.length, 2);
    assert.equal(requests[1]!.url.searchParams.get("from"), from);
    assert.equal(requests[1]!.url.searchParams.get("to"), to);
    assert.ok(container.textContent.includes(day));
    assert.equal(container.textContent.includes("101"), false);
    assert.equal(container.textContent.includes("Mantenimiento"), false);
    assert.equal(adaBar(), null);
    assert.ok(container.querySelector('[aria-label="Cargando calendario"]'));
    expectIdleRefresh(true);
  },
);

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

it.each(["first load", "outside hold"] as const)(
  "fails closed after a failed %s",
  async (state) => {
    if (state === "outside hold") {
      await render(React.createElement(CalendarSession));
      await until(() => !!adaBar());
      await click("Período siguiente");
      assert.equal(requests.length, 1);
    }
    failCalendar(500, "calendar window is incomplete");
    if (state === "first load") await render(React.createElement(CalendarSession));
    else await click("Período siguiente");
    await until(() => container.textContent.includes("La ventana del calendario está incompleta"));
    assert.equal(container.textContent.includes("calendar window is incomplete"), false);
    assert.equal(container.textContent.includes("101"), false);
    assert.equal(adaBar(), null);
    assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
    assert.equal(container.textContent.includes("Aún no hay habitaciones"), false);
    expectIdleRefresh(true);
  },
);

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

function CalendarWithOtherReads() {
  queries.useSession();
  queries.useReservations("2026-10-20", "2026-10-27");
  queries.useInventory("2026-10-20", "2026-10-26");
  return React.createElement(CalendarSession);
}

it.each(["focus", "mobile refresh"] as const)(
  "refreshes held calendar on %s while keeping its bars",
  async (trigger) => {
    if (trigger === "mobile refresh") page.mobile();
    await render(
      React.createElement(trigger === "focus" ? CalendarSession : CalendarWithOtherReads),
    );
    await until(() => !!adaBar());
    const before = requests.length;
    const refresh = page.api.hold("GET", "/calendar");
    if (trigger === "focus") await React.act(async () => returnToTab());
    else await click("Actualizar");
    await page.flush();
    assert.deepEqual(
      requests.slice(before).map((request) => request.path),
      ["/calendar"],
    );
    assert.ok(adaBar());
    assert.ok(
      container.querySelector('[aria-label="Mostrar habitaciones reservadas sin asignar, 1"]'),
    );
    assert.equal(container.querySelector('[aria-label="Cargando calendario"]'), null);
    const night = container.querySelector<HTMLButtonElement>(
      '[aria-label="Nueva reserva para habitación 2 el 22 oct 2026"]',
    );
    assert.equal(night?.disabled, false);
    if (trigger === "mobile refresh") {
      const refreshing = expectManualRefresh();
      await React.act(async () => refreshing.click());
      assert.equal(requests.length, before + 1);
      await openMobileUnassigned(1);
      assert.ok(window.document.body.textContent.includes("Mary Jackson"));
    } else expectIdleRefresh();
    refresh.release(calendarResponse(refresh.request!.url, bookedElsewhere("Katherine Johnson")));
    await until(
      () =>
        !!container.querySelector(
          '[aria-label="Editar reserva de Katherine Johnson · Confirmada"]',
        ),
    );
    assert.equal(requests.length, before + 1);
    assert.ok(container.textContent.includes("20 oct 2026"));
  },
);

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

  await click("Mostrar habitaciones reservadas sin asignar, 1");
  await until(() => container.textContent.includes("Mary Jackson"));
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
  assert.ok(container.textContent.includes("Mary Jackson"));
  assert.equal(container.querySelectorAll('[role="alert"]').length, 0);
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

it.each(["initial read", "background refresh"] as const)(
  "logs an untranslated 404 during a calendar %s without exposing it to staff",
  async (read) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = "calendar source unavailable";
    if (read === "background refresh") {
      await render(React.createElement(CalendarSession));
      await until(() => !!adaBar());
    }
    failCalendar(404, cause);
    if (read === "initial read") await render(React.createElement(CalendarSession));
    else await click("Actualizar");

    const role = read === "initial read" ? "alert" : "status";
    await until(() => !!container.querySelector(`[role="${role}"]`));
    const notice = container.querySelector(`[role="${role}"]`)!;
    assert.ok(
      notice.textContent.includes(
        read === "initial read" ? "No se pudieron cargar los datos" : "No se pudo actualizar.",
      ),
    );
    assert.ok(notice.textContent.includes("Reintentar"));
    assert.equal(container.textContent.includes(cause), false);
    if (read === "background refresh") assert.ok(adaBar());
    assert.equal(
      logged.mock.calls.filter(([error]) => error instanceof Error && error.message === cause)
        .length,
      1,
      "The untranslated cause must be logged once",
    );
  },
);

it("replaces the grid with an error when a new window fails, keeping date navigation", async () => {
  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "Week must paint before moving past the held window");
  failCalendar(500, "calendar window is incomplete");
  await click("Período siguiente");
  await click("Período siguiente");
  await until(
    () => !!container.querySelector('[role="alert"]'),
    "A window outside the held range must show the page error",
  );

  const alert = container.querySelector('[role="alert"]')!;
  assert.ok(alert.textContent.includes("La ventana del calendario está incompleta"));
  assert.ok(alert.textContent.includes("Reintentar"));
  assert.equal(container.textContent.includes("Los datos pueden estar desactualizados"), false);
  assert.equal(container.textContent.includes("Mantenimiento"), false);
  await click("Período anterior");
  await click("Período anterior");
  await until(() => !!adaBar(), "The held week must return from cache");
  assert.equal(container.querySelector('[role="alert"]'), null);
});

it.each(["held grid", "empty unassigned panel"] as const)(
  "retries only calendar from the %s",
  async (origin) => {
    if (origin === "empty unassigned panel") failCalendar(500, "calendar window is incomplete");
    await render(React.createElement(CalendarWithOtherReads));
    if (origin === "held grid") {
      await until(() => !!adaBar());
      failCalendar(500, "calendar window is incomplete");
      await click("Actualizar");
    }
    await until(() => container.textContent.includes("La ventana del calendario está incompleta"));
    if (origin === "empty unassigned panel")
      await click("Mostrar habitaciones reservadas sin asignar, 0");
    const retry =
      origin === "held grid"
        ? [...container.querySelectorAll("button")].find((item) =>
            item.textContent.includes("Reintentar"),
          )
        : window.document.querySelector<HTMLElement>(
            '[aria-label="Habitaciones reservadas sin asignar"] [role="alert"] button',
          );
    assert.ok(retry);
    const before = requests.length;
    await React.act(async () => retry.click());
    await page.flush();
    assert.deepEqual(
      requests.slice(before).map((request) => request.path),
      ["/calendar"],
    );
    if (origin === "held grid") assert.ok(adaBar());
    else assert.equal(container.textContent.includes("101"), false);
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

function withoutClosure(url: URL) {
  return calendarResponse(
    url,
    sampleWeekWith("room-10", (room) => ({ ...room, closures: [] })),
  );
}

function renamedRoom(url: URL) {
  return calendarResponse(
    url,
    sampleWeekWith("room-2", (room) => ({ ...room, number: "8", roomTypeName: "Familiar" })),
  );
}

it.each([
  {
    change: "closure creation",
    configure: () => {
      page.api.on("POST", "/room-closures", () => ({
        id: "closure-saved",
        roomId: "room-2",
        starts: "2026-10-22",
        ends: "2026-10-24",
        reason: "Pintura",
      }));
    },
    open: async () => {
      await openRoomActions("2");
      await chooseMenuItem("Cerrar habitación");
      await until(() => !!window.document.getElementById("closure-start"));
      await pickDate("closure-start", "22/10/2026");
      await pickDate("closure-end", "24/10/2026");
      await page.fill("reason", "Pintura");
      return window.document.querySelector<HTMLButtonElement>(
        "#room-closure-form button[type='submit']",
      );
    },
    next: closureOn("room-2", "Pintura"),
    arrived: () => container.textContent.includes("Pintura"),
  },
  {
    change: "closure deletion",
    configure: () => {
      page.api.on("DELETE", "/room-closures/closure-1", () => ({ ok: true }));
    },
    open: async () => {
      await React.act(async () => page.button("Mantenimiento").click());
      await until(() => window.document.body.textContent.includes("Editar cierre"));
      return page.button("Eliminar");
    },
    next: withoutClosure,
    arrived: () => !container.textContent.includes("Mantenimiento"),
  },
  {
    change: "room renumbering",
    configure: () => {
      page.api.on("PATCH", "/rooms/room-2", () => ({
        id: "room-2",
        number: "8",
        roomTypeId: "double",
      }));
    },
    open: async () => {
      await openRoomActions("2");
      await chooseMenuItem("Editar habitación");
      await until(() => {
        const input = window.document.querySelector<HTMLInputElement>('[name="number"]');
        return !!input && !input.disabled;
      });
      await page.fill("number", "8");
      return window.document.querySelector<HTMLButtonElement>(
        "#room-edit-form button[type='submit']",
      );
    },
    next: renamedRoom,
    arrived: () => !!container.querySelector('[aria-label="Acciones de habitación 8"]'),
  },
])(
  "refreshes held calendar after $change without blanking it",
  async ({ configure, open, next, arrived }) => {
    configure();
    await render(React.createElement(CalendarSession));
    await until(() => !!adaBar());
    const refresh = page.api.hold("GET", "/calendar");
    const save = await open();
    assert.ok(save);
    await until(() => !save.disabled);
    const before = requests.length;
    await React.act(async () => save.click());
    await until(() => requests.slice(before).some((request) => request.path === "/calendar"));
    await expectHeldRefresh({
      refresh,
      before,
      whileHeld: () => !!adaBar() && container.textContent.includes("Mantenimiento") && !arrived(),
      next,
      arrived,
      after: () => {
        assert.ok(adaBar());
        assert.ok(container.textContent.includes("101"));
      },
    });
  },
);

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

const room2Cell = () => container.querySelector('[data-room-id="room-2"]')!.textContent;

it("marks a room from its calendar actions at once, undoes it, and restores a rejected mark", async () => {
  let status: "dirty" | "clean" = "dirty";
  page.api.on("GET", "/calendar", ({ url }) =>
    calendarWindow(
      url,
      sampleWeekWith("room-2", (room) => ({ ...room, housekeepingStatus: status })),
    ),
  );
  const writes: unknown[] = [];
  page.api.on<HousekeepingMarks>("PUT", "/housekeeping", ({ body }) => {
    writes.push(body);
    status = body.marks[0]!.status;
    return {
      rooms: body.marks.map(({ roomId, status }) => ({
        id: roomId,
        housekeepingStatus: status,
        housekeepingChangedAt: "2026-10-20T15:00:00.000Z",
      })),
    };
  });
  const { ToastProvider } = (await browser.server.ssrLoadModule(
    "/src/components/ui/toast.tsx",
  )) as typeof import("../src/components/ui/toast.tsx");
  await render(React.createElement(ToastProvider, null, React.createElement(CalendarSession)));
  await until(() => !!adaBar(), "The calendar must load");
  assert.ok(room2Cell().includes("Sucia"), "A dirty room must show its badge");

  const saving = page.api.hold("PUT", "/housekeeping");
  await openRoomActions("2");
  await chooseMenuItem("Marcar limpia");
  await until(
    () => saving.request !== undefined && !room2Cell().includes("Sucia"),
    "The badge must go before the mark saves",
  );
  assert.deepEqual(saving.request!.body, { marks: [{ roomId: "room-2", status: "clean" }] });
  status = "clean";
  await React.act(async () =>
    saving.release(
      Response.json({
        rooms: [
          {
            id: "room-2",
            housekeepingStatus: "clean",
            housekeepingChangedAt: "2026-10-20T15:00:00.000Z",
          },
        ],
      }),
    ),
  );
  await until(() => window.document.body.textContent.includes("Habitación 2 lista"));

  await click("Deshacer");
  await until(
    () => writes.length === 1 && room2Cell().includes("Sucia"),
    "Undo must mark the room dirty again",
  );
  assert.deepEqual(writes, [{ marks: [{ roomId: "room-2", status: "dirty" }] }]);

  const rejected = page.api.hold("PUT", "/housekeeping");
  await openRoomActions("2");
  await chooseMenuItem("Marcar limpia");
  await until(() => rejected.request !== undefined && !room2Cell().includes("Sucia"));
  await React.act(async () =>
    rejected.release(Response.json({ error: "room not found" }, { status: 404 })),
  );
  await until(() => room2Cell().includes("Sucia"), "A rejected mark must restore the badge");
});

it.each([
  { when: "has begun", checkIn: "2026-10-20", checkOut: "2026-10-22", flagged: true },
  { when: "begins later", checkIn: "2026-10-22", checkOut: "2026-10-24", flagged: false },
])(
  "flags a dirty room in the assignment list only when the stay $when",
  async ({ checkIn, checkOut, flagged }) => {
    const mary = { ...sampleWeek.unassigned[0]!, checkIn, checkOut };
    page.api.on("GET", "/calendar", ({ url }) =>
      calendarWindow(url, {
        ...sampleWeekWith("room-2", (room) => ({ ...room, housekeepingStatus: "dirty" })),
        unassigned: [mary],
      }),
    );
    page.api.on("GET", "/reservations", () => [{ ...maryList, checkIn, checkOut }]);
    page.api.on("GET", "/reservations/res-open", assignmentDetail);
    await render(React.createElement(CalendarSession));
    await until(() => !!adaBar(), "The calendar must load");
    await click("Mostrar habitaciones reservadas sin asignar, 1");
    await until(() => container.textContent.includes("Mary Jackson"), "Mary must be listed");
    const maryButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Mary Jackson"),
    )!;
    await React.act(async () => maryButton.click());
    const label = `Asignar Mary Jackson a habitación 2, ${checkIn} al ${checkOut}${flagged ? ", sucia" : ""}`;
    await until(
      () => !!container.querySelector(`[aria-label="${label}"]`),
      "Room 2 must be offered with its badge only once the stay has begun",
    );
    assert.equal(
      container.querySelector(`[aria-label="${label}"]`)!.textContent.includes("Sucia"),
      flagged,
    );
    assert.ok(room2Cell().includes("Sucia"), "The grid keeps the badge in assignment mode");
  },
);

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
  const pendingSave = mountedWriter(save)();
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
    await React.act(async () => {
      await pendingSave;
    });
    assert.equal(
      requests.slice(before).some((request) => request.path === "/calendar"),
      false,
      "This save must not reload the calendar",
    );
    assert.ok(adaBar(), "The grid must stay up");
    options.after?.();
  }
}

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

it.each([
  {
    name: "updates the calendar after a reservation save without blanking the grid",
    options: (): Parameters<typeof expectOffCalendarWriter>[0] => ({
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
        !!container.querySelector(
          '[aria-label="Editar reserva de Rosalind Franklin · Confirmada"]',
        ),
      after: () => {
        assert.ok(adaBar());
        assert.ok(
          container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'),
        );
        assert.ok(container.textContent.includes("101"));
        assert.ok(container.textContent.includes("Mantenimiento"));
      },
    }),
  },
  {
    name: "updates the name on the stay after a booking-contact rename without blanking the calendar",
    options: (): Parameters<typeof expectOffCalendarWriter>[0] => ({
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
    }),
  },
  {
    name: "clears missing setup and shows the new room after property setup without a flash",
    options: (): Parameters<typeof expectOffCalendarWriter>[0] => ({
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
    }),
  },
  {
    name: "does not reload the calendar when a rate changes",
    options: (): Parameters<typeof expectOffCalendarWriter>[0] => ({
      dropsHold: false,
      after: () => {
        assert.ok(
          requests.filter((request) => request.path === "/inventory").length >= 2,
          "Rate save must refresh inventory",
        );
      },
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
    }),
  },
  {
    name: "drops the held calendar after a guest edit without blanking the grid",
    options: (): Parameters<typeof expectOffCalendarWriter>[0] => ({
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
    }),
  },
])("$name", async ({ options }) => {
  await expectOffCalendarWriter(options());
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

type HousekeepingMarks = { marks: { roomId: string; status: "dirty" | "clean" }[] };

function limpiezaRoom(id: string, number: string, housekeepingStatus: "dirty" | "clean") {
  return {
    id,
    number,
    roomTypeId: "double",
    roomTypeName: "Doble",
    housekeepingStatus,
    housekeepingChangedAt: null as string | null,
    closed: false,
    inHouse: false,
    departing: false,
    arriving: false,
  };
}

/**
 * The Limpieza page on a view, switching tabs like its route and showing toasts. It
 * opens on a phone unless asked for the front desk's desktop table.
 */
async function renderLimpieza(initial: "to-clean" | "all", { desktop = false } = {}) {
  if (!desktop) page.mobile();
  const { ToastProvider } = (await browser.server.ssrLoadModule(
    "/src/components/ui/toast.tsx",
  )) as typeof import("../src/components/ui/toast.tsx");
  function Limpieza() {
    const [view, setView] = React.useState(initial);
    return React.createElement(housekeeping.Housekeeping, { view, onViewChange: setView });
  }
  await render(React.createElement(ToastProvider, null, React.createElement(Limpieza)));
}

const limpiezaRows = () =>
  Array.from(container.querySelectorAll("li")).map(
    (row) =>
      `${row.textContent.slice(0, 3)}:${
        row.querySelector('[aria-pressed="true"]')?.textContent === "Sucia" ? "dirty" : "clean"
      }`,
  );

it("keeps Todas in room order after a mark and restores a status the server rejects", async () => {
  const statuses: Record<string, "dirty" | "clean"> = { "101": "clean", "102": "dirty" };
  let arriving = false;
  // Like the backend: by room number.
  page.api.on("GET", "/housekeeping", () => ({
    date: "2026-10-20",
    rooms: Object.entries(statuses).map(([number, status]) => ({
      ...limpiezaRoom(`room-${number}`, number, status),
      arriving: number === "102" && arriving,
    })),
  }));
  const writes: unknown[] = [];
  page.api.on<HousekeepingMarks>("PUT", "/housekeeping", ({ body }) => {
    writes.push(body);
    for (const { roomId, status } of body.marks) statuses[roomId.replace("room-", "")] = status;
    // The front desk assigns an arrival meanwhile; only a re-read can show it.
    arriving = true;
    return {
      rooms: body.marks.map(({ roomId, status }) => ({
        id: roomId,
        housekeepingStatus: status,
        housekeepingChangedAt: "2026-10-20T15:00:00.000Z",
      })),
    };
  });
  await renderLimpieza("all");
  await until(() => limpiezaRows().length === 2, "The list must load");
  assert.deepEqual(limpiezaRows(), ["101:clean", "102:dirty"]);

  // Tapping the pressed side saves nothing; only 102's mark below may write.
  await click("Marcar habitación 101 como limpia");
  await click("Marcar habitación 102 como limpia");
  await until(
    () => container.textContent.includes("Llega hoy"),
    "A saved mark must re-read the list",
  );
  assert.deepEqual(writes, [{ marks: [{ roomId: "room-102", status: "clean" }] }]);
  assert.deepEqual(limpiezaRows(), ["101:clean", "102:clean"]);
  assert.equal(window.document.body.textContent.includes("Habitación 101"), false);

  const rejected = page.api.hold("PUT", "/housekeeping");
  await click("Marcar habitación 102 como sucia");
  await until(() => rejected.request !== undefined && limpiezaRows()[1] === "102:dirty");
  await React.act(async () =>
    rejected.release(Response.json({ error: "room not found" }, { status: 404 })),
  );
  await until(() => limpiezaRows()[1] === "102:clean", "A rejected mark must restore the status");
});

it("re-reads Limpieza at property midnight so yesterday's arrivals stop showing", async () => {
  vi.setSystemTime(new Date("2026-10-21T04:59:59.990Z"));
  page.api.on("GET", "/housekeeping", () => {
    const tomorrow = Date.now() >= Date.parse("2026-10-21T05:00:00Z");
    return {
      date: tomorrow ? "2026-10-21" : "2026-10-20",
      rooms: [{ ...limpiezaRoom("room-101", "101", "dirty"), arriving: !tomorrow }],
    };
  });
  await renderLimpieza("to-clean");
  await until(() => container.textContent.includes("Llega hoy"), "The list must load");

  vi.setSystemTime(new Date("2026-10-21T05:00:00Z"));
  await until(
    () => !container.textContent.includes("Llega hoy"),
    "Property midnight must re-read the list without focus",
  );
});

/** Por limpiar over a hotel with each of today's cases, recording every mark. */
async function renderPorLimpiar({ desktop = false } = {}) {
  const rooms = [
    { ...limpiezaRoom("room-101", "101", "dirty"), departing: true },
    limpiezaRoom("room-102", "102", "dirty"),
    { ...limpiezaRoom("room-103", "103", "dirty"), inHouse: true },
    { ...limpiezaRoom("room-104", "104", "dirty"), closed: true },
    // A same-day turnover whose guest has not checked out yet.
    { ...limpiezaRoom("room-105", "105", "dirty"), departing: true, arriving: true },
    { ...limpiezaRoom("room-106", "106", "dirty"), closed: true, arriving: true },
    limpiezaRoom("room-107", "107", "clean"),
  ];
  page.api.on("GET", "/housekeeping", () => ({ date: "2026-10-20", rooms }));
  const writes: unknown[] = [];
  page.api.on<HousekeepingMarks>("PUT", "/housekeeping", ({ body }) => {
    const marked = body.marks.map(({ roomId, status }) => {
      writes.push([roomId, status]);
      const room = rooms.find((room) => room.id === roomId)!;
      room.housekeepingStatus = status;
      return {
        id: roomId,
        housekeepingStatus: status,
        housekeepingChangedAt: "2026-10-20T15:00:00.000Z",
      };
    });
    return { rooms: marked };
  });
  await renderLimpieza("to-clean", { desktop });
  await until(
    () => !container.querySelector('[aria-label="Cargando habitaciones"]'),
    "Por limpiar must load",
  );
  return { writes };
}

const porLimpiarCards = () =>
  Array.from(container.querySelectorAll("li")).map((card) => card.textContent.trim());

it("lists today's work in Por limpiar, arrivals first and free rooms before departures", async () => {
  await renderPorLimpiar();

  // A room in use tonight is left out, and so is one closed tonight unless a guest
  // arrives today.
  assert.deepEqual(porLimpiarCards(), [
    "106DobleLlega hoyLibreCerradaLista",
    "105DobleLlega hoySale hoyLista",
    "102DobleLibreLista",
    "101DobleSale hoyLista",
  ]);
  assert.equal(page.button("Por limpiar4").getAttribute("aria-selected"), "true");
});

it("takes a room marked Lista off Por limpiar and puts it back from the toast", async () => {
  const { writes } = await renderPorLimpiar();

  await click("Marcar habitación 102 como limpia");
  await until(
    () => writes.length === 1 && !porLimpiarCards().some((card) => card.startsWith("102")),
    "A room marked clean must leave Por limpiar",
  );
  await until(() => window.document.body.textContent.includes("Habitación 102 lista"));

  await click("Deshacer");
  await until(
    () => writes.length === 2 && porLimpiarCards().some((card) => card.startsWith("102")),
    "Undo must set the previous status again",
  );
  assert.deepEqual(writes, [
    ["room-102", "clean"],
    ["room-102", "dirty"],
  ]);
});

it("shows Todo limpio when Por limpiar empties while Todas still lists every room", async () => {
  await renderPorLimpiar();

  for (const number of ["101", "102", "105", "106"]) {
    await click(`Marcar habitación ${number} como limpia`);
  }
  await until(() => container.textContent.includes("Todo limpio"), "An empty Por limpiar is done");

  await click("Todas");
  await until(() => limpiezaRows().length === 7, "Todas must list every room");
  assert.match(container.textContent, /Cerrada/);
});

/** The desktop table's body rows as their cells' text, leaving out the selection checkbox. */
const limpiezaTableRows = () =>
  Array.from(container.querySelectorAll("tbody tr")).map((row) =>
    Array.from(row.querySelectorAll("td"))
      .filter((cell) => !cell.querySelector('[role="checkbox"]'))
      .map((cell) => cell.textContent.trim()),
  );

it("shows the front desk a Todas table with when each room was last marked", async () => {
  // Now is 10:00 in Lima.
  const rooms = [
    { ...limpiezaRoom("room-101", "101", "dirty"), inHouse: true },
    // 09:42 in Lima today.
    { ...limpiezaRoom("room-102", "102", "clean"), housekeepingChangedAt: "2026-10-20T14:42:00Z" },
    // Still the 19th in Lima, though the 20th in UTC.
    { ...limpiezaRoom("room-103", "103", "dirty"), housekeepingChangedAt: "2026-10-20T04:30:00Z" },
    // Some ICU versions shorten September to "sept" or "set".
    { ...limpiezaRoom("room-104", "104", "clean"), housekeepingChangedAt: "2026-09-05T15:00:00Z" },
  ];
  page.api.on("GET", "/housekeeping", () => ({ date: "2026-10-20", rooms }));
  const writes: unknown[] = [];
  page.api.on<HousekeepingMarks>("PUT", "/housekeeping", ({ body }) => ({
    rooms: body.marks.map(({ roomId, status }) => {
      writes.push([roomId, status]);
      const room = rooms.find((room) => room.id === roomId)!;
      room.housekeepingStatus = status;
      room.housekeepingChangedAt = "2026-10-20T15:00:00.000Z";
      return room;
    }),
  }));
  await renderLimpieza("all", { desktop: true });
  await until(() => limpiezaTableRows().length === 4, "Todas must load as a table");

  assert.equal(container.querySelector("ul"), null);
  assert.deepEqual(
    Array.from(container.querySelectorAll("thead th")).map((cell) => cell.textContent.trim()),
    ["", "Habitación", "Tipo", "Hoy", "Marcada", "Estado"],
  );
  assert.deepEqual(limpiezaTableRows(), [
    ["101", "Doble", "En casa", "—", "SuciaLimpia"],
    ["102", "Doble", "Libre", "09:42", "SuciaLimpia"],
    ["103", "Doble", "Libre", "19 oct", "SuciaLimpia"],
    ["104", "Doble", "Libre", "5 sep", "SuciaLimpia"],
  ]);

  const saving = page.api.hold("PUT", "/housekeeping");
  await click("Marcar habitación 103 como limpia");
  await until(() => saving.request !== undefined, "The mark must be sent");
  assert.equal(page.button("Marcar habitación 103 como sucia").disabled, true);
  assert.equal(page.button("Marcar habitación 102 como sucia").disabled, false);
  rooms[2].housekeepingStatus = "clean";
  rooms[2].housekeepingChangedAt = "2026-10-20T15:00:00.000Z";
  await React.act(async () => saving.release(Response.json({ rooms: [rooms[2]] })));
  await until(
    () => limpiezaTableRows()[2]?.[3] === "10:00",
    "A saved mark must re-read when the room was marked",
  );

  await until(() => window.document.body.textContent.includes("Habitación 103 lista"));
  await click("Deshacer");
  await until(
    () =>
      writes.length === 1 &&
      page.button("Marcar habitación 103 como sucia").getAttribute("aria-pressed") === "true",
    "Undo must set the previous status again",
  );
  assert.deepEqual(writes, [["room-103", "dirty"]]);
});

it("keeps Por limpiar's order and Lista in the desktop table, and phone cards below 768px", async () => {
  const { writes } = await renderPorLimpiar({ desktop: true });

  assert.deepEqual(
    limpiezaTableRows().map(([number, , today, marked, action]) => [number, today, marked, action]),
    [
      ["106", "Llega hoyLibreCerrada", "—", "Lista"],
      ["105", "Llega hoySale hoy", "—", "Lista"],
      ["102", "Libre", "—", "Lista"],
      ["101", "Sale hoy", "—", "Lista"],
    ],
  );
  assert.equal(page.button("Por limpiar4").getAttribute("aria-selected"), "true");

  await click("Marcar habitación 102 como limpia");
  await until(
    () => writes.length === 1 && limpiezaTableRows().length === 3,
    "A room marked Lista must leave the table",
  );
  assert.ok(page.button("Por limpiar3"));

  await React.act(async () => page.mobile());
  await until(() => container.querySelector("table") === null, "A phone must not get the table");
  assert.equal(container.querySelector('[role="checkbox"]'), null, "A phone has no selection");
  assert.deepEqual(porLimpiarCards(), [
    "106DobleLlega hoyLibreCerradaLista",
    "105DobleLlega hoySale hoyLista",
    "101DobleSale hoyLista",
  ]);
  await React.act(async () => window.happyDOM.setWindowSize({ width: 768, height: 844 }));
  await until(() => limpiezaTableRows().length === 3, "768px and wider is the desktop table");

  for (const number of ["101", "105", "106"]) {
    await click(`Marcar habitación ${number} como limpia`);
  }
  await until(() => container.textContent.includes("Todo limpio"), "An empty Por limpiar is done");
});

/** A desktop Limpieza row's checkbox, or the header's with `"todas"`. */
function selectBox(number: string) {
  const label = number === "todas" ? "Seleccionar todas" : `Seleccionar habitación ${number}`;
  const box = container.querySelector<HTMLElement>(`[role="checkbox"][aria-label="${label}"]`);
  assert.ok(box, `Missing checkbox ${label}`);
  return box;
}

async function select(number: string, { shift = false } = {}) {
  await React.act(async () =>
    selectBox(number).dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: shift }),
    ),
  );
}

/** The rooms whose row checkbox is checked, in the order on screen. */
const selectedRooms = () =>
  Array.from(container.querySelectorAll('tbody [role="checkbox"][aria-checked="true"]')).map(
    (box) => box.getAttribute("aria-label")!.replace("Seleccionar habitación ", ""),
  );

/** The selection bar's text, or null while nothing is selected. */
const selectionBar = () =>
  container.querySelector('[role="group"][aria-label="Selección"]')?.textContent ?? null;

/** Bulk marks the selection from Todas' Marcar como menu. */
async function markSelectedAs(label: "Limpias" | "Sucias") {
  const trigger = page.button("Marcar como");
  await React.act(async () => {
    trigger.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
    trigger.click();
  });
  await until(
    () => window.document.querySelector('[role="menuitem"]') !== null,
    "Marcar como must open",
  );
  await chooseMenuItem(label);
}

/** Todas over five rooms with mixed statuses, recording each request's marks. */
async function renderTodasTable() {
  const rooms = ["101", "102", "103", "104", "105"].map((number) =>
    limpiezaRoom(`room-${number}`, number, number === "102" ? "clean" : "dirty"),
  );
  page.api.on("GET", "/housekeeping", () => ({ date: "2026-10-20", rooms }));
  const writes: string[][] = [];
  page.api.on<HousekeepingMarks>("PUT", "/housekeeping", ({ body }) => {
    writes.push(body.marks.map(({ roomId, status }) => `${roomId.replace("room-", "")}:${status}`));
    return {
      rooms: body.marks.map(({ roomId, status }) => {
        const room = rooms.find((room) => room.id === roomId)!;
        room.housekeepingStatus = status;
        room.housekeepingChangedAt = "2026-10-20T15:00:00.000Z";
        return room;
      }),
    };
  });
  await renderLimpieza("all", { desktop: true });
  await until(() => limpiezaTableRows().length === 5, "Todas must load as a table");
  return { rooms, writes };
}

it("bulk marks a shift-clicked range of Todas in one request and undoes each room's own status", async () => {
  const { writes } = await renderTodasTable();
  assert.equal(selectionBar(), null);

  await select("101");
  await select("104", { shift: true });
  assert.deepEqual(selectedRooms(), ["101", "102", "103", "104"]);
  assert.equal(selectionBar(), "4 seleccionadasMarcar como");

  // 102 is already clean; it is marked again, so its Marcada time updates.
  await markSelectedAs("Limpias");
  await until(() => window.document.body.textContent.includes("4 habitaciones listas"));
  assert.deepEqual(writes, [["101:clean", "102:clean", "103:clean", "104:clean"]]);
  assert.equal(selectionBar(), null);
  assert.deepEqual(selectedRooms(), []);
  await until(() => limpiezaTableRows()[1]?.[3] === "10:00", "The re-read shows the new mark");

  await click("Deshacer");
  await until(() => writes.length === 2, "Undo must send one request");
  assert.deepEqual(writes[1], ["101:dirty", "102:clean", "103:dirty", "104:dirty"]);
  await until(
    () =>
      page.button("Marcar habitación 103 como sucia").getAttribute("aria-pressed") === "true" &&
      page.button("Marcar habitación 102 como limpia").getAttribute("aria-pressed") === "true",
    "Undo must restore each room's own status",
  );
});

it("bulk marks the selected Todas rooms dirty in one request, holding the selection while it saves", async () => {
  const { rooms, writes } = await renderTodasTable();

  await select("101");
  await select("102");
  const saving = page.api.hold("PUT", "/housekeeping");
  await markSelectedAs("Sucias");
  await until(() => saving.request !== undefined, "The bulk mark must be sent");
  assert.deepEqual(saving.request!.body, {
    marks: [
      { roomId: "room-101", status: "dirty" },
      { roomId: "room-102", status: "dirty" },
    ],
  });
  for (const number of ["todas", "101", "103"]) {
    assert.equal(selectBox(number).getAttribute("aria-disabled"), "true");
  }
  for (const number of ["101", "102", "103"]) {
    assert.equal(page.button(`Marcar habitación ${number} como limpia`).disabled, true);
    assert.equal(page.button(`Marcar habitación ${number} como sucia`).disabled, true);
  }
  await select("103");
  await select("todas");
  assert.deepEqual(selectedRooms(), ["101", "102"]);

  const marked = rooms.slice(0, 2);
  for (const room of marked) {
    room.housekeepingStatus = "dirty";
    room.housekeepingChangedAt = "2026-10-20T15:00:00.000Z";
  }
  await React.act(async () => saving.release(Response.json({ rooms: marked })));
  await until(() => window.document.body.textContent.includes("2 habitaciones marcadas sucias"));
  assert.equal(selectionBar(), null);
  assert.equal(page.button("Marcar habitación 102 como limpia").disabled, false);
  await until(
    () => page.button("Marcar habitación 102 como sucia").getAttribute("aria-pressed") === "true",
    "The marked rooms must show Sucia",
  );

  await click("Deshacer");
  await until(() => writes.length === 1, "Undo must send one request");
  assert.deepEqual(writes, [["101:dirty", "102:clean"]]);
  await until(
    () => page.button("Marcar habitación 102 como limpia").getAttribute("aria-pressed") === "true",
    "Undo must restore 102's own status",
  );
});

it("blocks overlapping row marks during a bulk save and enables them again after failure", async () => {
  const { writes } = await renderTodasTable();
  await select("101");
  await select("102");
  const rejected = page.api.hold("PUT", "/housekeeping");
  await markSelectedAs("Limpias");
  await until(() => rejected.request !== undefined, "The bulk mark must be sent");

  // 102 was already clean. A row mark here could succeed, then be overwritten in
  // the cache by the failed bulk request's rollback to that original clean status.
  assert.equal(page.button("Marcar habitación 102 como sucia").disabled, true);
  await click("Marcar habitación 102 como sucia");
  assert.deepEqual(writes, [], "The disabled row action must not send another mark");

  await React.act(async () =>
    rejected.release(Response.json({ error: "room not found" }, { status: 404 })),
  );
  await until(
    () => !page.button("Marcar habitación 102 como sucia").disabled,
    "A rejected bulk mark must enable the row actions again",
  );
  assert.deepEqual(selectedRooms(), ["101", "102"]);
  assert.equal(
    page.button("Marcar habitación 101 como sucia").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    page.button("Marcar habitación 102 como limpia").getAttribute("aria-pressed"),
    "true",
  );

  await click("Marcar habitación 102 como sucia");
  await until(() => writes.length === 1, "The row action must work after the failed bulk mark");
  assert.deepEqual(writes, [["102:dirty"]]);
});

it("selects Por limpiar ranges in cleaning order and keeps the selection when a bulk mark fails", async () => {
  const { writes } = await renderPorLimpiar({ desktop: true });

  // On screen: 106, 105, 102, 101.
  await select("106");
  await select("102", { shift: true });
  assert.deepEqual(selectedRooms(), ["106", "105", "102"]);
  assert.equal(selectionBar(), "3 seleccionadasMarcar limpias");

  // The header checkbox clears a partial selection, then selects every row.
  await select("todas");
  assert.deepEqual(selectedRooms(), []);
  assert.equal(selectionBar(), null);
  await select("todas");
  assert.deepEqual(selectedRooms(), ["106", "105", "102", "101"]);
  assert.equal(selectBox("todas").getAttribute("aria-checked"), "true");

  const rejected = page.api.hold("PUT", "/housekeeping");
  await click("Marcar limpias");
  await until(() => rejected.request !== undefined, "The bulk mark must be sent");
  await React.act(async () =>
    rejected.release(Response.json({ error: "room not found" }, { status: 404 })),
  );
  await until(
    () => window.document.body.textContent.includes("No se pudo guardar la limpieza"),
    "A failed bulk mark must show an error toast",
  );
  await until(() => limpiezaTableRows().length === 4, "A failed bulk mark changes nothing");
  assert.deepEqual(writes, []);
  assert.deepEqual(selectedRooms(), ["106", "105", "102", "101"]);
  assert.equal(selectionBar(), "4 seleccionadasMarcar limpias");

  await click("Marcar limpias");
  await until(() => container.textContent.includes("Todo limpio"), "The retry marks every room");
  assert.deepEqual(writes, [
    ["room-106", "clean"],
    ["room-105", "clean"],
    ["room-102", "clean"],
    ["room-101", "clean"],
  ]);
  await until(() => window.document.body.textContent.includes("4 habitaciones listas"));
});

it("drops rooms a re-read takes off the tab from the selection, and clears it on a tab switch", async () => {
  const rooms = ["101", "102", "103"].map((number) =>
    limpiezaRoom(`room-${number}`, number, "dirty"),
  );
  page.api.on("GET", "/housekeeping", () => ({ date: "2026-10-20", rooms }));
  await renderLimpieza("to-clean", { desktop: true });
  await until(() => limpiezaTableRows().length === 3, "Por limpiar must load");

  await select("todas");
  assert.equal(selectionBar(), "3 seleccionadasMarcar limpias");

  // Another device marks 102 clean; the next read takes it off Por limpiar.
  rooms[1]!.housekeepingStatus = "clean";
  await React.act(() => page.client.invalidateQueries({ queryKey: queries.housekeepingQueryKey }));
  await until(() => limpiezaTableRows().length === 2, "The re-read must drop 102");
  assert.deepEqual(selectedRooms(), ["101", "103"]);
  assert.equal(selectionBar(), "2 seleccionadasMarcar limpias");

  await click("Todas");
  await until(() => limpiezaTableRows().length === 3, "Todas must list every room");
  assert.deepEqual(selectedRooms(), []);
  assert.equal(selectionBar(), null);
});
