import assert from "node:assert/strict";
import { afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLElement, HTMLInputElement } from "happy-dom";
import type {
  ReservationCancellation,
  ReservationCoupon,
  ReservationCouponMovement,
  ReservationDetail,
  ReservationPayment,
  ReservationRefund,
  WorkflowCommand,
  WorkflowIssue,
  WorkflowPreview,
} from "../src/lib/api.ts";
import { sharedBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

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
  browser = await sharedBrowserTest();
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
  page.api.on(
    "GET",
    "/coupons/:code",
    ({ params }) =>
      saved.coupons.find((coupon) => coupon.code === params.code) ??
      Response.json({ error: "coupon not found" }, { status: 404 }),
  );
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
      nationality: null,
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
      (await options.preview?.(body)) ?? {
        billing: body.actions.reduce((bill, action) => {
          if (
            action.type === "set-status" &&
            (action.status === "cancelled" || action.status === "no_show")
          )
            return {
              ...bill,
              status: action.status,
              cancellation: cancellation({ outcome: action.status }),
            };
          return issueCoupon(bill, action);
        }, saved),
        validation: { issues: [] },
      },
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
            ...saved.payments,
            payment({
              ...action.payment,
              reference: action.payment.reference ?? null,
              notes: action.payment.notes ?? null,
              id: `payment-${saved.payments.length + 1}`,
              reservationId: saved.id,
            }),
          ],
        };
      if (action.type === "void-payment")
        saved = {
          ...saved,
          payments: saved.payments.map((payment) =>
            payment.id === action.paymentId
              ? {
                  ...payment,
                  voidedAt: "2026-10-19T16:00:00Z",
                  voidedBy: "kevin",
                  voidReason: action.reason,
                }
              : payment,
          ),
        };
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
      if (action.type === "request-refund") {
        const returned = action.completed ? action.amountCents : 0;
        saved = {
          ...saved,
          refundedCents: saved.refundedCents + returned,
          pendingRefundCents: saved.pendingRefundCents + action.amountCents - returned,
          balanceCents: saved.balanceCents + returned,
          refunds: [
            ...saved.refunds,
            refund({
              id: `refund-${saved.refunds.length + 1}`,
              paymentId: action.paymentId,
              amountCents: action.amountCents,
              method: action.method,
              reason: action.reason,
              status: action.completed ? "completed" : "requested",
              refundDate: action.completed?.refundDate ?? null,
              completionReference: action.completed?.reference ?? null,
            }),
          ],
        };
      }
      if (action.type === "complete-refund" || action.type === "fail-refund") {
        const target = saved.refunds.find((entry) => entry.id === action.refundId)!;
        const returned = action.type === "complete-refund" ? target.amountCents : 0;
        saved = {
          ...saved,
          refundedCents: saved.refundedCents + returned,
          pendingRefundCents: saved.pendingRefundCents - target.amountCents,
          balanceCents: saved.balanceCents + returned,
          refunds: saved.refunds.map((entry) =>
            entry !== target
              ? entry
              : action.type === "complete-refund"
                ? { ...entry, status: "completed", refundDate: action.refundDate }
                : { ...entry, status: "failed", failureReason: action.reason },
          ),
        };
      }
      saved = issueCoupon(saved, action);
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
async function render(search = "", waitForDetail = true, withToasts = false) {
  router = browser.routing.createRouter({
    routeTree: routes.router.routeTree,
    history: browser.routing.createMemoryHistory({
      initialEntries: [`/reservations/reservation-1${search}`],
    }),
  });
  if (withToasts) {
    await React.act(async () => router.load());
    await page.render(
      await browser.withToasts(React.createElement(browser.routing.RouterProvider, { router })),
    );
  } else await page.renderRouter(router);
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
const popup = () =>
  window.document.querySelector(
    '[role="dialog"]:is([data-slot="dialog-content"], [data-slot="sheet-content"])',
  );
async function chooseCharge(title: string) {
  const option = Array.from(popup()!.querySelectorAll<HTMLElement>('[role="radio"]')).find(
    (radio) => radioName(radio).startsWith(title),
  );
  assert.ok(option, `Missing charge option ${title}`);
  await React.act(async () => option.click());
}
const header = () => page.container.querySelector("h1")!.closest("header")!;
const statusMenu = (label: string) =>
  chooseRowAction('[aria-label="Acciones de la reserva"]', label);
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
async function chooseStatus(label: string) {
  await React.act(async () => dateTrigger("Estado").click());
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

it("confirms the page check-out balance, sends nothing on Volver, and offers undo", async () => {
  saved = { ...saved, status: "checked_in", paidCents: 10000, balanceCents: 20000 };
  mockApi();
  await render("", true, true);
  await click("Hacer check-out");
  const confirmation = () => window.document.querySelector('[role="alertdialog"]');
  assert.match(
    confirmation()!.textContent,
    /Quedan S\/\s*200 por pagar\. ¿Hacer check-out de todos modos\?/,
  );
  await click("Volver");
  assert.equal(confirmation(), null);
  assert.equal(writes.length, 0);
  await click("Hacer check-out");
  const confirm = Array.from(confirmation()!.querySelectorAll<HTMLElement>("button")).find(
    (item) => item.textContent === "Hacer check-out",
  )!;
  await React.act(async () => confirm.click());
  await page.until(() => window.document.body.textContent.includes("Check-out registrado"));
  assert.deepEqual(writes[0].actions, [{ type: "set-status", status: "checked_out" }]);
  await page.until(() => !button("Deshacer").disabled);
  await click("Deshacer");
  await page.until(() => window.document.body.textContent.includes("Check-out deshecho"));
  assert.deepEqual(writes[1].actions, [{ type: "set-status", status: "checked_in" }]);
  assert.equal(saved.balanceCents, 20000);
});

it("invalidates check-in undo after cancellation, even when the status later returns to checked-in", async () => {
  mockApi();
  await render("", true, true);
  await click("Hacer check-in");
  await page.until(() => window.document.body.textContent.includes("Check-in registrado"));
  const undo = button("Deshacer");
  await statusMenu("Cancelar reserva");
  await page.until(() => !button("Confirmar").disabled);
  await click("Confirmar");
  await page.until(() => !window.document.querySelector('[role="dialog"] form'));
  await React.act(async () => undo.click());
  assert.equal(saved.status, "cancelled", "An old undo must not silently restore a cancellation");
  assert.equal(writes.length, 2);
  await statusMenu("Restaurar reserva");
  await page.until(() => !button("Restaurar reserva").disabled);
  await submit();
  await page.until(() => !window.document.querySelector('[role="dialog"] form'));
  await click("Hacer check-in");
  await page.until(() => saved.status === "checked_in");
  await React.act(async () => undo.click());
  assert.equal(saved.status, "checked_in", "A status cycle must not revive the invalidated undo");
  assert.equal(writes.length, 4);
  assert.ok(!undo.isConnected || undo.disabled);
});

it("retains the contact draft after a failed save and a reconnect refresh", async () => {
  mockApi({
    write: () =>
      writes.length === 1
        ? Response.json({ error: "temporary failure" }, { status: 503 })
        : undefined,
  });
  await render();
  await statusMenu("Editar contacto");
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
  assert.equal(button("Hacer check-in").disabled, true);
  assert.equal(button("Acciones de la reserva").disabled, true);
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

it("corrects S/ 100 cash to S/ 80 card after a failed save, sending the void and new payment together once", async () => {
  saved = { ...saved, paidCents: 10000, balanceCents: 20000, payments: [payment()] };
  mockApi({
    write: () =>
      writes.length === 1
        ? Response.json({ error: "response unavailable" }, { status: 503 })
        : undefined,
  });
  await render();
  await chooseRowAction('[aria-label^="Acciones del pago de"]', "Corregir");
  assert.equal(field("amount").value, "100.00", "Corregir starts from the saved payment");
  await submit();
  assert.equal(writes.length, 0, "A correction needs a reason");
  await fill("voidReason", "Pagó con tarjeta");
  await fill("amount", "80");
  await React.act(async () => dateTrigger("Método de pago").click());
  await React.act(async () => statusOption("Tarjeta").click());
  await submit();
  await page.until(() => !button("Guardar cambios").disabled);
  assert.equal(field("voidReason").value, "Pagó con tarjeta");
  assert.equal(field("amount").value, "80");
  await submit();
  await page.until(() => !popup());
  const correction = [
    { type: "void-payment", paymentId: "payment-1", reason: "Pagó con tarjeta" },
    {
      type: "add-payment",
      payment: { amountCents: 8000, method: "card", paymentDate: "2026-10-19" },
    },
  ];
  assert.deepEqual(
    writes.map((write) => write.actions),
    [correction, correction],
  );
  assert.match(text(movementsCard()), /Anulado Pagó con tarjeta · anulado por kevin/);
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
  await statusMenu("Editar contacto");
  assert.equal(popup()!.querySelector('[name="documentType"]') !== null, false);
  assert.equal(popup()!.querySelector('[name="documentNumber"]') !== null, false);
  assert.equal(nationalityFlag(), null);
  assert.equal(nationalityTrigger().textContent, "Selecciona un país");
  await chooseNationality("Chile");
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
        nationality: "CL",
      },
    },
  ]);
  assert.equal(previews.length, 0);
  assert.equal(nationalityFlag()?.getAttribute("alt"), "Nacionalidad: Chile");
});

const nationalityFlag = () => header().querySelector('img[alt^="Nacionalidad"]');

function nationalityTrigger() {
  const label = Array.from(window.document.querySelectorAll("label")).find(
    (item) => item.textContent.trim() === "Nacionalidad",
  );
  assert.ok(label, "Missing nationality field");
  const trigger = window.document.getElementById(label.htmlFor);
  assert.ok(trigger, "Missing nationality picker");
  return trigger;
}

async function chooseNationality(name: string) {
  await React.act(async () => (nationalityTrigger() as HTMLElement).click());
  const option = Array.from(window.document.querySelectorAll('[role="option"]')).find(
    (item) => item.textContent.trim() === name,
  );
  assert.ok(option, `Missing nationality ${name}`);
  await React.act(async () => (option as HTMLElement).click());
}

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
  assert.equal(button("Hacer check-in").disabled, true);
  assert.equal(button("Acciones de la reserva").disabled, true);
  await click("Hacer check-in");
  assert.equal(writes.length, 0);
  await React.act(async () => popoverButton("Aplicar")!.click());
  await page.until(() => writes.length === 1);
  assert.equal(input()?.value, "50", "A failed save keeps the popover and its amount");
  saved = { ...saved, savedDiscountCents: 7000, discountCents: 7000 };
  await React.act(async () => page.client.invalidateQueries({ queryKey: ["reservation"] }));
  await page.until(() => text(trigger()) === "Descuento -S/ 70");
  assert.equal(input()?.value, "50", "A background change must also preserve a failed-save draft");
  await React.act(async () => popoverButton("Aplicar")!.click());
  await page.until(() => !input(), "A saved discount closes the popover");
  assert.equal(button("Hacer check-in").disabled, false);
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
] as const)(
  "saves a $label correction once and keeps the chosen status after a failed response",
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
    await statusMenu("Corregir estado…");
    await chooseStatus(label);
    const save = button("Guardar cambios");
    await React.act(async () => {
      save.click();
      save.click();
    });
    await page.until(() => writes.length === 1);
    assert.equal(writes.length, 1);
    assert.equal(button("Guardando…").disabled, true);
    assert.equal(button("Acciones de la reserva").disabled, true);
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
    await page.until(() => !button("Guardar cambios").disabled);
    assert.match(header().textContent, new RegExp(previous));
    assert.ok(dateTrigger("Estado").textContent.includes(label));
    await submit();
    await page.until(() => !popup() && saved.status === status);
    assert.deepEqual(writes[1].actions, [{ type: "set-status", status }]);
    assert.equal(writes[1].requestId, writes[0].requestId);
    assert.equal(saved.checkIn, "2026-10-19");
    assert.equal(saved.checkOut, "2026-10-21");
    assert.equal(saved.balanceCents, 30000);
    assert.equal(popup() !== null, false);
  },
);

it("previews cancellation selected in the header before saving and shows the resulting refund due", async () => {
  saved = { ...saved, paidCents: 20000, balanceCents: 10000 };
  const released = {
    ...saved,
    status: "cancelled" as const,
    totalCents: 12345,
    subtotalCents: 12345,
    balanceCents: -7655,
    refundDueCents: 7655,
    creditCents: 7655,
    cancellation: cancellation({ policyChargeCents: 12345, finalChargeCents: 12345 }),
  };
  mockApi({
    preview: () => ({
      billing: released,
      validation: { issues: [] },
    }),
    write: (command) => {
      saved = {
        ...released,
        cancellationReason:
          command.actions[0].type === "set-status" ? (command.actions[0].reason ?? null) : null,
      };
      return Response.json(saved);
    },
  });
  await render("", true, true);
  await statusMenu("Cancelar reserva");
  await page.until(() => popup() !== null && !button("Confirmar").disabled);
  assert.equal(writes.length, 0);
  assert.match(header().textContent, /Confirmada/);
  assert.match(
    text(popup()!),
    /Fuera del plazo de cancelación gratuita · Cargo de la primera noche/,
  );
  assert.match(text(popup()!), /Cargo por cancelación Cobrar S\/ 123\.45/);
  assert.match(text(popup()!), /Por devolver S\/ 76\.55/);
  assert.doesNotMatch(text(popup()!), /Subtotal|Descuento/);
  await fill("reason", "Cambio de planes");
  await submit();
  await page.until(() => !popup());
  assert.match(header().textContent, /Cancelada/);
  assert.match(page.container.textContent, /Cambio de planes/);
  assert.match(page.container.textContent, /Por devolver/);
  assert.deepEqual(writes[0].actions, [
    { type: "set-status", status: "cancelled", reason: "Cambio de planes" },
  ]);
  assert.equal(router.state.location.pathname, "/reservations/reservation-1");
  await page.until(() =>
    text(window.document.body).includes("Reserva cancelada · Por devolver S/ 76.55"),
  );
  assert.ok(button("Devolver…"));
});

it("requires one reason for an inline waiver and saves the cancellation and waiver atomically", async () => {
  mockApi({
    preview: (command) => ({
      billing: {
        ...saved,
        cancellation: cancellation({
          policyChargeCents: 12345,
          finalChargeCents: command.actions.length === 2 ? 2345 : 12345,
        }),
        balanceCents: command.actions.length === 2 ? 2345 : 12345,
      },
      validation: { issues: [] },
    }),
  });
  await render();
  await statusMenu("Cancelar reserva");
  await page.until(() => !button("Confirmar").disabled);
  assert.equal(popup()!.querySelector('[name="amount"]'), null);
  await chooseCharge("Perdonar una parte");
  assert.equal(field("amount").value, "");
  assert.equal(field("reason").required, true);
  await submit();
  assert.equal(writes.length, 0);
  assert.match(popup()!.textContent, /Indica el motivo/);
  await fill("amount", "123.46");
  await fill("reason", "  Error del hotel  ");
  await submit();
  assert.equal(writes.length, 0);
  assert.match(text(popup()!), /El importe no puede superar S\/ 123\.45/);
  await fill("amount", "100");
  await page.until(() => text(popup()!).includes("Saldo pendiente S/ 23.45"));
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "set-status", status: "cancelled", reason: "Error del hotel" },
    { type: "waive-cancellation-charge", amountCents: 10000, reason: "Error del hotel" },
  ]);
});

it("blocks saving through failed and stale waiver previews without substituting the saved bill", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  let finishOld!: (preview: WorkflowPreview) => void;
  let finishCurrent!: (preview: WorkflowPreview) => void;
  const previewBill = (balanceCents: number): WorkflowPreview => ({
    billing: {
      ...saved,
      cancellation: cancellation(),
      balanceCents,
    },
    validation: { issues: [] },
  });
  mockApi({
    preview: (command) => {
      if (saved.status === "cancelled") return previewBill(10000);
      const waiver = command.actions.find((action) => action.type === "waive-cancellation-charge");
      if (!waiver) return previewBill(15000);
      if (fail) return Response.json({ error: "preview unavailable" }, { status: 503 });
      return new Promise((resolve) => {
        if (waiver.amountCents === 10000) finishOld = resolve;
        else finishCurrent = resolve;
      });
    },
  });
  await render();
  await statusMenu("Cancelar reserva");
  await page.until(() => !button("Confirmar").disabled);
  await chooseCharge("Perdonar una parte");
  await fill("amount", "100");
  await fill("reason", "Error del hotel");
  await page.until(() => text(popup()!).includes("Ocurrió un error inesperado"));
  assert.doesNotMatch(text(popup()!), /preview unavailable/);
  assert.ok(log.mock.calls.length);
  assert.equal(button("Confirmar").disabled, true);
  assert.doesNotMatch(text(popup()!), /Saldo pendiente/);
  fail = false;
  await click("Reintentar");
  await page.until(() => !!finishOld);
  await fill("amount", "50");
  await page.until(() => !!finishCurrent);
  await React.act(async () => finishOld(previewBill(5000)));
  assert.equal(button("Confirmar").disabled, true);
  assert.doesNotMatch(text(popup()!), /Saldo pendiente S\/ 50/);
  await submit();
  assert.equal(writes.length, 0);
  await React.act(async () => finishCurrent(previewBill(10000)));
  await page.until(() => !button("Confirmar").disabled);
  assert.match(text(popup()!), /Saldo pendiente S\/ 100/);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "set-status", status: "cancelled", reason: "Error del hotel" },
    { type: "waive-cancellation-charge", amountCents: 5000, reason: "Error del hotel" },
  ]);
});

it("refreshes the cancellation charge across the property deadline without losing the reason", async () => {
  mockApi({
    preview: () => ({
      billing: {
        ...saved,
        cancellation: cancellation({
          freeUntil: "2026-10-19",
          policyChargeCents: previews.length === 1 ? 0 : 15000,
        }),
        totalCents: previews.length === 1 ? 0 : 15000,
        balanceCents: previews.length === 1 ? 0 : 15000,
      },
      validation: { issues: [] },
    }),
  });
  await render();
  await statusMenu("Cancelar reserva");
  await page.until(() => text(popup()!).includes("Sin cargo"));
  await fill("reason", "Cambio de planes");
  await React.act(async () => {
    vi.setSystemTime(new Date("2026-10-20T05:00:00Z"));
    window.dispatchEvent(new window.Event("focus"));
  });
  await page.until(() => text(popup()!).includes("Fuera del plazo"));
  assert.match(text(popup()!), /Cobrar S\/ 150/);
  assert.match(text(popup()!), /Saldo pendiente S\/ 150/);
  assert.equal(field("reason").value, "Cambio de planes");
});

it.each([false, true])("marks a stay as not presented with inline waiver = %s", async (waiving) => {
  mockApi({
    preview: (command) => ({
      billing: {
        ...saved,
        cancellation: cancellation({
          outcome: "no_show",
          policyChargeCents: 15000,
          finalChargeCents: command.actions.length === 2 ? 0 : 15000,
        }),
        balanceCents: command.actions.length === 2 ? 0 : 15000,
      },
      validation: { issues: [] },
    }),
  });
  await render("", true, true);
  await statusMenu("Marcar como no presentado");
  await page.until(() => !button("Confirmar").disabled);
  assert.match(popup()!.textContent, /¿El huésped no se presentó\?/);
  assert.match(text(popup()!), /Cargo por no presentarse · Primera noche/);
  assert.equal(popup()!.querySelector('[name="reason"]'), null);
  if (waiving) {
    await chooseCharge("Perdonar todo el cargo");
    assert.equal(popup()!.querySelector('[name="amount"]'), null);
    assert.equal(field("reason").required, true);
    await fill("reason", "Error del hotel");
    await page.until(() => text(popup()!).includes("Cuenta saldada S/ 0"));
  }
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "set-status", status: "no_show" },
    ...(waiving
      ? [{ type: "waive-cancellation-charge", amountCents: 15000, reason: "Error del hotel" }]
      : []),
  ]);
  await page.until(() => text(window.document.body).includes("Marcada como no presentada"));
});

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
  await page.until(() => router.state.location.pathname === "/calendar");
  assert.deepEqual({ ...router.state.location.search }, { from: "2026-10-12", span: 14 });
});

const account = () => page.container.querySelector('[role="region"][aria-label="Cuenta"]')!;
const movementsCard = () =>
  page.container.querySelector('[role="region"][aria-label="Movimientos"]')!;
function text(node: object) {
  const walker = window.document.createTreeWalker(node as never, 4);
  const parts: string[] = [];
  while (walker.nextNode())
    parts.push(walker.currentNode!.textContent!.replace(/\s+/g, " ").trim());
  return parts.filter(Boolean).join(" ");
}
const summaryRows = () =>
  Array.from(account().querySelectorAll('dl[aria-label="Resumen de la cuenta"] > div')).map(text);

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
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
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
    expiresOn: "2027-10-19",
    kind,
    amountCents,
    recordedAt: at,
    recordedOn: at.slice(0, 10),
    recordedBy: "admin",
  };
}

function issuedCoupon(fields: Partial<ReservationCoupon> = {}): ReservationCoupon {
  return {
    id: "coupon-1",
    code: "K7Q2M9XPA4",
    valueCents: 10000,
    balanceCents: 10000,
    issuedAt: "2026-10-19T15:30:00Z",
    issuedBy: "admin",
    expiresOn: "2027-10-19",
    ...fields,
  };
}

function issueCoupon(bill: ReservationDetail, action: WorkflowCommand["actions"][number]) {
  if (action.type !== "issue-coupon") return bill;
  const coupon = issuedCoupon({
    id: `coupon-${bill.coupons.length + 1}`,
    valueCents: action.amountCents,
    balanceCents: action.amountCents,
  });
  return {
    ...bill,
    couponIssuedCents: bill.couponIssuedCents + action.amountCents,
    balanceCents: bill.balanceCents + action.amountCents,
    refundDueCents: bill.refundDueCents - action.amountCents,
    coupons: [...bill.coupons, coupon],
    couponMovements: [
      ...bill.couponMovements,
      couponMovement({
        kind: "issue",
        code: coupon.code,
        amountCents: action.amountCents,
        at: coupon.issuedAt,
      }),
    ],
  };
}

const accountStatusLine = () => account().querySelector('[aria-label="Estado de la cuenta"]')!;

function owesBack(fields: Partial<ReservationDetail> = {}) {
  saved = {
    ...saved,
    subtotalCents: 20000,
    totalCents: 20000,
    paidCents: 30000,
    balanceCents: -10000,
    refundDueCents: 10000,
    payments: [payment({ amountCents: 30000 })],
    ...fields,
  };
}

async function dialogOptions(label: string) {
  await React.act(async () => dateTrigger(label).click());
  return Array.from(window.document.querySelectorAll('[role="option"]')).map(text);
}

function pickerDay(day: string) {
  const element = window.document.querySelector<HTMLElement>(`button[data-day="${day}"]`);
  assert.ok(element, `Missing date ${day}`);
  return element as unknown as HTMLButtonElement;
}

it.each([
  {
    handedOver: true,
    completed: { refundDate: "2026-10-18", reference: "OP-5" },
    line: "Cuenta saldada S/ 0",
    reembolsado: "Reembolsado -S/ 100",
  },
  { handedOver: false, line: "Reembolso solicitado S/ 100", reembolsado: undefined },
])(
  "returns S/ 100 owed back by hand (money handed over: $handedOver)",
  async ({ handedOver, completed, line, reembolsado }) => {
    const browserTimeZone = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    vi.setSystemTime(new Date("2026-10-20T03:00:00Z"));
    try {
      await returnOwedMoney({ handedOver, completed, line, reembolsado });
    } finally {
      if (browserTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = browserTimeZone;
    }
  },
);

async function returnOwedMoney({
  handedOver,
  completed,
  line,
  reembolsado,
}: {
  handedOver: boolean;
  completed?: { refundDate: string; reference: string };
  line: string;
  reembolsado?: string;
}) {
  owesBack();
  mockApi();
  await render();
  assert.equal(text(accountStatusLine()), "Por devolver S/ 100 Devolver…");
  await click("Devolver…");
  await chooseReturn("Dinero");
  assert.equal(field("amount").value, "100.00", "Importe starts at what remains owed back");
  assert.deepEqual(
    await dialogOptions("Método"),
    ["Efectivo", "Transferencia", "Yape", "Plin", "Otro"],
    "Tarjeta refunds go through Culqi",
  );
  await React.act(async () => statusOption("Transferencia").click());
  await submit();
  assert.equal(writes.length, 0, "Motivo is required");
  assert.match(popup()!.textContent, /Indica el motivo\./);
  await fill("reason", "Sobrepago");
  const box = popup()!.querySelector<HTMLElement>('[role="checkbox"]')!;
  assert.equal(box.getAttribute("aria-checked"), "true", "Ya se entregó el dinero starts ticked");
  if (handedOver) {
    assert.equal(
      text(dateTrigger("Fecha")),
      "19 oct 2026",
      "Fecha is property today in Lima, not the browser's 20 Oct",
    );
    await React.act(async () => dateTrigger("Fecha").click());
    assert.equal(pickerDay("20/10/2026").disabled, true, "A refund date cannot be future");
    await React.act(async () => pickerDay("18/10/2026").click());
    await fill("reference", "op-5");
  } else {
    await React.act(async () => box.click());
    assert.equal(popup()!.querySelector('[name="reference"]'), null);
  }
  await submit();
  await page.until(() => !popup(), "A saved refund closes the dialog");
  assert.deepEqual(writes[0].actions, [
    {
      type: "request-refund",
      paymentId: "payment-1",
      amountCents: 10000,
      method: "transfer",
      reason: "Sobrepago",
      ...(completed ? { completed } : {}),
    },
  ]);
  await page.until(() => text(accountStatusLine()) === line);
  assert.equal(accountStatusLine().querySelector("button"), null);
  assert.equal(
    summaryRows().find((row) => row.startsWith("Reembolsado")),
    reembolsado,
    "Only a completed refund counts as Reembolsado",
  );
}

const splitPayments = () => [
  payment({ id: "transfer", amountCents: 5000, method: "transfer", paymentDate: "2026-10-18" }),
  payment({ id: "cash", amountCents: 6000, createdAt: "2026-10-19T16:00:00Z" }),
  payment({
    id: "online",
    amountCents: 2000,
    method: "card",
    createdAt: "2026-10-19T17:00:00Z",
    culqiChargeId: "chr_1",
  }),
];

it.each([
  {
    dueCents: 10000,
    parts: [
      ["cash", 6000],
      ["transfer", 4000],
    ],
  },
  {
    dueCents: 12000,
    parts: [
      ["cash", 6000],
      ["transfer", 5000],
      ["online", 1000],
    ],
  },
])(
  "splits $dueCents cents across payments, non-Culqi newest first and Culqi last",
  async ({ dueCents, parts }) => {
    owesBack({
      totalCents: 13000 - dueCents,
      subtotalCents: 13000 - dueCents,
      paidCents: 13000,
      balanceCents: -dueCents,
      payments: splitPayments(),
    });
    mockApi();
    await render();
    await click("Devolver…");
    await chooseReturn("Dinero");
    await chooseReturn("En mano o por transferencia");
    await fill("reason", "Sobrepago");
    await submit();
    await page.until(() => writes.length === 1);
    assert.deepEqual(
      writes[0].actions.map((action) =>
        action.type === "request-refund" ? [action.paymentId, action.amountCents] : action.type,
      ),
      parts,
    );
  },
);

it.each([
  { source: "En mano o por transferencia", action: "request-refund" },
  { source: "A la tarjeta · Pago en línea del 19 oct 2026", action: "request-culqi-refund" },
])(
  "retries a lost $action with the same actions and request ID after a background refresh",
  async ({ source, action }) => {
    owesBack({
      totalCents: 3000,
      subtotalCents: 3000,
      paidCents: 13000,
      payments: splitPayments(),
    });
    mockApi({
      write: () =>
        writes.length === 1
          ? Response.json({ error: "response unavailable" }, { status: 503 })
          : undefined,
    });
    await render();
    await click("Devolver…");
    await chooseReturn("Dinero");
    await chooseReturn(source);
    await fill("amount", "20");
    await fill("reason", "Sobrepago");
    await submit();
    await page.until(() => writes.length === 1);
    assert.equal(writes[0].actions[0].type, action);
    assert.ok(popup(), "A lost response keeps the draft open");
    saved = { ...saved, refunds: [refund({ paymentId: "cash", amountCents: 6000 })] };
    await page.client.invalidateQueries({ queryKey: ["reservation", "reservation-1"] });
    await submit();
    await page.until(() => writes.length === 2);
    assert.equal(writes[1].requestId, writes[0].requestId);
    assert.deepEqual(writes[1].actions, writes[0].actions);
  },
);

it.each([
  { attempt: "edited after a lost save", committed: true, reopen: false },
  { attempt: "edited after a save that never arrived", committed: false, reopen: false },
  { attempt: "reopened before a refresh", committed: true, reopen: true },
])("records one partial refund when the retry is $attempt", async ({ committed, reopen }) => {
  owesBack();
  const receipts = new Map<string, string>();
  mockApi({
    write: (command) => {
      const payload = JSON.stringify(command);
      const receipt = receipts.get(command.requestId);
      if (receipt === payload) return Response.json(saved);
      if (receipt !== undefined)
        return Response.json(
          { error: "request ID reused with a different payload" },
          { status: 409 },
        );
      const lost = Response.json({ error: "response unavailable" }, { status: 503 });
      if (writes.length === 1 && !committed) return lost;
      receipts.set(command.requestId, payload);
      if (writes.length > 1) return undefined;
      saved = {
        ...saved,
        refundedCents: 4000,
        balanceCents: -6000,
        refunds: [refund({ amountCents: 4000, status: "completed", refundDate: "2026-10-19" })],
      };
      return lost;
    },
  });
  await render("", true, true);
  await click("Devolver…");
  await chooseReturn("Dinero");
  await fill("amount", "40");
  await fill("reason", "Sobrepago");
  await submit();
  await page.until(() => writes.length === 1);
  assert.ok(popup(), "A lost response keeps the draft open");
  if (reopen) {
    await click("Cerrar");
    await click("Descartar y salir");
    await click("Devolver…");
    await chooseReturn("Dinero");
    await fill("amount", "40");
  }
  await fill("reason", "Sobrepago de la tarifa");
  await submit();
  const editor = () => window.document.querySelector('[role="dialog"] form');
  await page.until(() => !editor(), "The retry closes the Devolver dialog");
  assert.deepEqual(
    saved.refunds.map((entry) => entry.reason),
    [committed ? "Sobrepago" : "Sobrepago de la tarifa"],
    "The lost refund is recorded exactly once",
  );
  assert.match(
    window.document.body.textContent,
    committed ? /Los cambios ya se habían guardado/ : /Reembolso registrado/,
  );
  await page.until(() => text(accountStatusLine()) === "Por devolver S/ 60 Devolver…");
});

function requestedRefund() {
  owesBack({
    pendingRefundCents: 10000,
    refunds: [refund({ amountCents: 10000, paymentId: "payment-1" })],
  });
}

it("confirms a requested refund with its date and optional reference", async () => {
  requestedRefund();
  mockApi();
  await render();
  assert.equal(text(accountStatusLine()), "Reembolso solicitado S/ 100");
  await chooseRowAction('[aria-label^="Acciones del reembolso"]', "Confirmar reembolso");
  assert.match(text(popup()!), /S\/ 100 · Transferencia · Sobrepago/);
  assert.equal(popup()!.querySelector('[name="reason"]'), null, "Confirming asks no Motivo");
  await React.act(async () => dateTrigger("Fecha").click());
  assert.equal(pickerDay("20/10/2026").disabled, true, "A refund date cannot be future");
  await React.act(async () => pickerDay("19/10/2026").click());
  await fill("reference", "op-9");
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "complete-refund", refundId: "refund-1", refundDate: "2026-10-19", reference: "OP-9" },
  ]);
  await page.until(() => summaryRows().includes("Reembolsado -S/ 100"));
});

it("marks a requested refund failed with a reason, leaving the money owed back", async () => {
  requestedRefund();
  mockApi();
  await render();
  await chooseRowAction('[aria-label^="Acciones del reembolso"]', "Marcar como fallido");
  assert.equal(text(popup()!.querySelector("h2")!), "Marcar como fallido");
  assert.match(text(popup()!), /el dinero sigue por devolver/);
  assert.equal(popup()!.querySelector('[name="reference"]'), null, "Failing asks no Referencia");
  await submit();
  assert.equal(writes.length, 0, "A failure needs a Motivo");
  await fill("reason", "Cuenta errada");
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "fail-refund", refundId: "refund-1", reason: "Cuenta errada" },
  ]);
  await page.until(() => text(accountStatusLine()) === "Por devolver S/ 100 Devolver…");
  const row = movementsCard().querySelector('table[aria-label="Movimientos"] tbody tr:last-child')!;
  assert.match(text(row), /^\S+ \S+ \S+ Reembolso Fallido Transferencia/);
  assert.equal(text(row.querySelector("del")!), "S/ 100", "A failed refund is struck through");
  assert.ok(!summaryRows().some((row) => row.startsWith("Reembolsado")));
});

const culqiLine = "Comprueba el resultado en Culqi antes de confirmarlo o marcarlo como fallido.";

function paidOnlineAndByPos(fields: Partial<ReservationDetail> = {}) {
  owesBack({
    subtotalCents: 22000,
    totalCents: 22000,
    paidCents: 32000,
    payments: [
      payment({
        id: "online",
        amountCents: 30000,
        method: "card",
        paymentDate: "2026-10-18",
        createdAt: "2026-10-18T15:00:00Z",
        culqiChargeId: "chr_1",
      }),
      payment({ id: "pos", amountCents: 2000, method: "card", reference: "POS-1" }),
    ],
    ...fields,
  });
}

const radioName = (radio: HTMLElement) =>
  text(window.document.getElementById(radio.getAttribute("aria-labelledby")!)!);
const returnOptions = (group = "Cómo se devuelve") =>
  Array.from(
    Array.from(popup()!.querySelectorAll<HTMLElement>("fieldset"))
      .find((fieldset) => fieldset.querySelector("legend")?.textContent === group)!
      .querySelectorAll<HTMLElement>('[role="radio"]'),
  ).map((radio) => ({
    label: radioName(radio),
    checked: radio.getAttribute("aria-checked") === "true",
  }));

async function chooseReturn(label: string) {
  const option = Array.from(popup()!.querySelectorAll<HTMLElement>('[role="radio"]')).find(
    (radio) => radioName(radio) === label,
  );
  assert.ok(option, `Missing return option ${label}`);
  await React.act(async () => option.click());
}

function culqiRefundSaved(status: "completed" | "requested") {
  return (command: WorkflowCommand) => {
    const action = command.actions[0];
    if (action.type !== "request-culqi-refund") return undefined;
    const completed = status === "completed";
    saved = {
      ...saved,
      refundedCents: completed ? action.amountCents : 0,
      pendingRefundCents: completed ? 0 : action.amountCents,
      balanceCents: saved.balanceCents + (completed ? action.amountCents : 0),
      refunds: [
        refund({
          paymentId: action.paymentId,
          amountCents: action.amountCents,
          method: "card",
          reason: action.reason,
          status,
          requestedAt: "2026-10-19T15:00:00Z",
          refundDate: completed ? "2026-10-19" : null,
          completionReference: completed ? "ref_1" : null,
          culqiChargeId: "chr_1",
          culqiRefundId: completed ? "ref_1" : null,
        }),
      ],
    };
    return Response.json(saved);
  };
}

it.each([
  {
    outcome: "completed",
    line: "Cuenta saldada S/ 0",
    row: "19 oct 2026 Reembolso Tarjeta REF_1 -S/ 100",
    toast: "Reembolso registrado",
  },
  {
    outcome: "requested",
    line: "Reembolso solicitado S/ 100",
    row: `19 oct 2026 Reembolso Solicitado ${culqiLine} Tarjeta — (S/ 100)`,
    toast: "Reembolso solicitado",
  },
] as const)(
  "returns money to the card through Culqi when Culqi answers $outcome",
  async ({ outcome, line, row, toast }) => {
    paidOnlineAndByPos();
    mockApi({ write: culqiRefundSaved(outcome) });
    await render("", true, true);
    await click("Devolver…");
    await chooseReturn("Dinero");
    assert.deepEqual(
      returnOptions(),
      [
        { label: "A la tarjeta · Pago en línea del 18 oct 2026", checked: true },
        { label: "En mano o por transferencia", checked: false },
      ],
      "Only the Culqi payment goes back to the card, not the POS Tarjeta payment",
    );
    assert.equal(field("amount").value, "100.00");
    assert.equal(popup()!.querySelector('[role="checkbox"]'), null, "Culqi hands nothing over");
    assert.ok(!text(popup()!).includes("Método"), "The card refund has no Método");
    await submit();
    assert.equal(writes.length, 0, "Motivo is required");
    await fill("reason", "Sobrepago");
    await submit();
    await page.until(
      () => !window.document.querySelector('[role="dialog"] form'),
      "A saved card refund closes the dialog",
    );
    assert.deepEqual(writes[0].actions, [
      {
        type: "request-culqi-refund",
        paymentId: "online",
        amountCents: 10000,
        reason: "Sobrepago",
      },
    ]);
    await page.until(() => text(accountStatusLine()) === line);
    assert.match(window.document.body.textContent, new RegExp(toast));
    const rows = Array.from(
      movementsCard().querySelectorAll('table[aria-label="Movimientos"] tbody tr'),
    );
    assert.equal(text(rows.at(-1)!), row);
    assert.ok(
      !/reintentar|de nuevo|otra vez/i.test(`${text(account())} ${text(movementsCard())}`),
      "A Culqi refund is never offered again",
    );
    if (outcome === "requested")
      assert.equal(
        rows.at(-1)!.querySelector("button")?.getAttribute("aria-label")?.replace(/\s+/g, " "),
        "Acciones del reembolso de S/ 100",
        "Staff resolve it with Confirmar reembolso or Marcar como fallido",
      );
  },
);

it("limits a card refund to what the online payment has left and at least S/ 1", async () => {
  paidOnlineAndByPos({
    subtotalCents: 2000,
    totalCents: 2000,
    paidCents: 6000,
    balanceCents: -4000,
    refundDueCents: 4000,
    payments: [
      payment({
        id: "online",
        amountCents: 3000,
        method: "card",
        paymentDate: "2026-10-18",
        culqiChargeId: "chr_1",
      }),
      payment({ id: "cash", amountCents: 3000 }),
    ],
  });
  mockApi();
  await render();
  await click("Devolver…");
  await chooseReturn("Dinero");
  assert.equal(field("amount").value, "30.00", "Importe starts at what the card payment has left");
  await fill("amount", "35");
  await fill("reason", "Sobrepago");
  await submit();
  assert.match(text(popup()!), /El importe no puede superar S\/ 30\./);
  await fill("amount", "0.50");
  await submit();
  assert.match(text(popup()!), /El reembolso a la tarjeta debe ser de al menos S\/ 1\./);
  assert.equal(writes.length, 0);
  await chooseReturn("En mano o por transferencia");
  await fill("amount", "35");
  await submit();
  await page.until(() => writes.length === 1);
  assert.deepEqual(
    writes[0].actions.map((action) =>
      action.type === "request-refund" ? [action.paymentId, action.amountCents] : action.type,
    ),
    [
      ["cash", 3000],
      ["online", 500],
    ],
    "En mano o por transferencia stays available",
  );
});

const couponTerms = "Vence el 19 de octubre de 2027 · No canjeable por dinero";

it("never issues against cached coupon terms during a failed refresh", async () => {
  owesBack();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  let finishRefresh!: (response: Response) => void;
  mockApi({
    preview: (command) =>
      previews.length === 2
        ? new Promise((resolve) => {
            finishRefresh = resolve;
          })
        : { billing: command.actions.reduce(issueCoupon, saved), validation: { issues: [] } },
  });
  await render();
  await click("Devolver…");
  await page.until(() => text(popup()!).includes(couponTerms));
  let refresh!: Promise<void>;
  await React.act(async () => {
    refresh = page.client.invalidateQueries({ queryKey: ["reservation-preview", saved.id] });
  });
  await page.until(() => !!finishRefresh);
  await page.until(() => text(popup()!).includes("Calculando…"));
  assert.equal(button("Emitir cupón").disabled, true);
  assert.doesNotMatch(text(popup()!), /Vence el/);
  await submit();
  assert.equal(writes.length, 0);
  await React.act(async () => {
    finishRefresh(Response.json({ error: "private refresh failure" }, { status: 503 }));
    await refresh;
  });
  await page.until(() => text(popup()!).includes("Ocurrió un error inesperado"));
  assert.equal(button("Emitir cupón").disabled, true);
  assert.doesNotMatch(text(popup()!), /Vence el|private refresh failure/);
  assert.ok(log.mock.calls.length);
  await submit();
  assert.equal(writes.length, 0);
  await click("Reintentar");
  await page.until(() => !button("Emitir cupón").disabled);
  await click("Emitir cupón");
  await page.until(() => writes.length === 1);
});

it.each(["cancellation", "waiver", "coupon"] as const)(
  "debounces editable %s previews and immediately gates a changed draft",
  async (workflow) => {
    if (workflow === "waiver") releasedStay();
    if (workflow === "coupon") owesBack();
    mockApi();
    await render();
    if (workflow === "cancellation") {
      await statusMenu("Cancelar reserva");
      await page.until(() => !button("Confirmar").disabled);
      await chooseCharge("Perdonar una parte");
      await fill("amount", "100");
    } else await click(workflow === "coupon" ? "Devolver…" : "Perdonar cargo");
    if (workflow !== "coupon") await fill("reason", "Error del hotel");
    const save = () =>
      workflow === "waiver"
        ? waiverSubmit()
        : button(workflow === "coupon" ? "Emitir cupón" : "Confirmar");
    await page.until(() => !save().disabled);
    const openingPreviews = previews.length;
    await fill("amount", "80");
    assert.equal(save().disabled, true, "Stale draft is blocked before debounce fires");
    await fill("amount", "70");
    if (workflow !== "coupon") await fill("reason", "Motivo corregido");
    await submit();
    assert.equal(writes.length, 0);
    assert.equal(previews.length, openingPreviews, "Typing does not send intermediate previews");
    await page.until(() => !save().disabled);
    assert.equal(previews.length, openingPreviews + 1);
    const action = previews.at(-1)!.actions.at(-1)!;
    assert.ok(action.type === "issue-coupon" || action.type === "waive-cancellation-charge");
    assert.equal(action.amountCents, 7000);
  },
);

const couponMessage = (balance: string) =>
  `Tu cupón K7Q2M9XPA4 tiene un saldo disponible de ${balance}. Puedes usarlo total o parcialmente en una próxima estadía con llegada hasta el 19 de octubre de 2027. No canjeable por dinero.`;

const copiedText = async () => (await window.navigator.clipboard.readText()).replace(/\s/g, " ");

it("issues a coupon and hands over its message", async () => {
  owesBack();
  mockApi();
  const clipboard = vi.spyOn(window.navigator.clipboard, "writeText");
  await render();
  await click("Devolver…");
  await page.until(() => text(popup()!).includes(couponTerms));
  await page.until(() => !button("Emitir cupón").disabled);
  await click("Emitir cupón");
  await page.until(() => writes.length === 1);
  assert.deepEqual(writes[0].actions, [
    { type: "issue-coupon", amountCents: 10000, guestAccepted: true },
  ]);
  await page.until(() => text(popup()!.querySelector("h2")!) === "Cupón emitido");
  assert.equal(
    text(popup()!),
    `Cupón emitido K7Q2M9XPA4 Saldo S/ 100 · ${couponTerms} Copiar mensaje Listo Cerrar`,
  );
  await click("Copiar mensaje");
  await page.until(() => !!popup()!.textContent.includes("Mensaje copiado"));
  assert.equal(await copiedText(), couponMessage("S/ 100"));
  saved = { ...saved, coupons: [issuedCoupon({ balanceCents: 4000 })] };
  assert.match(
    text(popup()!),
    /Saldo S\/ 100/,
    "Another device's spending is not in the local reservation cache",
  );
  await click("Mensaje copiado");
  await page.until(() => clipboard.mock.calls.length === 2);
  assert.equal(await copiedText(), couponMessage("S/ 40"));
  await click("Listo");
  await page.until(() => !popup(), "Listo closes the dialog");
  assert.equal(text(accountStatusLine()), "Cuenta saldada S/ 0");
});

it.each([false, true])(
  "replays a lost coupon issuance exactly once (reopen: %s)",
  async (reopen) => {
    owesBack();
    let receipt: WorkflowCommand | undefined;
    mockApi({
      write: (command) => {
        if (receipt) {
          assert.deepEqual(command, receipt, "A retry reuses the committed actions and request ID");
          return Response.json(saved);
        }
        receipt = command;
        saved = command.actions.reduce(issueCoupon, saved);
        return Response.json({ error: "response unavailable" }, { status: 503 });
      },
    });
    await render();
    await click("Devolver…");
    await page.until(() => text(popup()!).includes(couponTerms));
    await fill("amount", "60");
    await page.until(() => !button("Emitir cupón").disabled);
    await click("Emitir cupón");
    await page.until(() => writes.length === 1 && !button("Emitir cupón").disabled);
    if (reopen) {
      await click("Cerrar");
      await click("Descartar y salir");
      await click("Devolver…");
      await page.until(() => text(popup()!).includes(couponTerms));
      await fill("amount", "60");
      await page.until(() => !button("Emitir cupón").disabled);
    }
    await click("Emitir cupón");
    await page.until(() => text(popup()!.querySelector("h2")!) === "Cupón emitido");
    assert.equal(writes.length, 2);
    assert.equal(saved.coupons.length, 1, "No second coupon was issued");
    assert.match(text(popup()!), /K7Q2M9XPA4 Saldo S\/ 60/);
  },
);

it("reads an Unfulfilled reservation as Cancelada with nothing to do but return the money", async () => {
  saved = {
    ...saved,
    status: "unfulfilled",
    subtotalCents: 0,
    totalCents: 0,
    paidCents: 25000,
    balanceCents: -25000,
    refundDueCents: 25000,
    payments: [
      payment({ id: "online", amountCents: 25000, method: "card", culqiChargeId: "chr_1" }),
    ],
  };
  mockApi();
  await render();
  assert.match(text(header()), /Reserva # TEST0001 Cancelada Ana Pérez/);
  assert.equal(
    text(page.container.querySelector('[role="alert"]')!),
    "Reserva cancelada No había disponibilidad cuando se completó el pago en línea.",
  );
  await click("Acciones de la reserva");
  assert.deepEqual(
    Array.from(window.document.querySelectorAll('[role="menuitem"]'), (item) => item.textContent),
    ["Editar contacto"],
    "No status actions or Restaurar reserva",
  );
  assert.deepEqual(summaryRows(), ["Cargo por cancelación S/ 0", "Total S/ 0", "Pagado S/ 250"]);
  assert.equal(text(accountStatusLine()), "Por devolver S/ 250 Devolver…");
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

function releasedStay(status: "cancelled" | "no_show" = "cancelled") {
  const active = cancellation({ outcome: status });
  saved = {
    ...saved,
    status,
    cancellation: active,
    cancellations: [active],
    totalCents: 15000,
    subtotalCents: 15000,
    balanceCents: 15000,
  };
}

it("waives a remaining charge later with a required reason and shows the saved refund due", async () => {
  releasedStay();
  saved = { ...saved, paidCents: 15000, balanceCents: 0, payments: [payment()] };
  const waived = (): ReservationDetail => ({
    ...saved,
    totalCents: 10000,
    balanceCents: -5000,
    refundDueCents: 5000,
    cancellation: cancellation({
      waivedCents: 5000,
      finalChargeCents: 10000,
      waivers: [
        {
          id: "later",
          amountCents: 5000,
          reason: "Error del hotel",
          recordedAt: "2026-10-19T15:00:00Z",
          recordedBy: "admin",
        },
      ],
    }),
  });
  mockApi({
    preview: () => ({ billing: waived(), validation: { issues: [] } }),
    write: () => {
      saved = waived();
      return Response.json(saved);
    },
  });
  await render("", true, true);
  await click("Perdonar cargo");
  assert.match(text(popup()!), /No se puede deshacer\./);
  assert.equal(field("amount").value, "150.00");
  await submit();
  assert.match(text(popup()!), /Indica el motivo/);
  assert.equal(writes.length, 0);
  await fill("amount", "50");
  await fill("reason", "Error del hotel");
  await page.until(() => !waiverSubmit().disabled);
  assert.match(text(popup()!), /Por devolver S\/ 50/);
  await React.act(async () => waiverSubmit().click());
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "waive-cancellation-charge", amountCents: 5000, reason: "Error del hotel" },
  ]);
  assert.ok(summaryRows().includes("Cargo perdonado -S/ 50"));
  await page.until(() =>
    text(window.document.body).includes("Cargo perdonado · Por devolver S/ 50"),
  );
});

const waiverSubmit = () =>
  popup()!.querySelector<import("happy-dom").HTMLButtonElement>('button[type="submit"]')!;

it.each([
  "room is already assigned for those dates",
  "reservation with refunds cannot be restored",
  "reservation with coupons cannot be restored",
])("blocks restoration after a failed server preview: %s", async (error) => {
  releasedStay();
  mockApi({ preview: () => Response.json({ error }, { status: 409 }) });
  await render();
  await statusMenu("Restaurar reserva");
  await page.until(() => !!popup()?.querySelector('[role="alert"]'));
  assert.equal(button("Restaurar reserva").disabled, true);
  assert.doesNotMatch(text(popup()!), /Saldo pendiente|Cuenta saldada/);
  assert.doesNotMatch(text(popup()!), new RegExp(error));
  await submit();
  assert.equal(writes.length, 0);
});
