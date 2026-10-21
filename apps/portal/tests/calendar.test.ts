import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLButtonElement, HTMLElement } from "happy-dom";
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
