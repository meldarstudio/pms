import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLInputElement, HTMLElement } from "happy-dom";
import type { ReservationDetail } from "../src/lib/api.ts";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";
import { calendarResponse } from "./calendar-window.ts";
import type { FakeRequest } from "./fake-backend.ts";

let browser: BrowserTest;
let page: BrowserPage;
let window: BrowserTest["window"];
let React: BrowserTest["React"];
let routes: typeof import("../src/router.tsx");
let calendar: typeof import("../src/lib/property-calendar.ts");
let router: typeof routes.router;
let container: BrowserPage["container"];
let client: BrowserPage["client"];
let until: BrowserPage["until"];
let requests: FakeRequest[];
let calendarReservation: () => typeof ana;
let respond: (url: URL) => Response | Promise<Response>;
let respondToDetail: (url: URL, init?: RequestInit) => Response | Promise<Response>;
const originalTimeZone = process.env.TZ;

const ana: ReservationDetail & { guestName: string } = {
  id: "ana",
  code: "ANA0001",
  guestName: "Ana Pérez",
  status: "confirmed",
  guestId: "contact",
  guest: { id: "contact", fullName: "Ana Pérez", email: null, phone: null, notes: null },
  stayingGuests: [],
  checkIn: "2026-10-31",
  checkOut: "2026-11-02",
  source: "direct",
  currency: "PEN",
  totalCents: 30000,
  subtotalCents: 30000,
  discountCents: 0,
  savedDiscountCents: 0,
  paidCents: 10000,
  balanceCents: 20000,
  creditCents: 0,
  payments: [],
  notes: null,
  cancellationReason: null,
  cancelledAt: null,
  rooms: [
    {
      id: "line",
      roomTypeId: "double",
      roomTypeName: "Doble",
      roomId: "room",
      roomNumber: "101",
      housekeepingStatus: "clean",
      adults: 2,
      children: 0,
      subtotalCents: 30000,
      discountCents: 0,
      totalCents: 30000,
      nights: [],
    },
  ],
};

beforeAll(async () => {
  process.env.TZ = "Pacific/Kiritimati";
  browser = await createBrowserTest();
  ({ window, React } = browser);
  const { server } = browser;
  routes = (await server.ssrLoadModule("/src/router.tsx")) as typeof routes;
  calendar = (await server.ssrLoadModule("/src/lib/property-calendar.ts")) as typeof calendar;
});

beforeEach(() => {
  window.localStorage.clear();
  window.happyDOM.setWindowSize({ width: 1024, height: 768 });
  calendar.configurePropertyCalendar("America/Lima");
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-11-01T01:00:00Z").getTime());
  page = browser.createPage();
  ({ container, client, until } = page);
  calendarReservation = () => ana;
  respondToDetail = () => Response.json(ana);
  respond = (url) =>
    Response.json({
      rows: [ana],
      total: 1,
      limit: Number(url.searchParams.get("limit")),
      offset: Number(url.searchParams.get("offset")),
    });
  // The fake backend also asserts that every request sends credentials.
  page.api.catalog.roomTypes = [
    { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, baseRateCents: 15000 },
  ];
  page.api.catalog.rooms = [{ id: "room", number: "101", roomTypeId: "double" }];
  page.api.on("*", /^\/reservations\/ana/, ({ url, init }) => respondToDetail(url, init));
  page.api.on("GET", "/calendar", ({ url }) => {
    const reservation = calendarReservation();
    const line = reservation.rooms[0]!;
    return calendarResponse(url, {
      rooms: [
        {
          id: "room",
          number: "101",
          roomTypeId: "double",
          roomTypeName: "Doble",
          stays: [
            {
              id: line.id,
              reservationId: reservation.id,
              guestName: reservation.guestName,
              status: reservation.status,
              checkIn: reservation.checkIn,
              checkOut: reservation.checkOut,
            },
          ],
        },
      ],
    });
  });
  page.api.on("*", "/reservations", ({ url }) => respond(url));
  requests = page.api.requests("*", "/reservations");
});

afterEach(async () => {
  await page.cleanup();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await browser?.close();
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

async function render(path = "/reservations", waitForRows = true) {
  router = browser.routing.createRouter({
    routeTree: routes.router.routeTree,
    history: browser.routing.createMemoryHistory({ initialEntries: [path] }),
  });
  await page.renderRouter(router);
  if (waitForRows) await until(() => container.textContent.includes("Ana Pérez"));
}
function button(label: string) {
  const labelElement = Array.from(window.document.querySelectorAll("label")).find(
    (element) => element.textContent.trim() === label,
  );
  const element =
    (labelElement ? window.document.getElementById(labelElement.htmlFor) : null) ??
    Array.from(window.document.querySelectorAll('button, [role="button"]')).find(
      (element) =>
        element.textContent.trim() === label || element.getAttribute("aria-label") === label,
    );
  assert.ok(element, `Missing button ${label}`);
  return element as HTMLElement;
}
async function click(label: string) {
  await React.act(async () => button(label).click());
}
function assertFilterCount(expected: number) {
  assert.equal(
    button("Filtros").querySelector('[data-slot="badge"]')?.textContent.trim() ?? "0",
    String(expected),
  );
}
function params() {
  assert.ok(requests.length);
  return requests.at(-1)!.url.searchParams;
}

async function fill(label: string, value: string) {
  const labelElement = Array.from(window.document.querySelectorAll("label")).find(
    (element) => element.textContent.trim() === label,
  );
  assert.ok(labelElement, `Missing label ${label}`);
  const element = window.document.getElementById(labelElement.htmlFor) as HTMLInputElement;
  assert.ok(element);
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
async function choose(label: string, option: string) {
  const labelElement = Array.from(window.document.querySelectorAll("label")).find(
    (element) => element.textContent.trim() === label,
  );
  assert.ok(labelElement, `Missing label ${label}`);
  const element = window.document.getElementById(labelElement.htmlFor);
  assert.ok(element, `Missing control ${label}`);
  await React.act(async () => (element as HTMLElement).click());
  await until(() =>
    Array.from(window.document.querySelectorAll('[role="option"]')).some(
      (element) => element.textContent.trim() === option,
    ),
  );
  const item = Array.from(window.document.querySelectorAll('[role="option"]')).find(
    (element) => element.textContent.trim() === option,
  )!;
  await React.act(async () => (item as HTMLElement).click());
}

it("opens property-today Arrivals and switches all four server scopes without losing the selected day", async () => {
  assert.equal(new Date(Date.now()).getDate(), 1);
  await render();
  assert.equal(params().get("paginated"), "true");
  assert.equal(params().get("checkIn"), "2026-10-31");
  assert.equal(params().get("statuses"), "confirmed,checked_in,checked_out");
  assert.equal(params().get("sort"), "guestName");
  assert.equal(params().get("direction"), "asc");
  assertFilterCount(0);
  await click("Día siguiente");
  await until(() => params().get("checkIn") === "2026-11-01");
  await click("Salidas");
  await until(() => params().get("checkOut") === "2026-11-01");
  assert.equal(params().has("checkIn"), false);
  await click("Todas las reservas");
  await until(() => params().get("sort") === "checkIn");
  assert.equal(params().get("direction"), "desc");
  assert.equal(params().has("checkIn"), false);
  assert.equal(params().has("checkOut"), false);
  assert.equal(params().has("statuses"), false);
  assertFilterCount(0);
  await click("En casa");
  await until(() => params().get("statuses") === "checked_in");
  assert.equal(params().get("sort"), "checkOut");
  assertFilterCount(0);
  assert.equal(params().has("checkIn"), false);
  await click("Llegadas");
  await until(() => params().get("checkIn") === "2026-11-01");
  await click("Hoy");
  await until(() => params().get("checkIn") === "2026-10-31");
  await click("Día de operación");
  const selected = window.document.querySelector<HTMLElement>('button[data-day="30/10/2026"]');
  assert.ok(selected);
  await React.act(async () => selected.click());
  await until(() => params().get("checkIn") === "2026-10-30");
  assert.equal(params().get("offset"), "0");
  vi.mocked(Date.now).mockReturnValue(new Date("2026-11-01T05:01:00Z").getTime());
  await React.act(async () => window.dispatchEvent(new window.Event("focus")));
  assert.equal(params().get("checkIn"), "2026-10-30");
  assert.equal(button("Día de operación").textContent.includes("30 oct 2026"), true);
  await click("Día anterior");
  await until(() => params().get("checkIn") === "2026-10-29");
});

it("keeps navigation usable when browser storage is blocked", async () => {
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new Error("Storage is blocked");
  });
  await render();
  assert.equal(button("Alternar navegación").getAttribute("aria-expanded"), "true");
  await click("Alternar navegación");
  assert.equal(button("Alternar navegación").getAttribute("aria-expanded"), "false");
  await click("Alternar navegación");
  assert.equal(button("Alternar navegación").getAttribute("aria-expanded"), "true");
});

it("refreshes the sidebar's today links on resume without changing the selected reservation day", async () => {
  await render("/reservations?day=2026-10-31");
  vi.mocked(Date.now).mockReturnValue(new Date("2026-11-01T05:01:00Z").getTime());
  await React.act(async () => window.dispatchEvent(new window.Event("focus")));
  const inventoryLink = container.querySelector('nav a[href^="/inventory"]');
  assert.ok(inventoryLink);
  assert.equal(
    new URL(inventoryLink.getAttribute("href")!, "http://localhost").searchParams.get("from"),
    "2026-11-01",
  );
  assert.equal(router.state.location.search.day, "2026-10-31");
});

it("counts changed filter groups instead of chips and restores defaults without clearing search or context", async () => {
  respond = (url) =>
    Response.json({
      rows: [ana],
      total: 126,
      limit: 25,
      offset: Number(url.searchParams.get("offset")),
    });
  await render(
    "/reservations?view=departures&day=2026-12-31&sort=balance&direction=desc&size=25&page=2",
  );
  assert.equal(container.textContent.includes("Asignación"), false);
  await fill("Contacto principal o código", "Ana ANA0001");
  await until(() => params().get("q") === "Ana ANA0001");
  assert.equal(params().get("offset"), "0");
  assertFilterCount(0);
  await click("Filtros");
  assert.equal(button("Restablecer").hasAttribute("disabled"), true);
  await choose("Saldo", "Con crédito");
  await until(() => params().get("balance") === "credit");
  assertFilterCount(1);
  await choose("Asignación", "Con habitaciones sin asignar");
  await until(() => params().get("assignment") === "unassigned");
  assertFilterCount(2);
  await click("Cancelada");
  await until(() => !params().has("statuses"));
  assertFilterCount(3);
  await click("Check-out");
  await until(() => params().get("statuses") === "confirmed,checked_in,cancelled");
  await click("Confirmada");
  await until(() => params().get("statuses") === "checked_in,cancelled");
  assertFilterCount(3);
  await choose("Saldo", "Cualquier saldo");
  await until(() => !params().has("balance"));
  assert.equal(params().get("assignment"), "unassigned");
  assertFilterCount(2);
  assert.equal(container.querySelector('[aria-label="Filtros activos"]'), null);
  await click("Filtros");
  await click("Siguiente");
  await until(() => params().get("offset") === "25");
  await click("Filtros");
  await click("Restablecer");
  await until(() => !params().has("assignment"));
  assert.equal(params().get("q"), "Ana ANA0001");
  assertFilterCount(0);
  assert.equal(button("Restablecer").hasAttribute("disabled"), true);
  assert.ok(window.document.querySelector('[role="dialog"]'));
  assert.equal(params().get("statuses"), "confirmed,checked_in,checked_out");
  assert.equal(params().get("checkOut"), "2026-12-31");
  assert.equal(params().get("sort"), "balance");
  assert.equal(params().get("direction"), "desc");
  assert.equal(params().get("limit"), "25");
  assert.equal(params().get("offset"), "0");
  await click("Filtros");
  await click("Borrar búsqueda");
  await until(() => !params().has("q"));
});

it.each([{ remaining: 0, range: "0 de 0 reservas", offset: "0", page: 0 }])(
  "uses exact page bounds and recovers when matches shrink to $remaining",
  async ({ remaining, range, offset: expectedOffset, page }) => {
    let total = 150;
    respond = (url) => {
      const offset = Number(url.searchParams.get("offset"));
      return Response.json({
        rows:
          offset < total
            ? Array.from({ length: Math.min(50, total - offset) }, (_, i) => ({
                ...ana,
                id: `reservation-${offset + i}`,
                code: `CODE${offset + i}`,
              }))
            : [],
        total,
        limit: 50,
        offset,
      });
    };
    await render("/reservations?view=all");
    assert.ok(container.textContent.includes("1–50 de 150 reservas"));
    assert.equal(button("Anterior").hasAttribute("disabled"), true);
    await click("Siguiente");
    await until(() => container.textContent.includes("51–100 de 150 reservas"));
    await click("Siguiente");
    await until(() => container.textContent.includes("101–150 de 150 reservas"));
    assert.equal(button("Siguiente").hasAttribute("disabled"), true);
    total = remaining;
    await React.act(async () => {
      await client.invalidateQueries({ queryKey: ["reservations"] });
    });
    await until(() => container.textContent.includes(range));
    assert.equal(params().get("offset"), expectedOffset);
    assert.equal(button("Siguiente").hasAttribute("disabled"), true);
    assert.equal(router.state.location.search.page ?? 0, page);
  },
);

it("refreshes cached operations and legacy calendar results after saving in reservation details", async () => {
  client.setQueryDefaults(["reservations"], { staleTime: Infinity });
  let saved = false;
  const checkedIn = { ...ana, status: "checked_in" as const };
  calendarReservation = () => (saved ? checkedIn : ana);
  respond = (url) => {
    if (!url.searchParams.has("paginated")) return Response.json([saved ? checkedIn : ana]);
    return Response.json({ rows: saved ? [] : [ana], total: saved ? 0 : 1, limit: 50, offset: 0 });
  };
  respondToDetail = (url, init) => {
    if (url.pathname.endsWith("/preview"))
      return Response.json({ billing: checkedIn, validation: { issues: [] } });
    if (url.pathname.endsWith("/commands")) {
      assert.equal(init?.method, "POST");
      assert.ok(typeof init?.body === "string");
      const body = JSON.parse(init.body) as { actions: unknown[] };
      assert.deepEqual(body.actions, [{ type: "set-status", status: "checked_in" }]);
      saved = true;
      return Response.json(checkedIn);
    }
    return Response.json(saved ? checkedIn : ana);
  };
  await render("/calendar?from=2026-10-31");
  assert.ok(button("Editar reserva de Ana Pérez · Confirmada"));
  assert.equal(requests.length, 0);
  await React.act(async () =>
    router.navigate({ href: "/reservations?day=2026-10-31&statuses=confirmed" }),
  );
  await until(() => container.querySelector("tbody")?.textContent.includes("Ana Pérez") ?? false);
  const row = container.querySelector<HTMLElement>("tbody tr")!;
  await React.act(async () => row.click());
  await until(() => container.textContent.includes("#ANA0001"));
  await choose("Estado de la reserva", "Check-in");
  await until(() => saved && !container.querySelector("fieldset")?.disabled);
  await click("Volver a reservas");
  await until(() => container.textContent.includes("No se encontraron reservas"));
  assert.ok(container.textContent.includes("0 de 0 reservas"));
  assert.equal(params().get("statuses"), "confirmed");
  await React.act(async () => router.navigate({ href: "/calendar?from=2026-10-31" }));
  await until(
    () => container.querySelector('[aria-label="Editar reserva de Ana Pérez · Check-in"]') !== null,
  );
  assert.equal(params().get("paginated"), "true");
  assert.equal(params().get("statuses"), "confirmed");
});

it("sends sorting and page sizes to the full-result endpoint and resets the offset for every change", async () => {
  respond = (url) =>
    Response.json({
      rows: [ana],
      total: 126,
      limit: Number(url.searchParams.get("limit")),
      offset: Number(url.searchParams.get("offset")),
    });
  await render("/reservations?view=all&page=2");
  assert.equal(params().get("offset"), "100");
  await click("Ordenar por Check-in");
  await until(() => params().get("direction") === "asc");
  assert.equal(params().get("offset"), "0");
  assert.equal(
    button("Ordenar por Check-in").closest("th")!.getAttribute("aria-sort"),
    "ascending",
  );
  assert.equal(router.state.location.pathname, "/reservations");
  await click("Ordenar reservas");
  await choose("Ordenar por", "Saldo");
  await until(() => params().get("sort") === "balance");
  assert.equal(params().get("offset"), "0");
  await choose("Dirección", "Ascendente");
  await until(() => params().get("direction") === "asc");
  for (const [label, sort] of [
    ["Check-out", "checkOut"],
    ["Contacto principal", "guestName"],
    ["Check-in", "checkIn"],
  ]) {
    await choose("Ordenar por", label!);
    await until(() => params().get("sort") === sort);
  }
  await click("Ordenar reservas");
  await choose("Reservas por página", "100 / pág.");
  await until(() => params().get("limit") === "100");
  await choose("Reservas por página", "25 / pág.");
  await until(() => params().get("limit") === "25");
  assert.equal(params().get("offset"), "0");
});

it.each(["desktop", "mobile"])(
  "identifies the booking contact, balances, and room assignments on %s",
  async (viewport) => {
    if (viewport === "mobile") page.mobile();
    respond = () =>
      Response.json({
        rows: [
          {
            ...ana,
            guest: { ...ana.guest, phone: "+51 987 654 321" },
            rooms: [
              { ...ana.rooms[0], adults: 1, children: 1 },
              { ...ana.rooms[0], id: "unassigned-1", roomId: null, roomNumber: null, adults: 1 },
              { ...ana.rooms[0], id: "unassigned-2", roomId: null, roomNumber: null },
            ],
          },
          {
            ...ana,
            id: "settled",
            guestName: "Bea Saldada",
            balanceCents: 0,
            rooms: [{ ...ana.rooms[0], roomId: null, roomNumber: null }],
          },
          {
            ...ana,
            id: "credit",
            guestName: "Celia Crédito",
            status: "cancelled",
            totalCents: 0,
            balanceCents: -15000,
            creditCents: 15000,
          },
          {
            ...ana,
            id: "group",
            guestName: "Ester Aguilar",
            rooms: [
              // Unsorted, and 1001 sorts first as text but last as a number.
              ...["407", "1001", "108", "213", "201", "404", "204", "205", "207"]
                .concat(["208", "301", "304", "305", "307", "308", "405"])
                .map((number) => ({ ...ana.rooms[0], id: number, roomNumber: number })),
              { ...ana.rooms[0], id: "unassigned-1", roomId: null, roomNumber: null },
              { ...ana.rooms[0], id: "unassigned-2", roomId: null, roomNumber: null },
            ],
          },
        ],
        total: 4,
        limit: 50,
        offset: 0,
      });
    await render("/reservations?view=all");
    const rows = Array.from(
      container.querySelectorAll(
        viewport === "mobile" ? 'ul[aria-label="Reservas"] > li' : "tbody tr",
      ),
    );
    assert.match(rows[0]!.textContent, /Ana Pérez/);
    if (viewport === "desktop") {
      assert.match(rows[0]!.textContent, /\+51 987 654 321/);
      assert.match(rows[0]!.textContent, /4 adultos · 1 niño/);
      assert.match(rows[1]!.textContent, /Sin teléfono/);
    }
    assert.match(rows[0]!.textContent, /31 oct 2026/);
    assert.match(rows[0]!.textContent, /2 nov 2026/);
    assert.match(rows[0]!.textContent, /Confirmada/);
    assert.match(rows[1]!.textContent, /Bea Saldada/);
    assert.match(rows[0]!.textContent, /101 · 2 sin asignar/);
    assert.match(
      rows[0]!.querySelector(viewport === "mobile" ? '[data-slot="card-footer"]' : "td:last-child")!
        .textContent,
      /200Saldo pendiente/,
    );
    assert.match(rows[1]!.textContent, /1 sin asignar/);
    assert.match(
      rows[1]!.querySelector(viewport === "mobile" ? '[data-slot="card-footer"]' : "td:last-child")!
        .textContent,
      /0Saldada/,
    );
    assert.match(
      rows[2]!.querySelector(viewport === "mobile" ? '[data-slot="card-footer"]' : "td:last-child")!
        .textContent,
      /150Crédito/,
    );
    assert.equal(rows[2]!.textContent.includes("Saldo pendiente"), false);
    // Long room lists stay short on screen; assistive technology still gets every room.
    assert.match(rows[3]!.textContent, /108, 201, 204 \+13 · 2 sin asignar/);
    const allRooms = rows[3]!.querySelector(".sr-only");
    assert.equal(
      allRooms?.textContent,
      "108, 201, 204, 205, 207, 208, 213, 301, 304, 305, 307, 308, 404, 405, 407, 1001 · 2 sin asignar",
    );
    await fill("Contacto principal o código", "Ana ANA0001");
    await until(() => params().get("q") === "Ana ANA0001");
  },
);

it.each(["desktop", "mobile"])(
  "preserves the complete URL and page through details, direct reload, and return on %s",
  async (viewport) => {
    if (viewport === "mobile") page.mobile();
    respond = (url) =>
      Response.json({
        rows: [ana],
        total: 126,
        limit: 25,
        offset: Number(url.searchParams.get("offset")),
      });
    await render(
      "/reservations?view=departures&day=2026-12-31&q=Ana&statuses=all&balance=credit&assignment=unassigned&sort=balance&direction=asc&size=25&page=2",
    );
    const expected = { ...router.state.location.search };
    const row = container.querySelector('[aria-label="Abrir reserva de Ana Pérez"]');
    assert.ok(row);
    if (viewport === "desktop") assert.equal(row.getAttribute("tabindex"), "0");
    assert.equal(row.getAttribute("aria-label"), "Abrir reserva de Ana Pérez");
    await React.act(async () => {
      if (viewport === "mobile") (row as HTMLElement).click();
      else
        row.dispatchEvent(
          new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
        );
    });
    await until(() => container.textContent.includes("#ANA0001"));
    const detailLink = router.state.location.href;
    // A different table context must not overwrite the return URL encoded in this detail link.
    await React.act(async () => router.navigate({ href: "/reservations?view=all" }));
    await until(() => container.textContent.includes("Todas las reservas"));
    await render(detailLink);
    await click("Volver a reservas");
    await until(() => container.textContent.includes("51–51 de 126 reservas"));
    assert.deepEqual({ ...router.state.location.search }, expected);
    assert.equal(params().get("offset"), "50");
    assert.equal(params().has("statuses"), false);
    assert.equal(params().get("checkOut"), "2026-12-31");
  },
);

it("includes cancellations with all four statuses checked and restores daily defaults after a shared URL reload", async () => {
  const cancelled = {
    ...ana,
    id: "cancelled",
    guestName: "Cancelled contact",
    status: "cancelled",
  };
  respond = (url) => {
    const rows = url.searchParams.has("statuses") ? [ana] : [ana, cancelled];
    return Response.json({ rows, total: rows.length, limit: 50, offset: 0 });
  };
  await render("/reservations?day=2026-10-30");
  assert.equal(container.querySelector("tbody")!.textContent.includes("Cancelled contact"), false);
  await click("Filtros");
  await click("Cancelada");
  await until(() => container.querySelector("tbody")!.textContent.includes("Cancelled contact"));
  assert.equal(params().has("statuses"), false);
  const link = router.state.location.href;
  await click("Filtros");
  vi.mocked(Date.now).mockReturnValue(new Date("2026-11-01T05:01:00Z").getTime());
  await render(link);
  await until(() => container.querySelector("tbody")!.textContent.includes("Cancelled contact"));
  assert.equal(params().get("checkIn"), "2026-10-30");
  await click("Filtros");
  for (const status of ["Confirmada", "Check-in", "Check-out", "Cancelada"]) {
    assert.equal((button(status) as HTMLInputElement).checked, true);
  }
  assertFilterCount(1);
  await click("Restablecer");
  await until(() => params().get("statuses") === "confirmed,checked_in,checked_out");
  await until(() => !container.querySelector("tbody")!.textContent.includes("Cancelled contact"));
  assert.equal(params().get("checkIn"), "2026-10-30");
  await click("Confirmada");
  await click("Check-in");
  await until(() => params().get("statuses") === "checked_out");
  assert.equal(button("Check-out").hasAttribute("disabled"), true);
  await click("Check-out");
  assert.equal(params().get("statuses"), "checked_out");
  await click("Cancelada");
  await until(() => params().get("statuses") === "checked_out,cancelled");
  assert.equal(button("Check-out").hasAttribute("disabled"), false);
  const partialLink = router.state.location.href;
  await click("Filtros");
  await render(partialLink);
  assert.equal(params().get("statuses"), "checked_out,cancelled");
});

it("applies mobile sheet filters immediately, closes with focus restored, and keeps state across the breakpoint", async () => {
  window.happyDOM.setWindowSize({ width: 767, height: 844 });
  await render("/reservations?view=departures&day=2026-12-31&q=Ana&sort=balance&size=25");
  // happy-dom initializes media-query listeners to false, even when mounted on a phone.
  await React.act(async () => window.dispatchEvent(new window.Event("resize")));
  assert.ok(container.querySelector('ul[aria-label="Reservas"]'));
  await click("Filtros");
  await until(() => !!window.document.querySelector('[data-slot="sheet-content"]'));
  const sheet = window.document.querySelector('[role="dialog"]')!;
  assert.equal(
    window.document.getElementById(sheet.getAttribute("aria-labelledby")!)!.textContent,
    "Filtros de reservas",
  );
  await choose("Saldo", "Con crédito");
  await until(() => params().get("balance") === "credit");
  assertFilterCount(1);
  assert.ok(window.document.querySelector('[data-slot="sheet-content"]'));
  await click("Listo");
  await until(() => !window.document.querySelector('[data-slot="sheet-content"]'));
  await until(() => window.document.activeElement === button("Filtros"));
  await click("Filtros");
  assert.match(button("Saldo").textContent, /Con crédito/);
  await click("Restablecer");
  await until(() => !params().has("balance"));
  assert.equal(params().get("q"), "Ana");
  assert.equal(params().get("checkOut"), "2026-12-31");
  assert.equal(params().get("sort"), "balance");
  assert.equal(params().get("limit"), "25");
  await click("Listo");
  await until(() => !window.document.querySelector('[data-slot="sheet-content"]'));
  const expected = { ...router.state.location.search };
  await React.act(async () => window.happyDOM.setWindowSize({ width: 768, height: 844 }));
  await until(() => !!container.querySelector("tbody"));
  assert.deepEqual({ ...router.state.location.search }, expected);
  await click("Filtros");
  assert.ok(window.document.querySelector('[data-slot="popover-content"]'));
  await click("Filtros");
  await React.act(async () => window.happyDOM.setWindowSize({ width: 375, height: 844 }));
  await until(() => !!container.querySelector('ul[aria-label="Reservas"]'));
  await click("En casa");
  await until(() => params().get("statuses") === "checked_in");
  await click("Filtros");
  await until(() => !!window.document.querySelector('[data-slot="sheet-content"]'));
  assert.equal(
    window.document.querySelector('[data-slot="sheet-content"]')!.textContent.includes("Estados"),
    false,
  );
});

it("waits for the requested mobile page before moving focus to its first reservation", async () => {
  page.mobile();
  respond = (url) =>
    Response.json({
      rows: [ana],
      total: 126,
      limit: Number(url.searchParams.get("limit")),
      offset: Number(url.searchParams.get("offset")),
    });
  await render("/reservations?view=all");
  const nextPage = page.api.hold("GET", "/reservations");
  await React.act(async () => button("Siguiente").focus());
  await click("Siguiente");
  await until(() => !!nextPage.request);
  assert.equal(nextPage.request!.url.searchParams.get("offset"), "50");
  assert.equal(button("Siguiente").hasAttribute("disabled"), true);
  assert.equal(
    container.querySelector('ul[aria-label="Reservas"]')!.getAttribute("aria-busy"),
    "true",
  );
  nextPage.release(
    Response.json({
      rows: [{ ...ana, id: "bruno", guestName: "Bruno Díaz" }],
      total: 126,
      limit: 50,
      offset: 50,
    }),
  );
  await until(() => container.textContent.includes("Bruno Díaz"));
  await until(() => window.document.activeElement === button("Abrir reserva de Bruno Díaz"));
  assert.match(container.textContent, /51–51 de 126 reservas/);
  await choose("Reservas por página", "25 / pág.");
  await until(() => params().get("limit") === "25");
  assert.equal(params().get("offset"), "0");
  await until(() => window.document.activeElement === button("Abrir reserva de Ana Pérez"));
});

it("floats Nueva reserva on mobile, collapses it after scrolling without losing its name, and keeps it in the desktop header", async () => {
  await render();
  const header = container.querySelector("header")!;
  assert.match(header.textContent, /Nueva reserva/);
  await React.act(async () => window.happyDOM.setWindowSize({ width: 375, height: 844 }));
  await until(
    () => !header.textContent.includes("Nueva reserva"),
    "Mobile must move Nueva reserva out of the header",
  );
  const action = button("Nueva reserva");
  assert.equal(action.hasAttribute("data-collapsed"), false);
  const main = container.querySelector("main")!;
  await React.act(async () => {
    main.scrollTop = 200;
    main.dispatchEvent(new window.Event("scroll"));
  });
  await until(
    () => button("Nueva reserva").hasAttribute("data-collapsed"),
    "Scrolling away from the top must collapse the action",
  );
  await click("Nueva reserva");
  await until(
    () => !!window.document.querySelector('[role="dialog"]')?.textContent.includes("Nueva reserva"),
    "The floating action must open the new reservation dialog",
  );
});

it("keeps overdue checked-in stays in-house and hides the conflicting status selector", async () => {
  respond = (url) =>
    Response.json({
      rows:
        url.searchParams.get("statuses") === "checked_in"
          ? [
              {
                ...ana,
                guestName: "Overdue contact",
                status: "checked_in",
                checkIn: "2026-10-01",
                checkOut: "2026-10-03",
              },
            ]
          : [ana],
      total: 1,
      limit: 50,
      offset: 0,
    });
  await render();
  await React.act(async () =>
    router.navigate({
      href: "/reservations?view=in-house&statuses=confirmed,cancelled&day=2026-12-31",
    }),
  );
  await until(() => container.textContent.includes("Overdue contact"));
  assert.equal(container.querySelector("tbody")!.textContent.includes("Ana Pérez"), false);
  assert.equal(params().has("checkIn"), false);
  assert.equal(params().has("checkOut"), false);
  await click("Filtros");
  assert.equal(container.textContent.includes("Todos los estados"), false);
  assert.equal(container.textContent.includes("Día de operación"), false);
});

it("preserves every business date when the browser timezone skips December 30, 2011", async () => {
  process.env.TZ = "Pacific/Apia";
  try {
    await render("/reservations?day=2011-12-29");
    await click("Día siguiente");
    await until(() => params().get("checkIn") === "2011-12-30");
    assert.equal(router.state.location.search.day, "2011-12-30");
    assert.ok(button("Día de operación").textContent.includes("30 dic 2011"));
    const link = router.state.location.href;
    await render(link);
    assert.equal(params().get("checkIn"), "2011-12-30");
    await click("Día de operación");
    const selected = window.document.querySelector<HTMLElement>(
      'button[data-day="30/12/2011"][data-selected-single="true"]',
    );
    assert.ok(selected, "The property picker must retain the selected business day");
    const previous = window.document.querySelector<HTMLElement>('button[data-day="29/12/2011"]');
    assert.ok(previous);
    await React.act(async () => previous.click());
    await until(() => params().get("checkIn") === "2011-12-29");
    await click("Día de operación");
    const skipped = window.document.querySelector<HTMLElement>('button[data-day="30/12/2011"]');
    assert.ok(skipped);
    await React.act(async () => skipped.click());
    await until(() => params().get("checkIn") === "2011-12-30");
    assert.ok(button("Día de operación").textContent.includes("30 dic 2011"));
    await click("Día siguiente");
    await until(() => params().get("checkIn") === "2011-12-31");
    await click("Día anterior");
    await until(() => params().get("checkIn") === "2011-12-30");
    await click("Día anterior");
    await until(() => params().get("checkIn") === "2011-12-29");
  } finally {
    process.env.TZ = "Pacific/Kiritimati";
  }
});

it.each(["initial load", "background refresh"] as const)(
  "preserves list context through a failed %s and retry",
  async (state) => {
    if (state === "background refresh")
      await render("/reservations?view=all&q=Ana&balance=settled");
    let finish!: (response: Response) => void;
    respond = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    if (state === "initial load")
      await render("/reservations?view=all&q=Ana&balance=settled", false);
    else
      await React.act(async () => {
        void client.invalidateQueries({ queryKey: ["reservations"] });
      });
    await until(() => !!finish);
    assert.equal(container.textContent.includes("No se encontraron reservas"), false);
    if (state === "initial load") assert.ok(container.textContent.includes("Buscando reservas…"));
    else {
      assert.ok(container.querySelector("tbody")!.textContent.includes("Ana Pérez"));
      assert.ok(container.textContent.includes("1–1 de 1 reserva"));
    }
    await React.act(async () =>
      finish(
        Response.json({ error: "Invalid input: expected a valid checkout date" }, { status: 400 }),
      ),
    );
    await until(() => container.textContent.includes("Reintentar"));
    assert.ok(container.textContent.includes("La fecha de salida no es válida."));
    assert.equal(container.textContent.includes("No se encontraron reservas"), false);
    if (state === "background refresh")
      assert.ok(container.querySelector("tbody")!.textContent.includes("Ana Pérez"));
    respond = () => Response.json({ rows: [], total: 0, limit: 50, offset: 0 });
    await click("Reintentar");
    await until(() => container.textContent.includes("No se encontraron reservas"));
    assert.ok(container.textContent.includes("0 de 0 reservas"));
    assert.equal(params().get("q"), "Ana");
    assert.equal(params().get("balance"), "settled");
    assert.equal(button("Siguiente").hasAttribute("disabled"), true);
    assert.equal(button("Anterior").hasAttribute("disabled"), true);
  },
);

it("searches historical cancelled reservations across every date and retains visible refinements when changing views", async () => {
  respond = (url) =>
    Response.json({
      rows: url.searchParams.has("q")
        ? [
            {
              ...ana,
              guestName: "Historic contact",
              code: "PAST0001",
              status: "cancelled",
              checkIn: "2020-01-01",
              checkOut: "2020-01-02",
            },
          ]
        : [ana],
      total: 1,
      limit: 50,
      offset: 0,
    });
  await render("/reservations?view=all");
  await fill("Contacto principal o código", "   ");
  await until(() => !container.querySelector('table[aria-busy="true"]'));
  assert.equal(params().has("q"), false);
  assert.equal(container.textContent.includes("Reintentar"), false);
  await fill("Contacto principal o código", "Historic PAST0001");
  await until(() => container.querySelector("tbody")!.textContent.includes("Historic contact"));
  assert.ok(container.querySelector("tbody")!.textContent.includes("Cancelada"));
  assert.equal(params().has("checkIn"), false);
  assert.equal(params().has("checkOut"), false);
  assert.equal(params().has("statuses"), false);
  await click("Filtros");
  await choose("Saldo", "Saldo pendiente");
  await until(() => params().get("balance") === "outstanding");
  await choose("Asignación", "Todas asignadas");
  await until(() => params().get("assignment") === "assigned");
  await click("Salidas");
  await until(() => params().get("checkOut") === "2026-10-31");
  assert.equal(params().get("q"), "Historic PAST0001");
  assert.equal(params().get("balance"), "outstanding");
  assert.equal(params().get("assignment"), "assigned");
  assertFilterCount(2);
  await click("Filtros");
  await click("Borrar búsqueda");
  await until(() => !params().has("q"));
  assertFilterCount(2);
  await click("Filtros");
  assert.match(button("Asignación").textContent, /Todas asignadas/);
  assert.match(button("Saldo").textContent, /Saldo pendiente/);
  await choose("Asignación", "Cualquier asignación");
  await until(() => !params().has("assignment"));
  assert.equal(params().get("balance"), "outstanding");
  assertFilterCount(1);
});
