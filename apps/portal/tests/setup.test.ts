import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
import { Window, type HTMLDivElement, type HTMLInputElement } from "happy-dom";
import { createServer, type ViteDevServer } from "vite";
import type { Root } from "react-dom/client";
import type { QueryClient } from "@tanstack/react-query";
import type { PropertySetupInput, ReservationDetail, Room, RoomType } from "../src/lib/api.ts";

let window: Window;
let server: ViteDevServer;
let React: typeof import("react");
let createRoot: (typeof import("react-dom/client"))["createRoot"];
let query: typeof import("@tanstack/react-query");
let routing: typeof import("@tanstack/react-router");
let routes: typeof import("../src/router.tsx");
let router: typeof routes.router;
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  window = new Window({ url: "http://localhost:5173" });
  for (const name of [
    "window",
    "self",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "Element",
    "SVGElement",
    "HTMLButtonElement",
    "HTMLSelectElement",
    "Node",
    "NodeFilter",
    "Text",
    "Document",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "PointerEvent",
    "MutationObserver",
    "ResizeObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "scrollTo",
  ]) {
    const value = name === "window" ? window : Reflect.get(window, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: typeof value === "function" && /^[a-z]/.test(name) ? value.bind(window) : value,
    });
  }
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  React = await import("react");
  ({ createRoot } = await import("react-dom/client"));
  query = await import("@tanstack/react-query");
  routing = await import("@tanstack/react-router");
  server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    mode: "development",
  });
  routes = (await server.ssrLoadModule("/src/router.tsx")) as typeof routes;
});

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  client = new query.QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  client.clear();
  container.remove();
  globalThis.fetch = originalFetch;
});

afterAll(async () => {
  await server?.close();
  await window?.happyDOM.close();
});

const double = { id: "double", name: "Doble", maxOccupancy: 2, baseRateCents: 15000 };
const suite = { id: "suite", name: "Suite", maxOccupancy: 4, baseRateCents: 25000 };
let types: RoomType[];
let rooms: Room[];
let writes: PropertySetupInput[];

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}

function mockApi(
  save?: (body: PropertySetupInput) => Response | undefined | Promise<Response | undefined>,
) {
  types = [double, suite];
  rooms = [{ id: "room-101", number: "101", roomTypeId: "double" }];
  writes = [];
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.pathname === "/room-types") return Response.json(types);
    if (url.pathname === "/rooms") return Response.json(rooms);
    if (url.pathname === "/inventory")
      return Response.json({
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        currency: "PEN",
        roomTypes: [],
      });
    if (url.pathname === "/setup" && init?.method === "POST") {
      assert.ok(typeof init.body === "string");
      const body = JSON.parse(init.body) as PropertySetupInput;
      writes.push(body);
      const response = await save?.(body);
      if (response) return response;
      const roomType = { ...double, ...body, id: body.roomTypeId ?? "new-type" };
      const savedRooms = body.rooms.map((room, i) => ({
        ...room,
        id: room.id ?? `new-${i}`,
        roomTypeId: roomType.id,
      }));
      types = [...types.filter((type) => type.id !== roomType.id), roomType];
      rooms = [...rooms.filter((room) => room.roomTypeId !== roomType.id), ...savedRooms];
      return Response.json({ roomType, rooms: savedRooms });
    }
    if (url.pathname === "/reservations" || url.pathname === "/room-closures")
      return Response.json([]);
    throw new Error(`Unexpected request ${url.pathname}`);
  };
}

async function render(path = "/setup") {
  router = routing.createRouter({
    routeTree: routes.router.routeTree,
    history: routing.createMemoryHistory({ initialEntries: [path] }),
  });
  await React.act(async () => {
    await router.load();
    root.render(
      React.createElement(
        query.QueryClientProvider,
        { client },
        React.createElement(routing.RouterProvider, { router }),
      ),
    );
  });
}

async function until(condition: () => boolean, message: string) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.ok(condition(), message);
}

function input(name: string) {
  const element = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  assert.ok(element, `Missing input ${name}`);
  return element;
}

async function fill(name: string, value: string) {
  await React.act(async () => {
    const element = input(name);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function button(label: string) {
  const element = Array.from(window.document.querySelectorAll("button")).find(
    (button) => button.textContent.trim() === label || button.getAttribute("aria-label") === label,
  );
  assert.ok(element, `Missing button ${label}`);
  return element;
}

async function click(label: string) {
  await React.act(async () => button(label).click());
}

it.each([
  ["/calendar?from=2026-10-14&span=14", [], "Configura tu alojamiento", "Configurar alojamiento"],
  [
    "/calendar?from=2026-10-14&span=14",
    [double],
    "Aún no hay habitaciones",
    "Agregar habitaciones",
  ],
  [
    "/reservations?q=Ana&status=confirmed",
    [],
    "Configura tu alojamiento",
    "Configurar alojamiento",
  ],
  [
    "/reservations?q=Ana&status=confirmed",
    [double],
    "Aún no hay habitaciones",
    "Agregar habitaciones",
  ],
  ["/inventory?from=2026-10-14&span=7", [], "Configura tu alojamiento", "Configurar alojamiento"],
] as const)(
  "keeps %s accessible with its setup CTA (room types: %j)",
  async (path, roomTypes, title, action) => {
    mockApi();
    types = [...roomTypes];
    rooms = [];
    await render(path);
    await until(() => container.textContent.includes(title), "Setup guidance must appear");
    assert.equal(router.state.location.pathname, path.split("?")[0]);
    const originalLocation = router.state.location.href;
    const link = container.querySelector('a[href="/setup"]');
    assert.ok(link);
    assert.equal(link.textContent.trim(), action);
    await React.act(async () =>
      link.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      ),
    );
    await until(
      () =>
        router.state.location.pathname === "/setup" &&
        !!container.querySelector('input[name="name"]'),
      "Setup CTA must open configuration through the app router",
    );
    await React.act(async () => router.history.back());
    await until(
      () =>
        router.state.location.href === originalLocation && container.textContent.includes(title),
      "Back must restore the original page and its search without forcing setup",
    );
  },
);

it("keeps a direct reservation detail link accessible when no physical rooms exist", async () => {
  mockApi();
  rooms = [];
  const reservation: ReservationDetail = {
    id: "reservation-1",
    code: "TEST0001",
    status: "confirmed",
    notes: null,
    cancellationReason: null,
    cancelledAt: null,
    savedDiscountCents: 0,
    creditCents: 0,
    guestId: "contact-1",
    guest: { id: "contact-1", fullName: "Ana Pérez", phone: null, email: null, notes: null },
    stayingGuests: [],
    checkIn: "2026-10-14",
    checkOut: "2026-10-16",
    source: "direct",
    currency: "PEN",
    totalCents: 30000,
    subtotalCents: 30000,
    discountCents: 0,
    paidCents: 0,
    balanceCents: 30000,
    payments: [],
    rooms: [
      {
        id: "line-1",
        roomTypeId: "double",
        roomTypeName: "Doble",
        roomId: null,
        roomNumber: null,
        adults: 1,
        children: 0,
        subtotalCents: 30000,
        discountCents: 0,
        totalCents: 30000,
        nights: [],
      },
    ],
  };
  const fetchApi = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    requestUrl(input).pathname === "/reservations/reservation-1"
      ? Response.json(reservation)
      : fetchApi(input, init);
  await render("/reservations/reservation-1");
  await until(
    () =>
      container.textContent.includes("Reserva TEST0001") &&
      container.textContent.includes("Ana Pérez"),
    "Reservation details must render without forcing setup",
  );
  assert.equal(router.state.location.pathname, "/reservations/reservation-1");
});

it("edits a room type and adds several room numbers in the real table with one save", async () => {
  mockApi();
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  assert.equal(input("name").value, "Doble");
  await fill("name", "Doble superior");
  await fill("baseRate", "175.50");
  await fill("rooms[0].number", "201");
  await click("Agregar habitación");
  await fill("rooms[1].number", "202");
  await click("Agregar habitación");
  await fill("rooms[2].number", "203");
  await click("Guardar cambios");
  await until(
    () => writes.length === 1 && button("Guardar cambios").disabled,
    "Successful save must reset the draft",
  );
  assert.deepEqual(writes[0], {
    roomTypeId: "double",
    name: "Doble superior",
    maxOccupancy: 2,
    baseRateCents: 17550,
    rooms: [{ id: "room-101", number: "201" }, { number: "202" }, { number: "203" }],
  });
  assert.equal(container.querySelectorAll("tbody tr").length, 3);
});

it("keeps the draft and identifies a room-number conflict reported during saving, then allows correction", async () => {
  mockApi(() => {
    if (writes.length === 1) {
      rooms.push({ id: "other-room", number: "202", roomTypeId: "suite" });
      return Response.json(
        { error: "room number already exists" },
        { status: 409, headers: { "X-Error-Field": "rooms[1].number" } },
      );
    }
  });
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await fill("name", "Doble superior");
  await click("Agregar habitación");
  await fill("rooms[1].number", "202");
  await click("Guardar cambios");
  await until(
    () => input("rooms[1].number").getAttribute("aria-invalid") === "true",
    "Conflicting room must be identified",
  );
  assert.equal(input("name").value, "Doble superior");
  assert.equal(input("rooms[0].number").value, "101");
  assert.equal(input("rooms[1].number").value, "202");
  assert.ok(container.textContent.includes("Este número de habitación ya está en uso."));
  await fill("rooms[1].number", "203");
  await click("Guardar cambios");
  await until(
    () => writes.length === 2 && button("Guardar cambios").disabled,
    "Corrected draft must save",
  );
});

it("protects unsaved edits when switching types and supports staying or explicitly discarding", async () => {
  mockApi();
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await fill("name", "My unsaved type");
  await click("Suite");
  assert.equal(input("name").value, "My unsaved type");
  assert.ok(window.document.querySelector('[role="alertdialog"]'));
  await click("Seguir editando");
  assert.equal(input("name").value, "My unsaved type");
  await click("Suite");
  await click("Descartar cambios");
  await until(() => input("name").value === "Suite", "Discard must open the selected type");
  assert.equal(writes.length, 0);
});

it("saves before switching and prevents switching away while that save is pending", async () => {
  let finish!: (response: Response) => void;
  mockApi(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await fill("baseRate", "180");
  await click("Suite");
  await click("Guardar y continuar");
  await until(() => !!finish, "Save must start");
  assert.equal(input("name").value, "Doble");
  assert.equal(button("Suite").disabled, true);
  await click("Reservas");
  await until(
    () => window.document.body.textContent.includes("Guardando cambios"),
    "Navigation must remain blocked during the save",
  );
  assert.equal(button("Descartar cambios").disabled, true);
  await click("Seguir editando");
  await React.act(async () =>
    finish(Response.json({ roomType: { ...double, baseRateCents: 18000 }, rooms })),
  );
  await until(() => input("name").value === "Suite", "Switch must happen after saving");
  assert.equal(writes[0].baseRateCents, 18000);
});

it("lets an empty property open its calendar and choose setup before saving its first room", async () => {
  mockApi();
  types = [];
  rooms = [];
  await render("/");
  await until(
    () =>
      router.state.location.pathname === "/calendar" &&
      container.textContent.includes("Configura tu alojamiento"),
    "Empty property must stay on the calendar with setup guidance",
  );
  await click("Configuración");
  await until(
    () =>
      router.state.location.pathname === "/setup" &&
      !!container.querySelector('input[name="name"]'),
    "Configuration tab must open setup",
  );
  await fill("name", "Individual");
  await fill("baseRate", "85");
  await click("Guardar cambios");
  await until(
    () => writes.length === 1 && button("Guardar cambios").disabled,
    "Empty type must save",
  );
  assert.equal(router.state.location.pathname, "/setup");
  assert.deepEqual(writes[0].rooms, []);
  assert.equal(
    container.querySelector('a[href^="/calendar"]'),
    null,
    "An empty type is not ready for reservations",
  );
  await click("Agregar habitación");
  await fill("rooms[0].number", "101");
  await click("Guardar cambios");
  await until(
    () => !!container.querySelector('a[href^="/calendar"]'),
    "First saved room must unlock the calendar",
  );
  await React.act(async () =>
    container
      .querySelector('a[href^="/calendar"]')!
      .dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      ),
  );
  await until(
    () => router.state.location.pathname === "/calendar",
    "Continue must open the calendar",
  );
});

it("identifies duplicate numbers within the draft before sending any changes", async () => {
  mockApi();
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await click("Agregar habitación");
  await fill("rooms[1].number", " 101 ");
  await click("Guardar cambios");
  assert.equal(writes.length, 0);
  assert.equal(input("rooms[0].number").getAttribute("aria-invalid"), "true");
  assert.equal(input("rooms[1].number").getAttribute("aria-invalid"), "true");
});

it("protects a setup draft when leaving through the app navigation", async () => {
  mockApi();
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await fill("name", "Unsaved name");
  await click("Reservas");
  await until(
    () => !!window.document.querySelector('[role="alertdialog"]'),
    "Navigation must ask before discarding",
  );
  assert.equal(router.state.location.pathname, "/setup");
  await click("Seguir editando");
  assert.equal(input("name").value, "Unsaved name");
  await click("Reservas");
  await click("Descartar cambios");
  await until(
    () => router.state.location.pathname === "/reservations",
    "Explicit discard must allow navigation",
  );
});

it("creates a new type with its room table and can remove an extra unsaved row", async () => {
  mockApi();
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await click("Agregar tipo de habitación");
  await fill("name", "Individual");
  await fill("baseRate", "85.50");
  await click("Agregar habitación");
  await fill("rooms[0].number", "301");
  await click("Agregar habitación");
  await fill("rooms[1].number", "302");
  await click("Agregar habitación");
  await click("Quitar fila 3");
  await click("Guardar cambios");
  await until(
    () => writes.length === 1 && button("Guardar cambios").disabled,
    "New type and rooms must save together",
  );
  assert.deepEqual(writes[0], {
    name: "Individual",
    baseRateCents: 8550,
    maxOccupancy: 1,
    rooms: [{ number: "301" }, { number: "302" }],
  });
  assert.equal(
    container.querySelector('button[aria-label^="Quitar fila"]'),
    null,
    "Saved rooms cannot be deleted here",
  );
});

it("identifies a server-side room conflict without requiring a follow-up list request", async () => {
  let failRefresh = false;
  let refreshRequests = 0;
  mockApi(() => {
    failRefresh = true;
    return Response.json(
      { error: "room number already exists" },
      { status: 409, headers: { "X-Error-Field": "rooms[1].number" } },
    );
  });
  const fetchApi = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (failRefresh && requestUrl(input).pathname === "/rooms") {
      refreshRequests++;
      return Response.json({ error: "Refresh failed" }, { status: 500 });
    }
    return fetchApi(input, init);
  };
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await fill("name", "Keep my draft");
  await click("Agregar habitación");
  await fill("rooms[1].number", "202");
  await click("Guardar cambios");
  await until(
    () => container.textContent.includes("Este número de habitación ya está en uso."),
    "The save error must remain visible despite the refresh failure",
  );
  assert.equal(input("name").value, "Keep my draft");
  assert.equal(input("rooms[1].number").value, "202");
  assert.equal(input("rooms[1].number").getAttribute("aria-invalid"), "true");
  assert.equal(refreshRequests, 0);
});

it("validates name, money, and occupancy before writing and clears errors as fields are corrected", async () => {
  mockApi();
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await fill("name", " ");
  await fill("baseRate", "85.555");
  await React.act(async () =>
    input("baseRate").dispatchEvent(new window.FocusEvent("focusout", { bubbles: true })),
  );
  assert.equal(
    input("baseRate").getAttribute("aria-invalid"),
    "true",
    "Invalid fields validate on blur",
  );
  await fill("maxOccupancy", "0");
  await click("Guardar cambios");
  assert.equal(writes.length, 0);
  for (const field of ["name", "baseRate", "maxOccupancy"])
    assert.equal(input(field).getAttribute("aria-invalid"), "true");
  await fill("name", "Individual");
  await fill("baseRate", "85.55");
  await fill("maxOccupancy", "1");
  for (const field of ["name", "baseRate", "maxOccupancy"])
    assert.equal(input(field).getAttribute("aria-invalid"), "false");
  await click("Guardar cambios");
  await until(() => writes.length === 1, "Corrected fields must save");
});

it("keeps a successfully created type visible even when the follow-up list refresh fails", async () => {
  let failRefresh = false;
  mockApi(() => {
    failRefresh = true;
    return Response.json({
      roomType: {
        ...double,
        id: "new-type",
        name: "Individual",
        baseRateCents: 8500,
        maxOccupancy: 1,
      },
      rooms: [],
    });
  });
  const fetchApi = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (failRefresh && ["/rooms", "/room-types"].includes(requestUrl(input).pathname))
      return Response.json({ error: "Refresh failed" }, { status: 500 });
    return fetchApi(input, init);
  };
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await click("Agregar tipo de habitación");
  await fill("name", "Individual");
  await fill("baseRate", "85");
  await click("Guardar cambios");
  await until(() => writes.length === 1 && !input("name").disabled, "Save must finish");
  assert.equal(input("name").value, "Individual");
  assert.ok(button("Individual"));
  assert.equal(button("Guardar cambios").disabled, true);
});

it("does not switch types after a failed save-and-continue or a later ordinary save", async () => {
  mockApi(() =>
    writes.length === 1
      ? Response.json({ error: "room type already exists" }, { status: 409 })
      : undefined,
  );
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await fill("name", "Suite");
  await click("Suite");
  await click("Guardar y continuar");
  await until(
    () => input("name").getAttribute("aria-invalid") === "true",
    "Duplicate type must be identified",
  );
  assert.equal(input("name").value, "Suite");
  assert.equal(
    input("baseRate").value,
    "150.00",
    "Failed save must retain the original type's draft",
  );
  await fill("name", "Doble superior");
  await click("Guardar cambios");
  await until(
    () => writes.length === 2 && button("Guardar cambios").disabled,
    "Corrected ordinary save must finish",
  );
  assert.equal(input("name").value, "Doble superior");
});

it("keeps the normal calendar landing for a configured hotel and makes setup accessible from its tab", async () => {
  mockApi();
  await render("/");
  await until(
    () => router.state.location.pathname === "/calendar" && container.textContent.includes("101"),
    "Configured hotel must load its calendar",
  );
  await click("Configuración");
  await until(
    () =>
      router.state.location.pathname === "/setup" &&
      !!container.querySelector('input[name="name"]'),
    "Configuration tab must open setup",
  );
});
