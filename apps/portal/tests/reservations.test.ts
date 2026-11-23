import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLElement } from "happy-dom";
import type { ReservationDetail } from "../src/lib/api.ts";
import { sharedBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";
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
  guest: {
    id: "contact",
    fullName: "Ana Pérez",
    email: null,
    phone: null,
    notes: null,
    nationality: null,
  },
  stayingGuests: [],
  checkIn: "2026-10-31",
  checkOut: "2026-11-02",
  channel: "walk_in",
  currency: "PEN",
  totalCents: 30000,
  subtotalCents: 30000,
  discountCents: 0,
  savedDiscountCents: 0,
  paidCents: 10000,
  balanceCents: 20000,
  creditCents: 0,
  refundDueCents: 0,
  refundedCents: 0,
  pendingRefundCents: 0,
  refunds: [],
  couponIssuedCents: 0,
  couponAppliedCents: 0,
  initialPaymentDueCents: 0,
  coupons: [],
  couponMovements: [],
  cancellation: null,
  cancellations: [],
  ratePlan: {
    plan: "flexible",
    cancellationPolicy: {
      chargeBasis: "first_night",
      freeUntilDaysBeforeCheckIn: 2,
    },
    paymentSchedule: "first_night_deposit",
    priceAdjustmentPercent: 0,
  },
  requiredInitialPaymentCents: 15000,
  remainingScheduledCents: 15000,
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
  browser = await sharedBrowserTest();
  ({ window, React } = browser);
  const { server } = browser;
  routes = (await server.ssrLoadModule("/src/router.tsx")) as typeof routes;
  calendar = (await server.ssrLoadModule("/src/lib/property-calendar.ts")) as typeof calendar;
});

beforeEach(() => {
  window.localStorage.clear();
  window.happyDOM.setWindowSize({ width: 1440, height: 900 });
  calendar.configurePropertyCalendar("America/Lima");
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-11-01T01:00:00Z").getTime());
  page = browser.createPage();
  ({ container, until } = page);
  calendarReservation = () => ana;
  respondToDetail = () => Response.json(ana);
  respond = (url) =>
    Response.json({
      rows: [ana],
      total: 1,
      limit: Number(url.searchParams.get("limit")),
      offset: Number(url.searchParams.get("offset")),
    });
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
  const lists = requests;
  assert.ok(lists.length);
  return lists.at(-1)!.url.searchParams;
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
