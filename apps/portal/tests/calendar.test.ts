import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLButtonElement, HTMLElement } from "happy-dom";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let React: BrowserTest["React"];
let calendars: typeof import("../src/components/room-calendar.tsx");
let queries: typeof import("../src/lib/queries.ts");
let container: BrowserPage["container"];
let render: BrowserPage["render"];
let until: BrowserPage["until"];

beforeAll(async () => {
  browser = await createBrowserTest();
  ({ React } = browser);
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
                  roomTypeId: "double",
                  roomIndex: 1,
                  roomCount: 1,
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
                  roomTypeId: "double",
                  roomIndex: 1,
                  roomCount: 1,
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
                  roomTypeId: "double",
                  roomIndex: 1,
                  roomCount: 1,
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
                    roomTypeId: "double",
                    roomIndex: 1,
                    roomCount: 1,
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
                  roomTypeId: "double",
                  roomIndex: 1,
                  roomCount: 1,
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
                    roomTypeId: "double",
                    roomIndex: 1,
                    roomCount: 1,
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

  releaseRefresh(calendarResponse(refreshed[0]!, "Katherine Johnson"));
  await until(
    () =>
      !!container.querySelector('[aria-label="Editar reserva de Katherine Johnson · Confirmada"]'),
    "Refresh must show the reservation made elsewhere",
  );
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

  await click("Período siguiente");
  await until(
    () => container.textContent.includes("27 oct 2026"),
    "First period stays inside the hold",
  );
  assert.equal(requests.length, 2);
  assert.ok(container.textContent.includes("101"));

  await click("Período siguiente");
  await page.flush();
  assert.equal(requests.length, 3);
  assert.equal(requests[2]!.searchParams.get("from"), "2026-10-27");
  assert.ok(container.textContent.includes("3 nov 2026"));
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    null,
  );

  pending[0]!(calendarResponse(requests[1]!, "Katherine Johnson"));
  await page.flush();

  assert.ok(container.textContent.includes("3 nov 2026"));
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

function stayOn(roomId: string, guestName: string, id = "line-saved") {
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
                  reservationId: "res-new",
                  guestName,
                  status: "confirmed",
                  checkIn: "2026-10-22",
                  checkOut: "2026-10-24",
                  roomTypeId: room.roomTypeId,
                  roomIndex: 1,
                  roomCount: 1,
                },
              ],
            }
          : room,
      ),
    });
}

function CalendarWithReservationSave() {
  const save = queries.useWorkflowCommand("res-new");
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(CalendarSession),
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Guardar reserva",
        onClick: () => {
          void save.mutateAsync({
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
          });
        },
      },
      "Guardar reserva",
    ),
  );
}

it("updates the calendar after a reservation save without blanking the grid", async () => {
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  const savedWindow = stayOn("room-2", "Rosalind Franklin");
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/reservations/res-new/commands") {
      return Promise.resolve(Response.json({ id: "res-new" }));
    }
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.filter((item) => item.pathname === "/calendar").length === 1) {
      return Promise.resolve(calendarResponse(url));
    }
    return new Promise((resolve) => {
      releaseRefresh = resolve;
    });
  };

  await render(React.createElement(CalendarWithReservationSave));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before the reservation save",
  );
  const beforeSave = requests.length;

  await click("Guardar reserva");
  await page.flush();

  const refreshed = requests.slice(beforeSave).filter((url) => url.pathname === "/calendar");
  assert.equal(refreshed.length, 1, "The save must drop the held days and read the calendar again");
  assert.equal(refreshed[0]!.searchParams.get("from"), "2026-10-13");
  assert.equal(refreshed[0]!.searchParams.get("to"), "2026-11-02");
  assert.ok(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Current bars stay up while the saved window is in flight",
  );
  assert.ok(container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'));
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Rosalind Franklin · Confirmada"]'),
    null,
  );
  assert.ok(container.textContent.includes("20 oct 2026"));

  releaseRefresh(savedWindow(refreshed[0]!));
  await until(
    () =>
      !!container.querySelector('[aria-label="Editar reserva de Rosalind Franklin · Confirmada"]'),
    "The saved stay must appear on its room",
  );
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'));
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.textContent.includes("Doble"));
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
  assert.ok(container.textContent.includes("20 oct 2026"));
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);
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

function CalendarWithClosureSave() {
  const save = queries.useSaveRoomClosure();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(CalendarSession),
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Guardar cierre",
        onClick: () => {
          void save.mutateAsync({
            roomId: "room-2",
            starts: "2026-10-22",
            ends: "2026-10-24",
            reason: "Pintura",
          });
        },
      },
      "Guardar cierre",
    ),
  );
}

it("shows a saved room closure without blanking the calendar", async () => {
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  const savedWindow = closureOn("room-2", "Pintura");
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/room-closures" && init?.method === "POST") {
      return Promise.resolve(
        Response.json({
          id: "closure-saved",
          roomId: "room-2",
          starts: "2026-10-22",
          ends: "2026-10-24",
          reason: "Pintura",
        }),
      );
    }
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.filter((item) => item.pathname === "/calendar").length === 1) {
      return Promise.resolve(calendarResponse(url));
    }
    return new Promise((resolve) => {
      releaseRefresh = resolve;
    });
  };

  await render(React.createElement(CalendarWithClosureSave));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before the closure save",
  );
  assert.equal(container.textContent.includes("Pintura"), false);
  const beforeSave = requests.length;

  await click("Guardar cierre");
  await page.flush();

  const refreshed = requests.slice(beforeSave).filter((url) => url.pathname === "/calendar");
  assert.equal(refreshed.length, 1, "Saving a closure must drop the held days");
  assert.ok(container.textContent.includes("Mantenimiento"), "The current closure stays up");
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.textContent.includes("101"));
  assert.equal(container.textContent.includes("Pintura"), false);

  releaseRefresh(savedWindow(refreshed[0]!));
  await until(() => container.textContent.includes("Pintura"), "The saved closure must appear");
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);
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

function CalendarWithClosureDelete() {
  const remove = queries.useDeleteRoomClosure();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(CalendarSession),
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Eliminar cierre",
        onClick: () => {
          void remove.mutateAsync("closure-1");
        },
      },
      "Eliminar cierre",
    ),
  );
}

it("removes a deleted room closure without blanking the calendar", async () => {
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/room-closures/closure-1" && init?.method === "DELETE") {
      return Promise.resolve(Response.json({ ok: true }));
    }
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.filter((item) => item.pathname === "/calendar").length === 1) {
      return Promise.resolve(calendarResponse(url));
    }
    return new Promise((resolve) => {
      releaseRefresh = resolve;
    });
  };

  await render(React.createElement(CalendarWithClosureDelete));
  await until(
    () => container.textContent.includes("Mantenimiento"),
    "The closure must paint before it is deleted",
  );
  const beforeDelete = requests.length;

  await click("Eliminar cierre");
  await page.flush();

  const refreshed = requests.slice(beforeDelete).filter((url) => url.pathname === "/calendar");
  assert.equal(refreshed.length, 1, "Deleting a closure must drop the held days");
  assert.ok(
    container.textContent.includes("Mantenimiento"),
    "The closure stays up until the refresh arrives",
  );
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.textContent.includes("101"));

  releaseRefresh(withoutClosure(refreshed[0]!));
  await until(
    () => !container.textContent.includes("Mantenimiento"),
    "The deleted closure must disappear",
  );
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'));
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);
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

function CalendarWithRoomEdit() {
  const save = queries.usePatchRoom();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(CalendarSession),
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Guardar habitación",
        onClick: () => {
          void save.mutateAsync({ id: "room-2", number: "8", roomTypeId: "family" });
        },
      },
      "Guardar habitación",
    ),
  );
}

it("shows a new room number and room type after a room edit without blanking the calendar", async () => {
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/rooms/room-2" && init?.method === "PATCH") {
      return Promise.resolve(Response.json({ id: "room-2", number: "8", roomTypeId: "family" }));
    }
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.filter((item) => item.pathname === "/calendar").length === 1) {
      return Promise.resolve(calendarResponse(url));
    }
    return new Promise((resolve) => {
      releaseRefresh = resolve;
    });
  };

  await render(React.createElement(CalendarWithRoomEdit));
  await until(
    () => !!container.querySelector('[aria-label="Acciones de habitación 2"]'),
    "Room 2 must paint before the edit",
  );
  assert.equal(container.textContent.includes("Familiar"), false);
  const beforeSave = requests.length;

  await click("Guardar habitación");
  await page.flush();

  const refreshed = requests.slice(beforeSave).filter((url) => url.pathname === "/calendar");
  assert.equal(refreshed.length, 1, "Editing a room must drop the held days");
  assert.ok(container.querySelector('[aria-label="Acciones de habitación 2"]'));
  assert.equal(container.querySelector('[aria-label="Acciones de habitación 8"]'), null);
  assert.equal(container.textContent.includes("Familiar"), false);
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.textContent.includes("101"));

  releaseRefresh(renamedRoom(refreshed[0]!));
  await until(
    () => !!container.querySelector('[aria-label="Acciones de habitación 8"]'),
    "The new room number must show up",
  );
  assert.ok(container.textContent.includes("Familiar"));
  assert.equal(container.querySelector('[aria-label="Acciones de habitación 2"]'), null);
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.querySelector('[aria-label="Acciones de habitación 101"]'));
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);
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
                roomTypeId: "double",
                roomIndex: 1,
                roomCount: 1,
              },
            ],
          }
        : room,
    ),
    unassigned: [],
  });
}

function CalendarWithAssignment() {
  const assign = queries.useAssignRoom();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(CalendarSession),
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Asignar habitación",
        onClick: () => {
          void assign.mutateAsync({
            reservationId: "res-open",
            lineId: "line-open",
            roomId: "room-2",
          });
        },
      },
      "Asignar habitación",
    ),
  );
}

it("moves a reserved room onto its room after assignment without blanking the calendar", async () => {
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/reservations/res-open" && !init?.method) {
      return Promise.resolve(
        Response.json({
          id: "res-open",
          status: "confirmed",
          rooms: [{ id: "line-open", roomTypeId: "double", roomId: null, adults: 1, children: 0 }],
        }),
      );
    }
    if (url.pathname === "/reservations/res-open/commands") {
      return Promise.resolve(Response.json({ id: "res-open" }));
    }
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.filter((item) => item.pathname === "/calendar").length === 1) {
      return Promise.resolve(calendarResponse(url));
    }
    return new Promise((resolve) => {
      releaseRefresh = resolve;
    });
  };

  await render(React.createElement(CalendarWithAssignment));
  await until(
    () => !!container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'),
    "The unassigned stay must paint before assignment",
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Mary Jackson · Confirmada"]'),
    null,
  );
  const beforeAssign = requests.length;

  await click("Asignar habitación");
  await page.flush();

  const refreshed = requests.slice(beforeAssign).filter((url) => url.pathname === "/calendar");
  assert.equal(refreshed.length, 1, "Assigning a room must drop the held days");
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Mary Jackson · Confirmada"]'),
    null,
  );
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.textContent.includes("101"));

  releaseRefresh(assignedWindow(refreshed[0]!));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Mary Jackson · Confirmada"]'),
    "The reserved room must move onto its room",
  );
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 0"]'));
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'));
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);
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
                roomTypeId: "double",
                roomIndex: 1,
                roomCount: 1,
              },
            ],
          }
        : room,
    ),
  });
}

it("refreshes the calendar after a failed room assignment without keeping the contradicted bars", async () => {
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  const mary = {
    id: "res-open",
    guestName: "Mary Jackson",
    status: "confirmed",
    checkIn: "2026-10-22",
    checkOut: "2026-10-24",
    rooms: [{ id: "line-open", roomTypeId: "double", roomId: null }],
  };
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/calendar") {
      if (requests.filter((item) => item.pathname === "/calendar").length === 1) {
        return Promise.resolve(calendarResponse(url));
      }
      return new Promise((resolve) => {
        releaseRefresh = resolve;
      });
    }
    if (url.pathname === "/reservations") return Promise.resolve(Response.json([mary]));
    if (url.pathname === "/room-closures") return Promise.resolve(Response.json([]));
    if (url.pathname === "/reservations/res-open" && !init?.method) {
      return Promise.resolve(
        Response.json({
          id: "res-open",
          status: "confirmed",
          rooms: [{ id: "line-open", roomTypeId: "double", roomId: null, adults: 1, children: 0 }],
        }),
      );
    }
    if (url.pathname === "/reservations/res-open/commands") {
      return Promise.resolve(
        Response.json({ error: "room is already assigned for those dates" }, { status: 409 }),
      );
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };

  await render(React.createElement(CalendarSession));
  await until(
    () => !!container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'),
    "The unassigned stay must paint before assignment",
  );
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
  assert.ok(requests.some((url) => url.pathname === "/reservations"));
  assert.ok(requests.some((url) => url.pathname === "/room-closures"));
  const beforeFailure = requests.length;

  await click(assignLabel);
  await page.flush();

  const refreshed = requests.slice(beforeFailure).filter((url) => url.pathname === "/calendar");
  assert.equal(refreshed.length, 1, "A failed assignment must drop the held days");
  assert.ok(
    requests.slice(beforeFailure).some((url) => url.pathname === "/reservations"),
    "Assignment availability keeps its reservation read",
  );
  assert.ok(
    requests.slice(beforeFailure).some((url) => url.pathname === "/room-closures"),
    "Assignment availability keeps its room-closure read",
  );
  assert.ok(container.textContent.includes("Ada Lovelace"));
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.equal(container.textContent.includes("Katherine Johnson"), false);
  assert.ok(container.textContent.includes("20 oct 2026"));

  releaseRefresh(conflictWindow(refreshed[0]!));
  await until(
    () => container.textContent.includes("Katherine Johnson"),
    "The conflict must replace the bars the assignment just proved wrong",
  );
  assert.ok(container.textContent.includes("Ada Lovelace"));
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.ok(container.textContent.includes("20 oct 2026"));
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);
});

function renamedContact(url: URL) {
  return Response.json({
    ...windowPayload,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    rooms: windowPayload.rooms.map((room) => ({
      ...room,
      stays: room.stays.map((stay) =>
        stay.reservationId === "res-ada" ? { ...stay, guestName: "Ada Byron" } : stay,
      ),
    })),
  });
}

function CalendarWithContactRename() {
  const save = queries.useWorkflowCommand("res-ada");
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(CalendarSession),
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Guardar contacto",
        onClick: () => {
          void save.mutateAsync({
            id: "res-ada",
            command: {
              requestId: "rename-contact",
              actions: [
                {
                  type: "contact",
                  contact: {
                    fullName: "Ada Byron",
                    email: null,
                    phone: null,
                  },
                },
              ],
            },
          });
        },
      },
      "Guardar contacto",
    ),
  );
}

it("updates the name on the stay after a booking-contact rename without blanking the calendar", async () => {
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/reservations/res-ada/commands") {
      return Promise.resolve(Response.json({ id: "res-ada" }));
    }
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.filter((item) => item.pathname === "/calendar").length === 1) {
      return Promise.resolve(calendarResponse(url));
    }
    return new Promise((resolve) => {
      releaseRefresh = resolve;
    });
  };

  await render(React.createElement(CalendarWithContactRename));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Ada must paint before the rename",
  );
  const beforeRename = requests.length;

  await click("Guardar contacto");
  await page.flush();

  const refreshed = requests.slice(beforeRename).filter((url) => url.pathname === "/calendar");
  assert.equal(refreshed.length, 1, "Renaming the booking contact must drop the held days");
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Ada Byron · Confirmada"]'),
    null,
  );
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.textContent.includes("Mantenimiento"));

  releaseRefresh(renamedContact(refreshed[0]!));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Byron · Confirmada"]'),
    "The stay must show the renamed contact",
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    null,
  );
  assert.ok(container.querySelector('[aria-label="Editar reserva de Grace Hopper · Check-out"]'));
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 1"]'));
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);
});

function setupWindow(url: URL) {
  return Response.json({
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
  });
}

function CalendarWithPropertySetup() {
  const save = queries.useSavePropertySetup();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(CalendarSession),
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Guardar configuración",
        onClick: () => {
          void save.mutateAsync({
            name: "Doble",
            maxAdults: 2,
            maxChildren: 1,
            baseRateCents: 15000,
            rooms: [{ number: "1" }],
          });
        },
      },
      "Guardar configuración",
    ),
  );
}

it("clears missing setup and shows the new room after property setup without a flash", async () => {
  const requests: URL[] = [];
  let releaseRefresh: (response: Response) => void = () => {};
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/setup" && init?.method === "POST") {
      return Promise.resolve(
        Response.json({
          roomType: {
            id: "double",
            name: "Doble",
            maxAdults: 2,
            maxChildren: 1,
            baseRateCents: 15000,
          },
          rooms: [{ id: "room-1", number: "1", roomTypeId: "double" }],
        }),
      );
    }
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.filter((item) => item.pathname === "/calendar").length === 1) {
      return Promise.resolve(
        Response.json({
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          missingSetup: "rooms",
          rooms: [],
          unassigned: [],
        }),
      );
    }
    return new Promise((resolve) => {
      releaseRefresh = resolve;
    });
  };

  const rootRoute = browser.routing.createRootRoute({
    component: () => React.createElement(CalendarWithPropertySetup),
  });
  const setupRoute = browser.routing.createRoute({
    getParentRoute: () => rootRoute,
    path: "/setup",
  });
  const router = browser.routing.createRouter({
    routeTree: rootRoute.addChildren([setupRoute]),
    history: browser.routing.createMemoryHistory({ initialEntries: ["/"] }),
  });
  await page.renderRouter(router);
  await until(
    () => container.textContent.includes("Aún no hay habitaciones"),
    "Missing rooms must be called out before setup is saved",
  );
  const beforeSave = requests.length;

  await click("Guardar configuración");
  await page.flush();

  const refreshed = requests.slice(beforeSave).filter((url) => url.pathname === "/calendar");
  assert.equal(refreshed.length, 1, "Property setup must drop the held days");
  assert.ok(container.textContent.includes("Aún no hay habitaciones"));
  assert.equal(container.querySelector('[aria-label="Acciones de habitación 1"]'), null);
  assert.equal(container.textContent.includes("101"), false);

  releaseRefresh(setupWindow(refreshed[0]!));
  await until(
    () => !!container.querySelector('[aria-label="Acciones de habitación 1"]'),
    "The new room must appear",
  );
  assert.equal(container.textContent.includes("Aún no hay habitaciones"), false);
  assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
  assert.ok(container.textContent.includes("Doble"));
  assert.ok(container.querySelector('[aria-label="Mostrar reservas sin asignar, 0"]'));
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);
});

function CalendarWithRateSave() {
  queries.useInventory("2026-10-20", "2026-10-26");
  const save = queries.usePutRoomTypeRates();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(CalendarSession),
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Guardar tarifa",
        onClick: () => {
          void save.mutateAsync({
            id: "double",
            from: "2026-10-20",
            to: "2026-10-26",
            priceCents: 18000,
          });
        },
      },
      "Guardar tarifa",
    ),
  );
}

it("does not reload the calendar when a rate changes", async () => {
  const requests: URL[] = [];
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/calendar") return Promise.resolve(calendarResponse(url));
    if (url.pathname === "/inventory") return Promise.resolve(Response.json({ roomTypes: [] }));
    if (url.pathname === "/room-types/double/rates" && init?.method === "PUT") {
      return Promise.resolve(Response.json({ updated: 7 }));
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };

  await render(React.createElement(CalendarWithRateSave));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before the rate change",
  );
  await until(
    () => requests.some((url) => url.pathname === "/inventory"),
    "Inventory must load on its own read",
  );
  const beforeRate = requests.length;

  await click("Guardar tarifa");
  await page.flush();

  const after = requests.slice(beforeRate);
  assert.ok(
    after.some((url) => url.pathname === "/inventory"),
    "A rate change still reloads inventory",
  );
  assert.equal(
    after.some((url) => url.pathname === "/calendar"),
    false,
    "A rate change must not reload the calendar",
  );
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
  assert.ok(container.textContent.includes("101"));
  assert.ok(container.textContent.includes("Mantenimiento"));
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 1);
});

it("discards a save refresh that finishes after staff have left that day", async () => {
  const requests: URL[] = [];
  const pending: Array<(response: Response) => void> = [];
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/reservations/res-new/commands") {
      return Promise.resolve(Response.json({ id: "res-new" }));
    }
    if (url.pathname !== "/calendar") throw new Error(`Unexpected request ${url.pathname}`);
    if (requests.filter((item) => item.pathname === "/calendar").length === 1) {
      return Promise.resolve(calendarResponse(url));
    }
    return new Promise((resolve) => {
      pending.push(resolve);
    });
  };

  await render(React.createElement(CalendarWithReservationSave));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before the reservation save",
  );

  await click("Guardar reserva");
  await page.flush();
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);

  await click("Período siguiente");
  await until(
    () => container.textContent.includes("27 oct 2026"),
    "First period stays inside the hold",
  );
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 2);
  assert.ok(container.textContent.includes("101"));

  await click("Período siguiente");
  await page.flush();
  assert.equal(requests.filter((url) => url.pathname === "/calendar").length, 3);
  assert.ok(container.textContent.includes("3 nov 2026"));
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    null,
  );

  const held = requests.filter((url) => url.pathname === "/calendar")[1]!;
  pending[0]!(stayOn("room-2", "Rosalind Franklin")(held));
  await page.flush();

  assert.ok(container.textContent.includes("3 nov 2026"));
  assert.equal(container.textContent.includes("20 oct 2026"), false);
  assert.equal(container.textContent.includes("101"), false);
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Rosalind Franklin · Confirmada"]'),
    null,
  );
  assert.equal(
    container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    null,
  );
});

function CalendarAndReservationList() {
  queries.useReservationList({
    sort: "checkIn",
    direction: "asc",
    limit: 25,
    offset: 0,
  });
  return React.createElement(CalendarWithReservationSave);
}

it("keeps the reservation list on its own read when a reservation save refreshes the calendar", async () => {
  const requests: URL[] = [];
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.pathname === "/calendar") return Promise.resolve(calendarResponse(url));
    if (url.pathname === "/reservations" && url.searchParams.get("paginated") === "true") {
      return Promise.resolve(Response.json({ rows: [], total: 0, limit: 25, offset: 0 }));
    }
    if (url.pathname === "/reservations/res-new/commands") {
      return Promise.resolve(Response.json({ id: "res-new" }));
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };

  await render(React.createElement(CalendarAndReservationList));
  await until(
    () => !!container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before the reservation save",
  );
  await until(
    () => requests.some((url) => url.searchParams.get("paginated") === "true"),
    "The reservation list must load on its own read",
  );
  const beforeSave = requests.length;

  await click("Guardar reserva");
  await page.flush();

  const after = requests.slice(beforeSave);
  assert.ok(
    after.some((url) => url.pathname === "/calendar"),
    "The save still drops the held calendar",
  );
  assert.ok(
    after.some(
      (url) => url.pathname === "/reservations" && url.searchParams.get("paginated") === "true",
    ),
    "The reservation list stays on its current read",
  );
  assert.ok(container.querySelector('[aria-label="Editar reserva de Ada Lovelace · Confirmada"]'));
});
