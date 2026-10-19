import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLInputElement, HTMLElement } from "happy-dom";
import type { ReservationDetail } from "../src/lib/api.ts";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

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
let requests: URL[];
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
  calendar.configurePropertyCalendar("America/Lima");
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-11-01T01:00:00Z").getTime());
  page = browser.createPage();
  ({ container, client, until } = page);
  requests = [];
  respondToDetail = () => Response.json(ana);
  respond = (url) =>
    Response.json({
      rows: [ana],
      total: 1,
      limit: Number(url.searchParams.get("limit")),
      offset: Number(url.searchParams.get("offset")),
    });
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.credentials, "include");
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.pathname === "/room-types")
      return Response.json([
        { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, baseRateCents: 15000 },
      ]);
    if (url.pathname === "/rooms")
      return Response.json([{ id: "room", number: "101", roomTypeId: "double" }]);
    if (url.pathname.startsWith("/reservations/ana")) return respondToDetail(url, init);
    if (url.pathname === "/room-closures") return Response.json([]);
    if (url.pathname === "/reservations") {
      requests.push(url);
      return respond(url);
    }
    throw new Error(`Unexpected request ${url}`);
  };
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
    Array.from(window.document.querySelectorAll("button")).find(
      (element) =>
        element.textContent.trim() === label || element.getAttribute("aria-label") === label,
    ) ?? (labelElement ? window.document.getElementById(labelElement.htmlFor) : null);
  assert.ok(element, `Missing button ${label}`);
  return element as HTMLElement;
}
async function click(label: string) {
  await React.act(async () => button(label).click());
}
function params() {
  assert.ok(requests.length);
  return requests.at(-1)!.searchParams;
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
  await click("En casa");
  await until(() => params().get("statuses") === "checked_in");
  assert.equal(params().get("sort"), "checkOut");
  assert.equal(params().has("checkIn"), false);
  await click("Llegadas");
  await until(() => params().get("checkIn") === "2026-11-01");
  await click("Hoy");
  await until(() => params().get("checkIn") === "2026-10-31");
});

it("combines search and optional filters, removes chips, and clears restrictions without changing operating context", async () => {
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
  await fill("Contacto o código", "Ana ANA0001");
  await until(() => params().get("q") === "Ana ANA0001");
  assert.equal(params().get("offset"), "0");
  await click("Filtros");
  await choose("Saldo", "Con crédito");
  await until(() => params().get("balance") === "credit");
  await choose("Asignación", "Con habitaciones sin asignar");
  await until(() => params().get("assignment") === "unassigned");
  await click("Cancelada");
  await until(() => params().get("statuses") === "confirmed,checked_in,checked_out,cancelled");
  await click("Check-out");
  await until(() => params().get("statuses") === "confirmed,checked_in,cancelled");
  await click("Quitar filtro: Confirmada");
  await until(() => params().get("statuses") === "checked_in,cancelled");
  assert.ok(button("Quitar filtro: Con crédito"));
  await click("Quitar filtro: Con crédito");
  await until(() => !params().has("balance"));
  assert.equal(params().get("assignment"), "unassigned");
  await click("Limpiar filtros");
  await until(() => !params().has("q") && !params().has("assignment"));
  assert.equal(params().get("statuses"), "confirmed,checked_in,checked_out");
  assert.equal(params().get("checkOut"), "2026-12-31");
  assert.equal(params().get("sort"), "balance");
  assert.equal(params().get("direction"), "desc");
  assert.equal(params().get("limit"), "25");
  assert.equal(params().get("offset"), "0");
});

it.each([
  { remaining: 50, range: "1–50 de 50 reservas", offset: "0", page: 0 },
  { remaining: 76, range: "51–76 de 76 reservas", offset: "50", page: 1 },
  { remaining: 0, range: "0 de 0 reservas", offset: "0", page: 0 },
])(
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
  const checkedIn = { ...ana, status: "checked_in" };
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
  assert.equal(params().has("paginated"), false);
  assert.equal(params().get("from"), "2026-10-30");
  assert.equal(params().get("to"), "2026-11-06");
  await React.act(async () =>
    router.navigate({ href: "/reservations?day=2026-10-31&statuses=confirmed" }),
  );
  await until(() => container.querySelector("tbody")?.textContent.includes("Ana Pérez") ?? false);
  const row = container.querySelector<HTMLElement>("tbody tr")!;
  await React.act(async () => row.click());
  await until(() => container.textContent.includes("Reserva ANA0001"));
  await choose("Estado de la reserva", "Check-in");
  await until(() => !button("Guardar detalles").hasAttribute("disabled"));
  await click("Guardar detalles");
  await until(() => saved && button("Guardar detalles").hasAttribute("disabled"));
  await click("Volver a reservas");
  await until(() => container.textContent.includes("No se encontraron reservas"));
  assert.ok(container.textContent.includes("0 de 0 reservas"));
  assert.equal(params().get("statuses"), "confirmed");
  await React.act(async () => router.navigate({ href: "/calendar?from=2026-10-31" }));
  await until(
    () => container.querySelector('[aria-label="Editar reserva de Ana Pérez · Check-in"]') !== null,
  );
  assert.equal(params().has("paginated"), false);
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
  await choose("Ordenar por", "Saldo");
  await until(() => params().get("sort") === "balance");
  assert.equal(params().get("offset"), "0");
  await choose("Dirección", "Ascendente");
  await until(() => params().get("direction") === "asc");
  for (const [label, sort] of [
    ["Check-out", "checkOut"],
    ["Contacto", "guestName"],
    ["Check-in", "checkIn"],
  ]) {
    await choose("Ordenar por", label!);
    await until(() => params().get("sort") === sort);
  }
  await choose("Reservas por página", "100");
  await until(() => params().get("limit") === "100");
  await choose("Reservas por página", "25");
  await until(() => params().get("limit") === "25");
  assert.equal(params().get("offset"), "0");
});

it("identifies the booking contact, signed balances, and every assigned or unassigned reserved room", async () => {
  respond = () =>
    Response.json({
      rows: [
        {
          ...ana,
          rooms: [
            ana.rooms[0],
            { ...ana.rooms[0], id: "unassigned-1", roomId: null, roomNumber: null },
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
      ],
      total: 3,
      limit: 50,
      offset: 0,
    });
  await render("/reservations?view=all");
  const headers = Array.from(container.querySelectorAll("th")).map(
    (element) => element.textContent,
  );
  assert.ok(headers.includes("Contacto"));
  assert.ok(headers.includes("Saldo"));
  assert.equal(headers.includes("Huésped"), false);
  const rows = Array.from(container.querySelectorAll("tbody tr"));
  assert.match(rows[0]!.textContent, /101 · 2 sin asignar/);
  assert.match(rows[0]!.textContent, /Pendiente.*200/);
  assert.match(rows[1]!.textContent, /1 sin asignar/);
  assert.match(rows[1]!.textContent, /Saldada.*0/);
  assert.match(rows[2]!.textContent, /Crédito.*150/);
  assert.equal(rows[2]!.textContent.includes("Pendiente"), false);
});

it.each(["Enter", " ", "click"])(
  "preserves the complete URL and page through details, direct reload, and return (%s)",
  async (activation) => {
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
    const row = container.querySelector("tbody tr");
    assert.ok(row);
    assert.equal(row.getAttribute("tabindex"), "0");
    assert.equal(row.getAttribute("aria-label"), "Abrir reserva de Ana Pérez");
    await React.act(async () => {
      if (activation === "click") (row as HTMLElement).click();
      else
        row.dispatchEvent(
          new window.KeyboardEvent("keydown", { key: activation, bubbles: true, cancelable: true }),
        );
    });
    await until(() => container.textContent.includes("Reserva ANA0001"));
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

it("restores legacy arrival links and explicitly unrestricted daily statuses across property midnight", async () => {
  await render("/reservations?checkIn=2026-10-30&status=all");
  assert.equal(params().get("checkIn"), "2026-10-30");
  assert.equal(params().has("statuses"), false);
  vi.mocked(Date.now).mockReturnValue(new Date("2026-11-01T05:01:00Z").getTime());
  await click("Día siguiente");
  await until(() => params().get("checkIn") === "2026-10-31");
  const link = router.state.location.href;
  await render(link);
  assert.equal(params().get("checkIn"), "2026-10-31");
  assert.equal(params().has("statuses"), false);
  await click("Hoy");
  await until(() => params().get("checkIn") === "2026-11-01");
});

it("includes cancellations after selecting unrestricted daily statuses and restores defaults when its chip is removed", async () => {
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
  await click("Todos los estados");
  await until(() => container.querySelector("tbody")!.textContent.includes("Cancelled contact"));
  assert.equal(params().has("statuses"), false);
  const link = router.state.location.href;
  vi.mocked(Date.now).mockReturnValue(new Date("2026-11-01T05:01:00Z").getTime());
  await render(link);
  await until(() => container.querySelector("tbody")!.textContent.includes("Cancelled contact"));
  assert.equal(params().get("checkIn"), "2026-10-30");
  await click("Quitar filtro: Todos los estados");
  await until(() => params().get("statuses") === "confirmed,checked_in,checked_out");
  await until(() => !container.querySelector("tbody")!.textContent.includes("Cancelled contact"));
  assert.equal(params().get("checkIn"), "2026-10-30");
});

it("treats removing the last status as unrestricted and restores selected statuses from a shared URL", async () => {
  await render("/reservations?view=all&statuses=cancelled,confirmed,confirmed,bogus");
  assert.equal(params().get("statuses"), "confirmed,cancelled");
  await click("Quitar filtro: Confirmada");
  await until(() => params().get("statuses") === "cancelled");
  await click("Filtros");
  await click("Cancelada");
  await until(() => !params().has("statuses"));
  assert.equal((button("Todos los estados") as HTMLInputElement).checked, true);
  assert.equal(new URLSearchParams(router.state.location.searchStr).get("statuses"), "all");
  await click("Check-in");
  await until(() => params().get("statuses") === "checked_in");
  await click("Confirmada");
  await until(() => params().get("statuses") === "confirmed,checked_in");
  const link = router.state.location.href;
  assert.equal(
    new URLSearchParams(router.state.location.searchStr).get("statuses"),
    "confirmed,checked_in",
  );
  await render(link);
  assert.equal(params().get("statuses"), "confirmed,checked_in");
  await click("Limpiar filtros");
  await until(() => !params().has("statuses"));
  assert.equal(router.state.location.search.view, "all");
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

it("picks a property calendar day, steps backward, and keeps an explicit date when the property clock advances", async () => {
  await render("/reservations?day=2026-10-31&page=2");
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

it("distinguishes loading and request failure from zero results and retries without losing filters", async () => {
  let finish!: (response: Response) => void;
  respond = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await render("/reservations?view=all&q=Ana&balance=settled", false);
  assert.ok(container.textContent.includes("Buscando reservas…"));
  assert.equal(container.textContent.includes("No se encontraron reservas"), false);
  await React.act(async () => finish(Response.json({ error: "Request failed" }, { status: 503 })));
  await until(() => container.textContent.includes("Reintentar"));
  assert.equal(container.textContent.includes("No se encontraron reservas"), false);
  assert.equal(container.textContent.includes("0 de 0 reservas"), false);
  respond = () => Response.json({ rows: [], total: 0, limit: 50, offset: 0 });
  await click("Reintentar");
  await until(() => container.textContent.includes("No se encontraron reservas"));
  assert.ok(container.textContent.includes("0 de 0 reservas"));
  assert.equal(params().get("q"), "Ana");
  assert.equal(params().get("balance"), "settled");
  assert.equal(button("Siguiente").hasAttribute("disabled"), true);
  assert.equal(button("Anterior").hasAttribute("disabled"), true);
  await click("Nueva reserva");
  await until(() => window.document.querySelector('[role="dialog"]') !== null);
  assert.ok(
    window.document.querySelector('[role="dialog"]')!.textContent.includes("Nueva reserva"),
  );
});

it("keeps rows and totals visible during a failed background refresh and retries the same context", async () => {
  await render("/reservations?view=all&q=Ana&sort=balance");
  let finish!: (response: Response) => void;
  respond = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await React.act(async () => {
    void client.invalidateQueries({ queryKey: ["reservations"] });
  });
  await until(() => container.textContent.includes("Actualizando…"));
  assert.ok(container.querySelector("tbody")!.textContent.includes("Ana Pérez"));
  assert.ok(container.textContent.includes("1–1 de 1 reserva"));
  await React.act(async () => finish(Response.json({ error: "Request failed" }, { status: 503 })));
  await until(() => container.textContent.includes("Reintentar"));
  assert.ok(container.querySelector("tbody")!.textContent.includes("Ana Pérez"));
  assert.equal(container.textContent.includes("No se encontraron reservas"), false);
  respond = () =>
    Response.json({ rows: [{ ...ana, balanceCents: 0 }], total: 1, limit: 50, offset: 0 });
  await click("Reintentar");
  await until(() => container.querySelector("tbody")!.textContent.includes("Saldada"));
  assert.equal(params().get("q"), "Ana");
  assert.equal(params().get("sort"), "balance");
});

it("normalizes unsupported direct URL values before sending a request", async () => {
  await render(
    "/reservations?view=bogus&day=2026-02-30&q=123&statuses=nope&balance=bogus&assignment=bogus&sort=bogus&direction=sideways&size=75&page=-1",
  );
  assert.equal(params().get("checkIn"), "2026-10-31");
  assert.equal(params().get("statuses"), "confirmed,checked_in,checked_out");
  assert.equal(params().get("sort"), "guestName");
  assert.equal(params().get("direction"), "asc");
  assert.equal(params().get("limit"), "50");
  assert.equal(params().get("offset"), "0");
  assert.equal(params().has("q"), false);
  assert.equal(params().has("balance"), false);
  assert.equal(params().has("assignment"), false);
});

it("treats whitespace-only contact search as unrestricted rather than a failed request", async () => {
  respond = (url) =>
    url.searchParams.has("q")
      ? Response.json(
          { error: "Too small: expected string to have >=1 characters" },
          { status: 400 },
        )
      : Response.json({ rows: [ana], total: 1, limit: 50, offset: 0 });
  await render("/reservations?view=all");
  await fill("Contacto o código", "   ");
  await until(() => !container.querySelector('table[aria-busy="true"]'));
  assert.equal(params().has("q"), false);
  assert.ok(container.querySelector("tbody")!.textContent.includes("Ana Pérez"));
  assert.equal(container.textContent.includes("Reintentar"), false);
});

it.each([
  ["Invalid input: expected a valid check-in date", "La fecha de llegada no es válida."],
  ["Invalid input: expected a valid checkout date", "La fecha de salida no es válida."],
])("shows the list API date error in Spanish: %s", async (message, translation) => {
  respond = () => Response.json({ error: message }, { status: 400 });
  await render("/reservations?view=departures&day=2026-12-31", false);
  await until(() => container.textContent.includes("Reintentar"));
  assert.ok(container.textContent.includes(translation));
  assert.equal(container.textContent.includes(message), false);
});

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
  await fill("Contacto o código", "Historic PAST0001");
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
  assert.ok(button("Quitar filtro: Saldo pendiente"));
  assert.ok(button("Quitar filtro: Todas asignadas"));
  await click("Quitar filtro: Búsqueda: Historic PAST0001");
  await until(() => !params().has("q"));
  await click("Quitar filtro: Todas asignadas");
  await until(() => !params().has("assignment"));
});
