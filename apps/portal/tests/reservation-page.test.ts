import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLInputElement, HTMLTextAreaElement, HTMLElement } from "happy-dom";
import type {
  ReservationDetail,
  WorkflowCommand,
  WorkflowIssue,
  WorkflowPreview,
} from "../src/lib/api.ts";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let routes: typeof import("../src/router.tsx");
let router: typeof routes.router;
let window: BrowserTest["window"];
let React: BrowserTest["React"];
let saved: ReservationDetail;
let writes: WorkflowCommand[];
let previews: WorkflowCommand[];

beforeAll(async () => {
  browser = await createBrowserTest();
  ({ window, React } = browser);
  routes = (await browser.server.ssrLoadModule("/src/router.tsx")) as typeof routes;
  const calendar = (await browser.server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
  page = browser.createPage();
  writes = [];
  previews = [];
  saved = {
    id: "reservation-1",
    code: "TEST0001",
    status: "confirmed",
    notes: "Llegada por la tarde",
    cancellationReason: null,
    cancelledAt: null,
    savedDiscountCents: 0,
    creditCents: 0,
    guestId: "contact-1",
    guest: {
      id: "contact-1",
      fullName: "Ana Pérez",
      phone: "999111222",
      email: "ana@example.com",
      notes: "Contacto compartido",
    },
    stayingGuests: [],
    checkIn: "2026-10-19",
    checkOut: "2026-10-21",
    source: "direct",
    currency: "PEN",
    subtotalCents: 30000,
    discountCents: 0,
    totalCents: 30000,
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
        adults: 2,
        children: 0,
        subtotalCents: 30000,
        discountCents: 0,
        totalCents: 30000,
        nights: [
          { date: "2026-10-19", priceCents: 15000 },
          { date: "2026-10-20", priceCents: 15000 },
        ],
      },
    ],
  };
});
afterEach(async () => {
  await page.cleanup();
  vi.useRealTimers();
});
afterAll(async () => {
  await browser?.close();
});

type ApiOptions = {
  write?: (command: WorkflowCommand) => Response | undefined | Promise<Response | undefined>;
  preview?: (command: WorkflowCommand) => WorkflowPreview | Promise<WorkflowPreview>;
};
function mockApi(options: ApiOptions = {}) {
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const path = url.pathname;
    if (path === "/rooms")
      return Response.json([{ id: "room-1", number: "101", roomTypeId: "double" }]);
    if (path === "/room-types")
      return Response.json([
        { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, baseRateCents: 15000 },
      ]);
    if (path === "/reservations/reservation-1") return Response.json(saved);
    if (path === "/reservations")
      return Response.json(
        url.searchParams.get("paginated") === "true"
          ? { rows: [], total: 0, limit: 50, offset: 0 }
          : [],
      );
    if (path === "/room-closures") return Response.json([]);
    if (path.endsWith("/preview") || path.endsWith("/commands")) {
      assert.equal(typeof init?.body, "string");
      const command = JSON.parse(init!.body as string) as WorkflowCommand;
      if (path.endsWith("/preview")) {
        previews.push(command);
        return Response.json(
          (await options.preview?.(command)) ?? { billing: saved, validation: { issues: [] } },
        );
      }
      writes.push(command);
      const response = await options.write?.(command);
      if (response) return response;
      for (const action of command.actions) {
        if (action.type === "notes") saved = { ...saved, notes: action.notes };
        if (action.type === "contact")
          saved = { ...saved, guest: { ...saved.guest, ...action.contact } };
        if (action.type === "set-guests") saved = { ...saved, stayingGuests: action.guests };
        if (action.type === "add-payment")
          saved = {
            ...saved,
            paidCents: 10000,
            balanceCents: 20000,
            payments: [
              {
                ...action.payment,
                reference: action.payment.reference ?? null,
                notes: action.payment.notes ?? null,
                id: "payment-1",
                reservationId: saved.id,
                createdAt: "2026-10-19T15:00:00Z",
              },
            ],
          };
        if (action.type === "edit-payment")
          saved = {
            ...saved,
            payments: saved.payments.map((payment) =>
              payment.id === action.paymentId ? { ...payment, ...action.payment } : payment,
            ),
          };
        if (action.type === "delete-payment") saved = { ...saved, payments: [] };
        if (action.type === "set-discount")
          saved = {
            ...saved,
            savedDiscountCents: action.amountCents,
            discountCents: 5000,
            totalCents: 25000,
            balanceCents: 25000,
          };
        if (action.type === "set-status")
          saved = {
            ...saved,
            status: action.status,
            ...(action.status === "cancelled"
              ? {
                  totalCents: 0,
                  subtotalCents: 0,
                  balanceCents: -saved.paidCents,
                  creditCents: saved.paidCents,
                  cancelledAt: "2026-10-19T15:00:00Z",
                  cancellationReason: action.reason ?? null,
                }
              : {}),
          };
        if (action.type === "dates")
          saved = {
            ...saved,
            checkIn: action.checkIn,
            checkOut: action.checkOut,
            totalCents: 45000,
            subtotalCents: 45000,
            balanceCents: 45000,
          };
      }
      return Response.json(saved);
    }
    throw new Error(`Unexpected request ${path}`);
  };
}
async function render(search = "") {
  router = browser.routing.createRouter({
    routeTree: routes.router.routeTree,
    history: browser.routing.createMemoryHistory({
      initialEntries: [`/reservations/reservation-1${search}`],
    }),
  });
  await page.renderRouter(router);
  await page.until(() => page.container.textContent.includes("#TEST0001"));
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
function field(name: string) {
  const element = window.document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  );
  assert.ok(element, `Missing field ${name}`);
  return element;
}
async function fill(name: string, value: string) {
  await React.act(async () => {
    const element = field(name);
    const prototype =
      element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
async function submit() {
  const form = window.document.querySelector('[role="dialog"] form');
  assert.ok(form);
  await React.act(async () => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}
const popup = () => window.document.querySelector('[role="dialog"]');
async function menu(label: string) {
  const element = Array.from(
    window.document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).find((item) => item.textContent.trim() === label);
  assert.ok(element, `Missing menu item ${label}`);
  await React.act(async () => element.click());
}
function dateTrigger(label: string) {
  const fieldLabel = Array.from(window.document.querySelectorAll("label")).find(
    (node) => node.textContent.trim() === label,
  );
  assert.ok(fieldLabel, `Missing date label ${label}`);
  const element = window.document.getElementById(fieldLabel.htmlFor);
  assert.ok(element instanceof window.HTMLButtonElement);
  return element;
}
async function selectDate(label: string, day: string) {
  await React.act(async () => dateTrigger(label).click());
  const element = window.document.querySelector<HTMLElement>(`button[data-day="${day}"]`);
  assert.ok(element, `Missing date ${day}`);
  await React.act(async () => element.click());
}
async function unloadPrevented() {
  const event = new window.Event("beforeunload", { cancelable: true });
  await React.act(async () => {
    window.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

it("shows the read-first reservation identity, stay and payment summaries", async () => {
  mockApi();
  await render();
  assert.equal(page.container.querySelectorAll("input, textarea").length, 0);
  assert.ok(button("Editar reserva"));
  assert.match(page.container.textContent, /Datos de la reserva/);
  assert.match(page.container.textContent, /Pago y cuenta/);
  assert.match(page.container.textContent, /19 de octubre de 2026/);
  assert.match(page.container.textContent, /Llegada hoy/);
  assert.match(page.container.textContent, /Sin asignar · Doble/);
  assert.equal(page.container.querySelector("h1")!.textContent, "Ana Pérez");
  assert.equal(page.container.querySelector('a[href="tel:999111222"]')!.textContent, "999111222");
  assert.match(page.container.textContent, /Saldo pendiente/);
  assert.ok(button("Registrar pago"));
});

it("retains the entire combined draft and retry ID after rejection and background refresh", async () => {
  mockApi({
    write: () =>
      writes.length === 1
        ? Response.json({ error: "temporary failure" }, { status: 503 })
        : undefined,
  });
  await render();
  await click("Editar reserva");
  await fill("fullName", "Ana María Pérez");
  await fill("phone", "999333444");
  await fill("email", "nuevo@example.com");
  await fill("documentType", "DNI");
  await fill("documentNumber", "12345678");
  await selectDate("Check-out", "22/10/2026");
  await page.until(() => !button("Guardar cambios").disabled);
  assert.equal(await unloadPrevented(), true);
  await submit();
  await page.until(() => writes.length === 1 && !button("Guardar cambios").disabled);
  assert.equal(field("fullName").value, "Ana María Pérez");
  saved = { ...saved, guest: { ...saved.guest, fullName: "Cambio desde otra pantalla" } };
  await React.act(async () => {
    await page.client.invalidateQueries({ queryKey: ["reservation", saved.id] });
  });
  assert.equal(field("fullName").value, "Ana María Pérez");
  assert.equal(field("phone").value, "999333444");
  assert.equal(field("email").value, "nuevo@example.com");
  assert.equal(field("documentType").value, "DNI");
  assert.equal(field("documentNumber").value, "12345678");
  assert.match(dateTrigger("Check-out").textContent, /22 oct 2026/);
  await click("Cancelar");
  assert.match(window.document.body.textContent, /Hay cambios sin guardar/);
  await click("Seguir editando");
  await submit();
  await page.until(() => !popup());
  assert.match(page.container.querySelector("h1")!.textContent, /Ana María Pérez/);
  assert.deepEqual(writes[1].actions, writes[0].actions);
  assert.equal(writes[1].requestId, writes[0].requestId);
  assert.equal(await unloadPrevented(), false);
});

it("records payments through retry-safe commands and prevents dismissal or navigation during a save", async () => {
  let finish!: (response: Response) => void;
  mockApi({
    write: () =>
      writes.length === 1
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : undefined,
  });
  await render();
  await click("Registrar pago");
  await fill("amount", "100");
  await React.act(async () => dateTrigger("Fecha del pago").click());
  assert.equal(
    window.document.querySelector("button[data-day='20/10/2026']")?.hasAttribute("disabled"),
    true,
    "Future payment dates must be disabled",
  );
  await React.act(async () =>
    window.document.querySelector<HTMLElement>("button[data-day='19/10/2026']")!.click(),
  );
  await fill("reference", "op-123");
  await submit();
  await page.until(() => writes.length === 1);
  assert.equal(await unloadPrevented(), true);
  await React.act(async () => {
    popup()!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  assert.ok(popup());
  await React.act(async () => {
    finish(Response.json({ error: "response unavailable" }, { status: 503 }));
  });
  await page.until(() => !button("Guardar cambios").disabled);
  assert.equal(field("amount").value, "100");
  await submit();
  await page.until(() => !popup());
  assert.equal(writes[0].requestId, writes[1].requestId);
  assert.deepEqual(writes[1].actions, [
    {
      type: "add-payment",
      payment: {
        amountCents: 10000,
        method: "cash",
        paymentDate: "2026-10-19",
        reference: "OP-123",
      },
    },
  ]);
  assert.match(page.container.textContent, /PagadoS\/\s*100/);
  assert.equal(await unloadPrevented(), false);
});

it("validates and saves only contact changes without replacing guests, notes, or other reservations' cached contacts", async () => {
  saved = {
    ...saved,
    stayingGuests: [
      {
        id: "staying-guest-1",
        fullName: "Luis García",
        email: null,
        phone: null,
        reservationRoomId: "line-1",
      },
    ],
  };
  mockApi();
  await render();
  page.client.setQueryData(["reservation", "other"], { ...saved, id: "other" });
  await click("Editar reserva");
  await fill("fullName", "Ana María Pérez");
  await fill("email", "incorrecto");
  await submit();
  assert.equal(writes.length, 0);
  assert.match(popup()!.textContent, /Ingresa un correo válido/);
  await fill("email", "");
  await submit();
  await page.until(() => !popup());
  assert.match(page.container.querySelector("h1")!.textContent, /Ana María Pérez/);
  assert.equal(saved.notes, "Llegada por la tarde");
  assert.equal(saved.stayingGuests[0].fullName, "Luis García");
  assert.equal(saved.rooms[0].adults, 2);
  assert.deepEqual(writes[0].actions, [
    {
      type: "contact",
      contact: {
        fullName: "Ana María Pérez",
        email: null,
        phone: "999111222",
        documentType: null,
        documentNumber: null,
      },
    },
  ]);
  assert.equal(page.client.getQueryState(["reservation", "other"])?.isInvalidated, true);
  assert.equal(previews.length, 0);
});

it("waits for the current discount preview and saves its amount separately", async () => {
  let finish!: (preview: WorkflowPreview) => void;
  mockApi({
    preview: (command) =>
      command.actions.some(
        (action) => action.type === "set-discount" && action.amountCents === 5000,
      )
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { billing: saved, validation: { issues: [] } },
  });
  await render();
  await click("Editar descuento");
  await page.until(() => !button("Guardar cambios").disabled);
  await fill("amount", "50");
  assert.equal(button("Guardar cambios").disabled, true);
  await page.until(() => !!finish);
  await submit();
  assert.equal(writes.length, 0);
  await React.act(async () => {
    finish({
      billing: { ...saved, discountCents: 5000, totalCents: 25000, balanceCents: 25000 },
      validation: { issues: [] },
    });
  });
  await page.until(() => !button("Guardar cambios").disabled);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [{ type: "set-discount", amountCents: 5000 }]);
});

// T3 replaces this confirmation-era scenario with the direct lifecycle policy.
it.skip("checks in an unpaid, unassigned reservation without changing its dates", async () => {
  mockApi();
  await render();
  await click("Hacer check-in");
  await page.until(() => !button("Guardar cambios").disabled);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [{ type: "set-status", status: "checked_in" }]);
  assert.equal(saved.checkIn, "2026-10-19");
  assert.equal(saved.balanceCents, 30000);
  assert.ok(button("Hacer check-out"));
});

for (const balance of [0, -10000, 5000]) {
  it(`keeps a checked-out reservation editable with balance ${balance}`, async () => {
    saved = { ...saved, status: "checked_out", balanceCents: balance };
    mockApi();
    await render();
    assert.ok(button("Registrar pago"));
    await click("Editar reserva");
    await fill("phone", "999333444");
    await submit();
    await page.until(() => !popup());
    assert.equal(page.container.querySelector('a[href="tel:999333444"]')!.textContent, "999333444");
    assert.equal(saved.status, "checked_out");
  });
}

for (const [code, fieldName] of [
  ["room is already assigned for those dates", "roomId"],
  ["too many guests for this room type", "occupancy"],
] as const) {
  it(`blocks restoration when its preview reports ${fieldName} conflicts`, async () => {
    saved = {
      ...saved,
      status: "cancelled",
      cancelledAt: "2026-10-18T15:00:00Z",
      totalCents: 0,
      subtotalCents: 0,
      paidCents: 10000,
      balanceCents: -10000,
      creditCents: 10000,
    };
    mockApi({
      preview: () => ({
        billing: saved,
        validation: { issues: [{ code, field: fieldName, roomIndex: 0 }] },
      }),
    });
    await render();
    assert.match(page.container.textContent, /Saldo a favor/);
    await click("Cambiar estado");
    await menu("Confirmada…");
    await page.until(() => !!popup()?.textContent.includes("Habitación 1:"));
    assert.equal(button("Guardar cambios").disabled, true);
    await submit();
    assert.equal(writes.length, 0);
  });
}

it("cancels with a reason while retaining recorded payments as credit", async () => {
  saved = { ...saved, paidCents: 10000, balanceCents: 20000 };
  mockApi({
    preview: () => ({
      billing: {
        ...saved,
        subtotalCents: 0,
        totalCents: 0,
        balanceCents: -10000,
        creditCents: 10000,
      },
      validation: { issues: [] },
    }),
  });
  await render();
  await click("Cambiar estado");
  await menu("Cancelar reserva…");
  await page.until(() => !button("Confirmar").disabled);
  await fill("reason", "Cambio de planes");
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "set-status", status: "cancelled", reason: "Cambio de planes" },
  ]);
  assert.match(page.container.textContent, /Cambio de planes/);
  assert.match(page.container.textContent, /Saldo a favor/);
  assert.equal(saved.paidCents, 10000);
});

it("saves contact and stay together from visible sections with the current server bill", async () => {
  mockApi({
    preview: () => ({
      billing: { ...saved, subtotalCents: 45000, totalCents: 45000, balanceCents: 45000 },
      validation: { issues: [] },
    }),
  });
  await render();
  await click("Editar reserva");
  assert.match(popup()!.textContent, /Contacto/);
  assert.match(popup()!.textContent, /Estadía/);
  await fill("fullName", "Ana María Pérez");
  await fill("phone", "999333444");
  await selectDate("Check-out", "22/10/2026");
  assert.equal(button("Guardar cambios").disabled, true);
  await page.until(() => !button("Guardar cambios").disabled);
  assert.match(popup()!.textContent, /450/);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "dates", checkIn: "2026-10-19", checkOut: "2026-10-22" },
    {
      type: "contact",
      contact: {
        fullName: "Ana María Pérez",
        phone: "999333444",
        email: "ana@example.com",
        documentType: null,
        documentNumber: null,
      },
    },
  ]);
  assert.equal(writes.length, 1);
  assert.match(page.container.querySelector("h1")!.textContent, /Ana María Pérez/);
  assert.match(page.container.textContent, /3 noches/);
});

it("protects a pending combined command from duplicate submission, dismissal and navigation", async () => {
  let finish!: (response: Response) => void;
  mockApi({
    write: () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  });
  await render();
  await click("Editar reserva");
  await fill("phone", "999333444");
  await submit();
  await page.until(
    () => writes.length === 1 && window.document.body.textContent.includes("Guardando…"),
  );
  assert.equal(button("Guardando…").disabled, true);
  assert.equal(button("Cancelar").disabled, true);
  assert.equal(await unloadPrevented(), true);
  await click("Cerrar");
  await submit();
  assert.equal(writes.length, 1);
  await React.act(async () => {
    void router.navigate({ to: "/calendar", search: { from: "2026-10-19", span: 14 } });
  });
  await page.until(() => window.document.body.textContent.includes("Espera a que termine"));
  assert.equal(router.state.location.pathname, "/reservations/reservation-1");
  assert.equal(button("Descartar y salir").disabled, true);
  await click("Seguir editando");
  await React.act(async () => {
    saved = { ...saved, guest: { ...saved.guest, phone: "999333444" } };
    finish(Response.json(saved));
  });
  await page.until(() => !popup());
  assert.ok(page.container.querySelector('a[href="tel:999333444"]'));
  assert.equal(await unloadPrevented(), false);
});

it("validates occupancy and saves a room removal with the contact while retaining at least one room", async () => {
  saved = {
    ...saved,
    rooms: [...saved.rooms, { ...saved.rooms[0], id: "line-2" }],
  };
  mockApi({
    write: () => {
      saved = {
        ...saved,
        guest: { ...saved.guest, fullName: "Ana María Pérez" },
        rooms: [{ ...saved.rooms[0], adults: 1, children: 1 }],
      };
      return Response.json(saved);
    },
  });
  await render();
  await click("Editar reserva");
  await fill("fullName", "Ana María Pérez");
  await click("Quitar habitación 2");
  assert.equal(button("Quitar habitación 1").disabled, true);
  await fill("rooms[0].room.adults", "3");
  await submit();
  assert.equal(writes.length, 0);
  assert.match(popup()!.textContent, /no tiene capacidad/);
  await fill("rooms[0].room.adults", "1");
  await fill("rooms[0].room.children", "1");
  await page.until(() => !button("Guardar cambios").disabled);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    {
      type: "edit-room",
      lineId: "line-1",
      room: { roomTypeId: "double", roomId: null, adults: 1, children: 1 },
    },
    { type: "remove-room", lineId: "line-2" },
    {
      type: "contact",
      contact: {
        fullName: "Ana María Pérez",
        phone: "999111222",
        email: "ana@example.com",
        documentType: null,
        documentNumber: null,
      },
    },
  ]);
  assert.equal(saved.rooms.length, 1);
  assert.equal(saved.rooms[0].children, 1);
});

it("shows a contact server error beside its field and retains the stay for correction", async () => {
  mockApi({
    write: () =>
      writes.length === 1 ? Response.json({ error: "invalid email" }, { status: 400 }) : undefined,
  });
  await render();
  await click("Editar reserva");
  await fill("email", "rechazado@example.com");
  await selectDate("Check-out", "22/10/2026");
  await page.until(() => !button("Guardar cambios").disabled);
  await submit();
  await page.until(() => field("email").getAttribute("aria-invalid") === "true");
  await page.flush(30);
  assert.equal(field("email").getAttribute("aria-invalid"), "true");
  assert.equal(field("email").value, "rechazado@example.com");
  assert.match(dateTrigger("Check-out").textContent, /22 oct 2026/);
  assert.equal(saved.checkOut, "2026-10-21");
  await fill("email", "corregido@example.com");
  await submit();
  await page.until(() => !popup());
  assert.equal(writes.length, 2);
  assert.notEqual(writes[1].requestId, writes[0].requestId);
  assert.equal(saved.guest.email, "corregido@example.com");
  assert.equal(saved.checkOut, "2026-10-22");
});

it("preserves a stay draft when the server preview rejects its assignment", async () => {
  const issue: WorkflowIssue = {
    code: "room is already assigned for those dates",
    field: "roomId",
    roomIndex: 0,
  };
  mockApi({ preview: () => ({ billing: saved, validation: { issues: [issue] } }) });
  await render();
  await click("Editar reserva");
  await selectDate("Check-out", "22/10/2026");
  await page.until(() => previews.length > 0 && !!popup()?.querySelector('[role="alert"]'));
  await submit();
  assert.equal(writes.length, 0);
  assert.match(dateTrigger("Check-out").textContent, /22 oct 2026/);
  assert.equal(button("Guardar cambios").disabled, true);
});

it("ignores stale stay previews while contact validation and typing retain the current operational quote", async () => {
  let finishOld!: (preview: WorkflowPreview) => void;
  let finishCurrent!: (preview: WorkflowPreview) => void;
  mockApi({
    preview: (command) =>
      writes.length
        ? { billing: saved, validation: { issues: [] } }
        : new Promise((resolve) => {
            const dates = command.actions.find((action) => action.type === "dates");
            if (dates?.type === "dates" && dates.checkOut === "2026-10-22") finishOld = resolve;
            else finishCurrent = resolve;
          }),
  });
  await render();
  await click("Editar reserva");
  await selectDate("Check-out", "22/10/2026");
  await page.until(() => !!finishOld);
  await selectDate("Check-out", "23/10/2026");
  await page.until(() => !!finishCurrent);
  await React.act(async () =>
    finishOld({
      billing: { ...saved, subtotalCents: 45000, totalCents: 45000, balanceCents: 45000 },
      validation: { issues: [] },
    }),
  );
  assert.equal(button("Guardar cambios").disabled, true);
  await submit();
  assert.equal(writes.length, 0);
  await React.act(async () =>
    finishCurrent({
      billing: { ...saved, subtotalCents: 60000, totalCents: 60000, balanceCents: 60000 },
      validation: { issues: [] },
    }),
  );
  await page.until(() => !button("Guardar cambios").disabled);
  assert.match(popup()!.textContent, /600/);
  await fill("email", "incorrecto");
  await submit();
  assert.equal(writes.length, 0);
  assert.match(popup()!.textContent, /Ingresa un correo válido/);
  await fill("email", "nuevo@example.com");
  await fill("phone", "999333444");
  assert.equal(button("Guardar cambios").disabled, false);
  assert.equal(previews.length, 2);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "dates", checkIn: "2026-10-19", checkOut: "2026-10-23" },
    {
      type: "contact",
      contact: {
        fullName: "Ana Pérez",
        phone: "999333444",
        email: "nuevo@example.com",
        documentType: null,
        documentNumber: null,
      },
    },
  ]);
});

it("protects the combined draft from router navigation and dirty dismissal", async () => {
  mockApi();
  await render("?origin=calendar&returnTo=from%3D2026-10-12%26span%3D14");
  await click("Editar reserva");
  await fill("fullName", "Borrador");
  await React.act(async () => {
    void router.navigate({ to: "/calendar", search: { from: "2026-10-12", span: 14 } });
  });
  await page.until(() => window.document.body.textContent.includes("Hay cambios sin guardar"));
  assert.equal(router.state.location.pathname, "/reservations/reservation-1");
  await click("Seguir editando");
  assert.equal(field("fullName").value, "Borrador");
  await click("Cerrar");
  await click("Descartar y salir");
  await page.until(() => !popup());
  await click("Volver a reservas");
  await page.until(() => router.state.location.pathname === "/reservations");
});

it("returns to the originating reservation list filters", async () => {
  mockApi();
  const search = new URLSearchParams({
    view: "all",
    day: "2026-10-12",
    q: "Ana",
    balance: "credit",
    assignment: "unassigned",
    sort: "balance",
    direction: "desc",
  });
  await render(`?returnTo=${encodeURIComponent(search.toString())}`);
  await click("Volver a reservas");
  await page.until(() => router.state.location.pathname === "/reservations");
  assert.deepEqual(
    { ...router.state.location.search },
    { ...Object.fromEntries(search), statuses: "all", size: 50 },
  );
});
