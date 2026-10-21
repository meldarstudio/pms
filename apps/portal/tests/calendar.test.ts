import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLButtonElement, HTMLElement, HTMLInputElement } from "happy-dom";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let window: BrowserTest["window"];
let React: BrowserTest["React"];
let calendars: typeof import("../src/components/room-calendar.tsx");
let queries: typeof import("../src/lib/queries.ts");
let container: BrowserPage["container"];
let render: BrowserPage["render"];
let until: BrowserPage["until"];

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
        },
        {
          id: "line-long",
          reservationId: "res-long",
          guestName: "Grace Hopper",
          status: "checked_out",
          checkIn: "2026-10-21",
          checkOut: "2026-11-04",
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

async function click(label: string) {
  const element = container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  assert.ok(element, `Missing ${label}`);
  await React.act(async () => element.click());
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

it("opens a week of 20 Oct from one wider read and draws only 20–26 Oct", async () => {
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
  assert.equal(buttonByText("Nueva reserva").disabled, false);
  for (const label of ["Día anterior", "Día siguiente", "Período anterior", "Período siguiente"]) {
    assert.equal(
      container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.disabled,
      false,
    );
  }
  assert.equal(buttonByText("Hoy").disabled, false);
  assert.equal(buttonByText("20 oct 2026").disabled, false);
  assert.equal(container.querySelector('[role="combobox"]')?.getAttribute("aria-disabled"), null);
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar"]'));
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.pathname, "/calendar");
  assert.equal(requests[0]!.searchParams.get("from"), "2026-10-13");
  assert.equal(requests[0]!.searchParams.get("to"), "2026-11-02");

  release(
    Response.json({
      ...windowPayload,
      from: "2026-10-13",
      to: "2026-11-02",
      unassigned: [
        ...windowPayload.unassigned,
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
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
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

it("opens a 14-day calendar from one wider read and draws only that span", async () => {
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
  assert.equal(requests[0]!.searchParams.get("from"), "2026-10-13");
  assert.equal(requests[0]!.searchParams.get("to"), "2026-11-09");
  assert.equal(
    container.querySelector('[aria-label="Nueva reserva para habitación 101 el 13 oct 2026"]'),
    null,
  );
});

it("shows the next day without another read", async () => {
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    return Response.json({
      ...windowPayload,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      rooms: windowPayload.rooms.map((room) =>
        room.id === "room-101"
          ? {
              ...room,
              stays: [
                ...room.stays,
                {
                  id: "line-next",
                  reservationId: "res-next",
                  guestName: "Next Day",
                  status: "confirmed",
                  checkIn: "2026-10-27",
                  checkOut: "2026-10-28",
                },
              ],
            }
          : room,
      ),
    });
  };

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
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    return Response.json({
      ...windowPayload,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      rooms: windowPayload.rooms.map((room) =>
        room.id === "room-101"
          ? {
              ...room,
              stays: [
                ...room.stays,
                {
                  id: "line-prev",
                  reservationId: "res-prev",
                  guestName: "Previous Day",
                  status: "checked_out",
                  checkIn: "2026-10-18",
                  checkOut: "2026-10-19",
                },
              ],
            }
          : room,
      ),
    });
  };

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
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    return Response.json({
      ...windowPayload,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      rooms: windowPayload.rooms.map((room) =>
        room.id === "room-101"
          ? {
              ...room,
              stays: [
                ...room.stays,
                {
                  id: "line-fortnight",
                  reservationId: "res-fortnight",
                  guestName: "Fortnight",
                  status: "confirmed",
                  checkIn: "2026-11-01",
                  checkOut: "2026-11-02",
                },
              ],
            }
          : room,
      ),
    });
  };

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
  const requests: URL[] = [];
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.length > 1) return new Promise<Response>(() => {});
    return Promise.resolve(
      Response.json({
        ...windowPayload,
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      }),
    );
  };

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

  await click("Período siguiente");
  await page.flush();

  assert.equal(requests.length, 2);
  assert.equal(requests[1]!.searchParams.get("from"), "2026-10-27");
  assert.equal(requests[1]!.searchParams.get("to"), "2026-11-16");
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
  const requests: URL[] = [];
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.length > 1) return new Promise<Response>(() => {});
    return Promise.resolve(
      Response.json({
        ...windowPayload,
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        rooms: windowPayload.rooms.map((room) =>
          room.id === "room-101"
            ? {
                ...room,
                stays: [
                  ...room.stays,
                  {
                    id: "line-edge",
                    reservationId: "res-edge",
                    guestName: "Edge Night",
                    status: "confirmed",
                    checkIn: "2026-10-28",
                    checkOut: "2026-10-29",
                  },
                ],
              }
            : room,
        ),
      }),
    );
  };

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
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    return Response.json({
      ...windowPayload,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      rooms: windowPayload.rooms.map((room) =>
        room.id === "room-101"
          ? {
              ...room,
              stays: [
                ...room.stays,
                {
                  id: "line-edge-out",
                  reservationId: "res-edge-out",
                  guestName: "Hold Edge",
                  status: "checked_out",
                  checkIn: "2026-10-12",
                  checkOut: "2026-10-13",
                },
              ],
            }
          : room,
      ),
    });
  };

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
  assert.equal(container.querySelector('[aria-label="Cargando calendario"]'), null);
  expectIdleRefresh(true);
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

function calendarResponse(url: URL, guestName?: string) {
  return Response.json({
    ...windowPayload,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    rooms: guestName
      ? windowPayload.rooms.map((room) =>
          room.id === "room-101"
            ? {
                ...room,
                stays: [
                  ...room.stays,
                  {
                    id: "line-elsewhere",
                    reservationId: "res-elsewhere",
                    guestName,
                    status: "confirmed",
                    checkIn: "2026-10-22",
                    checkOut: "2026-10-24",
                  },
                ],
              }
            : room,
        )
      : windowPayload.rooms,
  });
}

function returnToTab() {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  window.dispatchEvent(new window.Event("visibilitychange"));
}

it("refreshes the calendar when staff return to the tab and keeps the current bars until that window arrives", async () => {
  const requests: URL[] = [];
  let releaseReturn: (response: Response) => void = () => {};
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.length === 1) return Promise.resolve(calendarResponse(url));
    return new Promise((resolve) => {
      releaseReturn = resolve;
    });
  };

  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before leaving the tab",
  );
  assert.equal(requests.length, 1);
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));

  await React.act(async () => returnToTab());
  await page.flush();

  assert.equal(requests.length, 2);
  assert.equal(requests[1]!.pathname, "/calendar");
  assert.equal(requests[1]!.searchParams.get("from"), "2026-10-13");
  assert.equal(requests[1]!.searchParams.get("to"), "2026-11-02");
  assert.ok(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Current bars stay up while the focus refresh is in flight",
  );
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
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

  releaseReturn(calendarResponse(requests[1]!, "Katherine Johnson"));
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

it("reloads only the calendar from the refresh button and keeps the current bars up", async () => {
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (
      url.pathname === "/calendar" &&
      requests.filter((item) => item.pathname === "/calendar").length > 1
    ) {
      return new Promise((resolve) => {
        releaseRefresh = resolve;
      });
    }
    if (url.pathname === "/calendar") return Promise.resolve(calendarResponse(url));
    if (url.pathname === "/session") {
      return Promise.resolve(
        Response.json({ username: "hotelmanantial", propertyTimeZone: "America/Lima" }),
      );
    }
    if (url.pathname === "/reservations") return Promise.resolve(Response.json([]));
    if (url.pathname === "/inventory") return Promise.resolve(Response.json({ roomTypes: [] }));
    throw new Error(`Unexpected request ${url.pathname}`);
  };

  await render(React.createElement(CalendarWithOtherReads));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before refreshing",
  );
  const beforeRefresh = requests.length;
  assert.ok(requests.some((url) => url.pathname === "/session"));
  assert.ok(requests.some((url) => url.pathname === "/reservations"));
  assert.ok(requests.some((url) => url.pathname === "/inventory"));

  await click("Actualizar");
  await page.flush();

  const refreshed = requests.slice(beforeRefresh);
  assert.deepEqual(
    refreshed.map((url) => url.pathname),
    ["/calendar"],
  );
  assert.ok(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Current bars stay up while the calendar reloads",
  );
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
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
  assert.equal(buttonByText("Mantenimiento").disabled, false);
  await React.act(async () => refreshing.click());
  assert.equal(requests.length, beforeRefresh + 1, "A pending refresh must not stack another read");
  await click("Mostrar reservas sin asignar, 1");
  assert.ok(
    container.textContent.includes("Mary Jackson"),
    "Unassigned reserved rooms stay available",
  );

  releaseRefresh(calendarResponse(refreshed[0]!));
  await until(
    () => !!container.querySelector('[aria-label="Actualizar"]'),
    "Refresh must finish even when the calendar has not changed",
  );
  expectIdleRefresh();
  assert.ok(adaBar());
  assert.equal(requests.length, beforeRefresh + 1);
});

it("ignores a refresh that finishes after staff have left that day", async () => {
  const requests: URL[] = [];
  const pending: Array<(response: Response) => void> = [];
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.length === 1) return Promise.resolve(calendarResponse(url));
    return new Promise((resolve) => {
      pending.push(resolve);
    });
  };

  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before refreshing",
  );

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

  await click("Período siguiente");
  await page.flush();
  assert.equal(requests.length, 3);
  assert.equal(requests[2]!.searchParams.get("from"), "2026-10-21");
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

  pending[0]!(calendarResponse(requests[1]!, "Katherine Johnson"));
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
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.length === 1) return calendarResponse(url);
    return Response.json({ error: "calendar window is incomplete" }, { status: 500 });
  };

  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before a failed refresh",
  );
  assert.ok(container.textContent.includes("Mantenimiento"));

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
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
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
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.length === 1) return calendarResponse(url);
    return Response.json({ error: "calendar range is too wide" }, { status: 400 });
  };

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
  assert.equal(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'), null);
  assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
  assert.equal(container.textContent.includes("Aún no hay habitaciones"), false);
  assert.equal(requests.length, 2);
  assert.equal(container.querySelector('[aria-label="Cargando calendario"]'), null);
  assert.equal(container.querySelector('[aria-label="Actualizando…"]'), null);
  expectIdleRefresh(true);
});

it("keeps an open unassigned list when a refresh fails, with the same banner as the grid", async () => {
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.length === 1) return calendarResponse(url);
    return Response.json({ error: "calendar window is incomplete" }, { status: 500 });
  };

  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'),
    "Unassigned count must paint with the week",
  );
  await click("Mostrar reservas sin asignar, 1");
  await until(
    () => container.textContent.includes("Mary Jackson"),
    "Unassigned stay must be listed",
  );

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
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    const calendarReads = requests.filter((item) => item.pathname === "/calendar").length;
    if (url.pathname === "/calendar" && calendarReads === 1) return calendarResponse(url);
    if (url.pathname === "/calendar") {
      return Response.json({ error: "calendar window is incomplete" }, { status: 500 });
    }
    if (url.pathname === "/session") {
      return Response.json({ username: "hotelmanantial", propertyTimeZone: "America/Lima" });
    }
    if (url.pathname === "/reservations") return Response.json([]);
    if (url.pathname === "/inventory") return Response.json({ roomTypes: [] });
    throw new Error(`Unexpected request ${url.pathname}`);
  };

  await render(React.createElement(CalendarWithOtherReads));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before a failed refresh",
  );
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
    requests.slice(beforeRetry).map((url) => url.pathname),
    ["/calendar"],
  );
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
});

it("retries a failed first load from the unassigned list without reloading unrelated reads", async () => {
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/calendar") {
      return Response.json({ error: "calendar window is incomplete" }, { status: 500 });
    }
    if (url.pathname === "/session") {
      return Response.json({ username: "hotelmanantial", propertyTimeZone: "America/Lima" });
    }
    if (url.pathname === "/reservations") return Response.json([]);
    if (url.pathname === "/inventory") return Response.json({ roomTypes: [] });
    throw new Error(`Unexpected request ${url.pathname}`);
  };

  await render(React.createElement(CalendarWithOtherReads));
  await until(
    () => container.textContent.includes("La ventana del calendario está incompleta"),
    "Failed load must show the Spanish error",
  );
  await click("Mostrar reservas sin asignar, 0");
  const panelRetry = container.querySelector<HTMLElement>(
    '[aria-label="Reservas sin asignar"] [role="alert"] button',
  );
  assert.ok(panelRetry, "Missing unassigned retry");
  const beforeRetry = requests.length;

  await React.act(async () => panelRetry.click());
  await page.flush();

  assert.deepEqual(
    requests.slice(beforeRetry).map((url) => url.pathname),
    ["/calendar"],
  );
  assert.equal(container.textContent.includes("101"), false);
});

function adaBar() {
  return container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]');
}

function buttonByText(label: string) {
  const element = [...window.document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
  assert.ok(element, `Missing button ${label}`);
  return element as HTMLButtonElement;
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

async function fillNamed(name: string, value: string) {
  const input = window.document.querySelector(`[name="${name}"]`);
  assert.ok(input, `Missing ${name}`);
  const prototype = window.HTMLInputElement.prototype;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function dialogReads(url: URL) {
  if (url.pathname === "/room-types") {
    return Response.json([
      { id: "double", name: "Doble", maxAdults: 2, maxChildren: 1, baseRateCents: 15000 },
      { id: "suite", name: "Suite", maxAdults: 4, maxChildren: 2, baseRateCents: 25000 },
    ]);
  }
  if (url.pathname === "/rooms") {
    return Response.json([
      { id: "room-2", number: "2", roomTypeId: "double" },
      { id: "room-10", number: "10", roomTypeId: "suite" },
      { id: "room-101", number: "101", roomTypeId: "double" },
    ]);
  }
  if (url.pathname === "/availability") {
    return Response.json({
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
    });
  }
  if (url.pathname === "/reservations") return Response.json([]);
  if (url.pathname === "/room-closures") return Response.json([]);
  return undefined;
}

type HeldCalendar = {
  requests: URL[];
  release: (response: Response) => void;
};

function installHeldCalendar(
  options: {
    initial?: (url: URL) => Response;
    respond?: (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;
  } = {},
): HeldCalendar {
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/calendar") {
      if (requests.filter((item) => item.pathname === "/calendar").length === 1) {
        return Promise.resolve((options.initial ?? calendarResponse)(url));
      }
      return new Promise((resolve) => {
        releaseRefresh = resolve;
      });
    }
    const response = options.respond?.(url, init);
    if (response) return Promise.resolve(response);
    throw new Error(`Unexpected request ${url.pathname}${init?.method ? ` ${init.method}` : ""}`);
  };
  return {
    requests,
    release: (response) => releaseRefresh(response),
  };
}

async function expectHeldRefresh(options: {
  held: HeldCalendar;
  before: number;
  whileHeld: () => boolean;
  next: (url: URL) => Response;
  arrived: () => boolean;
  after?: () => void;
}) {
  const refreshed = options.held.requests
    .slice(options.before)
    .filter((url) => url.pathname === "/calendar");
  assert.equal(refreshed.length, 1, "The save must drop the held days");
  assert.equal(refreshed[0]!.searchParams.get("from"), "2026-10-13");
  assert.equal(refreshed[0]!.searchParams.get("to"), "2026-11-02");
  assert.ok(options.whileHeld(), "The grid must stay up while the refresh is in flight");
  options.held.release(options.next(refreshed[0]!));
  await until(options.arrived, "The saved change must appear");
  options.after?.();
  assert.equal(options.held.requests.filter((url) => url.pathname === "/calendar").length, 2);
}

function stayOn(roomId: string, guestName: string, id = "line-saved", reservationId = "res-new") {
  return (url: URL) =>
    Response.json({
      ...windowPayload,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      rooms: windowPayload.rooms.map((room) =>
        room.id === roomId
          ? {
              ...room,
              stays: [
                ...room.stays,
                {
                  id,
                  reservationId,
                  guestName,
                  status: "confirmed",
                  checkIn: "2026-10-22",
                  checkOut: "2026-10-24",
                },
              ],
            }
          : room,
      ),
    });
}

it("shows a new reservation on its room without blanking the calendar", async () => {
  const held = installHeldCalendar({
    respond: (url, init) => {
      if (url.pathname === "/reservations" && init?.method === "POST") {
        return Response.json({ id: "res-new" });
      }
      return dialogReads(url);
    },
  });
  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "Week must paint before the new reservation");
  await click("Nueva reserva para habitación 2 el 22 oct 2026");
  await until(
    () => window.document.querySelector('[name="fullName"]') !== null,
    "New reservation dialog must open",
  );
  await fillNamed("fullName", "Rosalind Franklin");
  await until(() => !buttonByText("Crear reserva").disabled, "The quote must load");
  assert.ok(
    held.requests.some((url) => url.pathname === "/availability"),
    "The new-reservation dialog keeps its availability read",
  );
  const before = held.requests.length;

  await React.act(async () => buttonByText("Crear reserva").click());
  await until(
    () => held.requests.slice(before).some((url) => url.pathname === "/calendar"),
    "Creating a reservation must drop the held days",
  );

  await expectHeldRefresh({
    held,
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
    Response.json({
      ...windowPayload,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      rooms: windowPayload.rooms.map((room) =>
        room.id === roomId
          ? {
              ...room,
              closures: [
                ...room.closures,
                {
                  id: "closure-saved",
                  roomId,
                  starts: "2026-10-22",
                  ends: "2026-10-24",
                  reason,
                },
              ],
            }
          : room,
      ),
    });
}

it("shows a saved room closure without blanking the calendar", async () => {
  const held = installHeldCalendar({
    respond: (url, init) => {
      if (url.pathname === "/room-closures" && init?.method === "POST") {
        return Response.json({
          id: "closure-saved",
          roomId: "room-2",
          starts: "2026-10-22",
          ends: "2026-10-24",
          reason: "Pintura",
        });
      }
      return undefined;
    },
  });
  await render(React.createElement(CalendarSession));
  await until(() => !!adaBar(), "Week must paint before the closure save");
  assert.equal(container.textContent.includes("Pintura"), false);
  await openRoomActions("2");
  await chooseMenuItem("Cerrar habitación");
  await until(
    () => window.document.getElementById("closure-start") !== null,
    "Closure form must open",
  );
  await pickDate("closure-start", "22/10/2026");
  await pickDate("closure-end", "24/10/2026");
  await fillNamed("reason", "Pintura");
  const submit = window.document.querySelector<HTMLButtonElement>(
    "#room-closure-form button[type='submit']",
  );
  assert.ok(submit, "Missing closure save");
  await until(() => !submit.disabled, "Closure save must be ready");
  const before = held.requests.length;

  await React.act(async () => submit.click());
  await until(
    () => held.requests.slice(before).some((url) => url.pathname === "/calendar"),
    "Saving a closure must drop the held days",
  );

  await expectHeldRefresh({
    held,
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
  return Response.json({
    ...windowPayload,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    rooms: windowPayload.rooms.map((room) =>
      room.id === "room-10" ? { ...room, closures: [] } : room,
    ),
  });
}

it("removes a deleted room closure without blanking the calendar", async () => {
  const held = installHeldCalendar({
    respond: (url, init) => {
      if (url.pathname === "/room-closures/closure-1" && init?.method === "DELETE") {
        return Response.json({ ok: true });
      }
      return undefined;
    },
  });
  await render(React.createElement(CalendarSession));
  await until(
    () => container.textContent.includes("Mantenimiento"),
    "The closure must paint before it is deleted",
  );
  const closure = [...container.querySelectorAll("button")].find((button) =>
    button.getAttribute("title")?.startsWith("Mantenimiento"),
  );
  assert.ok(closure, "Missing closure bar");
  await React.act(async () => closure.click());
  await until(
    () => window.document.body.textContent?.includes("Editar cierre") ?? false,
    "Closure editor must open",
  );
  const before = held.requests.length;

  await React.act(async () => buttonByText("Eliminar").click());
  await until(
    () => held.requests.slice(before).some((url) => url.pathname === "/calendar"),
    "Deleting a closure must drop the held days",
  );

  await expectHeldRefresh({
    held,
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
  return Response.json({
    ...windowPayload,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    rooms: windowPayload.rooms.map((room) =>
      room.id === "room-2" ? { ...room, number: "8", roomTypeName: "Familiar" } : room,
    ),
  });
}

it("shows a new room number after a room edit without blanking the calendar", async () => {
  const held = installHeldCalendar({
    respond: (url, init) => {
      if (url.pathname === "/room-types") {
        return Response.json([
          { id: "double", name: "Doble", maxAdults: 2, maxChildren: 1, baseRateCents: 15000 },
          { id: "family", name: "Familiar", maxAdults: 4, maxChildren: 2, baseRateCents: 20000 },
        ]);
      }
      if (url.pathname === "/rooms/room-2" && init?.method === "PATCH") {
        return Response.json({ id: "room-2", number: "8", roomTypeId: "double" });
      }
      return undefined;
    },
  });
  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Acciones de habitación 2"]'),
    "Room 2 must paint before the edit",
  );
  await openRoomActions("2");
  await chooseMenuItem("Editar habitación");
  await until(() => {
    const input = window.document.querySelector<HTMLInputElement>('[name="number"]');
    return !!input && !input.disabled;
  }, "Room edit form must load");
  await fillNamed("number", "8");
  const save = window.document.querySelector<HTMLButtonElement>(
    "#room-edit-form button[type='submit']",
  );
  assert.ok(save, "Missing room save");
  await until(() => !save.disabled, "Room save must be ready");
  const before = held.requests.length;

  await React.act(async () => save.click());
  await until(
    () => held.requests.slice(before).some((url) => url.pathname === "/calendar"),
    "Editing a room must drop the held days",
  );

  await expectHeldRefresh({
    held,
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
  return Response.json({
    ...windowPayload,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    rooms: windowPayload.rooms.map((room) =>
      room.id === "room-2"
        ? {
            ...room,
            stays: [
              {
                id: "line-open",
                reservationId: "res-open",
                guestName: "Mary Jackson",
                status: "confirmed",
                checkIn: "2026-10-22",
                checkOut: "2026-10-24",
              },
            ],
          }
        : room,
    ),
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
  return Response.json({
    id: "res-open",
    status: "confirmed",
    rooms: [{ id: "line-open", roomTypeId: "double", roomId: null, adults: 1, children: 0 }],
  });
}

function assignmentReads(url: URL, init?: RequestInit) {
  if (url.pathname === "/reservations") return Response.json([maryList]);
  if (url.pathname === "/room-closures") return Response.json([]);
  if (url.pathname === "/reservations/res-open" && !init?.method) return assignmentDetail();
  return undefined;
}

async function offerMaryRoom2() {
  await click("Mostrar reservas sin asignar, 1");
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

it("moves a reserved room onto its room after assignment without blanking the calendar", async () => {
  let releaseAssignment: (response: Response) => void = () => {};
  const held = installHeldCalendar({
    respond: (url, init) => {
      if (url.pathname === "/reservations/res-open/commands")
        return new Promise((resolve) => {
          releaseAssignment = resolve;
        });
      return assignmentReads(url, init);
    },
  });
  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'),
    "The unassigned stay must paint before assignment",
  );
  const assignLabel = await offerMaryRoom2();
  assert.ok(held.requests.some((url) => url.pathname === "/reservations"));
  assert.ok(held.requests.some((url) => url.pathname === "/room-closures"));
  const before = held.requests.length;

  await click(assignLabel);
  await until(
    () => buttonByText("Nueva reserva").disabled,
    "Reservation creation must be disabled while room assignment is saving",
  );
  expectIdleRefresh(true);
  releaseAssignment(Response.json({ id: "res-open" }));
  await until(
    () => held.requests.slice(before).some((url) => url.pathname === "/calendar"),
    "Assigning a room must drop the held days",
  );

  await expectHeldRefresh({
    held,
    before,
    whileHeld: () =>
      container.textContent.includes("Ada Lovelace") &&
      container.textContent.includes("101") &&
      container.textContent.includes("Mantenimiento") &&
      container.textContent.includes("Sin asignar · 1") &&
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
  return Response.json({
    ...windowPayload,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    rooms: windowPayload.rooms.map((room) =>
      room.id === "room-2"
        ? {
            ...room,
            stays: [
              {
                id: "line-conflict",
                reservationId: "res-conflict",
                guestName: "Katherine Johnson",
                status: "confirmed",
                checkIn: "2026-10-22",
                checkOut: "2026-10-24",
              },
            ],
          }
        : room,
    ),
  });
}

it("refreshes the calendar after a failed room assignment without keeping the contradicted bars", async () => {
  const held = installHeldCalendar({
    respond: (url, init) => {
      if (url.pathname === "/reservations/res-open/commands") {
        return Response.json(
          { error: "room is already assigned for those dates" },
          { status: 409 },
        );
      }
      return assignmentReads(url, init);
    },
  });
  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'),
    "The unassigned stay must paint before assignment",
  );
  const assignLabel = await offerMaryRoom2();
  const before = held.requests.length;

  await click(assignLabel);
  await until(
    () => held.requests.slice(before).some((url) => url.pathname === "/calendar"),
    "A failed assignment must drop the held days",
  );

  assert.ok(
    held.requests.slice(before).some((url) => url.pathname === "/reservations"),
    "Assignment availability keeps its reservation read",
  );
  assert.ok(
    held.requests.slice(before).some((url) => url.pathname === "/room-closures"),
    "Assignment availability keeps its room-closure read",
  );
  await expectHeldRefresh({
    held,
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
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/calendar") {
      const count = requests.filter((item) => item.pathname === "/calendar").length;
      if (count === 1) return Promise.resolve((options.initial ?? calendarResponse)(url));
      if (!options.dropsHold) return Promise.resolve(calendarResponse(url));
      return new Promise((resolve) => {
        releaseRefresh = resolve;
      });
    }
    const response = options.respond(url, init);
    if (response) return Promise.resolve(response);
    throw new Error(`Unexpected request ${url.pathname}${init?.method ? ` ${init.method}` : ""}`);
  };
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
  void mountedWriter(save)();
  if (options.dropsHold) {
    await until(
      () => requests.filter((url) => url.pathname === "/calendar").length >= 2,
      "The save must drop the held days",
    );
    const refreshed = requests.slice(before).filter((url) => url.pathname === "/calendar");
    assert.equal(refreshed.length, 1);
    assert.equal(refreshed[0]!.searchParams.get("from"), "2026-10-13");
    assert.equal(refreshed[0]!.searchParams.get("to"), "2026-11-02");
    assert.ok(
      options.whileHeld?.() ?? !!adaBar(),
      "The grid must stay up while the refresh is in flight",
    );
    releaseRefresh(options.next!(refreshed[0]!));
    if (options.arrived) await until(options.arrived, "The saved change must appear");
    options.after?.();
    assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);
  } else {
    await page.flush();
    assert.equal(
      requests.slice(before).some((url) => url.pathname === "/calendar"),
      false,
      "This save must not reload the calendar",
    );
    assert.ok(adaBar(), "The grid must stay up");
  }
  return { requests, before };
}

it("updates the calendar after a reservation save without blanking the grid", async () => {
  const { requests } = await expectOffCalendarWriter({
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
      (url) => url.pathname === "/reservations" && url.searchParams.get("paginated") === "true",
    ).length >= 2,
    "The reservation list stays on its current read",
  );
});

function renamedContact(url: URL, guestName: string) {
  return Response.json({
    ...windowPayload,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    rooms: windowPayload.rooms.map((room) => ({
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
    initial: (url) =>
      Response.json({
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        missingSetup: "rooms",
        rooms: [],
        unassigned: [],
      }),
    ready: () => container.textContent.includes("Aún no hay habitaciones"),
    whileHeld: () =>
      container.textContent.includes("Aún no hay habitaciones") &&
      !container.querySelector('[aria-label="Acciones de habitación 1"]'),
    next: (url) =>
      Response.json({
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        missingSetup: null,
        rooms: [
          {
            id: "room-1",
            number: "1",
            roomTypeId: "double",
            roomTypeName: "Doble",
            stays: [],
            closures: [],
          },
        ],
        unassigned: [],
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
  const { requests } = await expectOffCalendarWriter({
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
    requests.filter((url) => url.pathname === "/inventory").length >= 2,
    "A rate change still reloads inventory",
  );
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 1);
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
