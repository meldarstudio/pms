import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
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

beforeAll(async () => {
  browser = await createBrowserTest();
  ({ window, React } = browser);
  const { server } = browser;
  routes = (await server.ssrLoadModule("/src/router.tsx")) as typeof routes;
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
});

afterAll(async () => {
  await browser?.close();
});

async function render(path = "/setup") {
  router = browser.routing.createRouter({
    routeTree: routes.router.routeTree,
    history: browser.routing.createMemoryHistory({ initialEntries: [path] }),
  });
  await page.renderRouter(router);
}

function linkByText(label: string) {
  return Array.from(container.querySelectorAll("a")).find(
    (element) => element.textContent.trim() === label,
  );
}

async function click(label: string) {
  const link = Array.from(
    window.document.querySelectorAll('nav[aria-label="Navegación principal"] a'),
  ).find((element) => element.textContent.trim() === label);
  await React.act(async () => {
    if (link) {
      link.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      );
    } else button(label).click();
  });
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

it("edits a room type and adds several room numbers in the real table with one save", async () => {
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  assert.equal(input("name").value, "Doble");
  await fill("name", "Doble superior");
  await fill("baseRate", "175.50");
  await fill("maxAdults", "4");
  await fill("maxChildren", "0");
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
    maxAdults: 4,
    maxChildren: 0,
    baseRateCents: 17550,
    rooms: [{ id: "room-101", number: "201" }, { number: "202" }, { number: "203" }],
  });
  assert.equal(container.querySelectorAll("tbody tr").length, 3);
});

it("keeps the draft and identifies a room-number conflict reported during saving, then allows correction", async () => {
  api.on("POST", "/setup", () => {
    if (writes.length === 1) {
      catalog.rooms.push({ id: "other-room", number: "202", roomTypeId: "suite" });
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
  const save = api.hold("POST", "/setup");
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await fill("baseRate", "180");
  await click("Suite");
  await click("Guardar y continuar");
  await until(() => !!save.request, "Save must start");
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
    save.release(
      Response.json({ roomType: { ...double, baseRateCents: 18000 }, rooms: catalog.rooms }),
    ),
  );
  await until(() => input("name").value === "Suite", "Switch must happen after saving");
  assert.equal(writes[0].baseRateCents, 18000);
});

it.each(["mobile"])("protects a setup draft through %s sidebar navigation", async (viewport) => {
  if (viewport === "mobile") page.mobile();
  await render();
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await fill("name", "Unsaved name");
  await click("Alternar navegación");
  assert.equal(
    input("name").value,
    "Unsaved name",
    "Toggling navigation must not remount the editor",
  );
  if (viewport === "desktop") await click("Alternar navegación");
  await click("Reservas");
  await until(
    () => !!window.document.querySelector('[role="alertdialog"]'),
    "Navigation must ask before discarding",
  );
  assert.equal(router.state.location.pathname, "/setup");
  await click("Seguir editando");
  assert.equal(input("name").value, "Unsaved name");
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
  await until(() => !!container.querySelector('input[name="name"]'), "Selected type must load");
  await click("Agregar tipo de habitación");
  await fill("name", "Individual");
  await fill("baseRate", "85.50");
  await click("Agregar habitación");
  await fill("rooms[0].number", "301");
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
  assert.ok(button("Individual"));
  assert.equal(button("Guardar cambios").disabled, true);
});

it("does not switch types after a failed save-and-continue or a later ordinary save", async () => {
  api.on("POST", "/setup", () =>
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
