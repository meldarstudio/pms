import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
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
    const { ToastProvider } = await browser.server.ssrLoadModule("/src/components/ui/toast.tsx");
    await React.act(async () => router.load());
    await page.render(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(browser.routing.RouterProvider, { router }),
      ),
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
const popup = () => window.document.querySelector('[role="dialog"][data-slot="dialog-content"]');
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

it.each([
  { status: "confirmed", today: "2026-10-18", action: "Hacer check-in", variant: "outline" },
  { status: "confirmed", today: "2026-10-19", action: "Hacer check-in", variant: "default" },
  { status: "confirmed", today: "2026-10-20", action: "Hacer check-in", variant: "default" },
  { status: "checked_in", today: "2026-10-20", action: "Hacer check-out", variant: "outline" },
  { status: "checked_in", today: "2026-10-21", action: "Hacer check-out", variant: "default" },
  { status: "checked_out", today: "2026-10-21", action: null, variant: null },
] as const)(
  "offers the contextual header action for $status on $today",
  async ({ status, today, action, variant }) => {
    vi.setSystemTime(
      new Date(today === "2026-10-18" ? "2026-10-19T03:00:00Z" : `${today}T05:00:00Z`),
    );
    saved = { ...saved, status };
    mockApi();
    await render();
    const header = page.container.querySelector("h1")!.closest("header")!;
    assert.equal(header.querySelector('[role="combobox"]'), null);
    const actions = Array.from(header.querySelectorAll("button")).filter((item) =>
      item.textContent.startsWith("Hacer check-"),
    );
    assert.deepEqual(
      actions.map((item) => item.textContent),
      action ? [action] : [],
    );
    if (action) assert.equal(actions[0].getAttribute("data-variant"), variant);
  },
);

it("corrects status through the menu without offering cancellation or the current status", async () => {
  mockApi();
  await render();
  await chooseRowAction('[aria-label="Acciones de la reserva"]', "Corregir estado…");
  assert.match(popup()!.textContent, /Corregir estado/);
  assert.equal(button("Guardar cambios").disabled, true);
  await React.act(async () => dateTrigger("Estado").click());
  assert.deepEqual(
    Array.from(window.document.querySelectorAll('[role="option"]')).map((item) => item.textContent),
    ["Check-in", "Check-out"],
  );
  await React.act(async () => statusOption("Check-out").click());
  assert.equal(writes.length, 0);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [{ type: "set-status", status: "checked_out" }]);
  assert.match(page.container.querySelector("h1")!.closest("header")!.textContent, /Check-out/);
});

it.each([
  {
    status: "confirmed",
    time: "2026-10-19T03:00:00Z",
    items: ["Corregir estado…", "Cancelar reserva"],
  },
  {
    status: "confirmed",
    time: "2026-10-19T05:00:00Z",
    items: ["Corregir estado…", "Marcar como no presentado", "Cancelar reserva"],
  },
  {
    status: "confirmed",
    time: "2026-10-20T05:00:00Z",
    items: ["Corregir estado…", "Marcar como no presentado", "Cancelar reserva"],
  },
  {
    status: "checked_in",
    time: "2026-10-19T15:00:00Z",
    items: ["Corregir estado…", "Cancelar reserva"],
  },
  {
    status: "checked_out",
    time: "2026-10-21T15:00:00Z",
    items: ["Corregir estado…", "Cancelar reserva"],
  },
  { status: "cancelled", time: "2026-10-19T15:00:00Z", items: ["Restaurar reserva"] },
  {
    status: "no_show",
    time: "2026-10-19T15:00:00Z",
    items: ["Restaurar reserva", "Corregir estado…"],
  },
  { status: "unfulfilled", time: "2026-10-19T15:00:00Z", items: [] },
] as const)(
  "offers only the allowed status menu actions for $status at $time",
  async ({ status, time, items }) => {
    vi.setSystemTime(new Date(time));
    saved = { ...saved, status };
    mockApi();
    await render();
    const trigger = header().querySelector<HTMLElement>('[aria-label="Acciones de la reserva"]');
    if (items.length) {
      assert.ok(trigger);
      await React.act(async () => trigger.click());
      assert.deepEqual(
        Array.from(window.document.querySelectorAll('[role="menuitem"]')).map(
          (item) => item.textContent,
        ),
        [...items],
      );
    } else {
      assert.equal(trigger, null);
      assert.equal(header().querySelector("button"), null);
    }
    assert.equal(writes.length, 0);
  },
);

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
  await click("Deshacer");
  await page.until(() => window.document.body.textContent.includes("Check-out deshecho"));
  assert.deepEqual(writes[1].actions, [{ type: "set-status", status: "checked_in" }]);
  assert.equal(saved.balanceCents, 20000);
});

it("warns about a dirty room before the page check-in and undoes the successful action", async () => {
  saved = {
    ...saved,
    rooms: [
      { ...saved.rooms[0], roomId: "room-1", roomNumber: "101", housekeepingStatus: "dirty" },
    ],
  };
  mockApi();
  await render("", true, true);
  await click("Hacer check-in");
  assert.match(
    window.document.querySelector('[role="alertdialog"]')!.textContent,
    /La habitación 101 está sucia/,
  );
  await click("Volver");
  assert.equal(writes.length, 0);
  await click("Hacer check-in");
  const confirm = Array.from(
    window.document.querySelectorAll<HTMLElement>('[role="alertdialog"] button'),
  ).find((item) => item.textContent === "Hacer check-in")!;
  await React.act(async () => confirm.click());
  await page.until(() => window.document.body.textContent.includes("Check-in registrado"));
  assert.deepEqual(writes[0].actions, [{ type: "set-status", status: "checked_in" }]);
  await click("Deshacer");
  await page.until(() => window.document.body.textContent.includes("Check-in deshecho"));
  assert.deepEqual(writes[1].actions, [{ type: "set-status", status: "confirmed" }]);
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

it.each(["discount", "editor"])(
  "blocks undo using the current page %s draft, then allows it after discarding",
  async (draft) => {
    mockApi();
    await render("", true, true);
    await click("Hacer check-in");
    await page.until(() => window.document.body.textContent.includes("Check-in registrado"));
    const undo = button("Deshacer");
    if (draft === "discount") {
      await React.act(async () => discountTrigger().click());
      await page.fill(discountInput()!, "50");
    } else {
      await click("Editar notas");
      assert.equal(undo.disabled, true, "Even a pristine open page editor blocks undo");
      await fill("notes", "Borrador protegido");
    }
    assert.equal(undo.disabled, true);
    await React.act(async () => undo.click());
    assert.equal(writes.length, 1);
    assert.equal(saved.status, "checked_in");
    if (draft === "discount") {
      assert.equal(discountInput()!.value, "50");
      await page.fill(discountInput()!, "0");
    } else {
      assert.equal(field("notes").value, "Borrador protegido");
      await click("Cerrar");
      await click("Descartar y salir");
    }
    await page.until(() => !undo.disabled);
    await React.act(async () => undo.click());
    await page.until(() => saved.status === "confirmed");
    assert.deepEqual(writes[1].actions, [{ type: "set-status", status: "confirmed" }]);
  },
);

it("does not queue an old undo behind a running lifecycle save", async () => {
  saved = { ...saved, paidCents: 30000, balanceCents: 0 };
  let finish!: (response: Response) => void;
  mockApi({
    write: () =>
      writes.length === 2
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : undefined,
  });
  await render("", true, true);
  await click("Hacer check-in");
  await page.until(() => window.document.body.textContent.includes("Check-in registrado"));
  const undo = button("Deshacer");
  await click("Hacer check-out");
  await page.until(() => writes.length === 2);
  assert.equal(undo.disabled, true);
  await React.act(async () => undo.click());
  assert.equal(writes.length, 2);
  await React.act(async () => {
    saved = { ...saved, status: "checked_out" };
    finish(Response.json(saved));
  });
  await page.until(() => window.document.body.textContent.includes("Check-out registrado"));
  await React.act(async () => undo.click());
  assert.equal(saved.status, "checked_out");
  assert.equal(writes.length, 2);
});

it.each([
  { editor: "Editar estadía", fieldName: "rooms[0].room.adults", value: "1", action: "edit-room" },
  { editor: "Registrar pago", fieldName: "amount", value: "100", action: "add-payment" },
])(
  "preserves the phone $editor draft and actions through keyboard viewport changes",
  async ({ editor, fieldName, value, action }) => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "visualViewport");
    const viewport = Object.assign(new window.EventTarget(), { height: 844, offsetTop: 0 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    try {
      page.mobile();
      mockApi();
      await render();
      await click(editor);
      const dialog = popup()! as HTMLElement;
      assert.equal(dialog.style.getPropertyValue("--reservation-viewport-height"), "844px");
      await fill(fieldName, value);
      const input = field(fieldName);
      await React.act(async () => {
        viewport.height = 420;
        viewport.offsetTop = 30;
        viewport.dispatchEvent(new window.Event("resize"));
        viewport.dispatchEvent(new window.Event("scroll"));
        window.happyDOM.setWindowSize({ width: 1024, height: 768 });
        window.dispatchEvent(new window.Event("resize"));
      });
      assert.equal(dialog.style.getPropertyValue("--reservation-viewport-height"), "420px");
      assert.equal(dialog.style.getPropertyValue("--reservation-viewport-top"), "30px");
      assert.equal(field(fieldName), input);
      assert.equal(input.value, value);
      assert.equal(await unloadPrevented(), true);
      assert.equal(button("Hacer check-in").disabled, true);
      await click("Cerrar");
      assert.match(window.document.body.textContent, /Hay cambios sin guardar/);
      await click("Seguir editando");
      assert.equal(field(fieldName).value, value);
      await page.until(
        () =>
          !window.document
            .querySelector('[role="dialog"] button[type="submit"]')
            ?.hasAttribute("disabled"),
      );
      await submit();
      await page.until(() => !popup());
      assert.equal(writes.length, 1);
      assert.equal(writes[0].actions[0].type, action);
      assert.equal(await unloadPrevented(), false);
    } finally {
      if (descriptor) Object.defineProperty(window, "visualViewport", descriptor);
      else Reflect.deleteProperty(window, "visualViewport");
    }
  },
);

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

it("offers the shared coupon method from Registrar pago and prefills the already-used code", async () => {
  saved = {
    ...saved,
    couponAppliedCents: 1000,
    balanceCents: 29000,
    couponMovements: [
      {
        id: "redeem-1",
        couponId: "coupon-1",
        code: "ABCD123456",
        expiresOn: "2027-10-18",
        kind: "redeem",
        amountCents: 1000,
        recordedAt: "2026-10-18T15:00:00Z",
        recordedOn: "2026-10-18",
        recordedBy: null,
      },
    ],
  };
  page.api.on("GET", "/coupons/ABCD123456", () => ({
    id: "coupon-1",
    code: "ABCD123456",
    valueCents: 50000,
    balanceCents: 49000,
    issuedAt: "2026-10-01T15:00:00Z",
    issuedBy: null,
    expiresOn: "2027-10-01",
    sourceReservationId: "source-reservation",
    sourceReservationCode: "SOURCE01",
    movements: [],
  }));
  mockApi({
    write: (command) => {
      assert.deepEqual(command.actions, [
        { type: "redeem-coupon", code: "ABCD123456", amountCents: 29000 },
      ]);
      saved = { ...saved, couponAppliedCents: 30000, balanceCents: 0 };
      return Response.json(saved);
    },
  });
  await render();
  await click("Registrar pago");
  await React.act(async () => dateTrigger("Método").click());
  await React.act(async () => statusOption("Cupón").click());
  assert.equal(field("code").value, "ABCD123456");
  await page.until(() => !button("Aplicar cupón").disabled);
  assert.equal(field("amount").value, "290.00");
  await click("Aplicar cupón");
  await page.until(() => !popup());
  assert.match(account().textContent, /Cuenta saldada/);
  assert.equal(writes.length, 1);
  assert.equal(previews.length, 0);
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
  assert.match(text(popup()!), /Cargo por cancelación S\/ 123\.45/);
  assert.match(text(popup()!), /Por devolver S\/ 76\.55/);
  assert.doesNotMatch(text(popup()!), /Subtotal|Pagado|Descuento/);
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
  await click("Perdonar cargo");
  assert.equal(field("amount").value, "123.45");
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

it("keeps the inline waiver draft and marks its amount when the server rejects a changed charge", async () => {
  mockApi({
    write: () =>
      Response.json({ error: "waiver cannot exceed the cancellation charge" }, { status: 400 }),
  });
  await render();
  await statusMenu("Cancelar reserva");
  await page.until(() => !button("Confirmar").disabled);
  await click("Perdonar cargo");
  await fill("reason", "Error del hotel");
  await page.until(() => !button("Confirmar").disabled);
  await submit();
  assert.equal(writes[0].actions.length, 2);
  await page.until(() => field("amount").getAttribute("aria-invalid") === "true");
  assert.equal(field("reason").value, "Error del hotel");
  assert.equal(field("amount").value, "150.00");
  assert.match(text(popup()!), /El importe a perdonar no puede superar el cargo pendiente/);
  assert.equal(saved.status, "confirmed");
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
  await click("Perdonar cargo");
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
  assert.match(text(popup()!), /Cargo por cancelación S\/ 150/);
  assert.match(text(popup()!), /Saldo pendiente S\/ 150/);
  assert.equal(field("reason").value, "Cambio de planes");
});

it.each([false, true])(
  "reconciles an uncertain cancellation after its prospective waiver rejects (reopen: %s)",
  async (reopen) => {
    let receipt: WorkflowCommand | undefined;
    mockApi({
      preview: (command) => {
        const waiver = command.actions.find(
          (action) => action.type === "waive-cancellation-charge",
        );
        if (receipt && waiver && waiver.amountCents > 5000)
          return Response.json(
            { error: "waiver cannot exceed the cancellation charge" },
            { status: 400 },
          );
        return { billing: { ...saved, cancellation: cancellation() }, validation: { issues: [] } };
      },
      write: (command) => {
        if (receipt) {
          assert.deepEqual(command, receipt);
          return Response.json(saved);
        }
        receipt = command;
        saved = {
          ...saved,
          status: "cancelled",
          cancellation: cancellation({ waivedCents: 10000, finalChargeCents: 5000 }),
          totalCents: 5000,
          balanceCents: 5000,
        };
        return Response.json({ error: "response unavailable" }, { status: 503 });
      },
    });
    await render();
    await statusMenu("Cancelar reserva");
    await page.until(() => !button("Confirmar").disabled);
    await click("Perdonar cargo");
    await fill("amount", "100");
    await fill("reason", "Error del hotel");
    await page.until(() => !button("Confirmar").disabled);
    await submit();
    await page.until(() => writes.length === 1 && !button("Cerrar").disabled);
    if (reopen) {
      await click("Cerrar");
      await click("Descartar y salir");
      await statusMenu("Cancelar reserva");
      await page.until(() => !button("Confirmar").disabled);
      await click("Perdonar cargo");
      await fill("amount", "100");
    }
    await fill("reason", "Otro motivo");
    await page.until(() =>
      text(popup()!).includes("El importe a perdonar no puede superar el cargo pendiente"),
    );
    assert.equal(button("Confirmar").disabled, true);
    await fill("amount", "no válido");
    await submit();
    assert.equal(writes.length, 1, "Invalid local input cannot create a new waiver");
    await click("Comprobar intento anterior");
    await page.until(() => !popup());
    assert.equal(writes[0].requestId, writes[1].requestId);
    assert.equal(saved.cancellation!.waivedCents, 10000);
    assert.match(header().textContent, /Cancelada/);
  },
);

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
    await click("Perdonar cargo");
    assert.equal(field("amount").value, "150.00");
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

it.each([
  {
    expiresOn: "2027-04-30",
    amount: 4321,
    line: "S/ 43.21 vuelven al cupón K7Q2M9XPA4 · Vence el 30 de abril de 2027",
  },
  {
    expiresOn: "2026-10-18",
    amount: 4321,
    line: "S/ 43.21 vuelven al cupón K7Q2M9XPA4, ya vencido. No se podrá usar.",
  },
  {
    expiresOn: "2026-10-19",
    amount: 4321,
    line: "S/ 43.21 vuelven al cupón K7Q2M9XPA4 · Vence el 19 de octubre de 2026",
  },
  { expiresOn: "2027-04-30", amount: 0, line: null },
])(
  "shows only the newly previewed coupon return ($amount, expiry $expiresOn)",
  async ({ expiresOn, amount, line }) => {
    const previous = couponMovement({ kind: "return", code: "K7Q2M9XPA4", amountCents: 1000 });
    saved = { ...saved, couponAppliedCents: 12000, couponMovements: [previous] };
    mockApi({
      preview: () => ({
        billing: {
          ...saved,
          cancellation: cancellation(),
          couponMovements: [
            previous,
            ...(amount ? [{ ...previous, id: "new-return", amountCents: amount, expiresOn }] : []),
          ],
        },
        validation: { issues: [] },
      }),
    });
    await render();
    await statusMenu("Cancelar reserva");
    await page.until(() => !button("Confirmar").disabled);
    if (line) assert.ok(text(popup()!).includes(line), text(popup()!));
    else assert.doesNotMatch(text(popup()!), /vuelven al cupón/);
    assert.equal(writes.length, 0);
  },
);

it.each([
  {
    outcome: "cancelled",
    freeUntil: "2026-10-19",
    basis: "first_night",
    charge: 0,
    line: "Cancelación gratuita hasta el 19 de octubre de 2026 · Sin cargo",
  },
  {
    outcome: "cancelled",
    freeUntil: null,
    basis: "final_total",
    charge: 27000,
    line: "Tarifa no reembolsable · Cargo del total de la reserva",
  },
  {
    outcome: "no_show",
    freeUntil: null,
    basis: "final_total",
    charge: 27000,
    line: "Cargo por no presentarse · Total de la reserva",
  },
] as const)(
  "explains the accepted preview policy: $line",
  async ({ outcome, freeUntil, basis, charge, line }) => {
    mockApi({
      preview: () => ({
        billing: {
          ...saved,
          ratePlan: {
            ...saved.ratePlan,
            cancellationPolicy: {
              chargeBasis: basis,
              freeUntilDaysBeforeCheckIn: freeUntil ? 2 : null,
            },
          },
          cancellation: cancellation({
            outcome,
            freeUntil,
            policyChargeCents: charge,
            finalChargeCents: charge,
          }),
          totalCents: charge,
          balanceCents: charge,
        },
        validation: { issues: [] },
      }),
    });
    await render();
    await statusMenu(outcome === "cancelled" ? "Cancelar reserva" : "Marcar como no presentado");
    await page.until(() => !button("Confirmar").disabled);
    assert.ok(text(popup()!).includes(line), text(popup()!));
    if (charge === 0) {
      assert.doesNotMatch(text(popup()!), /Perdonar cargo/);
      assert.match(text(popup()!), /Cuenta saldada S\/ 0/);
      await submit();
      await page.until(() => !popup());
      assert.deepEqual(writes[0].actions, [{ type: "set-status", status: "cancelled" }]);
    }
  },
);

it("retries a failed cancellation preview and keeps the reason after a failed save", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mockApi({
    preview: () =>
      previews.length === 1
        ? Response.json({ error: "Temporary preview failure" }, { status: 503 })
        : {
            billing: {
              ...saved,
              cancellation: cancellation({ policyChargeCents: 0, finalChargeCents: 0 }),
              totalCents: 0,
              balanceCents: 0,
            },
            validation: { issues: [] },
          },
    write: () =>
      writes.length === 1
        ? Response.json({ error: "Temporary cancellation save failure" }, { status: 503 })
        : undefined,
  });
  await render("", true, true);
  await statusMenu("Cancelar reserva");
  await page.until(() => popup()?.textContent.includes("Ocurrió un error inesperado") === true);
  assert.ok(log.mock.calls.length);
  assert.doesNotMatch(text(popup()!), /Temporary preview failure/);
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
  assert.match(text(window.document.body), /No se pudieron guardar los cambios/);
  assert.doesNotMatch(text(window.document.body), /Temporary cancellation save failure/);
  assert.ok(log.mock.calls.length >= 2);
  assert.equal(saved.status, "confirmed");
  await click("Confirmar");
  await page.until(() => !popup(), "A successful cancellation closes the confirmation");
  assert.deepEqual(writes[1].actions, [
    { type: "set-status", status: "cancelled", reason: "Cambio de planes" },
  ]);
});

it.each(["cancelled", "no_show"] as const)(
  "restores %s only to Confirmada without a picker or dirty-room check-in",
  async (status) => {
    saved = {
      ...saved,
      status,
      cancelledAt: "2026-10-18T15:00:00Z",
      rooms: [
        { ...saved.rooms[0], roomId: "room-1", roomNumber: "101", housekeepingStatus: "dirty" },
      ],
    };
    mockApi({
      preview: () => ({
        billing: { ...saved, status: "confirmed", balanceCents: 9000 },
        validation: { issues: [] },
      }),
    });
    await render();
    await statusMenu("Restaurar reserva");
    assert.match(text(popup()!), /¿Restaurar reserva\? Volverá a Confirmada\./);
    assert.equal(popup()!.querySelector('[role="combobox"]'), null);
    await page.until(() => !button("Restaurar reserva").disabled);
    assert.match(text(popup()!), /Saldo pendiente S\/ 90/);
    assert.equal(writes.length, 0);
    await submit();
    await page.until(() => saved.status === "confirmed" && !popup());
    assert.equal(window.document.querySelector('[role="alertdialog"]'), null);
    assert.deepEqual(writes[0].actions, [{ type: "set-status", status: "confirmed" }]);
  },
);

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
    await statusMenu("Restaurar reserva");
    await page.until(() => popup()?.textContent.includes("Habitación 1:") === true);
    assert.equal(button("Restaurar reserva").disabled, true);
    assert.match(header().textContent, /Cancelada/);
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

it("saves an agreed nightly price only for a new room in the stay editor", async () => {
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
          writes.length === 1 ? [...saved.rooms, added] : [saved.rooms[0], { ...added, adults: 1 }],
        subtotalCents: 54050,
        totalCents: 54050,
        balanceCents: 54050,
      };
      return Response.json(saved);
    },
  });
  await render();
  await click("Editar estadía");
  assert.equal(
    popup()!.querySelector('[aria-label="Acciones de la habitación 1"]'),
    null,
    "A lone saved room has no actions",
  );
  await page.until(() => !button("Agregar habitación").disabled);
  await click("Agregar habitación");
  await page.menuAction("Acciones de la habitación 2", "Cambiar precio por noche");
  await fill("rooms[1].room.nightlyRate", "120.25");
  await page.until(() => !button("Guardar cambios").disabled);
  assert.match(popup()!.textContent.replace(/\s/g, ""), /S\/540\.50/);
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
  assert.doesNotMatch(popup()!.textContent, /Precio por noche · S\//);
  assert.deepEqual(
    (await page.openMenu("Acciones de la habitación 2")).map((item) => item.textContent.trim()),
    ["Quitar habitación"],
    "A saved added room cannot be repriced",
  );
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
});

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
  await page.menuAction("Acciones de la habitación 2", "Cambiar precio por noche");
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
  await page.menuAction("Acciones de la habitación 2", "Quitar habitación");
  assert.equal(
    window.document.querySelector('[aria-label="Acciones de la habitación 1"]'),
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
    action: "Devolver…",
  },
  {
    state: "part of the refund due requested",
    bill: { paidCents: 40000, balanceCents: -10000, pendingRefundCents: 4000 },
    line: "Por devolver S/ 60",
    action: "Devolver…",
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
    action === "Registrar pago" ? 1 : 0,
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
        resolvedBy: "maria",
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
  assert.deepEqual(
    [rows[4], rows[5], rows[6]].map(
      (row) =>
        row.querySelector("button")?.getAttribute("aria-label")?.replace(/\s+/g, " ") ?? null,
    ),
    [null, "Acciones del reembolso de S/ 30", null],
    "Only a requested refund can be resolved",
  );
  assert.ok(summaryRows().includes("Reembolsado -S/ 20"), "Only the completed refund counts");
  assert.equal(table.querySelectorAll('[aria-label^="Acciones del pago"]').length, 1);
  await chooseRowAction('[aria-label^="Acciones del pago"]', "Eliminar");
  await submit();
  await page.until(() => writes.length === 1);
  assert.deepEqual(writes[0].actions, [{ type: "delete-payment", paymentId: "yape" }]);
});

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

it("keeps the Devolver draft and shows the Spanish rejection when the refund due changed", async () => {
  owesBack();
  mockApi({
    write: () => Response.json({ error: "refund exceeds the refund due" }, { status: 409 }),
  });
  await render("", true, true);
  await click("Devolver…");
  await chooseReturn("Dinero");
  await fill("amount", "80");
  await fill("reason", "Sobrepago");
  await submit();
  await page.until(() => writes.length === 1);
  await page.until(() =>
    popup()!.textContent.includes(
      "El reembolso supera el monto por devolver, descontando las solicitudes pendientes.",
    ),
  );
  assert.equal(field("amount").value, "80");
  assert.equal(field("reason").value, "Sobrepago");
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
  const row = account().querySelector('table[aria-label="Movimientos"] tbody tr:last-child')!;
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
    const rows = Array.from(account().querySelectorAll('table[aria-label="Movimientos"] tbody tr'));
    assert.equal(text(rows.at(-1)!), row);
    assert.ok(
      !/reintentar|de nuevo|otra vez/i.test(text(account())),
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

it.each(["manual", "provider"] as const)(
  "does not mistake a concurrent %s refund for this Culqi result",
  async (concurrent) => {
    paidOnlineAndByPos();
    const complete = culqiRefundSaved("completed");
    mockApi({
      write: (command) => {
        complete(command);
        saved = {
          ...saved,
          refunds: [
            ...saved.refunds,
            refund({
              id: "concurrent-refund",
              paymentId: "online",
              amountCents: 10000,
              reason: "Sobrepago",
              status: "requested",
              culqiChargeId: concurrent === "provider" ? "chr_1" : null,
            }),
          ],
        };
        return Response.json(saved);
      },
    });
    await render("", true, true);
    await click("Devolver…");
    await chooseReturn("Dinero");
    await fill("reason", "Sobrepago");
    await submit();
    await page.until(() => !popup());
    const notice = window.document.querySelector('[data-slot="toast"]')!;
    assert.ok(notice);
    assert.match(
      text(notice),
      concurrent === "manual" ? /Reembolso registrado/ : /Solicitud procesada/,
    );
    assert.doesNotMatch(text(notice), /Reembolso solicitado|Comprueba el resultado en Culqi/);
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

it.each([
  {
    error: "a Culqi refund for this payment is pending",
    status: 400,
    message:
      "Este pago ya tiene un reembolso a la tarjeta solicitado. Confírmalo o márcalo como fallido en Movimientos.",
  },
  {
    error: "Culqi is not configured",
    status: 503,
    message: "Los pagos en línea no están configurados en el servidor.",
  },
])("keeps the card refund draft and explains: $error", async ({ error, status, message }) => {
  paidOnlineAndByPos();
  mockApi({ write: () => Response.json({ error }, { status }) });
  await render("", true, true);
  await click("Devolver…");
  await chooseReturn("Dinero");
  await fill("amount", "80");
  await fill("reason", "Sobrepago");
  await submit();
  await page.until(() => writes.length === 1);
  await page.until(() => window.document.body.textContent.includes(message));
  assert.ok(popup(), "The dialog stays open");
  assert.equal(field("amount").value, "80");
  assert.equal(field("reason").value, "Sobrepago");
  assert.equal(returnOptions()[0].checked, true);
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
  await React.act(async () => acceptance().click());
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
      await click("Perdonar cargo");
    } else await click(workflow === "coupon" ? "Devolver…" : "Perdonar cargo");
    if (workflow === "coupon") await React.act(async () => acceptance().click());
    else await fill("reason", "Error del hotel");
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

it("defaults Devolver… to a coupon for the refund due less requested refunds, on the preview's terms", async () => {
  owesBack({ pendingRefundCents: 2000, refunds: [refund({ amountCents: 2000 })] });
  mockApi();
  await render();
  await click("Devolver…");
  assert.deepEqual(returnOptions("Devolver como"), [
    { label: "Cupón", checked: true },
    { label: "Dinero", checked: false },
  ]);
  assert.equal(field("amount").value, "80.00");
  await page.until(() => text(popup()!).includes(couponTerms), "The expiry comes from the preview");
  await fill("amount", "80.01");
  await submit();
  assert.match(text(popup()!), /El importe no puede superar S\/ 80\./);
  assert.equal(writes.length, 0, "Importe can be lowered, not raised");
});

const couponMessage = (balance: string) =>
  `Tu cupón K7Q2M9XPA4 tiene un saldo disponible de ${balance}. Puedes usarlo total o parcialmente en una próxima estadía con llegada hasta el 19 de octubre de 2027. No canjeable por dinero.`;

const copiedText = async () => (await window.navigator.clipboard.readText()).replace(/\s/g, " ");

it.each([
  { balanceCents: 4000, label: "Quedan S/ 40", amount: "S/ 40" },
  { balanceCents: 0, label: "Usado", amount: "S/ 0" },
])(
  "shows $label on the issued coupon row and copies its current balance",
  async ({ balanceCents, label, amount }) => {
    saved = {
      ...saved,
      couponIssuedCents: 10000,
      coupons: [issuedCoupon({ balanceCents })],
    };
    mockApi();
    await render("", true, true);
    assert.ok(
      summaryRows().includes(
        `Pasado a cupón -S/ 100 K7Q2M9XPA4 · Vence el 19 de octubre de 2027 · ${label}`,
      ),
    );
    const copy = account().querySelector<HTMLElement>(
      '[aria-label="Copiar mensaje del cupón K7Q2M9XPA4"]',
    );
    assert.ok(copy, "The issued row must offer a copy action");
    await React.act(async () => copy.click());
    await page.until(() => window.document.body.textContent.includes("Mensaje copiado"));
    assert.equal(await copiedText(), couponMessage(amount));
  },
);

function acceptance() {
  const label = Array.from(popup()!.querySelectorAll("label")).find(
    (node) => text(node) === "El huésped aceptó un cupón en lugar del reembolso",
  );
  const box = window.document.getElementById(label?.getAttribute("for") ?? "");
  assert.ok(box instanceof window.HTMLInputElement, "Missing the acceptance checkbox");
  return box;
}

it("issues a coupon only once the guest's acceptance is ticked and hands over its message", async () => {
  owesBack();
  mockApi();
  const clipboard = vi.spyOn(window.navigator.clipboard, "writeText");
  await render();
  await click("Devolver…");
  await page.until(() => text(popup()!).includes(couponTerms));
  assert.equal(acceptance().checked, false, "Acceptance starts unticked");
  assert.equal(button("Emitir cupón").disabled, true);
  await React.act(async () => acceptance().click());
  assert.equal(button("Emitir cupón").disabled, false);
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

it("refreshes coupon facts for each row copy and never copies stale value after a failed lookup", async () => {
  saved = { ...saved, couponIssuedCents: 10000, coupons: [issuedCoupon()] };
  mockApi();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const clipboard = vi.spyOn(window.navigator.clipboard, "writeText");
  await render("", true, true);
  saved = { ...saved, coupons: [issuedCoupon({ balanceCents: 4000, expiresOn: "2027-09-01" })] };
  await click("Copiar mensaje del cupón K7Q2M9XPA4");
  await page.until(() => clipboard.mock.calls.length === 1);
  assert.match(await copiedText(), /saldo disponible de S\/ 40.*1 de setiembre de 2027/);
  const removeFailure = page.api.on("GET", "/coupons/:code", () =>
    Response.json({ error: "private coupon lookup failure" }, { status: 503 }),
  );
  await click("Copiar mensaje del cupón K7Q2M9XPA4");
  await page.until(() => text(window.document.body).includes("No se pudo actualizar el cupón"));
  assert.equal(clipboard.mock.calls.length, 1, "A failed refresh cannot copy cached facts");
  assert.doesNotMatch(text(window.document.body), /private coupon lookup failure/);
  assert.ok(log.mock.calls.length);
  removeFailure();
  saved = { ...saved, coupons: [issuedCoupon({ balanceCents: 0 })] };
  await click("Copiar mensaje del cupón K7Q2M9XPA4");
  await page.until(() => clipboard.mock.calls.length === 2);
  assert.equal(await copiedText(), couponMessage("S/ 0"));
});

it("keeps the coupon draft through a failed preview and waits for server expiry before issuing", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  owesBack();
  let resolve: (result: WorkflowPreview) => void = () => assert.fail("Missing pending preview");
  mockApi({
    preview: (command) =>
      previews.length === 1
        ? Response.json({ error: "preview unavailable" }, { status: 503 })
        : new Promise((done) => {
            resolve = done;
            assert.equal(command.actions[0].type, "issue-coupon");
          }),
  });
  await render();
  await click("Devolver…");
  await page.until(() => !!popup()?.textContent.includes("Ocurrió un error inesperado"));
  assert.doesNotMatch(text(popup()!), /preview unavailable/);
  assert.ok(log.mock.calls.length);
  await React.act(async () => acceptance().click());
  assert.equal(button("Emitir cupón").disabled, true);
  await click("Reintentar");
  await page.until(() => previews.length === 2);
  assert.equal(
    button("Emitir cupón").disabled,
    true,
    "An in-flight preview has no confirmed terms",
  );
  await React.act(async () =>
    resolve({
      billing: { ...saved, coupons: [issuedCoupon({ expiresOn: "2028-02-29" })] },
      validation: { issues: [] },
    }),
  );
  await page.until(() => text(popup()!).includes("Vence el 29 de febrero de 2028"));
  assert.equal(field("amount").value, "100.00");
  assert.equal(acceptance().checked, true);
  assert.equal(button("Emitir cupón").disabled, false);
  assert.equal(writes.length, 0);
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
    await React.act(async () => acceptance().click());
    await page.until(() => !button("Emitir cupón").disabled);
    await click("Emitir cupón");
    await page.until(() => writes.length === 1 && !button("Emitir cupón").disabled);
    if (reopen) {
      await click("Cerrar");
      await click("Descartar y salir");
      await click("Devolver…");
      await page.until(() => text(popup()!).includes(couponTerms));
      await fill("amount", "60");
      await React.act(async () => acceptance().click());
      await page.until(() => !button("Emitir cupón").disabled);
    }
    await click("Emitir cupón");
    await page.until(() => text(popup()!.querySelector("h2")!) === "Cupón emitido");
    assert.equal(writes.length, 2);
    assert.equal(saved.coupons.length, 1, "No second coupon was issued");
    assert.match(text(popup()!), /K7Q2M9XPA4 Saldo S\/ 60/);
  },
);

it.each(["coupon", "money"] as const)(
  "does not duplicate or mislabel an edited cross-kind lost %s attempt",
  async (original) => {
    owesBack();
    let receipt: WorkflowCommand | undefined;
    mockApi({
      write: (command) => {
        if (receipt) {
          assert.equal(command.requestId, receipt.requestId);
          return Response.json(
            { error: "request ID reused with a different payload" },
            { status: 409 },
          );
        }
        receipt = command;
        saved =
          original === "coupon"
            ? command.actions.reduce(issueCoupon, saved)
            : {
                ...saved,
                refunds: [refund({ amountCents: 6000, status: "completed" })],
                refundedCents: 6000,
                balanceCents: -4000,
                refundDueCents: 4000,
              };
        return Response.json({ error: "response unavailable" }, { status: 503 });
      },
    });
    await render("", true, true);
    await click("Devolver…");
    await page.until(() => text(popup()!).includes(couponTerms));
    await fill("amount", "60");
    if (original === "coupon") {
      await React.act(async () => acceptance().click());
      await page.until(() => !button("Emitir cupón").disabled);
      await click("Emitir cupón");
    } else {
      await chooseReturn("Dinero");
      await fill("reason", "En efectivo");
      await submit();
    }
    await page.until(() => writes.length === 1 && !button("Cerrar").disabled);
    if (original === "coupon") {
      await chooseReturn("Dinero");
      await fill("reason", "En efectivo");
    } else {
      await chooseReturn("Cupón");
      await React.act(async () => acceptance().click());
      await page.until(() => !button("Emitir cupón").disabled);
    }
    await submit();
    await page.until(() => !popup());
    assert.equal(saved.coupons.length, original === "coupon" ? 1 : 0);
    assert.equal(saved.refunds.length, original === "money" ? 1 : 0);
    assert.equal(text(accountStatusLine()), "Por devolver S/ 40 Devolver…");
    const notices = Array.from(window.document.querySelectorAll('[data-slot="toast"]'))
      .map(text)
      .join(" ");
    assert.match(notices, /Los cambios ya se habían guardado/);
    assert.doesNotMatch(
      notices,
      /Este reembolso ya se había registrado|Este cupón ya se había emitido/,
    );
  },
);

it("reconciles a reopened lost coupon even when current terms reject the already-issued value", async () => {
  owesBack();
  vi.spyOn(console, "error").mockImplementation(() => {});
  let receipt: WorkflowCommand | undefined;
  mockApi({
    preview: (command) => {
      const action = command.actions[0];
      return action.type === "issue-coupon" && action.amountCents > saved.refundDueCents
        ? Response.json({ error: "coupon exceeds the refund due" }, { status: 409 })
        : { billing: command.actions.reduce(issueCoupon, saved), validation: { issues: [] } };
    },
    write: (command) => {
      if (receipt) {
        assert.deepEqual(command, receipt);
        return Response.json(saved);
      }
      receipt = command;
      saved = command.actions.reduce(issueCoupon, saved);
      return Response.json({ error: "response unavailable" }, { status: 503 });
    },
  });
  await render("", true, true);
  await click("Devolver…");
  await fill("amount", "60");
  await React.act(async () => acceptance().click());
  await page.until(() => !button("Emitir cupón").disabled);
  await click("Emitir cupón");
  await page.until(() => writes.length === 1 && !button("Cerrar").disabled);
  await click("Cerrar");
  await click("Descartar y salir");
  await click("Devolver…");
  await fill("amount", "60");
  await React.act(async () => acceptance().click());
  await page.client.invalidateQueries({ queryKey: ["reservation-preview", saved.id] });
  await page.until(() => text(popup()!).includes("El cupón supera el monto por devolver"));
  assert.equal(button("Emitir cupón").disabled, true);
  await submit();
  assert.equal(writes.length, 1);
  await click("Comprobar intento anterior");
  await page.until(() => !popup());
  assert.equal(saved.coupons.length, 1);
  assert.equal(writes.length, 2);
  assert.match(text(window.document.body), /Intento anterior comprobado/);
});

it("refreshes coupon expiry when property today changes without losing acceptance or amount", async () => {
  owesBack();
  mockApi({
    preview: () => ({
      billing: {
        ...saved,
        coupons: [issuedCoupon({ expiresOn: previews.length === 1 ? "2027-10-19" : "2027-10-20" })],
      },
      validation: { issues: [] },
    }),
  });
  await render();
  await click("Devolver…");
  await page.until(() => text(popup()!).includes(couponTerms));
  await fill("amount", "60");
  await React.act(async () => acceptance().click());
  await React.act(async () => {
    vi.setSystemTime(new Date("2026-10-20T05:00:00Z"));
    window.dispatchEvent(new window.Event("focus"));
  });
  await page.until(() => text(popup()!).includes("Vence el 20 de octubre de 2027"));
  assert.equal(field("amount").value, "60");
  assert.equal(acceptance().checked, true);
});

it("keeps the accepted coupon draft and shows a changed refund-due limit beside Importe", async () => {
  owesBack();
  mockApi({
    write: () => Response.json({ error: "coupon exceeds the refund due" }, { status: 409 }),
  });
  await render();
  await click("Devolver…");
  await page.until(() => text(popup()!).includes(couponTerms));
  await fill("amount", "60");
  await React.act(async () => acceptance().click());
  await page.until(() => !button("Emitir cupón").disabled);
  await click("Emitir cupón");
  await page.until(() => field("amount").getAttribute("aria-invalid") === "true");
  assert.match(
    text(popup()!),
    /El cupón supera el monto por devolver, descontando reembolsos solicitados y cupones ya emitidos\./,
  );
  assert.equal(field("amount").value, "60");
  assert.equal(acceptance().checked, true);
});

it("lets staff lower the amount after the coupon preview rejects a changed refund due", async () => {
  owesBack();
  mockApi({
    preview: (command) =>
      command.actions.some((action) => action.type === "issue-coupon" && action.amountCents > 6000)
        ? Response.json({ error: "coupon exceeds the refund due" }, { status: 409 })
        : { billing: command.actions.reduce(issueCoupon, saved), validation: { issues: [] } },
  });
  await render();
  await click("Devolver…");
  await page.until(() => !!popup()?.textContent.includes("El cupón supera el monto por devolver"));
  await fill("amount", "60");
  await React.act(async () => acceptance().click());
  await page.until(() => !button("Emitir cupón").disabled);
  await click("Emitir cupón");
  await page.until(() => text(popup()!.querySelector("h2")!) === "Cupón emitido");
  assert.deepEqual(writes[0].actions, [
    { type: "issue-coupon", amountCents: 6000, guestAccepted: true },
  ]);
});

it("hands over the coupon just issued, not a different coupon issued since the form opened", async () => {
  owesBack();
  mockApi({
    write: () => {
      saved = {
        ...saved,
        couponIssuedCents: 2000,
        balanceCents: -8000,
        refundDueCents: 8000,
        coupons: [
          issuedCoupon({
            id: "other-coupon",
            code: "OTHER20000",
            valueCents: 2000,
            balanceCents: 2000,
          }),
        ],
      };
      return undefined;
    },
  });
  await render();
  await click("Devolver…");
  await page.until(() => text(popup()!).includes(couponTerms));
  await fill("amount", "60");
  await React.act(async () => acceptance().click());
  await page.until(() => !button("Emitir cupón").disabled);
  await click("Emitir cupón");
  await page.until(() => text(popup()!.querySelector("h2")!) === "Cupón emitido");
  assert.match(text(popup()!), /K7Q2M9XPA4 Saldo S\/ 60/);
  assert.equal(text(popup()!).includes("OTHER20000"), false);
});

it("leaves the rest of a partial coupon Por devolver for a later Dinero run and locks payments", async () => {
  owesBack();
  mockApi();
  await render();
  await click("Devolver…");
  await page.until(() => text(popup()!).includes(couponTerms));
  await fill("amount", "60");
  await React.act(async () => acceptance().click());
  await page.until(() => !button("Emitir cupón").disabled);
  await click("Emitir cupón");
  await page.until(() => text(popup()!.querySelector("h2")!) === "Cupón emitido");
  assert.deepEqual(writes[0].actions, [
    { type: "issue-coupon", amountCents: 6000, guestAccepted: true },
  ]);
  await click("Listo");
  await page.until(() => text(accountStatusLine()) === "Por devolver S/ 40 Devolver…");
  assert.ok(
    summaryRows().includes(`Pasado a cupón -S/ 60 K7Q2M9XPA4 · Vence el 19 de octubre de 2027`),
  );
  const movements = account().querySelector('table[aria-label="Movimientos"]')!;
  assert.ok(movements.querySelector('[aria-label="Se emitió un cupón: no se puede editar"]'));
  assert.equal(movements.querySelector('[aria-label^="Acciones del pago"]'), null);

  await click("Devolver…");
  assert.equal(field("amount").value, "40.00", "The next run starts at the remainder");
  await chooseReturn("Dinero");
  assert.equal(field("amount").value, "40.00");
  assert.equal(popup()!.querySelector('[name="guestAccepted"]'), null);
  await fill("reason", "Resto en efectivo");
  await submit();
  await page.until(() => writes.length === 2);
  assert.deepEqual(writes[1].actions, [
    {
      type: "request-refund",
      paymentId: "payment-1",
      amountCents: 4000,
      method: "cash",
      reason: "Resto en efectivo",
      completed: { refundDate: "2026-10-19" },
    },
  ]);
});

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
  assert.equal(header().querySelector("button"), null, "No status actions or Restaurar reserva");
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
  assert.ok(summaryRows().includes("Cargo perdonado -S/ 50 Error del hotel"));
  await page.until(() =>
    text(window.document.body).includes("Cargo perdonado · Por devolver S/ 50"),
  );
});

const waiverSubmit = () =>
  popup()!.querySelector<import("happy-dom").HTMLButtonElement>('button[type="submit"]')!;

it("caps a later No-show waiver at the remaining charge and raises refund due even after a refund", async () => {
  releasedStay("no_show");
  const first = {
    id: "first",
    amountCents: 5000,
    reason: "Cliente frecuente",
    recordedAt: "2026-10-18T15:00:00Z",
    recordedBy: "admin",
  };
  saved = {
    ...saved,
    totalCents: 10000,
    balanceCents: 0,
    paidCents: 15000,
    refundedCents: 5000,
    refunds: [refund({ status: "completed", amountCents: 5000 })],
    cancellation: cancellation({
      outcome: "no_show",
      finalChargeCents: 10000,
      waivedCents: 5000,
      waivers: [first],
    }),
  };
  const finalBill = (): ReservationDetail => ({
    ...saved,
    totalCents: 0,
    balanceCents: -10000,
    refundDueCents: 10000,
    cancellation: {
      ...saved.cancellation!,
      finalChargeCents: 0,
      waivedCents: 15000,
      waivers: [
        first,
        { ...first, id: "second", amountCents: 10000, reason: "Canceló por correo" },
      ],
    },
  });
  mockApi({
    preview: () => ({ billing: finalBill(), validation: { issues: [] } }),
    write: () => {
      saved = finalBill();
      return Response.json(saved);
    },
  });
  await render();
  await click("Perdonar cargo");
  assert.equal(field("amount").value, "100.00");
  await fill("reason", "Canceló por correo");
  await fill("amount", "100.01");
  await submit();
  assert.equal(field("amount").getAttribute("aria-invalid"), "true");
  assert.equal(writes.length, 0);
  await fill("amount", "100");
  await page.until(() => !waiverSubmit().disabled);
  await submit();
  await page.until(() => !popup());
  assert.deepEqual(writes[0].actions, [
    { type: "waive-cancellation-charge", amountCents: 10000, reason: "Canceló por correo" },
  ]);
  assert.ok(summaryRows().includes("Cargo perdonado -S/ 50 Cliente frecuente"));
  assert.ok(summaryRows().includes("Cargo perdonado -S/ 100 Canceló por correo"));
  assert.equal(account().querySelector('[aria-label="Perdonar cargo"]'), null);
  assert.match(text(accountStatusLine()), /Por devolver S\/ 100/);
});

it("hides unconfirmed later-waiver amounts through failed, stale and property-day previews", async () => {
  releasedStay();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  const finish = new Map<number, (preview: WorkflowPreview) => void>();
  const quoted = (balanceCents: number): WorkflowPreview => ({
    billing: { ...saved, balanceCents },
    validation: { issues: [] },
  });
  mockApi({
    preview: (command) =>
      fail
        ? Response.json({ error: "private preview details" }, { status: 503 })
        : new Promise((resolve) => {
            const action = command.actions[0];
            if (action.type === "waive-cancellation-charge")
              finish.set(action.amountCents, resolve);
          }),
  });
  await render();
  await click("Perdonar cargo");
  await fill("reason", "Error del hotel");
  await page.until(() => text(popup()!).includes("Ocurrió un error inesperado"));
  assert.doesNotMatch(text(popup()!), /private preview details|Saldo pendiente/);
  assert.ok(log.mock.calls.length);
  assert.equal(waiverSubmit().disabled, true);
  fail = false;
  await click("Reintentar");
  await page.until(() => finish.has(15000));
  await fill("amount", "50");
  await page.until(() => finish.has(5000));
  await React.act(async () => finish.get(15000)!(quoted(0)));
  assert.equal(waiverSubmit().disabled, true);
  assert.doesNotMatch(text(popup()!), /Cuenta saldada/);
  await submit();
  assert.equal(writes.length, 0);
  await React.act(async () => finish.get(5000)!(quoted(10000)));
  await page.until(() => !waiverSubmit().disabled);
  assert.match(text(popup()!), /Saldo pendiente S\/ 100/);
  finish.delete(5000);
  await React.act(async () => {
    vi.setSystemTime(new Date("2026-10-20T05:00:00Z"));
    window.dispatchEvent(new window.Event("focus"));
  });
  await page.until(() => finish.has(5000));
  assert.equal(field("amount").value, "50");
  assert.equal(field("reason").value, "Error del hotel");
  assert.equal(waiverSubmit().disabled, true);
  assert.doesNotMatch(text(popup()!), /Saldo pendiente/);
  await React.act(async () => finish.get(5000)!(quoted(10000)));
  await page.until(() => !waiverSubmit().disabled);
});

it("keeps later-waiver drafts and puts a concurrent charge rejection beside the amount", async () => {
  releasedStay();
  mockApi({
    write: () =>
      Response.json({ error: "waiver cannot exceed the cancellation charge" }, { status: 409 }),
  });
  await render();
  await click("Perdonar cargo");
  await fill("reason", "Error del hotel");
  await page.until(() => !waiverSubmit().disabled);
  await submit();
  await page.until(() => field("amount").getAttribute("aria-invalid") === "true");
  assert.match(text(popup()!), /El importe a perdonar no puede superar el cargo pendiente/);
  assert.equal(field("reason").value, "Error del hotel");
  await React.act(async () =>
    field("amount").dispatchEvent(new window.FocusEvent("blur", { bubbles: true })),
  );
  assert.equal(field("amount").getAttribute("aria-invalid"), "true");
  await fill("amount", "50");
  await page.until(() => field("amount").getAttribute("aria-invalid") !== "true");
});

it.each([false, true])(
  "reconciles a lost later waiver despite a rejected prospective preview (reopen: %s)",
  async (reopen) => {
    releasedStay();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let receipt: WorkflowCommand | undefined;
    mockApi({
      preview: (command) => {
        const waiver = command.actions[0];
        if (receipt && waiver.type === "waive-cancellation-charge" && waiver.amountCents > 5000)
          return Response.json(
            { error: "waiver cannot exceed the cancellation charge" },
            { status: 400 },
          );
        return { billing: saved, validation: { issues: [] } };
      },
      write: (command) => {
        if (receipt) {
          assert.deepEqual(command, receipt);
          return Response.json(saved);
        }
        receipt = command;
        saved = {
          ...saved,
          cancellation: cancellation({ waivedCents: 10000, finalChargeCents: 5000 }),
        };
        return Response.json({ error: "private save details" }, { status: 503 });
      },
    });
    await render("", true, true);
    await click("Perdonar cargo");
    await fill("reason", "Error del hotel");
    await fill("amount", "100");
    await page.until(() => !waiverSubmit().disabled);
    await submit();
    await page.until(() =>
      text(window.document.body).includes("No se pudieron guardar los cambios."),
    );
    assert.doesNotMatch(text(window.document.body), /private save details/);
    if (reopen) {
      await click("Cerrar");
      await click("Descartar y salir");
      await page.until(() => !popup());
      await click("Perdonar cargo");
      await fill("amount", "100");
    }
    await fill("reason", "Otro motivo");
    await page.until(() =>
      text(popup()!).includes("El importe a perdonar no puede superar el cargo pendiente"),
    );
    assert.equal(waiverSubmit().disabled, true);
    await click("Comprobar intento anterior");
    await page.until(() => !popup());
    assert.equal(saved.cancellation!.waivedCents, 10000);
    assert.equal(writes[0].requestId, writes[1].requestId);
    assert.match(text(window.document.body), /Intento anterior comprobado/);
  },
);

it("finishes retained recovery when a lost edited retry returns the original payload-conflict receipt", async () => {
  releasedStay();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockApi({
    preview: (command) => {
      const action = command.actions[0];
      return writes.length &&
        action.type === "waive-cancellation-charge" &&
        action.amountCents > 5000
        ? Response.json({ error: "waiver cannot exceed the cancellation charge" }, { status: 400 })
        : { billing: saved, validation: { issues: [] } };
    },
    write: () => {
      if (writes.length < 3) {
        saved = {
          ...saved,
          cancellation: cancellation({ waivedCents: 10000, finalChargeCents: 5000 }),
        };
        return Response.json({ error: "response unavailable" }, { status: 503 });
      }
      return Response.json(
        { error: "request ID reused with a different payload" },
        { status: 409 },
      );
    },
  });
  await render("", true, true);
  await click("Perdonar cargo");
  await fill("reason", "Error del hotel");
  await fill("amount", "100");
  await page.until(() => !waiverSubmit().disabled);
  await submit();
  await page.until(() => writes.length === 1 && !button("Cerrar").disabled);
  await fill("amount", "50");
  await page.until(() => !waiverSubmit().disabled);
  await submit();
  await page.until(() => writes.length === 2 && !button("Cerrar").disabled);
  await fill("amount", "100");
  await page.until(() =>
    text(popup()!).includes("El importe a perdonar no puede superar el cargo pendiente"),
  );
  await click("Comprobar intento anterior");
  await page.until(() => !popup());
  assert.equal(saved.cancellation!.waivedCents, 10000);
  assert.equal(writes[2].requestId, writes[0].requestId);
  assert.deepEqual(writes[2], writes[1]);
  assert.match(text(window.document.body), /Intento anterior comprobado/);
});

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

it("retries a generic restoration preview failure and waits again on property-day rollover", async () => {
  releasedStay();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  let finish!: (preview: WorkflowPreview) => void;
  mockApi({
    preview: () =>
      previews.length === 1
        ? Response.json({ error: "private restore details" }, { status: 503 })
        : new Promise((resolve) => {
            finish = resolve;
          }),
  });
  await render();
  await statusMenu("Restaurar reserva");
  await page.until(() => text(popup()!).includes("Ocurrió un error inesperado"));
  assert.doesNotMatch(text(popup()!), /private restore details/);
  assert.ok(log.mock.calls.length);
  await click("Reintentar");
  await page.until(() => !!finish);
  assert.equal(button("Restaurar reserva").disabled, true);
  const bill: WorkflowPreview = {
    billing: { ...saved, status: "confirmed", balanceCents: 30000 },
    validation: { issues: [] },
  };
  await React.act(async () => finish(bill));
  await page.until(() => !button("Restaurar reserva").disabled);
  await React.act(async () => {
    vi.setSystemTime(new Date("2026-10-20T05:00:00Z"));
    window.dispatchEvent(new window.Event("focus"));
  });
  await page.until(() => previews.length === 3);
  assert.equal(button("Restaurar reserva").disabled, true);
  assert.doesNotMatch(text(popup()!), /Saldo pendiente/);
  await submit();
  assert.equal(writes.length, 0);
  await React.act(async () => finish(bill));
  await page.until(() => !button("Restaurar reserva").disabled);
});

it.each(["requested", "failed", "completed", "issue", "redeem", "return"] as const)(
  "keeps restoration visible but disabled for any %s refund or coupon record",
  async (kind) => {
    releasedStay("no_show");
    if (kind === "requested" || kind === "failed" || kind === "completed")
      saved.refunds = [refund({ status: kind })];
    else
      saved.couponMovements = [
        {
          id: "movement",
          couponId: "coupon",
          code: "ABCD123456",
          expiresOn: "2027-10-19",
          kind,
          amountCents: 5000,
          recordedAt: "2026-10-19T15:00:00Z",
          recordedOn: "2026-10-19",
          recordedBy: "admin",
        },
      ];
    mockApi();
    await render();
    await click("Acciones de la reserva");
    const item = window.document.querySelector<HTMLElement>('[role="menuitem"]')!;
    assert.equal(text(item), "Restaurar reserva");
    assert.equal(item.getAttribute("aria-disabled"), "true");
    assert.match(
      text(window.document.body),
      /Tiene reembolsos o cupones\. Crea una nueva reserva\./,
    );
    await React.act(async () => item.click());
    assert.equal(popup(), null);
    assert.equal(writes.length, 0);
  },
);

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
  assert.match(
    text(page.container.querySelector("fieldset header")!),
    /Reserva # TEST0001 No se presentó Ana Pérez/,
  );
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
