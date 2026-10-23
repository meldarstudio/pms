import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLElement } from "happy-dom";
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
  page.api.catalog.roomTypes = [
    { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, baseRateCents: 15000 },
  ];
  page.api.catalog.rooms = [{ id: "room-1", number: "101", roomTypeId: "double" }];
  page.api.on("GET", "/reservations/reservation-1", () => saved);
  writes = page.api.bodies<WorkflowCommand>("POST", "/reservations/:id/commands");
  previews = page.api.bodies<WorkflowCommand>("POST", "/reservations/:id/preview");
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
  page.api.on<WorkflowCommand>(
    "POST",
    "/reservations/:id/preview",
    async ({ body }) =>
      (await options.preview?.(body)) ?? { billing: saved, validation: { issues: [] } },
  );
  page.api.on<WorkflowCommand>("POST", "/reservations/:id/commands", async ({ body: command }) => {
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
    return saved;
  });
}
async function render(search = "", waitForDetail = true) {
  router = browser.routing.createRouter({
    routeTree: routes.router.routeTree,
    history: browser.routing.createMemoryHistory({
      initialEntries: [`/reservations/reservation-1${search}`],
    }),
  });
  await page.renderRouter(router);
  if (waitForDetail) await page.until(() => page.container.textContent.includes("#TEST0001"));
}
const button = (label: string) => page.button(label);
const click = (label: string) => page.click(label);
const field = (name: string) => page.field(name);
const fill = (name: string, value: string) => page.fill(name, value);
async function submit() {
  const form = window.document.querySelector('[role="dialog"] form');
  assert.ok(form);
  await React.act(async () => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}
const popup = () => window.document.querySelector('[role="dialog"]');
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
async function selectStatus(label: string) {
  await React.act(async () => dateTrigger("Estado de la reserva").click());
  await React.act(async () => statusOption(label).click());
}
function statusOption(label: string) {
  const option = Array.from(window.document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (node) => node.textContent.trim() === label,
  );
  assert.ok(option, `Missing status option ${label}`);
  return option;
}
async function unloadPrevented() {
  const event = new window.Event("beforeunload", { cancelable: true });
  await React.act(async () => {
    window.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

it("shows reservation sections with their own editing actions and contact details", async () => {
  saved.guest = { ...saved.guest, documentType: "DNI", documentNumber: "12345678" };
  saved.rooms = [
    ...saved.rooms,
    {
      ...saved.rooms[0],
      id: "line-2",
      roomId: "room-2",
      roomNumber: "103",
      adults: 1,
      children: 1,
    },
  ];
  mockApi();
  await render();
  assert.equal(popup() !== null, false);
  assert.ok(button("Editar contacto"));
  assert.ok(button("Editar estadía"));
  const contact = page.container.querySelector('[aria-label="Contacto principal"]');
  assert.ok(contact);
  assert.match(contact.textContent, /Ana Pérez/);
  assert.match(contact.textContent, /999111222/);
  assert.match(contact.textContent, /ana@example.com/);
  assert.doesNotMatch(contact.textContent, /documento|DNI|12345678/);
  assert.match(page.container.textContent, /Estadía y habitaciones/);
  const occupants = Array.from(page.container.querySelectorAll("dt")).find(
    (term) => term.textContent === "Ocupantes",
  );
  assert.ok(occupants, "The stay summary shows the total declared occupants");
  assert.equal(occupants.nextElementSibling?.textContent, "4");
  const rooms = page.container.querySelector('[aria-label="Habitaciones asignadas"]');
  assert.ok(rooms);
  assert.match(rooms.textContent, /2 habitaciones/);
  const roomRows = rooms.querySelectorAll('[role="listitem"]');
  assert.equal(roomRows.length, 2);
  assert.match(roomRows[0].textContent, /Sin asignar · Doble/);
  assert.match(roomRows[0].textContent, /2 adultos/);
  assert.doesNotMatch(roomRows[0].textContent, /niños/);
  assert.match(roomRows[1].textContent, /103 · Doble/);
  assert.match(roomRows[1].textContent, /1 adulto · 1 niño/);
  assert.match(page.container.textContent, /Pago y cuenta/);
  assert.match(page.container.textContent, /19 de octubre de 2026/);
  assert.match(page.container.textContent, /Llegada hoy/);
  assert.match(page.container.textContent, /Sin asignar · Doble/);
  assert.equal(page.container.querySelector("h1")!.textContent, "Ana Pérez");
  assert.equal(contact.querySelector('a[href="tel:999111222"]')!.textContent, "999111222");
  assert.equal(page.container.querySelector('header a[href^="tel:"]') !== null, false);
  assert.match(page.container.textContent, /Saldo pendiente/);
  assert.ok(button("Registrar pago"));
});

it("retains the contact draft and retry ID after rejection and background refresh", async () => {
  mockApi({
    write: () =>
      writes.length === 1
        ? Response.json({ error: "temporary failure" }, { status: 503 })
        : undefined,
  });
  await render();
  await click("Editar contacto");
  await fill("fullName", "Ana María Pérez");
  await fill("phone", "999333444");
  await fill("email", "nuevo@example.com");
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
  await click("Cancelar");
  assert.match(window.document.body.textContent, /Hay cambios sin guardar/);
  await click("Seguir editando");
  await submit();
  await page.until(() => !popup());
  assert.match(page.container.querySelector("h1")!.textContent, /Ana María Pérez/);
  assert.deepEqual(writes[1].actions, writes[0].actions);
  assert.equal(writes[1].requestId, writes[0].requestId);
  assert.equal(saved.checkOut, "2026-10-21");
  assert.equal(previews.length, 0);
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
    guest: { ...saved.guest, documentType: "DNI", documentNumber: "12345678" },
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
  await click("Editar contacto");
  assert.equal(popup()!.querySelector('[name="documentType"]') !== null, false);
  assert.equal(popup()!.querySelector('[name="documentNumber"]') !== null, false);
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
  assert.equal(saved.guest.documentType, "DNI");
  assert.equal(saved.guest.documentNumber, "12345678");
  assert.deepEqual(writes[0].actions, [
    {
      type: "contact",
      contact: {
        fullName: "Ana María Pérez",
        email: null,
        phone: "999111222",
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

it("autosaves the selected status of an unpaid, unassigned reservation without changing its dates", async () => {
  mockApi();
  await render();
  assert.match(dateTrigger("Estado de la reserva").textContent, /Confirmada/);
  await selectStatus("Check-in");
  await page.until(() => dateTrigger("Estado de la reserva").textContent.includes("Check-in"));
  assert.equal(popup() !== null, false);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].actions, [{ type: "set-status", status: "checked_in" }]);
  assert.equal(saved.checkIn, "2026-10-19");
  assert.equal(saved.checkOut, "2026-10-21");
  assert.equal(saved.balanceCents, 30000);
  await selectStatus("Confirmada");
  await page.until(() => dateTrigger("Estado de la reserva").textContent.includes("Confirmada"));
  assert.deepEqual(writes[1].actions, [{ type: "set-status", status: "confirmed" }]);
});

it("autosaves checkout once, protects pending navigation, and retries an uncertain response with the same ID", async () => {
  saved = { ...saved, status: "checked_in" };
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
  await React.act(async () => dateTrigger("Estado de la reserva").click());
  const checkout = statusOption("Check-out");
  await React.act(async () => {
    checkout.click();
    checkout.click();
  });
  await page.until(() => page.container.textContent.includes("Guardando estado…"));
  assert.equal(writes.length, 1);
  assert.equal(dateTrigger("Estado de la reserva").disabled, true);
  assert.equal(await unloadPrevented(), true);
  assert.equal(saved.status, "checked_in");
  await React.act(async () => {
    void router.navigate({ href: "/reservations" });
  });
  await page.until(() => window.document.body.textContent.includes("Guardando cambios"));
  await click("Seguir editando");
  await React.act(async () =>
    finish(Response.json({ error: "Temporary save failure" }, { status: 503 })),
  );
  await page.until(() => !dateTrigger("Estado de la reserva").disabled);
  assert.match(dateTrigger("Estado de la reserva").textContent, /Check-in/);
  await selectStatus("Check-out");
  await page.until(
    () =>
      !page.container.textContent.includes("Guardando estado…") && saved.status === "checked_out",
  );
  assert.deepEqual(writes[0], writes[1]);
  assert.deepEqual(writes[1].actions, [{ type: "set-status", status: "checked_out" }]);
  assert.equal(saved.checkIn, "2026-10-19");
  assert.equal(saved.checkOut, "2026-10-21");
  assert.equal(saved.balanceCents, 30000);
  assert.equal(popup() !== null, false);
});

for (const balance of [0, -10000, 5000]) {
  it(`keeps a checked-out reservation editable with balance ${balance}`, async () => {
    saved = { ...saved, status: "checked_out", balanceCents: balance };
    mockApi();
    await render();
    assert.ok(button("Registrar pago"));
    await click("Editar contacto");
    await fill("phone", "999333444");
    await submit();
    await page.until(() => !popup());
    assert.equal(page.container.querySelector('a[href="tel:999333444"]')!.textContent, "999333444");
    assert.equal(saved.status, "checked_out");
  });
}

it("previews cancellation selected in the header before saving and shows the resulting credit", async () => {
  saved = { ...saved, paidCents: 10000, balanceCents: 20000 };
  mockApi({
    preview: () => ({
      billing: {
        ...saved,
        totalCents: 0,
        subtotalCents: 0,
        balanceCents: -10000,
        creditCents: 10000,
      },
      validation: { issues: [] },
    }),
  });
  await render();
  await selectStatus("Cancelada");
  await page.until(() => popup() !== null && !button("Confirmar").disabled);
  assert.equal(writes.length, 0);
  assert.match(dateTrigger("Estado de la reserva").textContent, /Confirmada/);
  assert.match(popup()!.textContent, /sin registrar un reembolso/);
  await fill("reason", "Cambio de planes");
  await submit();
  await page.until(() => !popup());
  assert.match(dateTrigger("Estado de la reserva").textContent, /Cancelada/);
  assert.match(page.container.textContent, /Cambio de planes/);
  assert.match(page.container.textContent, /Saldo a favor/);
  assert.deepEqual(writes[0].actions, [
    { type: "set-status", status: "cancelled", reason: "Cambio de planes" },
  ]);
});

it.each([
  ["roomTypeId", "not enough rooms available for those dates"],
  ["roomId", "room is already assigned for those dates"],
] as const)(
  "keeps cancelled credit intact when header restoration conflicts on %s",
  async (field, code) => {
    saved = {
      ...saved,
      status: "cancelled",
      cancellationReason: "Cambio de planes",
      cancelledAt: "2026-10-18T15:00:00Z",
      subtotalCents: 0,
      totalCents: 0,
      paidCents: 10000,
      balanceCents: -10000,
      creditCents: 10000,
    };
    mockApi({
      preview: () => ({
        billing: saved,
        validation: { issues: [{ roomIndex: 0, field, code }] },
      }),
    });
    await render();
    assert.match(page.container.textContent, /Reserva cancelada/);
    assert.match(page.container.textContent, /Cambio de planes/);
    assert.match(page.container.textContent, /Saldo a favor/);
    await selectStatus("Confirmada");
    await page.until(() => popup()?.textContent.includes("Habitación 1:") === true);
    assert.equal(button("Guardar cambios").disabled, true);
    assert.match(dateTrigger("Estado de la reserva").textContent, /Cancelada/);
    await submit();
    assert.equal(writes.length, 0);
    await click("Cerrar");
    assert.equal(saved.status, "cancelled");
    assert.match(page.container.textContent, /Saldo a favor/);
  },
);

it("saves stay changes independently with the current server bill", async () => {
  mockApi({
    preview: () => ({
      billing: { ...saved, subtotalCents: 45000, totalCents: 45000, balanceCents: 45000 },
      validation: { issues: [] },
    }),
  });
  await render();
  await click("Editar estadía");
  assert.match(popup()!.textContent, /Editar estadía/);
  assert.equal(popup()!.querySelector('[name="fullName"]'), null);
  await selectDate("Check-out", "22/10/2026");
  assert.equal(button("Guardar cambios").disabled, true);
  await page.until(() => !button("Guardar cambios").disabled);
  assert.match(popup()!.textContent, /450/);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "dates", checkIn: "2026-10-19", checkOut: "2026-10-22" },
  ]);
  assert.equal(writes.length, 1);
  assert.equal(saved.guest.fullName, "Ana Pérez");
  assert.equal(saved.guest.phone, "999111222");
  assert.match(page.container.textContent, /3 noches/);
});

it("protects a pending stay command from duplicate submission, dismissal and navigation", async () => {
  let finish!: (response: Response) => void;
  mockApi({
    write: () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  });
  await render();
  await click("Editar estadía");
  await selectDate("Check-out", "22/10/2026");
  await page.until(() => !button("Guardar cambios").disabled);
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
    saved = { ...saved, checkOut: "2026-10-22" };
    finish(Response.json(saved));
  });
  await page.until(() => !popup());
  assert.match(page.container.textContent, /3 noches/);
  assert.equal(await unloadPrevented(), false);
});

it("validates occupancy and saves room changes together while retaining at least one room", async () => {
  saved = {
    ...saved,
    rooms: [...saved.rooms, { ...saved.rooms[0], id: "line-2" }],
  };
  mockApi({
    write: () => {
      saved = {
        ...saved,
        rooms: [{ ...saved.rooms[0], adults: 1, children: 1 }],
      };
      return Response.json(saved);
    },
  });
  await render();
  await click("Editar estadía");
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
  ]);
  assert.equal(saved.rooms.length, 1);
  assert.equal(saved.rooms[0].children, 1);
});

it("shows a contact server error beside its field and keeps the draft for correction", async () => {
  mockApi({
    write: () =>
      writes.length === 1 ? Response.json({ error: "invalid email" }, { status: 400 }) : undefined,
  });
  await render();
  await click("Editar contacto");
  await fill("email", "rechazado@example.com");
  await page.until(() => !button("Guardar cambios").disabled);
  await submit();
  await page.until(() => field("email").getAttribute("aria-invalid") === "true");
  await page.flush(30);
  assert.equal(field("email").getAttribute("aria-invalid"), "true");
  assert.equal(field("email").value, "rechazado@example.com");
  assert.equal(saved.checkOut, "2026-10-21");
  await fill("email", "corregido@example.com");
  await submit();
  await page.until(() => !popup());
  assert.equal(writes.length, 2);
  assert.notEqual(writes[1].requestId, writes[0].requestId);
  assert.equal(saved.guest.email, "corregido@example.com");
  assert.equal(saved.checkOut, "2026-10-21");
});

it("preserves a stay draft when the server preview rejects its assignment", async () => {
  const issue: WorkflowIssue = {
    code: "room is already assigned for those dates",
    field: "roomId",
    roomIndex: 0,
  };
  mockApi({ preview: () => ({ billing: saved, validation: { issues: [issue] } }) });
  await render();
  await click("Editar estadía");
  await selectDate("Check-out", "22/10/2026");
  await page.until(() => previews.length > 0 && !!popup()?.querySelector('[role="alert"]'));
  await submit();
  assert.equal(writes.length, 0);
  assert.match(dateTrigger("Check-out").textContent, /22 oct 2026/);
  assert.equal(button("Guardar cambios").disabled, true);
});

it("ignores stale stay previews and saves only after the current operational quote arrives", async () => {
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
  await click("Editar estadía");
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
  assert.equal(button("Guardar cambios").disabled, false);
  assert.equal(previews.length, 2);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "dates", checkIn: "2026-10-19", checkOut: "2026-10-23" },
  ]);
});

it("protects a stay draft from background refresh, router navigation and dirty dismissal", async () => {
  mockApi();
  await render("?origin=calendar&returnTo=from%3D2026-10-12%26span%3D14");
  await click("Editar estadía");
  await fill("rooms[0].room.adults", "1");
  saved = { ...saved, rooms: [{ ...saved.rooms[0], adults: 2, children: 1 }] };
  await React.act(async () => {
    await page.client.invalidateQueries({ queryKey: ["reservation", saved.id] });
  });
  assert.equal(field("rooms[0].room.adults").value, "1");
  assert.equal(field("rooms[0].room.children").value, "0");
  await React.act(async () => {
    void router.navigate({ to: "/calendar", search: { from: "2026-10-12", span: 14 } });
  });
  await page.until(() => window.document.body.textContent.includes("Hay cambios sin guardar"));
  assert.equal(router.state.location.pathname, "/reservations/reservation-1");
  await click("Seguir editando");
  assert.equal(field("rooms[0].room.adults").value, "1");
  await click("Cerrar");
  await click("Descartar y salir");
  await page.until(() => !popup());
  await click("Volver a reservas");
  await page.until(() => router.state.location.pathname === "/reservations");
});

it.each(["loaded", "loading", "failed"] as const)(
  "returns to the originating reservation list filters while the detail is %s",
  async (state) => {
    mockApi();
    if (state === "loading")
      page.api.on("GET", "/reservations/reservation-1", () => new Promise<Response>(() => {}));
    if (state === "failed")
      page.api.on("GET", "/reservations/reservation-1", () =>
        Response.json({ error: "Request failed" }, { status: 503 }),
      );
    const search = new URLSearchParams({
      view: "all",
      day: "2026-10-12",
      q: "Ana",
      balance: "credit",
      assignment: "unassigned",
      sort: "balance",
      direction: "desc",
    });
    await render(`?returnTo=${encodeURIComponent(search.toString())}`, state === "loaded");
    if (state === "failed")
      await page.until(() => page.container.textContent.includes("Reintentar"));
    await click("Volver a reservas");
    await page.until(() => router.state.location.pathname === "/reservations");
    assert.deepEqual(
      { ...router.state.location.search },
      { ...Object.fromEntries(search), statuses: "all", size: 50 },
    );
  },
);
