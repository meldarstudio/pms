import assert from "node:assert/strict";
import type { HTMLElement } from "happy-dom";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { PropertySetupInput } from "../src/lib/api.ts";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";
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
  browser = await createBrowserTest();
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
  // Saved setup replaces the type's rooms in the catalog that later reads return.
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

afterAll(async () => {
  await browser?.close();
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

function linkByText(label: string) {
  return Array.from(container.querySelectorAll("a")).find(
    (element) => element.textContent.trim() === label,
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

async function selectSection(label: string) {
  const trigger = container.querySelector(
    '[role="combobox"][aria-label="Secciones de configuración"]',
  );
  assert.ok(trigger);
  await React.act(async () => (trigger as HTMLElement).click());
  await until(() => !!window.document.querySelector('[role="option"]'));
  const option = Array.from(window.document.querySelectorAll('[role="option"]')).find(
    (element) => element.textContent.trim() === label,
  );
  assert.ok(option, `Section ${label} must be available`);
  await React.act(async () => (option as HTMLElement).click());
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
    catalog.roomTypes = [...roomTypes];
    catalog.rooms = [];
    await render(path);
    await until(() => container.textContent.includes(title), "Setup guidance must appear");
    assert.equal(router.state.location.pathname, path.split("?")[0]);
    const originalLocation = router.state.location.href;
    const link = linkByText(action);
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
        container.textContent.includes("Habitaciones"),
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
  await fill("name", "Doble superior");
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

it("saves before closing and prevents discarding or editing while that save is pending", async () => {
  const save = api.hold("POST", "/setup");
  await render();
  await openType();
  await fill("baseRate", "180");
  await click("Habitaciones");
  await click("Guardar y continuar");
  await until(() => !!save.request, "Save must start");
  assert.equal(input("name").value, "Doble");
  assert.equal(input("name").disabled, true);
  assert.equal(button("Agregar habitación").disabled, true);
  assert.equal(
    container
      .querySelector('[role="combobox"][aria-label="Secciones de configuración"]')
      ?.hasAttribute("disabled"),
    true,
  );
  await click("Reservas");
  await until(
    () => window.document.body.textContent.includes("Guardando cambios"),
    "Navigation must remain blocked during the save",
  );
  assert.equal(button("Descartar cambios").disabled, true);
  assert.equal(button("Seguir editando").disabled, true);
  await React.act(async () =>
    save.release(
      Response.json({ roomType: { ...double, baseRateCents: 18000 }, rooms: catalog.rooms }),
    ),
  );
  await until(
    () => !container.querySelector('input[name="name"]'),
    "Editor must close after saving",
  );
  await openType();
  assert.equal(button("Guardar cambios").disabled, true);
  assert.equal(writes[0].baseRateCents, 18000);
});

it.each(["mobile"])("protects a setup draft through %s sidebar navigation", async (viewport) => {
  if (viewport === "mobile") page.mobile();
  await render();
  await openType();
  await fill("roomNumber", "909");
  await click("Alternar navegación");
  assert.equal(input("roomNumber").value, "909", "Toggling navigation must not remount the editor");
  if (viewport === "desktop") await click("Alternar navegación");
  await click("Reservas");
  await until(
    () => !!window.document.querySelector('[role="alertdialog"]'),
    "Navigation must ask before discarding",
  );
  assert.equal(router.state.location.pathname, "/setup");
  await click("Seguir editando");
  assert.equal(input("roomNumber").value, "909");
  if (viewport === "mobile") await click("Alternar navegación");
  await click("Reservas");
  await click("Descartar cambios");
  await until(
    () => router.state.location.pathname === "/reservations",
    "Explicit discard must allow navigation",
  );
});

it("keeps a successfully created type visible even when the follow-up list refresh fails", async () => {
  let failRefresh = false;
  api.on("POST", "/setup", () => {
    failRefresh = true;
    return Response.json({
      roomType: {
        ...double,
        id: "new-type",
        name: "Individual",
        baseRateCents: 8550,
        maxAdults: 1,
      },
      rooms: [{ id: "new-room", number: "301", roomTypeId: "new-type" }],
    });
  });
  api.on("GET", /^\/(rooms|room-types)$/, () =>
    failRefresh ? Response.json({ error: "Refresh failed" }, { status: 500 }) : undefined,
  );
  await render();
  await until(() => container.textContent.includes("Agregar tipo"));
  await click("Agregar");
  await fill("name", "Individual");
  await fill("baseRate", "85.50");
  await fill("roomNumber", "301");
  await click("Guardar cambios");
  await until(() => writes.length === 1 && !input("name").disabled, "Save must finish");
  assert.deepEqual(writes[0], {
    name: "Individual",
    baseRateCents: 8550,
    maxAdults: 1,
    maxChildren: 2,
    rooms: [{ number: "301" }],
  });
  assert.equal(input("name").value, "Individual");
  assert.ok(container.textContent.includes("Individual"));
  assert.equal(button("Guardar cambios").disabled, true);
});

it("does not close after a failed save-and-continue or a later ordinary save", async () => {
  api.on("POST", "/setup", () =>
    writes.length === 1
      ? Response.json({ error: "room type already exists" }, { status: 409 })
      : undefined,
  );
  await render();
  await openType();
  await fill("name", "Suite");
  await click("Habitaciones");
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
    () => writes.length === 2 && button("Guardar cambios").disabled && !input("name").disabled,
    "Corrected ordinary save must finish",
  );
  assert.equal(input("name").value, "Doble superior");
});

it("keeps inventory editable when room types exist without rooms", async () => {
  catalog.roomTypes = [double];
  catalog.rooms = [];
  api.on("GET", "/inventory", ({ url }) => ({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    currency: "PEN",
    roomTypes: [{ ...double, capacity: 0, nights: [] }],
  }));
  await render("/inventory?from=2026-10-14&span=7");
  await until(() => container.textContent.includes("Doble"));
  assert.equal(container.textContent.includes("Configura tu alojamiento"), false);
  assert.equal(container.textContent.includes("Aún no hay habitaciones"), false);
});

it("blocks an invalid whole draft without staging pending text, then clears all edits on discard", async () => {
  await render();
  await openType();
  await fill("baseRate", "invalid");
  await fill("roomNumber", "202");
  await click("Guardar cambios");
  await until(() => input("baseRate").getAttribute("aria-invalid") === "true");
  assert.equal(writes.length, 0);
  assert.equal(input("roomNumber").value, "202");
  assert.equal(container.querySelector('[name="rooms[1].number"]'), null);
  await fill("baseRate", "180");
  await fill("roomNumber", "101");
  await click("Guardar cambios");
  assert.equal(writes.length, 0, "A duplicate pending number blocks the entire request");
  await fill("roomNumber", "202");
  await click("Agregar habitación");
  await fill("roomNumber", "203");
  await click("Descartar");
  assert.equal(input("roomNumber").value, "");
  assert.equal(input("rooms[0].number").value, "101");
  assert.equal(input("baseRate").value, "150.00");
  assert.equal(container.querySelector('[name="rooms[1].number"]'), null);
  assert.equal(button("Guardar cambios").disabled, true);
});

it("saves room-number swaps atomically and keeps opening values across successful background refreshes", async () => {
  catalog.rooms.push({ id: "room-102", number: "102", roomTypeId: "double" });
  await render();
  await openType();
  await fill("rooms[0].number", "102");
  catalog.roomTypes = [{ ...double, name: "Remote edit" }, suite];
  await React.act(async () => {
    await page.client.invalidateQueries({ queryKey: ["room-types"] });
  });
  assert.equal(input("name").value, "Doble");
  assert.equal(input("rooms[0].number").value, "102");
  await fill("rooms[1].number", "101");
  await click("Guardar cambios");
  await until(
    () => writes.length === 1 && button("Guardar cambios").disabled && !input("name").disabled,
  );
  assert.deepEqual(writes[0].rooms, [
    { id: "room-101", number: "102" },
    { id: "room-102", number: "101" },
  ]);
});

it("saves a pending number before router navigation and permits a new type without rooms", async () => {
  await render();
  await openType();
  await fill("roomNumber", "202");
  await click("Reservas");
  await until(() => !!window.document.querySelector('[role="alertdialog"]'));
  await click("Guardar y continuar");
  await until(() => router.state.location.pathname === "/reservations");
  assert.deepEqual(writes[0].rooms, [{ number: "202" }, { id: "room-101", number: "101" }]);
  await React.act(async () => router.navigate({ to: "/setup" }));
  await until(() => container.textContent.includes("Agregar tipo"));
  await click("Agregar");
  await fill("name", "Individual");
  await fill("baseRate", "80");
  await click("Guardar cambios");
  await until(
    () => writes.length === 2 && button("Guardar cambios").disabled && !input("name").disabled,
  );
  assert.deepEqual(writes[1].rooms, []);
});

it("maps a staged room conflict correctly when a pending number precedes it in the request", async () => {
  api.on("POST", "/setup", () =>
    Response.json(
      { error: "room number already exists" },
      {
        status: 409,
        headers: { "X-Error-Field": "rooms[1].number" },
      },
    ),
  );
  await render();
  await openType();
  await fill("roomNumber", "202");
  await click("Agregar habitación");
  await fill("roomNumber", "203");
  await click("Guardar cambios");
  await until(() => input("rooms[0].number").getAttribute("aria-invalid") === "true");
  assert.equal(input("rooms[0].number").value, "202");
  assert.equal(input("roomNumber").value, "203");
  assert.equal(input("roomNumber").getAttribute("aria-invalid"), "false");
});

it("retains pending text on failed router save-and-continue and protects same-route section changes", async () => {
  api.failOnce("POST", "/setup", 409, { error: "room type already exists" });
  await render();
  await openType();
  await fill("roomNumber", "202");
  await click("Reservas");
  await until(() => !!window.document.querySelector('[role="alertdialog"]'));
  await click("Guardar y continuar");
  await until(() => input("name").getAttribute("aria-invalid") === "true");
  assert.equal(router.state.location.pathname, "/setup");
  assert.equal(input("roomNumber").value, "202");
  await fill("name", "Doble renovada");
  await click("Guardar cambios");
  await until(
    () => writes.length === 2 && !input("name").disabled && button("Guardar cambios").disabled,
  );
  assert.equal(router.state.location.pathname, "/setup");
  await fill("roomNumber", "204");
  await React.act(async () => page.mobile());
  await selectSection("Apariencia");
  await until(() => !!window.document.querySelector('[role="alertdialog"]'));
  assert.equal(router.state.location.search.section, undefined);
  assert.equal(input("roomNumber").value, "204");
  assert.ok(
    container
      .querySelector('[role="combobox"][aria-label="Secciones de configuración"]')
      ?.textContent.includes("Habitaciones"),
  );
  await click("Seguir editando");
  assert.equal(input("roomNumber").value, "204");
  await selectSection("Apariencia");
  await until(() => !!window.document.querySelector('[role="alertdialog"]'));
  await click("Descartar cambios");
  await until(() => !!container.querySelector("#configuration-theme"));
  assert.equal(router.state.location.search.section, "appearance");
  await selectSection("Habitaciones");
  await openType("Doble renovada");
  assert.equal(input("roomNumber").value, "");
});

it.each([false, true])(
  "applies appearance through the real selector (storage unavailable: %s)",
  async (unavailable) => {
    if (unavailable) {
      vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
        throw new Error("Storage denied");
      });
      vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
        throw new Error("Storage denied");
      });
    } else window.localStorage.setItem("theme", "light");
    await render("/setup?section=appearance");
    await until(() => !!container.querySelector("#configuration-theme"));
    await React.act(async () =>
      (container.querySelector("#configuration-theme") as HTMLElement).click(),
    );
    await until(() =>
      Array.from(window.document.querySelectorAll('[role="option"]')).some(
        (element) => element.textContent.trim() === "Oscuro",
      ),
    );
    const option = Array.from(window.document.querySelectorAll('[role="option"]')).find(
      (element) => element.textContent.trim() === "Oscuro",
    )!;
    await React.act(async () => (option as HTMLElement).click());
    await until(() => window.document.documentElement.classList.contains("dark"));
    assert.ok(container.querySelector("#configuration-theme")?.textContent.includes("Oscuro"));
    if (!unavailable) assert.equal(window.localStorage.getItem("theme"), "dark");
    assert.equal(writes.length, 0, "Appearance must not write property settings");
  },
);
