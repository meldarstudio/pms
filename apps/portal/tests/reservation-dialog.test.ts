import assert from "node:assert/strict";
import { afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLInputElement, HTMLButtonElement, HTMLElement } from "happy-dom";
import { sharedBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";
import type {
  RatePlanTerms,
  ReservationDetail,
  RoomType,
  WorkflowCommand,
  WorkflowBilling,
  WorkflowIssue,
} from "../src/lib/api.ts";

let browser: BrowserTest;
let page: BrowserPage;
let window: BrowserTest["window"];
let React: BrowserTest["React"];
let query: BrowserTest["query"];
let forms: typeof import("../src/components/reservation-entry-forms.tsx");
let dialogs: typeof import("../src/components/room-booking-dialog.tsx");
let stayEditors: typeof import("../src/components/stay-editor.tsx");
let newBookings: typeof import("../src/components/new-booking.tsx");
let commands: typeof import("../src/lib/reservation-commands.ts");
type CreateBookingInput = Parameters<typeof import("../src/lib/api.ts").createWorkflowBooking>[0];
type CreationPreviewInput = Parameters<
  typeof import("../src/lib/api.ts").previewWorkflowBooking
>[0];
let root: BrowserPage["root"];
let container: BrowserPage["container"];
let client: BrowserPage["client"];
let render: BrowserPage["render"];
let withClient: BrowserPage["withClient"];
let flush: BrowserPage["flush"];
let until: BrowserPage["until"];

beforeAll(async () => {
  browser = await sharedBrowserTest();
  ({ window, React, query } = browser);
  const { server } = browser;
  forms = (await server.ssrLoadModule(
    "/src/components/reservation-entry-forms.tsx",
  )) as typeof forms;
  dialogs = (await server.ssrLoadModule(
    "/src/components/room-booking-dialog.tsx",
  )) as typeof dialogs;
  stayEditors = (await server.ssrLoadModule(
    "/src/components/stay-editor.tsx",
  )) as typeof stayEditors;
  newBookings = (await server.ssrLoadModule(
    "/src/components/new-booking.tsx",
  )) as typeof newBookings;
  commands = (await server.ssrLoadModule("/src/lib/reservation-commands.ts")) as typeof commands;
  const calendar = (await server.ssrLoadModule(
    "/src/lib/property-calendar.ts",
  )) as typeof import("../src/lib/property-calendar.ts");
  calendar.configurePropertyCalendar("America/Lima");
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T01:00:00Z"));
  page = browser.createPage();
  ({ root, container, client, render, withClient, flush, until } = page);
  page.api.catalog.roomTypes = [doubleType];
  page.api.catalog.rooms = [{ id: "room-1", number: "101", roomTypeId: "double" }];
});

afterEach(async () => {
  await page.cleanup();
  vi.useRealTimers();
});

const doubleType: RoomType = {
  id: "double",
  name: "Doble",
  maxAdults: 2,
  maxChildren: 2,
  baseRateCents: 15000,
};

function detail(): ReservationDetail {
  return {
    id: "reservation-1",
    code: "TEST0001",
    status: "confirmed",
    notes: null,
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
      cancellationPolicy: { chargeBasis: "first_night", freeUntilDaysBeforeCheckIn: 2 },
      paymentSchedule: "first_night_deposit",
      priceAdjustmentPercent: 0,
    },
    requiredInitialPaymentCents: 15000,
    remainingScheduledCents: 15000,
    guestId: "contact-1",
    guest: {
      id: "contact-1",
      fullName: "Test Guest",
      phone: null,
      email: null,
      notes: null,
      nationality: null,
    },
    stayingGuests: [],
    checkIn: "2026-10-14",
    checkOut: "2026-10-16",
    source: "direct",
    currency: "PEN",
    totalCents: 30000,
    subtotalCents: 30000,
    discountCents: 0,
    paidCents: 0,
    balanceCents: 30000,
    payments: [],
    rooms: [
      {
        id: "line-1",
        roomTypeId: "double",
        roomTypeName: "Doble",
        roomId: "room-1",
        roomNumber: "101",
        housekeepingStatus: "clean",
        adults: 1,
        children: 0,
        subtotalCents: 30000,
        discountCents: 0,
        totalCents: 30000,
        nights: [],
      },
    ],
  };
}

const savedAs = (reservation: ReservationDetail) => ({ status: "saved" as const, reservation });

const control = (name: string) => page.field(name);
const fill = (target: Parameters<BrowserPage["fill"]>[0], value: string) =>
  page.fill(target, value);

async function submit() {
  const form = container.querySelector("form")!;
  await React.act(async () => {
    form.dispatchEvent(
      new window.Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

const button = (label: string) => page.button(label);

const stayEditor = (reservation: ReservationDetail) =>
  React.createElement(stayEditors.StayEditor, {
    detail: reservation,
    onDirtyChange: () => {},
    onCancel: () => {},
    onSaved: () => {},
  });

async function renderCachedEditor(reservation: () => ReservationDetail) {
  client.setQueryData(["reservation", reservation().id], reservation());
  function Editor() {
    const cached = query.useQuery<ReservationDetail>({
      queryKey: ["reservation", reservation().id],
      queryFn: async () => reservation(),
      staleTime: Infinity,
    });
    return stayEditor(cached.data!);
  }
  await render(React.createElement(Editor));
}

async function renderPaymentEntry(reservation: () => ReservationDetail) {
  client.setQueryData(["reservation", reservation().id], reservation());
  function Entry() {
    const cached = query.useQuery<ReservationDetail>({
      queryKey: ["reservation", reservation().id],
      queryFn: async () => reservation(),
      staleTime: Infinity,
    });
    const { send, saving } = commands.useReservationCommands(reservation().id);
    return React.createElement(forms.PaymentForm, {
      detail: cached.data!,
      disabled: saving,
      onDirtyChange: () => {},
      onReady: (_title, actions) => send(actions),
    });
  }
  await render(React.createElement(Entry));
}

const couponApplied = () =>
  client.getQueryData<ReservationDetail>(["reservation", "reservation-1"])?.couponAppliedCents;

it("refreshes an untouched payment suggestion and submits a manual Yape amount without a reference", async () => {
  const writes: WorkflowCommand["actions"][] = [];
  const props = {
    disabled: false,
    onDirtyChange: () => {},
    onReady: async (_title: string, actions: WorkflowCommand["actions"]) => {
      writes.push(actions);
      return savedAs(detail());
    },
  };
  await render(React.createElement(forms.PaymentForm, { ...props, detail: detail() }));
  await render(
    React.createElement(forms.PaymentForm, {
      ...props,
      detail: { ...detail(), balanceCents: 25000 },
    }),
  );
  assert.equal(control("amount").value, "250.00");
  await fill("amount", "75");
  await render(
    React.createElement(forms.PaymentForm, {
      ...props,
      detail: { ...detail(), balanceCents: 20000 },
    }),
  );
  assert.equal(control("amount").value, "75");
  await choose("Método", "Yape");
  await submit();
  assert.deepEqual(writes, [
    [
      {
        type: "add-payment",
        payment: { amountCents: 7500, method: "yape", paymentDate: "2026-10-31" },
      },
    ],
  ]);
});

function mockApi(
  handler: (path: string, command: WorkflowCommand) => Promise<Response>,
  {
    roomCount = 1,
    reservation = detail,
  }: { roomCount?: number; reservation?: () => ReservationDetail } = {},
) {
  page.api.catalog.rooms = Array.from({ length: roomCount }, (_, index) => ({
    id: `room-${index + 1}`,
    number: `${101 + index}`,
    roomTypeId: "double",
  }));
  page.api.on("GET", "/reservations/reservation-1", () => reservation());
  page.api.on<WorkflowCommand>("POST", "*", ({ path, body }) => handler(path, body));
}

function previewResponse(billing: WorkflowBilling, issues: WorkflowIssue[] = []) {
  return Response.json({ billing, validation: { issues } });
}

function doubleAvailability(free: number, freeRoomIds: string[]) {
  return {
    checkIn: "2026-10-14",
    checkOut: "2026-10-16",
    nights: 2,
    currency: "PEN",
    roomTypes: [
      { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, free, freeRoomIds },
    ].map((type) => ({ ...type, totalCents: 0, nights: [] })),
  };
}

it("adds a new room without repricing saved rooms and retries a failed save", async () => {
  const writes: WorkflowCommand[] = [];
  mockApi(
    async (path, command) => {
      if (path.endsWith("/preview"))
        return previewResponse({
          ...detail(),
          subtotalCents: 60000,
          totalCents: 60000,
          balanceCents: 60000,
        });
      writes.push(command);
      return writes.length === 1
        ? Response.json({ error: "Temporary save failure" }, { status: 503 })
        : Response.json(detail());
    },
    { roomCount: 3 },
  );
  await renderCachedEditor(detail);
  await until(
    () => !!window.document.querySelector('[name="rooms[0].room.adults"]'),
    "The details form must load",
  );
  await until(() => !button("Agregar habitación").disabled, "Room availability must load");
  await page.click("Agregar habitación");
  await until(() => !button("Guardar cambios").disabled, "The added room preview must load");
  assert.equal(summaryAmount("Total"), "S/600");
  await page.click("Guardar cambios");
  await until(
    () => writes.length === 1 && !button("Guardar cambios").disabled,
    "A failed save must keep the draft retryable",
  );
  await page.click("Guardar cambios");
  await until(() => writes.length === 2, "Retry must save the same new room");
  assert.deepEqual(writes[1], writes[0]);
  assert.deepEqual(writes[0].actions, [
    {
      type: "add-room",
      room: { roomTypeId: "double", roomId: null, adults: 1, children: 0 },
    },
  ]);
});

function summaryAmount(label: string) {
  const status = container.querySelector(`output[aria-label="${label}"]`);
  if (status) return status.textContent.replace(/\s/g, "");
  const term = Array.from(container.querySelectorAll("dt")).find(
    (item) => item.textContent === label,
  );
  assert.ok(term, `Missing bill label ${label}`);
  return term.nextElementSibling?.textContent.replace(/\s/g, "");
}

async function submitPayment() {
  const form = control("amount").closest("form")!;
  await React.act(async () => {
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.focus();
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function enterCoupon(code: string) {
  await choose("Método", "Cupón");
  await fill("code", code);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(
    page.api.requests("GET", /\/coupons\//).length,
    0,
    "A coupon is not looked up while it is typed",
  );
}

it("checks a normalized coupon with the command preview on submit, then redeems it", async () => {
  let saved = { ...detail(), initialPaymentDueCents: 15000 };
  const previews = page.api.bodies<WorkflowCommand>("POST", "/reservations/:id/preview");
  const writes = page.api.bodies<WorkflowCommand>("POST", "/reservations/:id/commands");
  const redemption = [{ type: "redeem-coupon", code: "ABCD123456", amountCents: 30000 }];
  mockApi(
    async (path, command) => {
      assert.deepEqual(command.actions, redemption);
      if (path.endsWith("/preview")) return previewResponse({ ...saved, balanceCents: 0 });
      assert.equal(previews.length, 1, "The save waits for the preview");
      saved = { ...saved, couponAppliedCents: 30000, balanceCents: 0 };
      return Response.json(saved);
    },
    { reservation: () => saved },
  );
  await renderPaymentEntry(() => saved);
  await enterCoupon(" abcd-123 456 ");
  assert.equal(window.document.querySelector('[name="reference"]'), null);
  assert.equal(control("amount").value, "300.00", "The suggestion is the saved balance");
  assert.equal(button("Aplicar cupón").disabled, false);
  await submitPayment();
  await until(() => writes.length === 1 && couponApplied() === 30000);
});

it("keeps a coupon draft and retry ID after a lost response and replays it without a new preview", async () => {
  const writes = page.api.bodies<WorkflowCommand>("POST", "/reservations/:id/commands");
  let previewRejects = false;
  mockApi(async (path) => {
    if (path.endsWith("/preview"))
      return previewRejects
        ? Response.json({ error: "coupon redemption exceeds its balance" }, { status: 400 })
        : previewResponse(detail());
    return writes.length === 1
      ? Response.json({ error: "Temporary failure" }, { status: 503 })
      : Response.json({ ...detail(), couponAppliedCents: 5000, balanceCents: 25000 });
  });
  await renderPaymentEntry(detail);
  await enterCoupon("ABCD123456");
  await fill("amount", "50");
  await submitPayment();
  await until(() => writes.length === 1 && !button("Aplicar cupón").disabled);
  assert.equal(control("amount").value, "50");
  assert.equal(control("code").value, "ABCD123456");
  assert.match(container.textContent, /El intento anterior pudo guardarse/);
  previewRejects = true;
  await submitPayment();
  await until(() => writes.length === 2 && couponApplied() === 5000);
  assert.deepEqual(writes[1], writes[0]);
  assert.equal(
    page.api.requests("POST", /\/preview$/).length,
    1,
    "Confirming an uncertain redemption is not blocked by a fresh preview",
  );
});

function fieldTrigger(label: string, index = 0) {
  const fieldLabel = Array.from(window.document.querySelectorAll("label")).filter(
    (item) => item.textContent.trim() === label,
  )[index];
  assert.ok(fieldLabel, `Missing label ${label}`);
  return window.document.getElementById(fieldLabel.htmlFor) as HTMLButtonElement;
}

async function choose(label: string, option: string, index = 0) {
  const trigger = fieldTrigger(label, index);
  await until(() => !trigger.hasAttribute("disabled"), `${label} must be ready`);
  await React.act(async () => trigger.click());
  const item = Array.from(window.document.querySelectorAll('[role="option"]')).find(
    (item) => item.textContent.trim() === option,
  );
  assert.ok(item, `Missing option ${option}`);
  assert.notEqual(item.getAttribute("aria-disabled"), "true");
  await React.act(async () => (item as HTMLElement).click());
}

function ratePlanRadios() {
  const legend = Array.from(window.document.querySelectorAll("legend")).find(
    (item) => item.textContent.trim() === "Tarifa",
  );
  assert.ok(legend?.parentElement, "Missing Tarifa radio group");
  return Array.from(legend.parentElement.querySelectorAll("label")).map((option) => ({
    radio: option.querySelector<HTMLElement>('[role="radio"]')!,
    label: option.querySelector('[data-slot="field-content"]')?.firstElementChild?.textContent,
  }));
}

function checkedRatePlan() {
  return ratePlanRadios().find(({ radio }) => radio.getAttribute("aria-checked") === "true")?.label;
}

async function chooseRatePlan(option: string) {
  const match = ratePlanRadios().find(({ label }) => label === option);
  assert.ok(match, `Missing rate plan ${option}`);
  await React.act(async () => match.radio.click());
  await until(() => checkedRatePlan() === option, `${option} must be selected`);
}

const createTarget = {
  mode: "create" as const,
  roomId: "room-1",
  roomTypeId: "double",
  number: "101",
  typeName: "Doble",
  checkIn: "2026-10-14",
};

const ratePlans: RatePlanTerms[] = [
  {
    plan: "flexible",
    cancellationPolicy: { chargeBasis: "first_night", freeUntilDaysBeforeCheckIn: 2 },
    paymentSchedule: "first_night_deposit",
    priceAdjustmentPercent: 0,
  },
  {
    plan: "non_refundable",
    cancellationPolicy: { chargeBasis: "final_total", freeUntilDaysBeforeCheckIn: null },
    paymentSchedule: "full_upfront",
    priceAdjustmentPercent: -10,
  },
];

function stayDates(checkIn: string, checkOut: string) {
  const dates: string[] = [];
  for (let day = Date.parse(checkIn); day < Date.parse(checkOut); day += 86400000)
    dates.push(new Date(day).toISOString().slice(0, 10));
  return dates;
}

function creationPreview(
  body: CreationPreviewInput,
  nightCents: (date: string) => number = () => 15000,
) {
  const terms = ratePlans.find((plan) => plan.plan === (body.ratePlan ?? "flexible"))!;
  const rooms = body.rooms.map((room) => {
    const nights = stayDates(body.checkIn, body.checkOut).map((date) => ({
      date,
      priceCents: Math.round((nightCents(date) * (100 + terms.priceAdjustmentPercent)) / 100),
    }));
    const subtotalCents = nights.reduce((sum, night) => sum + night.priceCents, 0);
    return {
      roomTypeId: room.roomTypeId,
      subtotalCents,
      discountCents: 0,
      totalCents: subtotalCents,
      nights,
    };
  });
  const subtotalCents = rooms.reduce((sum, room) => sum + room.subtotalCents, 0);
  const discountCents = Math.min(body.discountCents ?? 0, subtotalCents);
  const totalCents = subtotalCents - discountCents;
  const firstNights = rooms.reduce((sum, room) => sum + room.nights[0].priceCents, 0);
  const requiredInitialPaymentCents =
    terms.paymentSchedule === "full_upfront" ? totalCents : Math.min(firstNights, totalCents);
  return {
    billing: {
      subtotalCents,
      discountCents,
      totalCents,
      paidCents: 0,
      balanceCents: totalCents,
      requiredInitialPaymentCents,
      remainingScheduledCents: totalCents - requiredInitialPaymentCents,
      ratePlan: terms,
      currency: "PEN",
      rooms,
    },
  };
}

function mockCreationApi(
  handler: (input: CreateBookingInput) => Promise<Response>,
  { nightCents }: { nightCents?: (date: string) => number } = {},
) {
  mockApi(async (path, input) => {
    assert.equal(path, "/reservations");
    return handler(input as unknown as CreateBookingInput);
  });
  page.api.on("GET", "/rate-plans", () => ratePlans);
  page.api.on<CreationPreviewInput>("POST", "/reservations/preview", ({ body }) =>
    creationPreview(body, nightCents),
  );
  page.api.on("GET", "/availability", ({ url }) => {
    const checkIn = url.searchParams.get("checkIn")!;
    const checkOut = url.searchParams.get("checkOut")!;
    const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
    return {
      checkIn,
      checkOut,
      nights,
      currency: "PEN",
      roomTypes: [
        {
          id: "double",
          name: "Doble",
          maxAdults: 2,
          maxChildren: 2,
          free: 5,
          freeRoomIds: page.api.catalog.rooms
            .filter((room) => room.roomTypeId === "double")
            .map((room) => room.id),
          totalCents: nights * 15000,
          nights: [],
        },
      ],
    };
  });
}

async function renderNewBooking(
  onCreated: (id: string) => void = () => {},
  target: typeof createTarget | { mode: "new" } = createTarget,
) {
  await render(
    React.createElement(newBookings.NewBooking, {
      target,
      onCreated: (reservation: ReservationDetail) => onCreated(reservation.id),
      onCancel: () => {},
      onDirtyChange: () => {},
      onSavingChange: () => {},
    }),
  );
  await until(() => !button("Crear reserva").disabled, "New booking quote must load");
}

const creationTotal = () =>
  Array.from(window.document.querySelectorAll("dt"))
    .find((term) => term.textContent === "Total")
    ?.nextElementSibling?.textContent.replace(/\s/g, "") ?? "";

function discountTrigger() {
  const trigger = Array.from(window.document.querySelectorAll("button")).find((item) =>
    item.textContent.trim().startsWith("Descuento"),
  );
  assert.ok(trigger, "The summary must offer the reservation discount");
  return trigger;
}

function discountInput() {
  const label = Array.from(window.document.querySelectorAll("label")).find(
    (item) => item.textContent.trim() === "Descuento · S/",
  );
  return label ? window.document.querySelector<HTMLInputElement>(`[id="${label.htmlFor}"]`) : null;
}

function discountPopover() {
  const popup = discountInput()?.closest('[role="dialog"]');
  assert.ok(popup, "The discount popover must be open");
  return popup;
}

const popoverButton = (label: string) => {
  const found = Array.from(discountPopover().querySelectorAll("button")).find(
    (item) => item.textContent.trim() === label,
  );
  return found as HTMLButtonElement | undefined;
};

async function openDiscount() {
  await React.act(async () => discountTrigger().click());
  await until(() => !!discountInput(), "The discount popover must open");
}

async function applyDiscount(amount: string) {
  await openDiscount();
  await fill(discountInput()!, amount);
  await React.act(async () => popoverButton("Aplicar")!.click());
  await until(() => !discountInput(), "Applying must close the discount popover");
  await until(() => !button("Crear reserva").disabled, "The discounted preview must load");
}

const summaryText = () =>
  Array.from(window.document.querySelectorAll("h3"))
    .find((heading) => heading.textContent === "Resumen de reserva")
    ?.closest("section")?.textContent ?? "";
const appliedDiscount = () =>
  discountTrigger()
    .textContent.replace(/\s/g, "")
    .replace(/^Descuento/, "");

it("defaults to Flexible, previews and creates under the chosen rate plan", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  const previews = page.api.bodies<CreationPreviewInput>("POST", "/reservations/preview");
  await renderNewBooking();
  assert.equal(checkedRatePlan(), "Flexible");
  assert.equal(previews.at(-1)?.ratePlan, "flexible");
  await fill("fullName", "Ada Lovelace");
  await submit();
  await until(() => writes.length === 1, "A Flexible reservation must save");
  assert.equal(writes[0].ratePlan, "flexible");

  await chooseRatePlan("No reembolsable");
  await until(
    () => previews.at(-1)?.ratePlan === "non_refundable" && !button("Crear reserva").disabled,
    "Choosing a plan must request its preview",
  );
  await submit();
  await until(() => writes.length === 2, "A Non-refundable reservation must save");
  assert.equal(writes[1].ratePlan, "non_refundable");
});

it("never shows a stale preview and retries a failed one before creating", async () => {
  mockCreationApi(async () => Response.json(detail(), { status: 201 }));
  await renderNewBooking();
  const held = page.api.hold("POST", "/reservations/preview");
  await chooseRatePlan("No reembolsable");
  await until(() => !!held.request, "The new plan must be previewed");
  assert.equal(button("Crear reserva").disabled, true);
  assert.ok(summaryText().includes("Calculando…"));
  assert.ok(!summaryText().includes("S/150"), "The Flexible total must not stay visible");
  await React.act(async () =>
    held.release(Response.json({ error: "unknown rate plan" }, { status: 400 })),
  );
  await until(() => summaryText().includes("Esta tarifa ya no existe"), "Errors are translated");
  assert.equal(button("Crear reserva").disabled, true);
  await React.act(async () => button("Reintentar").click());
  await until(() => creationTotal() === "S/135", "Retrying must load the preview");
  assert.equal(button("Crear reserva").disabled, false);
});

it("creates a reservation with its contact, notes, room quote, and initial discount", async () => {
  const writes: CreateBookingInput[] = [];
  let created = "";
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking((id) => {
    created = id;
  });
  assert.equal(creationTotal(), "S/150");
  assert.equal(
    control("fullName").closest("fieldset")?.querySelector("legend")?.textContent,
    "Contacto principal",
  );
  await fill("fullName", "  Ada Lovelace  ");
  await fill("email", "  ada@example.com  ");
  await fill("phone", "+51 999 888 777");
  assert.equal(fieldTrigger("Nacionalidad").textContent, "Perú");
  await fill("notes", "Llegada después de las 22:00");
  await React.act(async () => fieldTrigger("Check-out").click());
  const day = Array.from(
    window.document.querySelectorAll<HTMLButtonElement>("button[data-day]"),
  ).find((button) => button.textContent.trim() === "16")!;
  assert.ok(day);
  await React.act(async () => day.click());
  await until(
    () => container.textContent.replace(/\s/g, "").includes("S/300"),
    "Changing dates must reprice the stay",
  );
  await React.act(async () => button("Agregar habitación").click());
  await until(
    () => container.textContent.replace(/\s/g, "").includes("S/600"),
    "Both rooms must appear in the total",
  );
  await applyDiscount("30");
  assert.equal(appliedDiscount(), "-S/30");
  assert.equal(creationTotal(), "S/570", "The discount applies after both rooms' subtotal");
  await submit();
  await until(
    () => created === "reservation-1",
    "Successful creation must report the saved reservation",
  );
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].guest, {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+51999888777",
    nationality: "PE",
  });
  assert.equal(writes[0].notes, "Llegada después de las 22:00");
  assert.equal(writes[0].discountCents, 3000);
  assert.equal(writes[0].checkOut, "2026-10-16");
  assert.deepEqual(
    writes[0].rooms.map((room) => room.roomId),
    ["room-1", null],
  );
});

it("offers only server-listed free room numbers and types not used up by this draft", async () => {
  mockCreationApi(async () => Response.json(detail()));
  const types = [
    { ...doubleType, free: 2 },
    { id: "suite", name: "Suite", maxAdults: 4, maxChildren: 2, baseRateCents: 15000, free: 0 },
    { id: "family", name: "Familiar", maxAdults: 4, maxChildren: 2, baseRateCents: 15000, free: 1 },
  ];
  page.api.catalog.roomTypes = types;
  page.api.catalog.rooms = [
    ...[1, 2, 3, 4].map((n) => ({
      id: `room-${n}`,
      number: `10${n}`,
      roomTypeId: "double",
    })),
    { id: "suite-1", number: "201", roomTypeId: "suite" },
    { id: "family-1", number: "301", roomTypeId: "family" },
  ];
  page.api.on("GET", "/availability", () => ({
    checkIn: "2026-10-14",
    checkOut: "2026-10-15",
    nights: 1,
    currency: "PEN",
    roomTypes: types.map((type) => ({
      ...type,
      freeRoomIds: { double: ["room-3", "room-4"], suite: [], family: ["family-1"] }[type.id],
      totalCents: 15000,
      nights: [],
    })),
  }));
  await renderNewBooking();
  assert.match(fieldTrigger("Hab.").textContent, /Sin asignar/);
  await React.act(async () => fieldTrigger("Tipo").click());
  const optionLabels = () =>
    [
      ...window.document.querySelectorAll(
        '[data-slot="select-content"][data-open] [role="option"]',
      ),
    ].map((option) => option.textContent.trim());
  assert.deepEqual(optionLabels(), ["Doble", "Familiar"]);
  await React.act(async () =>
    (
      window.document.querySelector(
        '[data-slot="select-content"][data-open] [role="option"]',
      ) as HTMLElement
    ).click(),
  );
  await React.act(async () => fieldTrigger("Hab.").click());
  assert.deepEqual(optionLabels(), ["Sin asignar", "103", "104"]);
  const room103 = [
    ...window.document.querySelectorAll<HTMLElement>(
      '[data-slot="select-content"][data-open] [role="option"]',
    ),
  ].find((option) => option.textContent.trim() === "103")!;
  await React.act(async () => room103.click());
  await React.act(async () => button("Agregar habitación").click());
  await React.act(async () => fieldTrigger("Hab.", 1).click());
  assert.deepEqual(optionLabels(), ["Sin asignar", "104"]);
  await React.act(async () =>
    (
      window.document.querySelector(
        '[data-slot="select-content"][data-open] [role="option"]',
      ) as HTMLElement
    ).click(),
  );
  await React.act(async () => button("Agregar habitación").click());
  await React.act(async () => fieldTrigger("Tipo", 2).click());
  assert.deepEqual(optionLabels(), ["Familiar"]);
  await React.act(async () =>
    (
      window.document.querySelector(
        '[data-slot="select-content"][data-open] [role="option"]',
      ) as HTMLElement
    ).click(),
  );
  assert.equal(button("Agregar habitación").disabled, true);
  await page.menuAction("Acciones de la habitación 2", "Quitar habitación");
  assert.equal(button("Agregar habitación").disabled, false);
});

for (const { name, cached, fresh, roomId, shown } of [
  {
    name: "clears a preselected room the fresh read no longer lists",
    cached: ["room-1"],
    fresh: [],
    roomId: null,
    shown: /^Sin asignar/,
  },
  {
    name: "keeps a preselected room the fresh read lists again",
    cached: [],
    fresh: ["room-1"],
    roomId: "room-1",
    shown: /^101/,
  },
])
  it(`rechecks cached availability on reopen before creating and ${name}`, async () => {
    const writes: CreateBookingInput[] = [];
    mockCreationApi(async (input) => {
      writes.push(input);
      return Response.json(detail(), { status: 201 });
    });
    const availabilityFor = (url: URL, freeRoomIds: string[]) => ({
      checkIn: url.searchParams.get("checkIn"),
      checkOut: url.searchParams.get("checkOut"),
      nights: 1,
      currency: "PEN",
      roomTypes: [{ ...doubleType, free: 5, freeRoomIds, totalCents: 15000, nights: [] }],
    });
    page.api.on("GET", "/availability", ({ url }) => availabilityFor(url, cached));
    function Reopenable() {
      const [open, setOpen] = React.useState(true);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement("button", { type: "button", onClick: () => setOpen(!open) }, "Toggle"),
        open &&
          React.createElement(newBookings.NewBooking, {
            target: createTarget,
            onCreated: () => {},
            onCancel: () => {},
            onDirtyChange: () => {},
            onSavingChange: () => {},
          }),
      );
    }
    await render(React.createElement(Reopenable));
    await until(() => !button("Crear reserva").disabled, "The first open must load");
    await React.act(async () => button("Toggle").click());
    await until(
      () => window.document.querySelector('[name="fullName"]') === null,
      "Closing must unmount the form",
    );

    const held = page.api.hold("GET", "/availability");
    await React.act(async () => button("Toggle").click());
    await until(() => !!held.request, "Reopening must refetch the cached availability");
    await fill("fullName", "Ada Lovelace");
    await flush();
    assert.equal(button("Crear reserva").disabled, true);
    await submit();
    await flush();
    assert.equal(writes.length, 0, "Submitting must wait for the fresh availability");

    await React.act(async () =>
      held.release(Response.json(availabilityFor(held.request!.url, fresh))),
    );
    await until(() => !button("Crear reserva").disabled, "Fresh availability must allow creating");
    assert.match(fieldTrigger("Hab.").textContent, shown);
    await submit();
    await until(() => writes.length === 1, "The rechecked draft may be created");
    assert.equal(writes[0].rooms[0].roomId ?? null, roomId);
  });

it("preserves a failed creation draft and safely retries until its payload changes", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return writes.length < 3
      ? Response.json({ error: "Temporary save failure" }, { status: 503 })
      : Response.json(detail());
  });
  await renderNewBooking();
  await fill("fullName", "Ada Lovelace");
  await fill("notes", "Llegada tarde");
  await until(() => !button("Crear reserva").disabled);
  for (let attempt = 1; attempt <= 2; attempt++) {
    await submit();
    await until(
      () => writes.length === attempt && !button("Crear reserva").disabled,
      "Failed save must allow retrying",
    );
    assert.equal(control("notes").value, "Llegada tarde");
  }
  assert.deepEqual(writes[0], writes[1]);
  await fill("notes", "Llegada temprano");
  await until(() => !button("Crear reserva").disabled);
  await submit();
  await until(() => writes.length === 3, "Updated draft must save");
  assert.notEqual(writes[2].requestId, writes[1].requestId);
});

it.each([
  {
    rejected: "too many guests",
    field: "rooms[1]",
    response: Response.json({ error: "too many guests for this room type" }, { status: 400 }),
    target: () => control("rooms[1].room.adults"),
    message: "no tiene capacidad",
    correct: () => fill("rooms[1].room.adults", "2"),
  },
  {
    rejected: "room number",
    field: "rooms[1].roomId",
    response: Response.json({ error: "room not found" }, { status: 404 }),
    target: () => fieldTrigger("Hab.", 1),
    message: "Esta habitación ya no existe.",
    correct: () => choose("Hab.", "Sin asignar", 1),
  },
])(
  "shows a rejected $rejected at the second room's fields until corrected, keeping the draft",
  async ({ field, response, target, message, correct }) => {
    const writes: CreateBookingInput[] = [];
    mockCreationApi(async (input) => {
      writes.push(input);
      response.headers.set("X-Error-Field", field);
      return response;
    });
    page.api.catalog.rooms.push({ id: "room-2", number: "102", roomTypeId: "double" });
    await renderNewBooking();
    await fill("fullName", "Ada Lovelace");
    await React.act(async () => button("Agregar habitación").click());
    await choose("Hab.", "102", 1);
    await until(() => !button("Crear reserva").disabled);
    await submit();
    await until(() => writes.length === 1 && !button("Crear reserva").disabled);
    assert.equal(writes[0].rooms[1].roomId, "room-2");
    const element = target();
    await until(
      () => element.getAttribute("aria-invalid") === "true",
      "The rejected room's field must be marked",
    );
    const described = (element.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => window.document.getElementById(id)?.textContent ?? "")
      .join(" ");
    assert.ok(described.includes(message), described);
    assert.equal(control("rooms[0].room.adults").getAttribute("aria-invalid"), "false");
    assert.equal(control("fullName").value, "Ada Lovelace");
    await correct();
    await until(
      () => target().getAttribute("aria-invalid") === "false",
      "Correcting the room must clear its rejection",
    );
  },
);

it("protects a new reservation draft, blocks closing during creation, then opens its page", async () => {
  let finish!: (response: Response) => void;
  let closed = 0;
  const created: string[] = [];
  mockCreationApi(
    async () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  function NewDialog() {
    const [open, setOpen] = React.useState(true);
    return React.createElement(dialogs.RoomBookingDialog, {
      target: open ? createTarget : null,
      onClose: () => {
        closed++;
        setOpen(false);
      },
      onCreated: (id: string) => {
        created.push(id);
      },
    });
  }
  await render(React.createElement(NewDialog));
  await until(() => !button("Crear reserva").disabled, "New dialog must load");
  await fill("fullName", "Ada Lovelace");
  await React.act(async () => button("Cerrar").click());
  assert.equal(closed, 0);
  assert.ok(window.document.body.textContent.includes("Descartar y salir"));
  await React.act(async () => button("Seguir editando").click());
  assert.equal(control("fullName").value, "Ada Lovelace");
  await React.act(async () => button("Cancelar").click());
  assert.equal(closed, 0);
  await React.act(async () => button("Seguir editando").click());
  const popup = window.document.querySelector('[role="dialog"]')!;
  await React.act(async () => button("Crear reserva").click());
  await until(() => !!finish && button("Cerrar").disabled, "Saving must lock closing");
  await React.act(async () =>
    popup.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  assert.equal(closed, 0);
  await React.act(async () => finish(Response.json(detail(), { status: 201 })));
  await until(() => created.length === 1, "Successful creation must open the new reservation");
  assert.deepEqual(created, ["reservation-1"]);
  assert.equal(closed, 0, "Opening the page replaces closing the dialog");
  assert.equal(
    window.document.querySelector('[name="amount"]'),
    null,
    "Creation must not turn the dialog into an editor",
  );
  assert.equal(page.api.requests("POST", /\/commands$/).length, 0, "Creating records no payment");
});

it("keeps an extension price visible and identifies the conflicting room without exposing its ID", async () => {
  const initial = detail();
  let writes = 0;
  const previews: WorkflowCommand[] = [];
  let finishPreview!: () => void;
  mockApi(async (path, command) => {
    if (path.endsWith("/commands")) {
      writes++;
      return Response.json(initial);
    }
    previews.push(command);
    const assignment = command.actions.find((action) => action.type === "edit-room");
    const conflict =
      !assignment || assignment.type !== "edit-room" || assignment.room.roomId !== null;
    const response = previewResponse(
      {
        ...initial,
        checkOut: "2026-10-17",
        subtotalCents: 45000,
        totalCents: 45000,
        balanceCents: 45000,
        rooms: [{ ...initial.rooms[0], subtotalCents: 45000, totalCents: 45000 }],
      },
      conflict
        ? [
            {
              code: "room is already assigned for those dates",
              roomIndex: 0,
              field: "roomId",
            },
          ]
        : [],
    );
    return previews.length === 2
      ? new Promise<Response>((resolve) => {
          finishPreview = () => resolve(response);
        })
      : response;
  });
  page.api.on("GET", "/availability", ({ url }) =>
    url.searchParams.get("checkOut") === "2026-10-17"
      ? doubleAvailability(0, [])
      : doubleAvailability(1, ["room-1"]),
  );
  await render(stayEditor(initial));
  await React.act(async () => fieldTrigger("Check-out").click());
  const day = Array.from(
    window.document.querySelectorAll<HTMLButtonElement>("button[data-day]"),
  ).find((button) => button.textContent.trim() === "17");
  assert.ok(day);
  await React.act(async () => day.click());
  const room = fieldTrigger("Hab.");
  await until(
    () => room.getAttribute("aria-invalid") === "true",
    "Conflict must mark the assigned room",
  );
  assert.equal(room.querySelector('[data-slot="select-value"]')?.textContent.trim(), "101");
  assert.equal(button("Guardar cambios").disabled, true);
  const error = window.document.getElementById(room.getAttribute("aria-describedby")!)!;
  assert.ok(error.textContent.includes("ocupada para esas fechas"));
  assert.equal(container.querySelector("aside")!.contains(error), false);
  const subtotal = Array.from(container.querySelectorAll("dt")).find(
    (item) => item.textContent === "Total",
  )!;
  assert.equal(subtotal.nextElementSibling?.textContent.replace(/\s/g, ""), "S/450");
  assert.equal(summaryAmount("Saldo pendiente"), "S/450");
  assert.equal(container.textContent.includes("Reintentar"), false);
  assert.equal(container.textContent.includes("Calculando…"), false);
  await submit();
  assert.equal(writes, 0);
  await React.act(async () => room.click());
  const options = Array.from(window.document.querySelectorAll<HTMLElement>('[role="option"]'));
  assert.equal(
    options.find((item) => item.textContent.trim() === "101")?.getAttribute("aria-disabled"),
    "true",
  );
  const unassigned = options.find((item) => item.textContent.trim() === "Sin asignar")!;
  await React.act(async () => unassigned.click());
  const assertQuoteVisible = () => {
    assert.equal(subtotal.nextElementSibling?.textContent.replace(/\s/g, ""), "S/450");
    assert.equal(container.textContent.includes("Calculando…"), false);
    assert.equal(button("Guardar cambios").disabled, true);
  };
  assertQuoteVisible();
  await flush(150);
  assertQuoteVisible();
  await until(() => previews.length === 2, "Assignment must be revalidated");
  assertQuoteVisible();
  await React.act(async () => finishPreview());
  await until(
    () => !button("Guardar cambios").disabled,
    "Clearing the assignment must resolve the conflict",
  );
  assert.equal(room.getAttribute("aria-invalid"), "false");
  assert.equal(window.document.body.textContent.includes("ocupada para esas fechas"), false);
  assert.equal(subtotal.nextElementSibling?.textContent.replace(/\s/g, ""), "S/450");
  assert.equal(previews.length, 2);
});

it("retries a failed stay preview without losing its draft", async () => {
  const previews: WorkflowCommand[] = [];
  mockApi(async (path, command) => {
    assert.equal(path, "/reservations/reservation-1/preview");
    previews.push(command);
    return previews.length === 1
      ? Response.json({ error: "Temporary preview failure" }, { status: 503 })
      : previewResponse(detail());
  });
  await render(stayEditor(detail()));
  await fill("rooms[0].room.adults", "2");
  await until(() => window.document.body.textContent.includes("Temporary preview failure"));
  assert.equal(button("Guardar cambios").disabled, true);
  await React.act(async () => button("Reintentar").click());
  await until(() => !button("Guardar cambios").disabled);
  assert.equal(control("rooms[0].room.adults").value, "2");
  assert.equal(previews.length, 2);
  assert.deepEqual(previews[1].actions, previews[0].actions);
});

it("preserves a failed payment draft and clears each successful payment without restoring the suggested balance", async () => {
  let saved = detail();
  const amounts: number[] = [];
  const props = () => ({
    detail: saved,
    disabled: false,
    onDirtyChange: () => {},
    onReady: async (_title: string, actions: WorkflowCommand["actions"]) => {
      const action = actions[0];
      assert.equal(action.type, "add-payment");
      if (action.type !== "add-payment") throw new Error("Only payments are recorded here");
      amounts.push(action.payment.amountCents);
      if (amounts.length === 1)
        return { status: "failed" as const, message: "Temporary payment failure" };
      saved = { ...saved, balanceCents: saved.balanceCents - action.payment.amountCents };
      root.render(withClient(React.createElement(forms.PaymentForm, props())));
      return savedAs(saved);
    },
  });
  await render(React.createElement(forms.PaymentForm, props()));
  assert.equal(control("amount").value, "300.00");
  await fill("amount", "75");
  await submit();
  await flush();
  assert.equal(control("amount").value, "75");
  for (const amount of ["75", "50"]) {
    await fill("amount", amount);
    await submit();
    assert.equal(control("amount").value, "");
    await flush();
    assert.equal(control("amount").value, "");
  }
  assert.deepEqual(amounts, [7500, 7500, 5000]);
});
