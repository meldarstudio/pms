import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLElement, HTMLInputElement } from "happy-dom";
import type {
  ReservationCancellation,
  ReservationCouponMovement,
  ReservationDetail,
  ReservationPayment,
  ReservationRefund,
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
        housekeepingStatus: null,
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
  vi.restoreAllMocks();
  vi.useRealTimers();
});
afterAll(async () => {
  await browser?.close();
});

type ApiOptions = {
  write?: (command: WorkflowCommand) => Response | undefined | Promise<Response | undefined>;
  preview?: (
    command: WorkflowCommand,
  ) => WorkflowPreview | Response | Promise<WorkflowPreview | Response>;
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
              culqiChargeId: null,
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
          discountCents: action.amountCents,
          totalCents: saved.subtotalCents - action.amountCents,
          balanceCents: saved.subtotalCents - action.amountCents - saved.paidCents,
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

it.each([
  { status: "confirmed", today: "2026-10-18", action: "Hacer check-in", variant: "outline" },
  { status: "confirmed", today: "2026-10-19", action: "Hacer check-in", variant: "default" },
  { status: "confirmed", today: "2026-10-20", action: "Hacer check-in", variant: "default" },
  { status: "checked_in", today: "2026-10-20", action: "Hacer check-out", variant: "outline" },
  { status: "checked_in", today: "2026-10-21", action: "Hacer check-out", variant: "default" },
  { status: "checked_out", today: "2026-10-21", action: null, variant: null },
] as const)("offers the contextual header action for $status on $today", async ({ status, today, action, variant }) => {
  vi.setSystemTime(new Date(`${today}T05:00:00Z`));
  saved = { ...saved, status };
  mockApi();
  await render();
  const header = page.container.querySelector("h1")!.closest("header")!;
  assert.equal(header.querySelector('[role="combobox"]'), null);
  const actions = Array.from(header.querySelectorAll("button")).filter((item) =>
    /^Hacer check-/.test(item.textContent),
  );
  assert.deepEqual(actions.map((item) => item.textContent), action ? [action] : []);
  if (action) assert.equal(actions[0].getAttribute("data-variant"), variant);
});

it("retains the contact draft after a failed save and a reconnect refresh", async () => {
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
  await React.act(async () => window.dispatchEvent(new window.Event("offline")));
  saved = { ...saved, guest: { ...saved.guest, fullName: "Cambio desde otra pantalla" } };
  await React.act(async () => window.dispatchEvent(new window.Event("online")));
  await page.until(
    () => page.container.querySelector("h1")?.textContent === "Cambio desde otra pantalla",
    "Reconnecting must refresh the saved reservation overview",
  );
  assert.equal(field("fullName").value, "Ana María Pérez");
  assert.equal(field("phone").value, "999 333 444");
  assert.equal(field("email").value, "nuevo@example.com");
  await click("Cancelar");
  assert.match(window.document.body.textContent, /Hay cambios sin guardar/);
  await click("Seguir editando");
  await submit();
  await page.until(() => !popup());
  assert.match(page.container.querySelector("h1")!.textContent, /Ana María Pérez/);
  assert.deepEqual(writes[1].actions, writes[0].actions);
  assert.equal(saved.checkOut, "2026-10-21");
  assert.equal(previews.length, 0);
  assert.equal(await unloadPrevented(), false);
});

it("records payments after a failed save and prevents dismissal or navigation during a save", async () => {
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

it("shows notes, staying guests, and payments in their own cards and edits records from them", async () => {
  saved = {
    ...saved,
    rooms: [...saved.rooms, { ...saved.rooms[0], id: "line-2" }],
    stayingGuests: [
      {
        id: "8d0f1b5e-2c4a-4f6e-9b7d-3a1c5e7f9b2d",
        fullName: "Luis Gómez",
        email: "luis@example.com",
        phone: "+51987654321",
        documentType: "DNI",
        documentNumber: "12345678",
      },
    ],
    paidCents: 10000,
    balanceCents: 20000,
    payments: [payment()],
  };
  mockApi();
  await render();
  const region = (label: string) =>
    page.container.querySelector(`[role="region"][aria-label="${label}"]`)!;
  assert.match(region("Notas de la reserva").textContent, /Llegada por la tarde/);
  assert.ok(button("Editar notas"));
  assert.equal(page.container.querySelector('[role="tab"]'), null);
  assert.equal(
    page.container.ownerDocument.querySelector('nav[aria-label="breadcrumb"]')!.textContent,
    "ReservasDetalle",
  );
  assert.match(
    region("Huéspedes").textContent,
    /Luis GómezDNI 12345678 · \+51 987 654 321 · luis@example\.com/,
  );
  await chooseRowAction('[aria-label="Acciones de Luis Gómez"]', "Editar");
  await fill("fullName", "Luis Gómez Ruiz");
  await submit();
  await page.until(() => writes.length === 1, "The guest edit must save");
  assert.deepEqual(writes[0].actions, [
    {
      type: "set-guests",
      guests: [
        {
          id: "8d0f1b5e-2c4a-4f6e-9b7d-3a1c5e7f9b2d",
          fullName: "Luis Gómez Ruiz",
          email: "luis@example.com",
          phone: "+51987654321",
          documentType: "DNI",
          documentNumber: "12345678",
        },
      ],
    },
  ]);
  await page.until(() => !popup());
  await chooseRowAction('[aria-label="Acciones de Luis Gómez Ruiz"]', "Eliminar");
  assert.match(popup()!.textContent, /Se eliminará a Luis Gómez Ruiz/);
  await submit();
  await page.until(() => writes.length === 2);
  assert.deepEqual(writes[1].actions, [{ type: "set-guests", guests: [] }]);
  assert.match(region("Huéspedes").textContent, /Sin huéspedes registrados/);
  await chooseRowAction('[aria-label^="Acciones del pago"]', "Editar");
  assert.match(popup()!.textContent, /Editar pago/);
  assert.equal(field("amount").value, "100.00");
});

it("lists assigned rooms by number with unassigned rooms last", async () => {
  const room = saved.rooms[0];
  saved = {
    ...saved,
    rooms: [null, "206", "104", "302", "101", "1001", "203", "108"].map((roomNumber, index) => ({
      ...room,
      id: `line-${index}`,
      roomId: roomNumber && `room-${roomNumber}`,
      roomNumber,
    })),
  };
  mockApi();
  await render();
  const rooms = () =>
    Array.from(
      page.container.querySelectorAll<HTMLElement>(
        '[aria-label="Habitaciones asignadas"] [role="listitem"]',
      ),
      (element) => element.textContent.split(" · ")[0],
    );
  assert.deepEqual(rooms(), ["101", "104", "108", "203", "206", "302", "1001", "Sin asignar"]);
  assert.match(page.container.textContent, /206 · Doble2 adultos/);
});

async function back() {
  const link = window.document.querySelector<HTMLElement>('nav[aria-label="breadcrumb"] a');
  assert.ok(link, "Missing Reservas breadcrumb");
  await React.act(async () => link.click());
}

async function chooseRowAction(selector: string, label: string) {
  const trigger = page.container.querySelector<HTMLElement>(selector);
  assert.ok(trigger, `Missing row actions ${selector}`);
  await React.act(async () => trigger.click());
  const item = Array.from(window.document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (element) => element.textContent.trim() === label,
  );
  assert.ok(item, `Missing menu item ${label}`);
  await React.act(async () => item.click());
}

it("validates and saves only contact changes without replacing guests or notes", async () => {
  saved = {
    ...saved,
    guest: { ...saved.guest, documentType: "DNI", documentNumber: "12345678" },
    stayingGuests: [
      {
        id: "staying-guest-1",
        fullName: "Luis García",
        email: null,
        phone: null,
      },
    ],
  };
  mockApi({
    write: () =>
      writes.length === 1 ? Response.json({ error: "invalid email" }, { status: 400 }) : undefined,
  });
  await render();
  await click("Editar contacto");
  assert.equal(popup()!.querySelector('[name="documentType"]') !== null, false);
  assert.equal(popup()!.querySelector('[name="documentNumber"]') !== null, false);
  await fill("fullName", "Ana María Pérez");
  await fill("email", "incorrecto");
  await submit();
  assert.equal(writes.length, 0);
  assert.match(popup()!.textContent, /Ingresa un correo válido/);
  await fill("email", "rejected@example.com");
  await submit();
  await page.until(() => field("email").getAttribute("aria-invalid") === "true");
  assert.equal(field("email").value, "rejected@example.com");
  assert.equal(field("fullName").value, "Ana María Pérez");
  await fill("email", "");
  await submit();
  await page.until(() => !popup());
  assert.match(page.container.querySelector("h1")!.textContent, /Ana María Pérez/);
  assert.equal(saved.notes, "Llegada por la tarde");
  assert.equal(saved.stayingGuests[0].fullName, "Luis García");
  assert.equal(saved.rooms[0].adults, 2);
  assert.equal(saved.guest.documentType, "DNI");
  assert.equal(saved.guest.documentNumber, "12345678");
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].actions, [
    {
      type: "contact",
      contact: {
        fullName: "Ana María Pérez",
        email: null,
        phone: "999111222",
      },
    },
  ]);
  assert.equal(previews.length, 0);
});

function discountTrigger() {
  return Array.from(account().querySelectorAll<HTMLElement>("button")).find((item) =>
    text(item).startsWith("Descuento"),
  )!;
}

function discountInput() {
  const label = Array.from(window.document.querySelectorAll("label")).find(
    (item) => item.textContent.trim() === "Descuento · S/",
  );
  return label ? window.document.querySelector<HTMLInputElement>(`[id="${label.htmlFor}"]`) : null;
}

function discountButton(label: string) {
  return Array.from(
    discountInput()!.closest('[role="dialog"]')!.querySelectorAll<HTMLElement>("button"),
  ).find((item) => item.textContent.trim() === label);
}

it.each(["unopened", "open pristine", "closed pristine"])(
  "keeps the %s discount editor current without overwriting an edited draft",
  async (editor) => {
    saved = { ...saved, savedDiscountCents: 5000, discountCents: 5000 };
    mockApi();
    await render();
    if (editor !== "unopened") {
      await React.act(async () => discountTrigger().click());
      await page.until(() => !!discountInput());
      assert.equal(discountInput()!.value, "50");
      if (editor === "closed pristine") {
        await React.act(async () =>
          discountInput()!.dispatchEvent(
            new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          ),
        );
        await page.until(() => !discountInput());
      }
    }
    saved = { ...saved, savedDiscountCents: 7000, discountCents: 7000 };
    await React.act(async () => page.client.invalidateQueries({ queryKey: ["reservation"] }));
    await page.until(() => text(discountTrigger()) === "Descuento -S/ 70");
    if (editor !== "open pristine") await React.act(async () => discountTrigger().click());
    await page.until(() => !!discountInput());
    assert.equal(discountInput()!.value, "70", "A pristine editor follows the saved discount");
    assert.equal(await unloadPrevented(), false, "A background change must not create a draft");

    await page.fill(discountInput()!, "90");
    saved = { ...saved, savedDiscountCents: 8000, discountCents: 8000 };
    await React.act(async () => page.client.invalidateQueries({ queryKey: ["reservation"] }));
    await page.until(() => text(discountTrigger()) === "Descuento -S/ 80");
    assert.equal(discountInput()!.value, "90", "A background read must keep an edited draft");
    assert.equal(await unloadPrevented(), true);
    await React.act(async () => discountButton("Aplicar")!.click());
    await page.until(() => !discountInput());
    assert.deepEqual(writes[0].actions, [{ type: "set-discount", amountCents: 9000 }]);
  },
);

it("applies and removes the discount from the Cuenta summary, keeping a rejected amount", async () => {
  mockApi({
    write: () =>
      writes.length === 1
        ? Response.json({ error: "Temporary save failure" }, { status: 503 })
        : undefined,
  });
  await render();
  const trigger = discountTrigger;
  const input = discountInput;
  const popoverButton = discountButton;
  assert.equal(text(trigger()), "Descuento S/ 0");
  await React.act(async () => trigger().click());
  await page.until(() => !!input(), "Descuento must open the discount popover");
  assert.equal(popoverButton("Quitar"), undefined, "Quitar is only for an applied discount");
  await page.fill(input()!, "50");
  await React.act(async () => popoverButton("Aplicar")!.click());
  await page.until(() => writes.length === 1);
  assert.equal(input()?.value, "50", "A failed save keeps the popover and its amount");
  saved = { ...saved, savedDiscountCents: 7000, discountCents: 7000 };
  await React.act(async () => page.client.invalidateQueries({ queryKey: ["reservation"] }));
  await page.until(() => text(trigger()) === "Descuento -S/ 70");
  assert.equal(input()?.value, "50", "A background change must also preserve a failed-save draft");
  await React.act(async () => popoverButton("Aplicar")!.click());
  await page.until(() => !input(), "A saved discount closes the popover");
  assert.deepEqual(writes[1].actions, [{ type: "set-discount", amountCents: 5000 }]);
  assert.deepEqual(summaryRows().slice(0, 3), [
    "Subtotal S/ 300",
    "Descuento -S/ 50",
    "Total S/ 250",
  ]);
  await React.act(async () => trigger().click());
  await page.until(() => !!input());
  await React.act(async () => popoverButton("Quitar")!.click());
  await page.until(() => writes.length === 3 && !input());
  assert.deepEqual(writes[2].actions, [{ type: "set-discount", amountCents: 0 }]);
  assert.equal(previews.length, 0, "The popover saves the amount without a bill preview");
});

it.each([
  { label: "Check-in", initial: "confirmed", previous: "Confirmada", status: "checked_in" },
  { label: "Check-out", initial: "checked_in", previous: "Check-in", status: "checked_out" },
])(
  "autosaves $label once and saves it again after a failed response",
  async ({ label, initial, previous, status }) => {
    saved = { ...saved, status: initial };
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
    const checkout = statusOption(label);
    await React.act(async () => {
      checkout.click();
      checkout.click();
    });
    await page.until(() => page.container.textContent.includes("Guardando estado…"));
    assert.equal(writes.length, 1);
    assert.equal(dateTrigger("Estado de la reserva").disabled, true);
    assert.equal(await unloadPrevented(), true);
    assert.equal(saved.status, initial);
    await React.act(async () => {
      void router.navigate({ href: "/reservations" });
    });
    await page.until(() => window.document.body.textContent.includes("Guardando cambios"));
    await click("Seguir editando");
    await React.act(async () =>
      finish(Response.json({ error: "Temporary save failure" }, { status: 503 })),
    );
    await page.until(() => !dateTrigger("Estado de la reserva").disabled);
    assert.ok(dateTrigger("Estado de la reserva").textContent.includes(previous));
    await selectStatus(label);
    await page.until(
      () => !page.container.textContent.includes("Guardando estado…") && saved.status === status,
    );
    assert.deepEqual(writes[1].actions, [{ type: "set-status", status }]);
    assert.equal(saved.checkIn, "2026-10-19");
    assert.equal(saved.checkOut, "2026-10-21");
    assert.equal(saved.balanceCents, 30000);
    assert.equal(popup() !== null, false);
  },
);

it.each([
  { scenario: "local number", phone: "999111222" },
  { scenario: "annotated international number", phone: "+51 987654321 llamar por la tarde" },
])("shows a legacy $scenario as stored and clears it on request", async ({ phone }) => {
  saved = { ...saved, guest: { ...saved.guest, phone } };
  mockApi();
  await render();
  assert.equal(page.container.querySelector(`a[href="tel:${phone}"]`)?.textContent, phone);
  await click("Editar contacto");
  assert.equal(field("phone").value, phone);
  await fill("phone", "");
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    {
      type: "contact",
      contact: { fullName: "Ana Pérez", email: "ana@example.com", phone: null },
    },
  ]);
  assert.match(page.container.textContent, /Sin teléfono/);
  assert.doesNotMatch(page.container.textContent, /Falta|sin teléfono registrado/i);
});

it("keeps a server phone rejection on the contact field until the phone changes", async () => {
  mockApi({
    write: () =>
      writes.length === 1
        ? Response.json(
            { error: "phone number is too long" },
            { status: 400, headers: { "X-Error-Field": "phone" } },
          )
        : undefined,
  });
  await render();
  await click("Editar contacto");
  await fill("phone", "987 654 321");
  await submit();
  await page.until(() => field("phone").getAttribute("aria-invalid") === "true");
  assert.match(
    popup()!.textContent,
    /El número tiene demasiados dígitos para el país seleccionado/,
  );
  await fill("fullName", "Ana María Pérez");
  assert.equal(field("phone").getAttribute("aria-invalid"), "true");
  await fill("phone", "987 654 322");
  await page.until(() => field("phone").getAttribute("aria-invalid") !== "true");
  await submit();
  await page.until(() => !popup());
  assert.equal(writes.length, 2);
  assert.equal(saved.guest.phone, "+51987654322");
});

for (const balance of [-10000]) {
  it(`keeps a checked-out reservation editable with balance ${balance}`, async () => {
    saved = { ...saved, status: "checked_out", balanceCents: balance };
    mockApi();
    await render();
    await click("Editar contacto");
    await fill("phone", "999333444");
    await submit();
    await page.until(() => !popup());
    assert.equal(
      page.container.querySelector('a[href="tel:+51999333444"]')!.textContent,
      "+51 999 333 444",
    );
    assert.equal(saved.status, "checked_out");
  });
}

it("previews cancellation selected in the header before saving and shows the resulting refund due", async () => {
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
  assert.match(page.container.textContent, /Por devolver/);
  assert.deepEqual(writes[0].actions, [
    { type: "set-status", status: "cancelled", reason: "Cambio de planes" },
  ]);
});

it("retries a failed cancellation preview and keeps the reason after a failed save", async () => {
  mockApi({
    preview: () =>
      previews.length === 1
        ? Response.json({ error: "Temporary preview failure" }, { status: 503 })
        : { billing: { ...saved, totalCents: 0, balanceCents: 0 }, validation: { issues: [] } },
    write: () =>
      writes.length === 1
        ? Response.json({ error: "Temporary cancellation save failure" }, { status: 503 })
        : undefined,
  });
  await render();
  await selectStatus("Cancelada");
  await page.until(() => popup()?.textContent.includes("Temporary preview failure") === true);
  assert.equal(button("Confirmar").disabled, true);
  await click("Reintentar");
  await page.until(() => !button("Confirmar").disabled, "The retried preview must finish");
  assert.deepEqual(previews[1].actions, previews[0].actions);
  const reason = "  Cambio de planes  ";
  await fill("reason", reason);
  await click("Confirmar");
  await page.until(
    () => writes.length === 1 && !button("Confirmar").disabled,
    "A failed cancellation save must allow retrying",
  );
  assert.equal(field("reason").value, reason);
  assert.equal(saved.status, "confirmed");
  await click("Confirmar");
  await page.until(() => !popup(), "A successful cancellation closes the confirmation");
  assert.deepEqual(writes[1].actions, [
    { type: "set-status", status: "cancelled", reason: "Cambio de planes" },
  ]);
});

it("warns before restoring a cancelled reservation into a dirty room, then restores it", async () => {
  saved = {
    ...saved,
    status: "cancelled",
    cancelledAt: "2026-10-18T15:00:00Z",
    rooms: [
      { ...saved.rooms[0], roomId: "room-1", roomNumber: "101", housekeepingStatus: "dirty" },
    ],
  };
  mockApi({
    preview: () => ({ billing: { ...saved, status: "checked_in" }, validation: { issues: [] } }),
  });
  await render();
  const warning = () =>
    [...window.document.querySelectorAll('[role="alertdialog"]')].find((item) =>
      item.textContent.includes("La habitación 101 está sucia"),
    );
  const warningButton = (label: string) =>
    [...warning()!.querySelectorAll<HTMLElement>("button")].find(
      (item) => item.textContent.trim() === label,
    )!;
  await selectStatus("Check-in");
  await page.until(() => warning() !== undefined, "Restoring into a dirty room must warn");
  await React.act(async () => warningButton("Volver").click());
  await page.until(() => warning() === undefined);
  assert.equal(popup(), null);
  await selectStatus("Check-in");
  await page.until(() => warning() !== undefined);
  await React.act(async () => warningButton("Hacer check-in").click());
  await page.until(
    () => popup()?.textContent.includes("Restaurar reserva") === true,
    "Restoration must follow the warning",
  );
  assert.equal(writes.length, 0);
  await page.until(() => !button("Guardar cambios").disabled);
  await click("Guardar cambios");
  await page.until(() => saved.status === "checked_in" && !popup());
  assert.deepEqual(writes[0].actions, [{ type: "set-status", status: "checked_in" }]);
});

it.each([
  ["roomTypeId", "not enough rooms available for those dates"],
  ["roomId", "room is already assigned for those dates"],
] as const)(
  "keeps the cancelled refund due intact when header restoration conflicts on %s",
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
    assert.match(page.container.textContent, /Por devolver/);
    await selectStatus("Confirmada");
    await page.until(() => popup()?.textContent.includes("Habitación 1:") === true);
    assert.equal(button("Guardar cambios").disabled, true);
    assert.match(dateTrigger("Estado de la reserva").textContent, /Cancelada/);
    await submit();
    assert.equal(writes.length, 0);
    await click("Cerrar");
    assert.equal(saved.status, "cancelled");
    assert.match(page.container.textContent, /Por devolver/);
  },
);

it("saves stay changes independently with the current server bill", async () => {
  let finish!: (response: Response) => void;
  mockApi({
    write: () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
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
    saved = {
      ...saved,
      checkOut: "2026-10-22",
      subtotalCents: 45000,
      totalCents: 45000,
      balanceCents: 45000,
    };
    finish(Response.json(saved));
  });
  await page.until(() => !popup());
  assert.equal(await unloadPrevented(), false);
  assert.deepEqual(writes[0].actions, [
    { type: "dates", checkIn: "2026-10-19", checkOut: "2026-10-22" },
  ]);
  assert.equal(writes.length, 1);
  assert.equal(saved.guest.fullName, "Ana Pérez");
  assert.equal(saved.guest.phone, "999111222");
  assert.match(page.container.textContent, /3 noches/);
});

it.each(["desktop", "phone"])(
  "saves an agreed nightly price only for a new room in the %s stay editor",
  async (viewport) => {
    if (viewport === "phone") page.mobile();
    page.api.catalog.rooms.push({ id: "room-2", number: "102", roomTypeId: "double" });
    const added = {
      ...saved.rooms[0],
      id: "line-2",
      adults: 2,
      subtotalCents: 24050,
      totalCents: 24050,
      nights: [
        { date: "2026-10-19", priceCents: 12025 },
        { date: "2026-10-20", priceCents: 12025 },
      ],
    };
    mockApi({
      preview: () => ({
        billing: {
          ...saved,
          rooms: [...saved.rooms, added],
          subtotalCents: 54050,
          totalCents: 54050,
          balanceCents: 54050,
        },
        validation: { issues: [] },
      }),
      write: () => {
        saved = {
          ...saved,
          rooms:
            writes.length === 1
              ? [...saved.rooms, added]
              : [saved.rooms[0], { ...added, adults: 1 }],
          subtotalCents: 54050,
          totalCents: 54050,
          balanceCents: 54050,
        };
        return Response.json(saved);
      },
    });
    await render();
    await click("Editar estadía");
    assert.doesNotMatch(popup()!.textContent, /Cambiar precio por noche/);
    await page.until(() => !button("Agregar habitación").disabled);
    await click("Agregar habitación");
    await click("Cambiar precio por noche");
    await fill("rooms[1].room.nightlyRate", "120.25");
    await page.until(() => !button("Guardar cambios").disabled);
    assert.match(popup()!.textContent.replace(/\s/g, ""), /S\/540\.50/);
    if (viewport === "phone") {
      assert.match(popup()!.textContent.replace(/\s/g, ""), /2noches×S\/120\.25·2adultos/);
      await click("Ver detalle");
      assert.equal(button("Ver detalle").getAttribute("aria-expanded"), "true");
    }
    await click("Guardar cambios");
    await page.until(() => !popup());
    assert.deepEqual(writes[0].actions, [
      {
        type: "add-room",
        room: {
          roomTypeId: "double",
          roomId: null,
          adults: 2,
          children: 0,
          nightlyRateCents: 12025,
        },
      },
    ]);
    await click("Editar estadía");
    assert.doesNotMatch(popup()!.textContent, /Cambiar precio por noche|Precio por noche · S\//);
    await fill("rooms[1].room.adults", "1");
    await page.until(() => !button("Guardar cambios").disabled);
    await click("Guardar cambios");
    await page.until(() => writes.length === 2);
    assert.deepEqual(writes[1].actions, [
      {
        type: "edit-room",
        lineId: "line-2",
        room: { roomTypeId: "double", roomId: null, adults: 1, children: 0 },
      },
    ]);
  },
);

it("blocks new-room price previews and saves until an empty or invalid override is undone", async () => {
  page.mobile();
  page.api.catalog.rooms.push({ id: "room-2", number: "102", roomTypeId: "double" });
  mockApi();
  await render();
  await click("Editar estadía");
  await page.until(() => !button("Agregar habitación").disabled);
  await click("Agregar habitación");
  await page.until(() => !button("Guardar cambios").disabled);
  const quoted = previews.length;
  await click("Cambiar precio por noche");
  for (const value of ["", "-1"]) {
    await fill("rooms[1].room.nightlyRate", value);
    await submit();
    await page.flush(350);
    assert.equal(field("rooms[1].room.nightlyRate").getAttribute("aria-invalid"), "true");
    assert.equal(button("Guardar cambios").disabled, true);
    assert.equal(previews.length, quoted);
    assert.equal(writes.length, 0);
    assert.match(popup()!.textContent, /Revisa el precio por noche/);
  }
  await click("Deshacer precio por noche");
  await page.until(() => !button("Guardar cambios").disabled);
  assert.ok(button("Cambiar precio por noche"));
  assert.ok(!popup()!.querySelector('[aria-invalid="true"]'));
  await click("Guardar cambios");
  await page.until(() => writes.length === 1);
  assert.deepEqual(writes[0].actions, [
    { type: "add-room", room: { roomTypeId: "double", roomId: null, adults: 2, children: 0 } },
  ]);
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
  assert.equal(
    window.document.querySelector('[aria-label="Quitar habitación 1"]'),
    null,
    "The last room cannot be removed",
  );
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
  await back();
  await page.until(() => router.state.location.pathname === "/reservations");
});

it("explains a missing reservation instead of offering a retry", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  mockApi();
  page.api.on("GET", "/reservations/reservation-1", () =>
    Response.json({ error: "unrecognized missing reservation message" }, { status: 404 }),
  );
  await render("", false);
  await page.until(() => page.container.textContent.includes("No se encontró la reserva"));
  assert.ok(page.container.textContent.includes("Esta reserva no existe o fue eliminada."));
  assert.equal(page.container.textContent.includes("Reintentar"), false);
  assert.equal(logged.mock.calls.length, 0, "The intentional not-found state needs no diagnostic");
  await click("Volver a reservas");
  await page.until(() => router.state.location.pathname === "/reservations");
});

it.each(["loading", "failed"] as const)(
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
    await render(`?returnTo=${encodeURIComponent(search.toString())}`, false);
    if (state === "failed")
      await page.until(() => page.container.textContent.includes("Reintentar"));
    await back();
    await page.until(() => router.state.location.pathname === "/reservations");
    assert.deepEqual(
      { ...router.state.location.search },
      { ...Object.fromEntries(search), statuses: "all", size: 50 },
    );
  },
);

const account = () => page.container.querySelector('[role="region"][aria-label="Cuenta"]')!;
function text(node: object) {
  const walker = window.document.createTreeWalker(node as never, 4);
  const parts: string[] = [];
  while (walker.nextNode())
    parts.push(walker.currentNode!.textContent!.replace(/\s+/g, " ").trim());
  return parts.filter(Boolean).join(" ");
}
const summaryRows = () =>
  Array.from(account().querySelectorAll('dl[aria-label="Resumen de la cuenta"] > div')).map(text);

it("shows the coupon and refund summary rows only when the bill has them", async () => {
  mockApi();
  await render();
  assert.deepEqual(summaryRows(), [
    "Subtotal S/ 300",
    "Descuento S/ 0",
    "Total S/ 300",
    "Pagado S/ 0",
  ]);
  assert.equal(page.container.querySelector('[role="region"][aria-label="Pagos"]'), null);

  saved = {
    ...saved,
    paidCents: 30000,
    refundedCents: 5000,
    couponAppliedCents: 10000,
    couponIssuedCents: 5000,
    balanceCents: 0,
    payments: [payment({ amountCents: 30000 })],
    refunds: [refund({ status: "completed", amountCents: 5000, refundDate: "2026-10-20" })],
    coupons: [
      {
        id: "coupon-1",
        code: "VUELTA50",
        valueCents: 5000,
        balanceCents: 5000,
        issuedAt: "2026-10-20T16:00:00Z",
        issuedBy: "admin",
        expiresOn: "2027-10-20",
      },
    ],
    couponMovements: [
      couponMovement({ kind: "redeem", code: "OTRO100", amountCents: 10000 }),
      couponMovement({
        kind: "issue",
        code: "VUELTA50",
        amountCents: 5000,
        at: "2026-10-20T16:00:00Z",
      }),
    ],
  };
  await page.client.invalidateQueries();
  await page.until(
    () => summaryRows().length > 4,
    "The refreshed bill must show its optional rows",
  );
  assert.deepEqual(summaryRows(), [
    "Subtotal S/ 300",
    "Descuento S/ 0",
    "Total S/ 300",
    "Pagado S/ 300",
    "Pagado con cupón S/ 100",
    "Reembolsado -S/ 50",
    "Pasado a cupón -S/ 50 VUELTA50 · Vence el 20 de octubre de 2027",
  ]);
});

function payment(fields: Partial<ReservationPayment> = {}): ReservationPayment {
  return {
    id: "payment-1",
    reservationId: "reservation-1",
    amountCents: 10000,
    method: "cash",
    paymentDate: "2026-10-19",
    reference: null,
    notes: null,
    createdAt: "2026-10-19T15:00:00Z",
    culqiChargeId: null,
    ...fields,
  };
}

function refund(fields: Partial<ReservationRefund> = {}): ReservationRefund {
  return {
    id: "refund-1",
    paymentId: "payment-1",
    amountCents: 5000,
    method: "transfer",
    reference: null,
    reason: "Sobrepago",
    status: "requested",
    requestedAt: "2026-10-20T15:00:00Z",
    requestedBy: "admin",
    resolvedAt: null,
    resolvedBy: null,
    refundDate: null,
    completionReference: null,
    failureReason: null,
    culqiChargeId: null,
    culqiRefundId: null,
    ...fields,
  };
}

function couponMovement({
  kind,
  code,
  amountCents,
  at = "2026-10-19T16:00:00Z",
}: {
  kind: ReservationCouponMovement["kind"];
  code: string;
  amountCents: number;
  at?: string;
}): ReservationCouponMovement {
  return {
    id: `${kind}-${code}`,
    couponId: `coupon-${code}`,
    code,
    kind,
    amountCents,
    recordedAt: at,
    recordedOn: at.slice(0, 10),
    recordedBy: "admin",
  };
}

it.each([
  {
    state: "guest owes",
    bill: { initialPaymentDueCents: 15000 },
    line: "Saldo pendiente S/ 300 Falta el depósito: S/ 150",
    action: "Registrar pago",
  },
  {
    state: "hotel owes",
    bill: { paidCents: 40000, balanceCents: -10000 },
    line: "Por devolver S/ 100",
  },
  {
    state: "part of the refund due requested",
    bill: { paidCents: 40000, balanceCents: -10000, pendingRefundCents: 4000 },
    line: "Por devolver S/ 60",
  },
  {
    state: "the whole refund due requested",
    bill: { paidCents: 40000, balanceCents: -10000, pendingRefundCents: 10000 },
    line: "Reembolso solicitado S/ 100",
  },
  { state: "settled", bill: { paidCents: 30000, balanceCents: 0 }, line: "Cuenta saldada S/ 0" },
])("shows one status line and its action when the $state", async ({ bill, line, action }) => {
  saved = { ...saved, ...bill };
  mockApi();
  await render();
  const status = account().querySelector('[aria-label="Estado de la cuenta"]')!;
  assert.equal(text(status).replace(` ${action}`, ""), line);
  assert.deepEqual(Array.from(status.querySelectorAll("button")).map(text), action ? [action] : []);
  assert.equal(
    Array.from(page.container.querySelectorAll("button")).filter(
      (item) => text(item) === "Registrar pago",
    ).length,
    action ? 1 : 0,
    "Only a bill the guest owes offers Registrar pago",
  );
});

it("lists payments, refunds and coupon movements oldest first, locking changed payments", async () => {
  saved = {
    ...saved,
    paidCents: 41000,
    refundedCents: 2000,
    pendingRefundCents: 3000,
    couponAppliedCents: 10000,
    balanceCents: -19000,
    payments: [
      payment({ id: "cash", amountCents: 20000 }),
      payment({
        id: "online",
        amountCents: 20000,
        method: "card",
        createdAt: "2026-10-19T16:00:00Z",
        culqiChargeId: "chr_1",
      }),
      payment({
        id: "yape",
        amountCents: 1000,
        method: "yape",
        reference: "op-77",
        createdAt: "2026-10-19T17:00:00Z",
      }),
    ],
    refunds: [
      refund({ id: "failed", paymentId: "cash", status: "failed", failureReason: "Cuenta errada" }),
      refund({
        id: "requested",
        paymentId: "cash",
        amountCents: 3000,
        requestedAt: "2026-10-20T16:00:00Z",
      }),
      refund({
        id: "completed",
        paymentId: "cash",
        amountCents: 2000,
        status: "completed",
        requestedAt: "2026-10-21T15:00:00Z",
        refundDate: "2026-10-21",
        completionReference: "OP-1",
      }),
    ],
    couponMovements: [
      couponMovement({
        kind: "redeem",
        code: "OTRO100",
        amountCents: 10000,
        at: "2026-10-19T14:00:00Z",
      }),
    ],
  };
  mockApi();
  await render();
  const table = account().querySelector('table[aria-label="Movimientos"]')!;
  assert.deepEqual(Array.from(table.querySelectorAll("th")).map(text), [
    "Fecha",
    "Movimiento",
    "Método",
    "Referencia",
    "Importe",
    "Acciones",
  ]);
  const rows = Array.from(table.querySelectorAll("tbody tr"));
  assert.deepEqual(rows.map(text), [
    "19 oct 2026 Cupón aplicado Cupón OTRO100 S/ 100",
    "19 oct 2026 Pago Efectivo — S/ 200",
    "19 oct 2026 Pago En línea Tarjeta — S/ 200",
    "19 oct 2026 Pago Yape OP-77 S/ 10",
    "20 oct 2026 Reembolso Fallido Transferencia — S/ 50",
    "20 oct 2026 Reembolso Solicitado Transferencia — (S/ 30)",
    "21 oct 2026 Reembolso Transferencia OP-1 -S/ 20",
  ]);
  assert.equal(text(rows[4].querySelector("del")!), "S/ 50", "A failed refund is struck through");
  assert.ok(rows[1].querySelector('[aria-label="Tiene reembolsos: no se puede editar"]'));
  assert.ok(rows[2].querySelector('[aria-label="Pago en línea: no se puede editar"]'));
  assert.equal(rows[0].querySelector("button"), null, "Coupon movements are read-only");
  assert.equal(rows[5].querySelector("button"), null, "Refund rows are read-only here");
  assert.ok(summaryRows().includes("Reembolsado -S/ 20"), "Only the completed refund counts");
  assert.equal(table.querySelectorAll('[aria-label^="Acciones del pago"]').length, 1);
  await chooseRowAction('[aria-label^="Acciones del pago"]', "Eliminar");
  await submit();
  await page.until(() => writes.length === 1);
  assert.deepEqual(writes[0].actions, [{ type: "delete-payment", paymentId: "yape" }]);
});

function cancellation(fields: Partial<ReservationCancellation> = {}): ReservationCancellation {
  return {
    id: "cancellation-1",
    outcome: "cancelled",
    recordedAt: "2026-10-18T15:00:00Z",
    recordedBy: "admin",
    freeUntil: "2026-10-17",
    policyChargeCents: 15000,
    waivedCents: 0,
    finalChargeCents: 15000,
    restoredAt: null,
    waivers: [],
    ...fields,
  };
}

it("bills a cancelled stay by its active charge and waivers and explains it in an alert", async () => {
  const waiver = (id: string, amountCents: number, reason: string) => ({
    id,
    amountCents,
    reason,
    recordedAt: "2026-10-18T16:00:00Z",
    recordedBy: "admin",
  });
  const active = cancellation({
    id: "active",
    waivedCents: 5000,
    finalChargeCents: 10000,
    waivers: [waiver("waiver-1", 5000, "Cliente frecuente")],
  });
  saved = {
    ...saved,
    status: "cancelled",
    cancelledAt: "2026-10-18T15:00:00Z",
    cancellationReason: "Cambio de planes",
    savedDiscountCents: 2000,
    subtotalCents: 10000,
    discountCents: 0,
    totalCents: 10000,
    paidCents: 15000,
    balanceCents: -5000,
    payments: [payment({ amountCents: 15000 })],
    cancellation: active,
    cancellations: [
      cancellation({
        id: "restored",
        recordedAt: "2026-10-10T15:00:00Z",
        restoredAt: "2026-10-11T15:00:00Z",
        waivers: [waiver("old-waiver", 15000, "Error del hotel")],
      }),
      active,
    ],
  };
  mockApi();
  await render();
  assert.deepEqual(summaryRows(), [
    "Cargo por cancelación S/ 150",
    "Cargo perdonado -S/ 50 Cliente frecuente",
    "Total S/ 100",
    "Pagado S/ 150",
  ]);
  assert.equal(
    Array.from(account().querySelectorAll("button")).some((item) =>
      text(item).startsWith("Descuento"),
    ),
    false,
    "A cancelled stay's discount cannot be edited",
  );
  const alert = page.container.querySelector('[role="alert"]')!;
  assert.equal(text(alert), "Reserva cancelada · 18 oct 2026 Cambio de planes");
  assert.doesNotMatch(page.container.textContent, /saldo a favor|crédito/i);
});

it("reads No se presentó for a No-show stay and bills its charge", async () => {
  saved = {
    ...saved,
    status: "no_show",
    subtotalCents: 15000,
    totalCents: 15000,
    balanceCents: 15000,
    cancellation: cancellation({
      outcome: "no_show",
      recordedAt: "2026-10-20T03:00:00Z",
      freeUntil: null,
    }),
  };
  saved.cancellations = [saved.cancellation!];
  mockApi();
  await render();
  assert.match(text(page.container.querySelector("fieldset header")!), /Ana Pérez No se presentó/);
  assert.match(dateTrigger("Estado de la reserva").textContent, /No se presentó/);
  assert.equal(
    text(page.container.querySelector('[role="alert"]')!),
    "No se presentó · 19 oct 2026",
  );
  assert.deepEqual(summaryRows(), [
    "Cargo por no presentarse S/ 150",
    "Total S/ 150",
    "Pagado S/ 0",
  ]);
});

it.each([
  { plan: "flexible", label: "Flexible" },
  { plan: "non_refundable", label: "No reembolsable" },
] as const)(
  "shows the accepted $label rate plan with the stay, outside the Cuenta",
  async ({ plan, label }) => {
    saved = { ...saved, ratePlan: { ...saved.ratePlan, plan } };
    mockApi();
    await render();
    const stay = Array.from(page.container.querySelectorAll('[data-slot="card"]')).find(
      (card) => card.querySelector("h2")?.textContent === "Estadía y habitaciones",
    )!;
    assert.match(text(stay), new RegExp(`Plan tarifario ${label}`));
    assert.doesNotMatch(text(account()), /Plan tarifario/);
  },
);
