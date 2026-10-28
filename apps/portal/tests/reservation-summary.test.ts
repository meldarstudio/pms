import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
import type { HTMLElement, HTMLInputElement } from "happy-dom";
import type { ReservationDetail, WorkflowCommand } from "../src/lib/api.ts";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let routes: typeof import("../src/router.tsx");
let router: typeof routes.router;
let saved: ReservationDetail;
let detailResponse: () => Response | Promise<Response>;
let writeResponse: (command: WorkflowCommand) => Response;

beforeAll(async () => {
  browser = await createBrowserTest();
  routes = (await browser.server.ssrLoadModule("/src/router.tsx")) as typeof routes;
  const calendar = (await browser.server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});
beforeEach(() => {
  page = browser.createPage();
  saved = {
    id: "summary",
    code: "BILL0001",
    status: "confirmed",
    guestId: "contact",
    guest: { id: "contact", fullName: "Ana Pérez", phone: "999111222", email: null, notes: null },
    stayingGuests: [],
    checkIn: "2026-10-19",
    checkOut: "2026-10-21",
    source: "direct",
    currency: "PEN",
    subtotalCents: 30050,
    discountCents: 5050,
    savedDiscountCents: 5050,
    totalCents: 25000,
    paidCents: 10025,
    balanceCents: 14975,
    creditCents: 0,
    refundDueCents: 0,
    refundedCents: 0,
    pendingRefundCents: 0,
    refunds: [],
    cancellation: null,
    cancellations: [],
    ratePlan: {
      plan: "flexible",
      cancellationPolicy: {
        chargeBasis: "first_night",
        freeUntilHoursBeforeCheckIn: 48,
        checkInTime: "15:00",
      },
      paymentSchedule: "first_night_deposit",
      priceAdjustmentPercent: 0,
    },
    requiredInitialPaymentCents: 15025,
    remainingScheduledCents: 9975,
    payments: [],
    notes: null,
    cancellationReason: null,
    cancelledAt: null,
    rooms: [
      {
        id: "reserved-room",
        roomTypeId: "double",
        roomTypeName: "Doble",
        roomId: null,
        roomNumber: null,
        housekeepingStatus: null,
        adults: 2,
        children: 0,
        subtotalCents: 30050,
        discountCents: 5050,
        totalCents: 25000,
        nights: [],
      },
    ],
  };
  detailResponse = () => Response.json(saved);
  writeResponse = () => {
    throw new Error("Unexpected write");
  };
  page.api.catalog.roomTypes = [
    { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, baseRateCents: 15025 },
  ];
  page.api.catalog.rooms = [{ id: "room", number: "101", roomTypeId: "double" }];
  page.api.on("GET", "/reservations/summary", () => detailResponse());
  page.api.on("POST", "/reservations/:id/preview", () => ({
    billing: saved,
    validation: { issues: [] },
  }));
  page.api.on<WorkflowCommand>("POST", "/reservations/:id/commands", ({ body }) =>
    writeResponse(body),
  );
});
afterEach(async () => {
  await page.cleanup();
});
afterAll(async () => {
  await browser?.close();
});

async function render(search = "", waitForDetail = true) {
  router = browser.routing.createRouter({
    routeTree: routes.router.routeTree,
    history: browser.routing.createMemoryHistory({
      initialEntries: [`/reservations/summary${search}`],
    }),
  });
  await page.renderRouter(router);
  if (waitForDetail) await page.until(() => page.container.textContent.includes("#BILL0001"));
}
const button = (label: string) => page.button(label);
const click = (label: string) => page.click(label);
const fillAmount = (value: string) => page.fill("amount", value);
function amount(label: string) {
  const term = Array.from(page.container.querySelectorAll("dt")).find(
    (element) => element.textContent.trim() === label,
  );
  assert.ok(term, `Missing bill row ${label}`);
  return term.parentElement!.querySelector("dd")!.textContent.replace(/\s/g, "");
}

it("saves a discount from its zero-valued row and then a payment without changing the discount", async () => {
  saved = {
    ...saved,
    discountCents: 0,
    savedDiscountCents: 0,
    totalCents: 30050,
    balanceCents: 20025,
  };
  writeResponse = (command) => {
    const [action] = command.actions;
    if (action?.type === "add-payment") {
      assert.equal(command.actions.length, 1);
      assert.equal(action.payment.amountCents, 4975);
      saved = { ...saved, paidCents: 15000, balanceCents: 10000 };
      return Response.json(saved);
    }
    assert.deepEqual(command.actions, [{ type: "set-discount", amountCents: 5050 }]);
    saved = {
      ...saved,
      discountCents: 5050,
      savedDiscountCents: 5050,
      totalCents: 25000,
      balanceCents: 14975,
    };
    return Response.json(saved);
  };
  await render();
  assert.equal(amount("Descuento"), "S/0");
  await click("Editar descuento");
  await fillAmount("50.50");
  await page.until(() => !button("Guardar cambios").disabled);
  await click("Guardar cambios");
  await page.until(() => browser.window.document.querySelector('[role="dialog"]') === null);
  assert.equal(amount("Subtotal"), "S/300.50");
  assert.equal(amount("Descuento"), "S/50.50");
  assert.equal(amount("Total"), "S/250");
  assert.equal(amount("Pagado"), "S/100.25");
  assert.match(page.container.textContent.replace(/\s/g, ""), /SaldopendienteS\/149\.75/);

  await click("Registrar pago");
  await fillAmount("49.75");
  await click("Guardar cambios");
  await page.until(() => browser.window.document.querySelector('[role="dialog"]') === null);
  assert.equal(amount("Descuento"), "S/50.50");
  assert.equal(amount("Total"), "S/250");
  assert.equal(amount("Pagado"), "S/150");
  assert.match(page.container.textContent.replace(/\s/g, ""), /SaldopendienteS\/100/);
});

it.each([
  {
    paidCents: 25000,
    balanceCents: 0,
    creditCents: 0,
    label: "Cuenta saldada",
    paid: "S/250",
    balance: "S/0",
  },
  {
    paidCents: 30050,
    balanceCents: -5050,
    creditCents: 5050,
    label: "Saldo a favor",
    paid: "S/300.50",
    balance: "S/50.50",
  },
])(
  "distinguishes $label from money owed without hiding bill arithmetic",
  async ({ paidCents, balanceCents, creditCents, label, paid, balance }) => {
    saved = { ...saved, paidCents, balanceCents, creditCents };
    await render();
    assert.equal(amount("Subtotal"), "S/300.50");
    assert.equal(amount("Descuento"), "S/50.50");
    assert.equal(amount("Total"), "S/250");
    assert.equal(amount("Pagado"), paid);
    assert.ok(
      page.container.textContent
        .replace(/\s/g, "")
        .includes(`${label.replace(/\s/g, "")}${balance}`),
    );
  },
);

async function back() {
  const link = browser.window.document.querySelector<HTMLElement>('nav[aria-label="breadcrumb"] a');
  assert.ok(link, "Missing Reservas breadcrumb");
  await browser.React.act(async () => link.click());
}

it("protects a discount draft when Back targets Reservations and allows explicit discard", async () => {
  await render("?origin=calendar&returnTo=from%3D2026-10-19%26span%3D14");
  await click("Editar descuento");
  await fillAmount("25");
  const unload = new browser.window.Event("beforeunload", { cancelable: true });
  await browser.React.act(async () => browser.window.dispatchEvent(unload));
  assert.equal(unload.defaultPrevented, true, "A discount draft must block an update reload");
  await back();
  await page.until(() =>
    browser.window.document.body.textContent.includes("Hay cambios sin guardar"),
  );
  assert.equal(router.state.location.pathname, "/reservations/summary");
  await click("Seguir editando");
  assert.equal(
    browser.window.document.querySelector<HTMLInputElement>('input[name="amount"]')?.value,
    "25",
  );
  await back();
  await click("Descartar y salir");
  await page.until(() => router.state.location.pathname === "/reservations");
});
