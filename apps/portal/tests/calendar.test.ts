import assert from "node:assert/strict";
import { afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLButtonElement, HTMLElement } from "happy-dom";
import { sharedBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";
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
let commands: typeof import("../src/lib/reservation-commands.ts");
let container: BrowserPage["container"];
let render: BrowserPage["render"];
let until: BrowserPage["until"];
let click: BrowserPage["click"];
let requests: FakeRequest[];

beforeAll(async () => {
  browser = await sharedBrowserTest();
  ({ React, window } = browser);
  calendars = (await browser.server.ssrLoadModule(
    "/src/components/room-calendar.tsx",
  )) as typeof calendars;
  housekeeping = (await browser.server.ssrLoadModule(
    "/src/components/housekeeping.tsx",
  )) as typeof housekeeping;
  queries = (await browser.server.ssrLoadModule("/src/lib/queries.ts")) as typeof queries;
  commands = (await browser.server.ssrLoadModule(
    "/src/lib/reservation-commands.ts",
  )) as typeof commands;
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
      () => !!container.querySelector('[aria-label="Ver reserva de Ada Lovelace · Confirmada"]'),
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
    () => !!container.querySelector('[aria-label="Ver reserva de Ada Lovelace · Confirmada"]'),
    "Week must paint before stepping back to the hold edge",
  );
  assert.equal(
    container.querySelector('[aria-label="Ver reserva de Hold Edge · Check-out"]'),
    null,
  );
  assert.equal(requests.length, 1);

  for (let step = 0; step < 7; step++) await click("Día anterior");
  await until(
    () => !!container.querySelector('[aria-label="Ver reserva de Hold Edge · Check-out"]'),
    "Checkout on the hold's first morning must still draw",
  );

  assert.equal(requests.length, 1);
  assert.ok(container.textContent.includes("13 oct 2026"));
  assert.equal(
    container
      .querySelector('[aria-label="Ver reserva de Hold Edge · Check-out"]')
      ?.getAttribute("title"),
    "Hold Edge · Check-out, 2026-10-12 al 2026-10-13",
  );
});

it("opens a stay's reservation page from its calendar bar without a summary panel", async () => {
  const opened: string[] = [];
  await render(
    React.createElement(calendars.RoomCalendar, {
      start: new Date(2026, 9, 20),
      span: 7,
      onStartChange: () => {},
      onSpanChange: () => {},
      onOpenReservation: (id: string) => opened.push(id),
    }),
  );
  await until(() => !!adaBar(), "The calendar must load");
  await React.act(async () => (adaBar() as HTMLElement).click());
  assert.deepEqual(opened, ["res-ada"]);
  assert.equal(window.document.querySelector('[role="dialog"]'), null);
});

function adaBar() {
  return container.querySelector('[aria-label="Ver reserva de Ada Lovelace · Confirmada"]');
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
    checkIn: "2026-10-22",
    checkOut: "2026-10-24",
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
  await render(await browser.withToasts(React.createElement(CalendarSession)));
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
  await openRoomActions("2");
  const pendingMark = [...window.document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === "Marcar sucia",
  )!;
  assert.equal(
    pendingMark.getAttribute("aria-disabled"),
    "true",
    "A room must not accept another mark while its previous status is unsaved",
  );
  await React.act(async () => pendingMark.click());
  assert.equal(writes.length, 1, "A disabled mark must not send another write");
  await React.act(async () => {
    pendingMark.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  await until(() => !window.document.querySelector('[role="menuitem"]'));
  await openRoomActions("101");
  const otherMark = [...window.document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim().startsWith("Marcar "),
  )!;
  assert.notEqual(otherMark.getAttribute("aria-disabled"), "true", "Other rooms stay available");
  await React.act(async () => {
    otherMark.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await React.act(async () =>
    rejected.release(Response.json({ error: "room not found" }, { status: 404 })),
  );
  await until(() => room2Cell().includes("Sucia"), "A rejected mark must restore the badge");
  await openRoomActions("2");
  const retry = [...window.document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === "Marcar limpia",
  )!;
  assert.notEqual(retry.getAttribute("aria-disabled"), "true", "A failed mark can be retried");
});

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
      expected: { roomTypeId: "double", roomId: null, adults: 1, children: 0 },
    },
  ]);
  assignment.release(Response.json({ id: "res-open" }));
  await until(
    () => requests.slice(before).some((request) => request.path === "/calendar"),
    "Assignment must refresh the calendar",
  );
  refresh.release(assignedWindow(refresh.request!.url));
  await until(
    () => !!container.querySelector('[aria-label="Ver reserva de Mary Jackson · Confirmada"]'),
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
  await render(await browser.withToasts(React.createElement(CalendarSession)));
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
    () =>
      window.document.body.textContent.includes(
        "Esta habitación acaba de asignarse a otra reserva. Elige otra habitación.",
      ),
    "The toast must explain that a colleague just took the room",
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

type HousekeepingMarks = { marks: { roomId: string; status: "dirty" | "clean" }[] };
