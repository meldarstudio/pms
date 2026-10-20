import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it } from "vite-plus/test";
import type { HTMLInputElement } from "happy-dom";
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
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.pathname === "/room-types")
      return Response.json([
        { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, baseRateCents: 15025 },
      ]);
    if (url.pathname === "/rooms")
      return Response.json([{ id: "room", number: "101", roomTypeId: "double" }]);
    if (url.pathname === "/reservations/summary") return detailResponse();
    if (url.pathname.endsWith("/preview"))
      return Response.json({ billing: saved, validation: { issues: [] } });
    if (url.pathname.endsWith("/commands")) {
      assert.equal(init?.method, "POST");
      assert.equal(typeof init.body, "string");
      return writeResponse(JSON.parse(init.body as string) as WorkflowCommand);
    }
    if (url.pathname === "/reservations")
      return Response.json(
        url.searchParams.has("paginated") ? { rows: [], total: 0, limit: 50, offset: 0 } : [],
      );
    if (url.pathname === "/room-closures") return Response.json([]);
    throw new Error(`Unexpected request ${url}`);
  };
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
function button(label: string) {
  const element = Array.from(browser.window.document.querySelectorAll("button")).find(
    (element) =>
      element.textContent.trim() === label || element.getAttribute("aria-label") === label,
  );
  assert.ok(element, `Missing button ${label}`);
  return element;
}
async function click(label: string) {
  await browser.React.act(async () => button(label).click());
}
async function fillAmount(value: string) {
  const input = browser.window.document.querySelector<HTMLInputElement>('input[name="amount"]');
  assert.ok(input);
  await browser.React.act(async () => {
    Object.getOwnPropertyDescriptor(browser.window.HTMLInputElement.prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new browser.window.Event("input", { bubbles: true }));
  });
}
function amount(label: string) {
  const term = Array.from(page.container.querySelectorAll("dt")).find(
    (element) => element.textContent.trim() === label,
  );
  assert.ok(term, `Missing bill row ${label}`);
  return term.parentElement!.querySelector("dd")!.textContent.replace(/\s/g, "");
}

it("explains the reservation bill using server subtotal, discount, total, payments and outstanding balance", async () => {
  await render();
  assert.equal(amount("Subtotal"), "S/300.50");
  assert.equal(amount("Descuento"), "S/50.50");
  assert.equal(amount("Total"), "S/250");
  assert.equal(amount("Pagado"), "S/100.25");
  assert.match(page.container.textContent.replace(/\s/g, ""), /SaldopendienteS\/149\.75/);
});

it("offers discount editing on its zero-valued row and refreshes the bill after saving", async () => {
  saved = {
    ...saved,
    discountCents: 0,
    savedDiscountCents: 0,
    totalCents: 30050,
    balanceCents: 20025,
  };
  writeResponse = (command) => {
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
  const edit = button("Editar descuento");
  assert.ok(
    edit.closest("dl"),
    "The edit action must be beside the discount, not on the whole card",
  );
  assert.equal(edit.closest("dt")?.textContent.trim(), "Descuento");
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
});

it.each(
  [
    ["calendar", "?origin=calendar&returnTo=from%3D2026-10-19%26span%3D14"],
    ["list", "?returnTo=view%3Dall%26q%3DAna"],
    ["direct", ""],
  ].flatMap(([origin, search]) =>
    ["loaded", "loading", "error"].map((state) => ({ origin, search, state })),
  ),
)(
  "returns to Reservations from $origin entry while detail is $state",
  async ({ search, state }) => {
    if (state === "loading") detailResponse = () => new Promise<Response>(() => {});
    if (state === "error")
      detailResponse = () => Response.json({ error: "Request failed" }, { status: 503 });
    await render(search, state === "loaded");
    if (state === "error")
      await page.until(() => page.container.textContent.includes("Reintentar"));
    await click("Volver a reservas");
    await page.until(() => router.state.location.pathname === "/reservations");
    await page.until(() => page.container.textContent.includes("No se encontraron reservas"));
  },
);

it("keeps identity and phone visible with one reservation-edit entry point in the header", async () => {
  await render();
  const header = page.container.querySelector("main header");
  assert.ok(header);
  assert.ok(header.textContent.includes("Ana Pérez"));
  assert.ok(header.textContent.includes("#BILL0001"));
  assert.equal(header.querySelector('a[href="tel:999111222"]')?.textContent, "999111222");
  const reservationEditors = Array.from(page.container.querySelectorAll("button")).filter(
    (element) =>
      element.textContent.trim() === "Editar reserva" ||
      element.getAttribute("aria-label") === "Editar estadía",
  );
  assert.equal(
    reservationEditors.length,
    1,
    "Staff must have one clearly scoped reservation editor",
  );
  assert.ok(header.contains(button("Editar reserva")));
  await click("Editar reserva");
  await page.until(() => browser.window.document.querySelector('[role="dialog"]') !== null);
  assert.match(browser.window.document.querySelector('[role="dialog"]')!.textContent, /Check-in/);
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
    if (creditCents > 0)
      assert.ok(page.container.textContent.includes("no representa un reembolso"));
  },
);

it("registers a received payment independently of the discount and refreshes the amount paid and balance", async () => {
  writeResponse = (command) => {
    assert.equal(command.actions.length, 1);
    const action = command.actions[0]!;
    assert.equal(action.type, "add-payment");
    if (action.type === "add-payment") assert.equal(action.payment.amountCents, 4975);
    saved = { ...saved, paidCents: 15000, balanceCents: 10000 };
    return Response.json(saved);
  };
  await render();
  await click("Registrar pago");
  await fillAmount("49.75");
  await click("Guardar cambios");
  await page.until(() => browser.window.document.querySelector('[role="dialog"]') === null);
  assert.equal(amount("Descuento"), "S/50.50");
  assert.equal(amount("Total"), "S/250");
  assert.equal(amount("Pagado"), "S/150");
  assert.match(page.container.textContent.replace(/\s/g, ""), /SaldopendienteS\/100/);
});

it("protects a discount draft when Back targets Reservations and allows explicit discard", async () => {
  await render("?origin=calendar&returnTo=from%3D2026-10-19%26span%3D14");
  await click("Editar descuento");
  await fillAmount("25");
  await click("Volver a reservas");
  await page.until(() =>
    browser.window.document.body.textContent.includes("Hay cambios sin guardar"),
  );
  assert.equal(router.state.location.pathname, "/reservations/summary");
  await click("Seguir editando");
  assert.equal(
    browser.window.document.querySelector<HTMLInputElement>('input[name="amount"]')?.value,
    "25",
  );
  await click("Volver a reservas");
  await click("Descartar y salir");
  await page.until(() => router.state.location.pathname === "/reservations");
});
