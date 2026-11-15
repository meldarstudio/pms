import assert from "node:assert/strict";
import { afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
import type { HTMLElement, HTMLInputElement } from "happy-dom";
import type { ReservationDetail, WorkflowCommand } from "../src/lib/api.ts";
import { sharedBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let routes: typeof import("../src/router.tsx");
let router: typeof routes.router;
let saved: ReservationDetail;
let detailResponse: () => Response | Promise<Response>;
let writeResponse: (command: WorkflowCommand) => Response;

beforeAll(async () => {
  browser = await sharedBrowserTest();
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
    guest: {
      id: "contact",
      fullName: "Ana Pérez",
      phone: "999111222",
      email: null,
      notes: null,
      nationality: null,
    },
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
const click = (label: string) => page.click(label);
const fillAmount = (value: string) => page.fill("amount", value);
function amount(label: string) {
  const row = Array.from(
    page.container.querySelectorAll('dl[aria-label="Resumen de la cuenta"] > div'),
  ).find((element) => element.querySelector("dt, button > span")?.textContent.trim() === label);
  assert.ok(row, `Missing bill row ${label}`);
  return row.querySelector("dd, button > span:last-child")!.textContent.replace(/\s/g, "");
}
function discountInput() {
  const label = Array.from(browser.window.document.querySelectorAll("label")).find(
    (item) => item.textContent.trim() === "Descuento · S/",
  );
  return label
    ? browser.window.document.querySelector<HTMLInputElement>(`[id="${label.htmlFor}"]`)
    : null;
}
async function openDiscount() {
  const trigger = Array.from(page.container.querySelectorAll<HTMLElement>("button")).find((item) =>
    item.textContent.trim().startsWith("Descuento"),
  );
  assert.ok(trigger, "The Cuenta summary must offer the discount");
  await browser.React.act(async () => trigger.click());
  await page.until(() => !!discountInput(), "Descuento must open the discount popover");
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
  await openDiscount();
  await page.fill(discountInput()!, "50.50");
  await click("Aplicar");
  await page.until(() => !discountInput(), "A saved discount closes the popover");
  assert.equal(amount("Subtotal"), "S/300.50");
  assert.equal(amount("Descuento"), "-S/50.50");
  assert.equal(amount("Total"), "S/250");
  assert.equal(amount("Pagado"), "S/100.25");
  assert.match(page.container.textContent.replace(/\s/g, ""), /SaldopendienteS\/149\.75/);

  await click("Registrar pago");
  await fillAmount("49.75");
  await click("Guardar cambios");
  await page.until(() => browser.window.document.querySelector('[role="dialog"]') === null);
  assert.equal(amount("Descuento"), "-S/50.50");
  assert.equal(amount("Total"), "S/250");
  assert.equal(amount("Pagado"), "S/150");
  assert.match(page.container.textContent.replace(/\s/g, ""), /SaldopendienteS\/100/);
});
