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

it("shows reservation and payment summaries above working detail tabs", async () => {
  mockApi();
  await render();
  assert.equal(page.container.querySelectorAll("input, textarea").length, 0);
  assert.ok(button("Editar reserva"));
  assert.match(page.container.textContent, /Datos de la reserva/);
  assert.match(page.container.textContent, /Pago y cuenta/);
  assert.match(page.container.textContent, /19 de octubre de 2026/);
  assert.match(page.container.textContent, /Llegada hoy/);
  assert.match(page.container.textContent, /habitación sin asignar/);
  assert.deepEqual(
    Array.from(page.container.querySelectorAll('main [role="tab"]')).map((tab) => tab.textContent),
    ["Detalles", "Pagos", "Cuenta"],
  );
  assert.match(
    page.container.querySelector('[role="tabpanel"]')!.textContent,
    /Contacto de la reserva/,
  );
  await click("Pagos");
  assert.equal(button("Pagos").getAttribute("aria-selected"), "true");
  assert.match(
    page.container.querySelector('[role="tabpanel"]')!.textContent,
    /Sin pagos registrados/,
  );
  await click("Cuenta");
  const disclosure = page.container.querySelector("details");
  assert.ok(disclosure);
  await React.act(async () => disclosure.querySelector("summary")!.click());
  assert.equal(disclosure.open, true);
  assert.match(disclosure.textContent, /150/);
  await click("Detalles");
  assert.match(
    page.container.querySelector('[role="tabpanel"]')!.textContent,
    /Notas de la reserva/,
  );
});

it("retains failed notes and dirty navigation guards across a background refresh, then saves only notes", async () => {
  mockApi({
    write: () =>
      writes.length === 1
        ? Response.json({ error: "temporary failure" }, { status: 503 })
        : undefined,
  });
  await render();
  await click("Editar notas");
  await fill("notes", "Guardar equipaje");
  assert.equal(await unloadPrevented(), true);
  await submit();
  await page.until(() => writes.length === 1 && !button("Guardar cambios").disabled);
  assert.equal(field("notes").value, "Guardar equipaje");
  saved = { ...saved, notes: "Cambio desde otra pantalla" };
  await React.act(async () => {
    await page.client.invalidateQueries({ queryKey: ["reservation", saved.id] });
  });
  assert.equal(field("notes").value, "Guardar equipaje");
  await click("Cerrar");
  assert.match(window.document.body.textContent, /Hay cambios sin guardar/);
  await click("Seguir editando");
  await submit();
  await page.until(() => !popup());
  assert.match(page.container.textContent, /Guardar equipaje/);
  assert.deepEqual(writes[1].actions, [{ type: "notes", notes: "Guardar equipaje" }]);
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
  await click("Pagos");
  assert.match(page.container.textContent, /OP-123/);
  assert.equal(await unloadPrevented(), false);
});

it("edits the shared contact without replacing staying guests or reservation notes", async () => {
  mockApi();
  await render();
  page.client.setQueryData(["reservation", "other"], { ...saved, id: "other" });
  await click("Editar contacto");
  assert.match(popup()!.textContent, /todas las reservas/);
  await fill("fullName", "Ana María Pérez");
  await fill("email", "incorrecto");
  await submit();
  assert.equal(writes.length, 0);
  await fill("email", "");
  await submit();
  await page.until(() => !popup());
  assert.equal(page.container.querySelector("h1")!.textContent, "Ana María Pérez");
  assert.equal(saved.notes, "Llegada por la tarde");
  assert.deepEqual(saved.stayingGuests, []);
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
});

it("edits and deletes saved payments through their account actions", async () => {
  saved = {
    ...saved,
    paidCents: 10000,
    balanceCents: 20000,
    payments: [
      {
        id: "payment-1",
        reservationId: saved.id,
        amountCents: 10000,
        method: "cash",
        paymentDate: "2026-10-18",
        reference: "OP-1",
        notes: "Anticipo",
        createdAt: "2026-10-18T15:00:00Z",
      },
    ],
  };
  mockApi();
  await render();
  await click("Pagos");
  await click("Acciones del pago OP-1");
  await menu("Editar pago");
  assert.equal(field("amount").value, "100.00");
  assert.equal(field("reason").value, "Anticipo");
  await fill("amount", "50");
  await fill("reason", "Importe corregido");
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    {
      type: "edit-payment",
      paymentId: "payment-1",
      payment: {
        amountCents: 5000,
        method: "cash",
        paymentDate: "2026-10-18",
        reference: "OP-1",
        notes: "Importe corregido",
      },
    },
  ]);
  assert.match(page.container.textContent, /Importe corregido/);
  await click("Acciones del pago OP-1");
  await menu("Eliminar registro…");
  assert.match(popup()!.textContent, /no representa un reembolso/);
  await click("Confirmar");
  await page.until(() => !popup());
  assert.deepEqual(writes[1].actions, [{ type: "delete-payment", paymentId: "payment-1" }]);
  assert.match(page.container.textContent, /Sin pagos registrados/);
});

it("adds, edits and removes a staying guest independently of declared occupancy", async () => {
  mockApi();
  await render();
  await click("Agregar");
  await fill("fullName", "Luis García");
  await submit();
  await page.until(() => !popup());
  assert.match(page.container.textContent, /Luis García/);
  await click("Acciones de Luis García");
  await menu("Editar huésped");
  await fill("fullName", "Luis García Díaz");
  await submit();
  await page.until(() => !popup());
  await click("Acciones de Luis García Díaz");
  await menu("Eliminar huésped…");
  await click("Confirmar");
  await page.until(() => !popup());
  assert.equal(saved.stayingGuests.length, 0);
  assert.equal(saved.rooms[0].adults, 2);
  assert.equal(saved.guest.fullName, "Ana Pérez");
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

it("checks in an unpaid, unassigned reservation without changing its dates", async () => {
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
    const header = page.container.querySelector("main header")!;
    assert.equal(header.textContent.includes("Registrar pago"), true);
    assert.equal(header.textContent.includes("Hacer check-in"), false);
    await click("Editar notas");
    await fill("notes", "Corrección posterior");
    await submit();
    await page.until(() => !popup());
    assert.match(page.container.textContent, /Corrección posterior/);
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
    await click("Restaurar reserva");
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
  await click("Más");
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

it("uses the validated stay editor, shows repricing, and saves only the changed stay", async () => {
  mockApi({
    preview: () => ({
      billing: { ...saved, subtotalCents: 45000, totalCents: 45000, balanceCents: 45000 },
      validation: { issues: [] },
    }),
  });
  await render();
  await click("Editar reserva");
  assert.equal(popup()!.querySelector('[name="notes"]'), null);
  await selectDate("Check-out", "22/10/2026");
  assert.equal(button("Guardar detalles").disabled, true);
  await page.until(() => !button("Guardar detalles").disabled);
  assert.match(popup()!.textContent, /450/);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "dates", checkIn: "2026-10-19", checkOut: "2026-10-22" },
  ]);
  assert.match(page.container.textContent, /3 noches/);
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
  assert.equal(button("Guardar detalles").disabled, true);
});

it("protects editor drafts from router navigation and restores calendar context on return", async () => {
  mockApi();
  await render("?origin=calendar&returnTo=from%3D2026-10-12%26span%3D14");
  await click("Editar notas");
  await fill("notes", "Borrador");
  await React.act(async () => {
    void router.navigate({ to: "/calendar", search: { from: "2026-10-12", span: 14 } });
  });
  await page.until(() => window.document.body.textContent.includes("Hay cambios sin guardar"));
  assert.equal(router.state.location.pathname, "/reservations/reservation-1");
  await click("Seguir editando");
  assert.equal(field("notes").value, "Borrador");
  await click("Cerrar");
  await click("Descartar y salir");
  await page.until(() => !popup());
  await click("Volver al calendario");
  await page.until(() => router.state.location.pathname === "/calendar");
  assert.equal(router.state.location.search.from, "2026-10-12");
  assert.equal(router.state.location.search.span, 14);
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
