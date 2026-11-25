import assert from "node:assert/strict";
import type { HTMLElement } from "happy-dom";
import { afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { PropertySetupInput } from "../src/lib/api.ts";
import { sharedBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";
import type { FakeBackend } from "./fake-backend.ts";

let browser: BrowserTest;
let page: BrowserPage;
let window: BrowserTest["window"];
let React: BrowserTest["React"];
let routes: typeof import("../src/router.tsx");
let router: typeof routes.router;
let container: BrowserPage["container"];
let until: BrowserPage["until"];
let api: FakeBackend;
let catalog: FakeBackend["catalog"];
let writes: PropertySetupInput[];
let input: BrowserPage["field"];
let fill: BrowserPage["fill"];
let button: BrowserPage["button"];
let ThemeProvider: (typeof import("../src/components/theme-provider.tsx"))["ThemeProvider"];

beforeAll(async () => {
  browser = await sharedBrowserTest();
  ({ window, React } = browser);
  const { server } = browser;
  routes = (await server.ssrLoadModule("/src/router.tsx")) as typeof routes;
  ({ ThemeProvider } = await server.ssrLoadModule("/src/components/theme-provider.tsx"));
  const calendar = (await server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});

const double = { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, baseRateCents: 15000 };
const suite = { id: "suite", name: "Suite", maxAdults: 4, maxChildren: 2, baseRateCents: 25000 };

beforeEach(() => {
  page = browser.createPage();
  ({ api, container, until, field: input, fill, button } = page);
  ({ catalog } = api);
  catalog.roomTypes = [double, suite];
  catalog.rooms = [{ id: "room-101", number: "101", roomTypeId: "double" }];
  writes = api.bodies<PropertySetupInput>("POST", "/setup");
  api.on<PropertySetupInput>("POST", "/setup", ({ body }) => {
    const roomType = { ...double, ...body, id: body.roomTypeId ?? "new-type" };
    const savedRooms = body.rooms.map((room, i) => ({
      ...room,
      id: room.id ?? `new-${i}`,
      roomTypeId: roomType.id,
    }));
    catalog.roomTypes = [...catalog.roomTypes.filter((type) => type.id !== roomType.id), roomType];
    catalog.rooms = [
      ...catalog.rooms.filter((room) => room.roomTypeId !== roomType.id),
      ...savedRooms,
    ];
    return { roomType, rooms: savedRooms };
  });
});

afterEach(async () => {
  await page.cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.document.documentElement.classList.remove("light", "dark");
});

async function render(path = "/setup") {
  router = browser.routing.createRouter({
    routeTree: routes.router.routeTree,
    history: browser.routing.createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  await page.render(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(browser.routing.RouterProvider, { router }),
    ),
  );
}

async function click(label: string) {
  const link = Array.from(window.document.querySelectorAll("nav a")).find(
    (element) => element.textContent.trim() === label,
  );
  await React.act(async () => {
    if (link) {
      link.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      );
    } else button(label).click();
  });
}

async function openType(name = "Doble") {
  await until(
    () =>
      !!Array.from(container.querySelectorAll("button")).find(
        (element) => element.getAttribute("aria-label") === `Editar ${name}`,
      ),
    "Room-type list must load",
  );
  await click(`Editar ${name}`);
  await until(() => !!container.querySelector('input[name="name"]'), "Editor must open");
}

it("edits a room type and adds staged and pending room numbers with one save", async () => {
  await render();
  await openType();
  assert.equal(input("name").value, "Doble");
  assert.equal(
    container.querySelector('#property-setup-form [role="status"]')?.textContent,
    "Sin cambios",
  );
  await fill("name", "Doble superior");
  assert.equal(
    container.querySelector('#property-setup-form [role="status"]')?.textContent,
    "Cambios sin guardar",
  );
  await fill("baseRate", "175.50");
  await fill("maxAdults", "4");
  await fill("maxChildren", "0");
  await fill("rooms[0].number", "201");
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
    throw new Error("Secure-context UUID API unavailable on HTTP LAN origins");
  });
  await fill("roomNumber", "202");
  await React.act(async () =>
    input("roomNumber").dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    ),
  );
  assert.equal(input("roomNumber").value, "");
  assert.equal(window.document.activeElement, input("roomNumber"));
  await fill("roomNumber", " 203 ");
  await click("Guardar cambios");
  await until(
    () => writes.length === 1 && button("Guardar cambios").disabled && !input("name").disabled,
    "Successful save must reset the draft",
  );
  assert.deepEqual(writes[0], {
    roomTypeId: "double",
    name: "Doble superior",
    maxAdults: 4,
    maxChildren: 0,
    baseRateCents: 17550,
    rooms: [{ number: "203" }, { number: "202" }, { id: "room-101", number: "201" }],
  });
  assert.equal(input("roomNumber").value, "");
  assert.equal(input("rooms[2].number").value, "201");
  assert.equal(container.textContent.includes("Nueva"), false);
  assert.equal(
    container.querySelector('#property-setup-form [role="status"]')?.textContent,
    "Sin cambios",
  );
});

it("keeps the draft and identifies a room-number conflict reported during saving, then allows correction", async () => {
  api.on("POST", "/setup", () => {
    if (writes.length === 1) {
      catalog.rooms.push({ id: "other-room", number: "202", roomTypeId: "suite" });
      return Response.json(
        { error: "room number already exists" },
        { status: 409, headers: { "X-Error-Field": "rooms[0].number" } },
      );
    }
  });
  await render();
  await openType();
  await fill("name", "Doble superior");
  await fill("roomNumber", "202");
  await click("Guardar cambios");
  await until(
    () => input("roomNumber").getAttribute("aria-invalid") === "true",
    "Conflicting room must be identified",
  );
  assert.equal(input("name").value, "Doble superior");
  assert.equal(input("rooms[0].number").value, "101");
  assert.equal(input("roomNumber").value, "202");
  assert.ok(container.textContent.includes("Este número de habitación ya está en uso."));
  await fill("roomNumber", "203");
  await click("Guardar cambios");
  await until(
    () => writes.length === 2 && button("Guardar cambios").disabled && !input("name").disabled,
    "Corrected draft must save",
  );
});

it("protects unsaved edits when closing the editor and supports staying or explicitly discarding", async () => {
  await render();
  await openType();
  await fill("name", "My unsaved type");
  await click("Habitaciones");
  assert.equal(input("name").value, "My unsaved type");
  assert.ok(window.document.querySelector('[role="alertdialog"]'));
  await click("Seguir editando");
  assert.equal(input("name").value, "My unsaved type");
  await click("Habitaciones");
  await click("Descartar cambios");
  await openType("Suite");
  assert.equal(input("name").value, "Suite");
  assert.equal(writes.length, 0);
});

function signedInAs(role: "owner" | "staff") {
  api.on("GET", "/session", () => ({
    username: role === "owner" ? "propietario" : "hotelmanantial",
    role,
    propertyTimeZone: "America/Lima",
  }));
}

type PaymentAdmission = { admitted: boolean; updatedAt: string | null };

function savedPaymentAdmission(initial: PaymentAdmission) {
  let saved = initial;
  api.on("GET", "/controls/public-payments", () => saved);
  api.on<{ admitted: boolean }>("PUT", "/controls/public-payments", ({ body }) => {
    saved = { admitted: body.admitted, updatedAt: "2026-11-13T20:45:00.000Z" };
    return saved;
  });
  return api.bodies<{ admitted: boolean }>("PUT", "/controls/public-payments");
}

function paymentSwitch() {
  const element = container.querySelector<HTMLElement>('[role="switch"]');
  assert.ok(element, "The Pagos en línea switch must render");
  return element;
}

async function togglePayments() {
  const element = paymentSwitch();
  await React.act(async () => element.click());
}

async function renderPayments() {
  await render("/setup?section=payments");
  await until(() => !!container.querySelector('[role="switch"]'), "Payment settings must load");
}

it("lets the owner pause online payments at once and resume them only after confirming, and keeps the saved state after a reload", async () => {
  signedInAs("owner");
  const saves = savedPaymentAdmission({ admitted: true, updatedAt: "2026-11-10T14:05:00.000Z" });
  await renderPayments();
  assert.equal(paymentSwitch().getAttribute("aria-checked"), "true");
  assert.match(container.textContent, /Activados · Último cambio: 10 de noviembre de 2026/);

  await togglePayments();
  await until(() => paymentSwitch().getAttribute("aria-checked") === "false");
  assert.deepEqual(saves, [{ admitted: false }]);
  assert.match(container.textContent, /Pausados · Último cambio: 13 de noviembre de 2026/);

  await togglePayments();
  await until(() => !!window.document.querySelector('[role="alertdialog"]'));
  await click("Cancelar");
  await until(() => !window.document.querySelector('[role="alertdialog"]'));
  assert.equal(paymentSwitch().getAttribute("aria-checked"), "false");
  assert.equal(saves.length, 1, "Cancelling the confirmation must not resume payments");

  await togglePayments();
  await until(() => !!window.document.querySelector('[role="alertdialog"]'));
  await click("Activar pagos");
  await until(() => paymentSwitch().getAttribute("aria-checked") === "true");
  assert.deepEqual(saves, [{ admitted: false }, { admitted: true }]);

  await page.cleanup();
  page = browser.createPage();
  ({ api, container, until } = page);
  signedInAs("owner");
  savedPaymentAdmission({ admitted: true, updatedAt: "2026-11-13T20:45:00.000Z" });
  await renderPayments();
  assert.equal(paymentSwitch().getAttribute("aria-checked"), "true");
  assert.match(container.textContent, /Activados · Último cambio: 13 de noviembre de 2026/);
});

it("hides Pagos from staff and sends a direct visit to Habitaciones without reading the payment switch", async () => {
  page.mobile();
  signedInAs("staff");
  await render("/setup?section=payments");
  await until(
    () => container.querySelector("main h1")?.textContent === "Habitaciones",
    "Staff land on a section they can use",
  );
  assert.equal(router.state.location.search.section, undefined);
  await click("Alternar navegación");
  assert.deepEqual(
    Array.from(
      window.document.querySelectorAll('nav[aria-label="Navegación principal"] a[href^="/setup"]'),
    ).map((link) => link.textContent.trim()),
    ["Habitaciones", "Apariencia"],
  );
  assert.equal(api.requests("GET", "/controls/public-payments").length, 0);
});

it("retains an unsaved rate adjustment after a failed save so the owner can retry", async () => {
  signedInAs("owner");
  const plan = {
    plan: "non_refundable",
    priceAdjustmentPercent: -10,
    cancellationPolicy: { chargeBasis: "final_total", freeUntilDaysBeforeCheckIn: null },
    paymentSchedule: "full_upfront",
  };
  let saved = plan;
  const path = "/rate-plans/non-refundable";
  api.on("GET", "/rate-plans", () => [saved]);
  api.on<{ reductionPercent: number }>("PUT", path, ({ body }) => {
    saved = { ...plan, priceAdjustmentPercent: -body.reductionPercent };
    return [saved];
  });
  api.failOnce("PUT", path, 503);
  const saves = api.bodies<{ reductionPercent: number }>("PUT", path);
  await render("/setup?section=rate-plans");
  await until(() => !!container.querySelector('input[name="reductionPercent"]'));

  await fill("reductionPercent", "20");
  await click("Guardar");
  await until(() => container.textContent.includes("No se pudo guardar el ajuste"));
  assert.equal(input("reductionPercent").value, "20");
  assert.match(container.textContent, /No reembolsable\s+−10%/);

  await click("Guardar");
  await until(() => /No reembolsable\s+−20%/.test(container.textContent));
  assert.deepEqual(saves, [{ reductionPercent: 20 }, { reductionPercent: 20 }]);
});
