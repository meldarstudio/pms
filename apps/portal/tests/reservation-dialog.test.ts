import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type { HTMLInputElement, HTMLButtonElement, HTMLElement } from "happy-dom";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";
import type {
  CouponLookup,
  RatePlanTerms,
  ReservationDetail,
  RoomType,
  StayingGuest,
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
let summaries: typeof import("../src/components/reservation-summary.tsx");
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
  browser = await createBrowserTest();
  ({ window, React, query } = browser);
  const { server } = browser;
  forms = (await server.ssrLoadModule(
    "/src/components/reservation-entry-forms.tsx",
  )) as typeof forms;
  dialogs = (await server.ssrLoadModule(
    "/src/components/room-booking-dialog.tsx",
  )) as typeof dialogs;
  summaries = (await server.ssrLoadModule(
    "/src/components/reservation-summary.tsx",
  )) as typeof summaries;
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

afterAll(async () => {
  await browser?.close();
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

function summaryDialog({
  onClose = () => {},
  onEdit = () => {},
}: { onClose?: () => void; onEdit?: (id: string) => void } = {}) {
  return React.createElement(summaries.ReservationSummary, {
    reservationId: "reservation-1",
    onClose,
    onEdit,
  });
}

async function openSummary(handlers: Parameters<typeof summaryDialog>[0] = {}) {
  await render(summaryDialog(handlers));
  await until(() => !!summary()?.textContent.includes("#TEST0001"), "The summary must load");
}

const summary = () =>
  window.document.querySelector(
    '[role="dialog"]:is([data-slot="sheet-content"], [data-slot="drawer-popup"])',
  );

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

it("adds consecutive trimmed guests with distinct IDs and resets the real form across rerenders", async () => {
  let saved = detail();
  const writes: StayingGuest[][] = [];
  const props = () => ({
    detail: saved,
    disabled: false,
    onDirtyChange: () => {},
    onSave: async (guests: StayingGuest[]) => {
      writes.push(guests);
      saved = { ...saved, stayingGuests: guests };
      root.render(withClient(React.createElement(forms.GuestEntryForm, props())));
      return savedAs(saved);
    },
  });
  await render(React.createElement(forms.GuestEntryForm, props()));
  for (const name of [" First Guest ", "Second Guest"]) {
    await fill("fullName", name);
    await submit();
    assert.equal(control("fullName").value, "");
  }
  assert.equal(writes.length, 2);
  assert.deepEqual(
    saved.stayingGuests.map((guest) => guest.fullName),
    ["First Guest", "Second Guest"],
  );
  assert.notEqual(saved.stayingGuests[0].id, saved.stayingGuests[1].id);
  const { id: _id, ...first } = writes[0][0];
  assert.deepEqual(first, {
    fullName: "First Guest",
    email: null,
    phone: null,
    documentType: null,
    documentNumber: null,
  });
});

it("asks a staying guest for name, contact and document but not a room", async () => {
  const saved = detail();
  saved.rooms.push({ ...saved.rooms[0], id: "line-2", roomId: "room-2", roomNumber: "102" });
  const writes: StayingGuest[][] = [];
  await render(
    React.createElement(forms.GuestEntryForm, {
      detail: saved,
      disabled: false,
      onDirtyChange: () => {},
      onSave: async (guests: StayingGuest[]) => {
        writes.push(guests);
        return savedAs({ ...saved, stayingGuests: guests });
      },
    }),
  );
  assert.deepEqual(
    Array.from(container.querySelectorAll("label"), (label) => label.textContent.trim()),
    [
      "Nombre completo",
      "Correo · Opcional",
      "Teléfono · Opcional",
      "Documento",
      "Número de documento",
    ],
  );
  assert.doesNotMatch(container.textContent, /Hab\. del huésped/);
  await fill("fullName", "Ana Pérez");
  await submit();
  await until(() => writes.length === 1, "The guest must save");
});

it.each([
  {
    scenario: "a new guest after replacing the only room",
    editing: false,
    roomIds: ["replacement"],
  },
  {
    scenario: "a new guest after adding a second room",
    editing: false,
    roomIds: ["line-1", "line-2"],
  },
  {
    scenario: "an edited guest after adding a second room",
    editing: true,
    roomIds: ["line-1", "line-2"],
  },
])(
  "preserves entered data without submitting a room for $scenario",
  async ({ editing, roomIds }) => {
    let saved = detail();
    const guest: StayingGuest | undefined = editing
      ? {
          id: crypto.randomUUID(),
          fullName: "Nombre anterior",
          email: null,
          phone: null,
          documentType: null,
          documentNumber: null,
        }
      : undefined;
    if (guest) saved = { ...saved, stayingGuests: [guest] };
    const writes: StayingGuest[][] = [];
    const props = () => ({
      detail: saved,
      guest,
      disabled: false,
      onDirtyChange: () => {},
      onSave: async (guests: StayingGuest[]) => {
        writes.push(guests);
        return savedAs({ ...saved, stayingGuests: guests });
      },
    });
    await render(React.createElement(forms.GuestEntryForm, props()));
    await fill("fullName", "Ana Pérez");
    await fill("email", "ana@example.com");
    await fill("phone", "987654321");
    await choose("Documento", "Carné de extranjería");
    await fill("documentNumber", "12345678");
    const nameInput = control("fullName");
    saved = { ...saved, rooms: roomIds.map((id) => ({ ...saved.rooms[0], id })) };
    await render(React.createElement(forms.GuestEntryForm, props()));
    assert.equal(control("fullName"), nameInput, "Room changes must not remount the guest form");
    assert.equal(control("fullName").value, "Ana Pérez");
    assert.equal(control("email").value, "ana@example.com");
    assert.equal(control("phone").value, "987 654 321");
    assert.equal(control("documentNumber").value, "12345678");
    await submit();
    await until(() => writes.length === 1, "The guest draft must save against the current rooms");
    const { id, ...submitted } = writes[0][0];
    assert.ok(id);
    if (guest) assert.equal(id, guest.id);
    assert.deepEqual(submitted, {
      fullName: "Ana Pérez",
      email: "ana@example.com",
      phone: "+51987654321",
      documentType: "Carné de extranjería",
      documentNumber: "12345678",
    });
  },
);

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

it("preserves a backdated Plin payment and refreshes future-date limits on resume without losing the draft", async () => {
  const writes: WorkflowCommand["actions"][] = [];
  await render(
    React.createElement(forms.PaymentForm, {
      detail: detail(),
      disabled: false,
      onDirtyChange: () => {},
      onReady: async (_title, actions) => {
        writes.push(actions);
        return savedAs(detail());
      },
    }),
  );
  assert.ok(button("31 oct 2026"), "Payment defaults to the property date, not UTC November 1");
  await fill("amount", "25");
  await React.act(async () => button("31 oct 2026").click());
  const day = (label: string) => {
    const element = window.document.querySelector<HTMLButtonElement>(`button[data-day="${label}"]`);
    assert.ok(element, `Missing picker day ${label}`);
    return element;
  };
  assert.equal(day("1/11/2026").disabled, true);
  await React.act(async () => day("30/10/2026").click());
  assert.ok(button("30 oct 2026"));
  vi.setSystemTime(new Date("2026-11-01T05:00:00Z"));
  await React.act(async () => window.dispatchEvent(new window.Event("focus")));
  assert.equal(control("amount").value, "25");
  assert.ok(button("30 oct 2026"));
  await React.act(async () => button("30 oct 2026").click());
  assert.equal(day("1/11/2026").disabled, false);
  await React.act(async () => day("30/10/2026").click());
  await choose("Método", "Plin");
  await submit();
  assert.deepEqual(writes, [
    [
      {
        type: "add-payment",
        payment: {
          amountCents: 2500,
          method: "plin",
          paymentDate: "2026-10-30",
        },
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

it.each([false, true])(
  "shows optional bill rows only when present (present: %s)",
  async (present) => {
    const saved = {
      ...detail(),
      ...(present
        ? {
            savedDiscountCents: 3000,
            discountCents: 3000,
            totalCents: 27000,
            paidCents: 30000,
            refundedCents: 6000,
            couponIssuedCents: 2000,
            couponAppliedCents: 1000,
            balanceCents: 4000,
          }
        : {}),
    };
    mockApi(async () => previewResponse(saved));
    await renderCachedEditor(() => saved);
    const rows = [...container.querySelectorAll("dt")].map((term) => term.textContent);
    for (const label of ["Subtotal", "Pagado con cupón", "Reembolsado", "Pasado a cupón"])
      assert.equal(rows.includes(label), present);
    assert.equal(summaryAmount("Descuento"), present ? "-S/30" : "S/0");
    assert.equal(
      summaryAmount("Pagado"),
      present ? "S/300" : "S/0",
      "Pagado is gross, not net of refunds",
    );
    if (present) {
      assert.equal(summaryAmount("Total"), "S/270");
      assert.equal(summaryAmount("Pagado con cupón"), "S/10");
      assert.equal(summaryAmount("Reembolsado"), "-S/60");
      assert.equal(summaryAmount("Pasado a cupón"), "-S/20");
    }
  },
);

function coupon(changes: Partial<CouponLookup> = {}): CouponLookup {
  return {
    id: "coupon-1",
    code: "ABCD123456",
    valueCents: 50000,
    balanceCents: 50000,
    issuedAt: "2026-10-01T15:00:00Z",
    issuedBy: null,
    expiresOn: "2027-10-01",
    sourceReservationId: "source-reservation",
    sourceReservationCode: "SOURCE01",
    movements: [],
    ...changes,
  };
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

it.each([
  {
    scenario: "an expired coupon",
    status: 400,
    code: "coupon has expired",
    field: "code",
    error: "El cupón venció y ya no se puede usar.",
    known: true,
  },
  {
    scenario: "an unknown coupon",
    status: 404,
    code: "coupon not found",
    field: "code",
    error: "No existe un cupón con ese código.",
    known: false,
  },
  {
    scenario: "more than the stay owes after the redemption",
    status: 400,
    code: "coupon redemption exceeds the balance owed",
    field: "amount",
    error: "El monto del cupón supera el saldo pendiente de la reserva.",
    known: true,
  },
])(
  "shows the preview's reason for $scenario and saves nothing",
  async ({ status, code, field, error, known }) => {
    mockApi(async (path) => {
      assert.ok(path.endsWith("/preview"), "A rejected coupon must not write");
      return Response.json({ error: code }, { status });
    });
    page.api.on("GET", "/coupons/ABCD123456", () =>
      known
        ? coupon({ balanceCents: 5000 })
        : Response.json({ error: "coupon not found" }, { status: 404 }),
    );
    await renderPaymentEntry(detail);
    await enterCoupon("ABCD123456");
    assert.doesNotMatch(container.textContent, /No existe un cupón/);
    await submitPayment();
    await until(() => container.textContent.includes(error), error);
    assert.equal(control(field).getAttribute("aria-invalid"), "true");
    assert.equal(page.api.requests("POST", /\/preview$/).length, 1);
    assert.equal(page.api.requests("POST", /\/commands$/).length, 0);
    if (known)
      await until(
        () => /Saldo\s*S\/\s*50 · Vence el 2027-10-01/.test(container.textContent),
        "The submitted coupon's balance helps staff correct the amount",
      );
  },
);

it("offers only the coupon method on a settled bill and saves what the preview accepts", async () => {
  let saved = { ...detail(), balanceCents: 0, paidCents: 30000 };
  const writes = page.api.bodies<WorkflowCommand>("POST", "/reservations/:id/commands");
  mockApi(
    async (path, command) => {
      if (path.endsWith("/preview")) return previewResponse({ ...saved, balanceCents: 0 });
      assert.deepEqual(command.actions, [
        { type: "redeem-coupon", code: "ABCD123456", amountCents: 2000 },
      ]);
      saved = { ...saved, totalCents: 32000, couponAppliedCents: 2000 };
      return Response.json(saved);
    },
    { reservation: () => saved },
  );
  await renderPaymentEntry(() => saved);
  assert.equal(fieldTrigger("Método").textContent.replace("▼", "").trim(), "Cupón");
  await React.act(async () => fieldTrigger("Método").click());
  assert.deepEqual(
    Array.from(window.document.querySelectorAll('[role="option"]')).map((item) =>
      item.textContent.trim(),
    ),
    ["Cupón"],
    "Money payments stay unavailable when nothing is owed",
  );
  await React.act(async () =>
    window.document.querySelector<HTMLElement>('[role="option"]')!.click(),
  );
  await fill("code", "ABCD123456");
  await fill("amount", "20");
  await submitPayment();
  await until(() => writes.length === 1 && couponApplied() === 2000);
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

it("shows variable nightly prices and detail without assignments in the phone pricing summary", async () => {
  page.mobile();
  const saved = detail();
  saved.rooms[0].nights = [
    { date: saved.checkIn, priceCents: 12000 },
    { date: "2026-10-15", priceCents: 18000 },
  ];
  mockApi(async () => previewResponse(saved), { reservation: () => saved });
  await renderCachedEditor(() => saved);
  const summary = () =>
    Array.from(container.querySelectorAll("section")).find(
      (section) => section.querySelector("h3")?.textContent === "Resumen de reserva",
    )!;
  assert.match(summary().textContent, /2 noches · Precio variable · 1 adulto/);
  assert.doesNotMatch(summary().textContent, /101|Sin asignar/);
  await page.click("Ver detalle");
  assert.match(summary().textContent.replace(/\s/g, ""), /S\/120/);
  assert.match(summary().textContent.replace(/\s/g, ""), /S\/180/);
});

it("uses the server-applied discount in a room-removal preview while retaining the saved amount", async () => {
  const initial = detail();
  initial.savedDiscountCents = 10000;
  initial.subtotalCents = 16000;
  initial.discountCents = 10000;
  initial.totalCents = 6000;
  initial.balanceCents = 6000;
  initial.rooms = [
    { ...initial.rooms[0], subtotalCents: 8000, totalCents: 8000 },
    {
      ...initial.rooms[0],
      id: "line-2",
      roomId: "room-2",
      roomNumber: "102",
      subtotalCents: 8000,
      totalCents: 8000,
    },
  ];
  mockApi(
    async (path, command) => {
      assert.ok(path.endsWith("/preview"), "A preview must not save the draft");
      assert.deepEqual(command.actions, [{ type: "remove-room", lineId: "line-2" }]);
      return previewResponse({
        ...initial,
        rooms: [initial.rooms[0]],
        subtotalCents: 8000,
        discountCents: 8000,
        totalCents: 0,
        balanceCents: 0,
      });
    },
    { roomCount: 2 },
  );
  await render(stayEditor(initial));
  await page.menuAction("Acciones de la habitación 2", "Quitar habitación");
  await until(() => !button("Guardar cambios").disabled, "Room-removal preview must load");
  assert.equal(summaryAmount("Subtotal"), "S/80");
  assert.equal(summaryAmount("Descuento"), "-S/80");
  assert.equal(summaryAmount("Total"), "S/0");
  assert.equal(summaryAmount("Cuenta saldada"), "S/0");
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

it("shows the room saved by the assignment panel when the summary reopens", async () => {
  const assigned = detail();
  let saved: ReservationDetail = {
    ...assigned,
    rooms: assigned.rooms.map((room) => ({
      ...room,
      roomId: null,
      roomNumber: null,
    })),
  };
  let writes = 0;
  mockApi(
    async (path, command) => {
      assert.equal(path, "/reservations/reservation-1/commands");
      assert.deepEqual(command.actions, [
        {
          type: "edit-room",
          lineId: "line-1",
          room: {
            roomTypeId: "double",
            roomId: "room-1",
            adults: 1,
            children: 0,
          },
        },
      ]);
      writes++;
      saved = assigned;
      return Response.json(saved);
    },
    { reservation: () => saved },
  );
  function AssignmentAndSummary() {
    const { assign } = commands.useRoomAssignmentCommand();
    const [open, setOpen] = React.useState(true);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        {
          onClick: async () => {
            await assign(
              {
                id: "line-1",
                reservationId: saved.id,
                guestName: saved.guest.fullName,
                checkIn: saved.checkIn,
                checkOut: saved.checkOut,
                roomId: null,
                roomTypeId: "double",
                roomIndex: 1,
                roomCount: 1,
              },
              "room-1",
            );
            setOpen(true);
          },
        },
        "Assign room",
      ),
      React.createElement(summaries.ReservationSummary, {
        reservationId: open ? "reservation-1" : null,
        onClose: () => setOpen(false),
        onEdit: () => {},
      }),
    );
  }
  await render(React.createElement(AssignmentAndSummary));
  await until(
    () => roomLines().join() === "SinasignarDoble1adulto",
    "Initial reservation must load",
  );
  await React.act(async () => summaryButton("Cerrar").click());
  await until(() => summary() === null, "Closing must unmount the summary");
  await React.act(async () => button("Assign room").click());
  await until(
    () => roomLines().join() === "Hab.101Doble1adulto",
    "The summary must show the saved room",
  );
  assert.equal(writes, 1);
});

const createTarget = {
  mode: "create" as const,
  roomId: "room-1",
  roomTypeId: "double",
  number: "101",
  typeName: "Doble",
  checkIn: "2026-10-14",
};

it("announces the phone balance preview without showing a stale refund due", async () => {
  const saved = { ...detail(), paidCents: 50000, balanceCents: -20000 };
  let finishPreview!: () => void;
  mockApi(async (path) => {
    assert.ok(path.endsWith("/preview"), "Editing dates must only request a preview");
    return new Promise<Response>((resolve) => {
      finishPreview = () =>
        resolve(
          previewResponse({
            ...saved,
            checkOut: "2026-10-17",
            subtotalCents: 45000,
            totalCents: 45000,
            balanceCents: -5000,
            rooms: [{ ...saved.rooms[0], subtotalCents: 45000, totalCents: 45000 }],
          }),
        );
    });
  });
  page.mobile();
  await render(stayEditor(saved));
  const financials = window.document.querySelector('[aria-label="Importes de la reserva"]')!;
  assert.equal(financials.getAttribute("aria-live"), "polite");
  const text = () => financials.textContent.replace(/\s/g, "");
  assert.ok(text().includes("PordevolverS/200"));
  await React.act(async () => fieldTrigger("Check-out").click());
  const day = [...window.document.querySelectorAll<HTMLButtonElement>("button[data-day]")].find(
    (item) => item.textContent.trim() === "17",
  )!;
  assert.ok(day);
  await React.act(async () => day.click());
  assert.equal(text().includes("Singuardar"), false);
  assert.equal(text().includes("S/200"), false, "Do not show a stale refund due while repricing");
  assert.match(container.textContent, /Calculando…/);
  await until(() => !!finishPreview, "The updated stay must request its price");
  await React.act(async () => finishPreview());
  await until(
    () => text().includes("PordevolverS/50"),
    "The persistent balance must use the server preview",
  );
  assert.ok(text().includes("PordevolverS/50"));
  assert.equal(button("Guardar cambios").disabled, false);
});

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

async function pickDay(field: string, day: string) {
  await React.act(async () => fieldTrigger(field).click());
  const target = Array.from(
    window.document.querySelectorAll<HTMLButtonElement>("button[data-day]"),
  ).find((item) => item.textContent.trim() === day);
  assert.ok(target, `Missing day ${day}`);
  await React.act(async () => target.click());
}

const summaryText = () =>
  Array.from(window.document.querySelectorAll("h3"))
    .find((heading) => heading.textContent === "Resumen de reserva")
    ?.closest("section")?.textContent ?? "";
const appliedDiscount = () =>
  discountTrigger()
    .textContent.replace(/\s/g, "")
    .replace(/^Descuento/, "");
const cancellationText = () =>
  Array.from(
    window.document.querySelectorAll('[aria-label="Condiciones de cancelación"] p'),
    (line) => line.textContent.replace(/S\/\s/g, "S/"),
  );

it("previews and creates ordinary pricing before applying the reservation discount", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking();
  await pickDay("Check-out", "17");
  await fill("fullName", "Ana Pérez");
  await until(() => !button("Crear reserva").disabled, "Room pricing must be current");
  await applyDiscount("30");
  assert.equal(creationTotal(), "S/420");
  await submit();
  await until(() => writes.length === 1, "The priced reservation must save");
  assert.equal(writes[0].discountCents, 3000);
});

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

it("summarizes the server preview's total, initial payment and cancellation terms per plan", async () => {
  mockCreationApi(async () => Response.json(detail(), { status: 201 }));
  await renderNewBooking(() => {}, { ...createTarget, checkIn: "2026-11-10" });
  await pickDay("Check-out", "12");
  await until(() => creationTotal() === "S/300", "Two nights must be previewed");
  assert.equal(summaryAmount("Pago inicial requerido"), "S/150");
  assert.equal(summaryText().includes("Pago restante"), false);
  assert.deepEqual(cancellationText(), [
    "Cancelación gratuita hasta el 8 nov.",
    "Después, cargo de la primera noche: S/150",
  ]);
  assert.equal(
    summaryText().match(/S\/\s?300/g)?.length,
    1,
    "The total must not be repeated as a subtotal or footer total",
  );

  await chooseRatePlan("No reembolsable");
  await until(() => creationTotal() === "S/270", "Non-refundable must be repriced by the server");
  assert.equal(summaryAmount("Pago inicial requerido"), "S/270");
  assert.deepEqual(cancellationText(), [
    "Tarifa no reembolsable",
    "Cargo del total de la reserva: S/270",
  ]);
});

it("shows only the actual charge once free cancellation has passed, as for a walk-in", async () => {
  mockCreationApi(async () => Response.json(detail(), { status: 201 }));
  await render(
    React.createElement(newBookings.NewBooking, {
      target: { mode: "new" },
      onCreated: () => {},
      onCancel: () => {},
      onDirtyChange: () => {},
      onSavingChange: () => {},
    }),
  );
  await choose("Tipo", "Doble");
  await until(() => creationTotal() === "S/150", "A walk-in must be previewed");
  assert.deepEqual(cancellationText(), [
    "Cancelación / No se presentó",
    "Cargo de la primera noche: S/150",
  ]);
});

it("keeps an unapplied discount draft out of the bill and blocks creating while it is open", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  const previews = page.api.bodies<CreationPreviewInput>("POST", "/reservations/preview");
  await render(
    React.createElement(dialogs.RoomBookingDialog, {
      target: createTarget,
      onClose: () => assert.fail("Esc in the discount popover must not close the dialog"),
      onCreated: () => {},
    }),
  );
  await until(() => !button("Crear reserva").disabled, "New dialog must load");
  await fill("fullName", "Ada Lovelace");
  await openDiscount();
  assert.ok(discountPopover().getAttribute("aria-labelledby"), "The popover keeps a dialog title");
  assert.equal(popoverButton("Cancelar"), undefined);
  assert.equal(popoverButton("Quitar"), undefined, "Quitar is only for an applied discount");
  await fill(discountInput()!, "abc");
  await React.act(async () => popoverButton("Aplicar")!.click());
  assert.ok(discountInput(), "An invalid amount must not apply");
  assert.equal(discountInput()!.getAttribute("aria-invalid"), "true");
  await fill(discountInput()!, "20");
  assert.equal(button("Crear reserva").disabled, true);
  const submitDialog = () =>
    React.act(async () => {
      button("Crear reserva")
        .closest("form")!
        .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });
  await submitDialog();
  await flush();
  assert.equal(writes.length, 0, "An open changed draft must block creation");

  await React.act(async () =>
    discountInput()!.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await until(() => !discountInput(), "Esc must close the popover");
  assert.ok(window.document.querySelector('[role="dialog"]'), "The reservation dialog stays open");
  assert.equal(discountTrigger().textContent.replace(/\s/g, ""), "DescuentoS/0");
  assert.equal(creationTotal(), "S/150");
  assert.ok(previews.every((preview) => !preview.discountCents));
  await openDiscount();
  assert.equal(discountInput()!.value, "20", "Reopening must keep the draft");
  await React.act(async () => popoverButton("Aplicar")!.click());
  await until(() => creationTotal() === "S/130", "Applying must reprice the preview");
  await openDiscount();
  await React.act(async () => popoverButton("Quitar")!.click());
  await until(() => creationTotal() === "S/150", "Quitar must remove the applied discount");
  await submitDialog();
  await until(() => writes.length === 1, "A closed or applied draft must allow creating");
  assert.equal(writes[0].discountCents, 0);
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

it("hides cached amounts and blocks creation while a revisited draft is repricing", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking();
  await fill("fullName", "Ada Lovelace");
  assert.equal(creationTotal(), "S/150");
  await chooseRatePlan("No reembolsable");
  await until(() => creationTotal() === "S/135", "The other plan must load first");

  const held = page.api.hold("POST", "/reservations/preview");
  await chooseRatePlan("Flexible");
  await until(() => !!held.request, "Revisiting Flexible must refresh its cached preview");
  assert.equal(button("Crear reserva").disabled, true);
  assert.ok(summaryText().includes("Calculando…"));
  assert.ok(!summaryText().includes("S/150"), "Cached bill amounts must remain hidden");
  assert.equal(creationTotal(), "");
  assert.deepEqual(cancellationText(), []);
  await submit();
  await flush();
  assert.equal(writes.length, 0, "Submitting the form must also reject a cached, refreshing bill");

  await React.act(async () =>
    held.release(
      Response.json(creationPreview(held.request!.body as CreationPreviewInput, () => 18000)),
    ),
  );
  await until(() => creationTotal() === "S/180", "Only the refreshed bill may be displayed");
  assert.equal(summaryAmount("Pago inicial requerido"), "S/180");
  assert.equal(button("Crear reserva").disabled, false);
  await submit();
  await until(() => writes.length === 1, "The refreshed draft may be created");
  assert.equal(writes[0].ratePlan, "flexible");
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

function phoneCountry() {
  const trigger = window.document.querySelector<HTMLButtonElement>(
    '[aria-label^="País del teléfono"]',
  );
  assert.ok(trigger, "The phone input must have a country selector");
  return trigger;
}

async function blur(target: Exclude<Parameters<BrowserPage["fill"]>[0], string>) {
  await React.act(async () => {
    target.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
}

async function choosePhoneCountry(search: string, option: string) {
  await React.act(async () => phoneCountry().click());
  const input = await (async () => {
    await until(
      () => !!window.document.querySelector('input[placeholder="Buscar país"]'),
      "The country search must open",
    );
    return window.document.querySelector<HTMLInputElement>('input[placeholder="Buscar país"]')!;
  })();
  await fill(input, search);
  let item: HTMLElement | undefined;
  await until(() => {
    item = Array.from(window.document.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (element) => element.textContent.trim() === option,
    );
    return !!item;
  }, `The country search must offer ${option}`);
  await React.act(async () => item!.click());
}

const incompletePhone =
  "El número está incompleto. Si es un teléfono fijo, incluye el código de área.";

it("enters an optional phone in the selected country, revealing errors only after blur or save", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking();
  const phone = control("phone");
  assert.equal(
    window.document.querySelector(`label[for="${phone.id}"]`)?.textContent,
    "Teléfono · Opcional",
  );
  assert.equal(phone.getAttribute("type"), "tel");
  assert.equal(phoneCountry().getAttribute("aria-label"), "País del teléfono: Perú +51");
  await fill("fullName", "Ada Lovelace");

  await choosePhoneCountry("chile", "Chile +56");
  await fill(phone, "2 2345");
  await flush();
  assert.notEqual(
    phone.getAttribute("aria-invalid"),
    "true",
    "Choosing a country first must not reveal errors during the first entry",
  );
  await fill(phone, "");
  await choosePhoneCountry("per", "Perú +51");
  await fill(phone, "234 5678");
  assert.ok(!container.textContent.includes(incompletePhone), "Typing must not show the error yet");
  await blur(phone);
  await until(
    () => container.textContent.includes(incompletePhone),
    "Blur must explain the missing area code",
  );
  await submit();
  await flush();
  assert.equal(writes.length, 0, "An invalid phone must not save");
  assert.equal(control("phone").value, "2345678");

  await fill("phone", "2 2345 6789");
  await until(
    () => container.textContent.includes("Ingresa un teléfono válido para el país seleccionado."),
    "A Santiago landline is not a valid Peruvian number",
  );
  await choosePhoneCountry("chile", "Chile +56");
  assert.equal(phoneCountry().getAttribute("aria-label"), "País del teléfono: Chile +56");
  assert.equal(control("phone").value, "2 2345 6789", "Changing country must keep the digits");
  await until(
    () => !container.textContent.includes("Ingresa un teléfono válido"),
    "The digits must be revalidated for Chile",
  );

  await fill("phone", "+1 (415) 555-2671");
  assert.equal(phoneCountry().getAttribute("aria-label"), "País del teléfono: Estados Unidos +1");

  await fill("phone", "");
  await choosePhoneCountry("per", "Perú +51");
  await fill("phone", "(01) 234-5678");
  await submit();
  await until(() => writes.length === 1, "A corrected landline must save");
  assert.equal(writes[0].guest.phone, "+5112345678");
});

it("preserves unsupported extensions when changing country until the phone is corrected", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking();
  await fill("fullName", "Ada Lovelace");
  await fill("notes", "Llegada por la tarde");
  await fill("phone", "+51 987654321 ext. 5");
  await blur(control("phone"));
  await until(() => container.textContent.includes("No se admiten extensiones telefónicas."));

  await choosePhoneCountry("chile", "Chile +56");
  assert.equal(phoneCountry().getAttribute("aria-label"), "País del teléfono: Chile +56");
  assert.equal(control("phone").value, "+51 987654321 ext. 5");
  await submit();
  assert.equal(writes.length, 0, "Changing country must not silently remove an extension and save");
  assert.ok(container.textContent.includes("No se admiten extensiones telefónicas."));
  assert.equal(control("fullName").value, "Ada Lovelace");
  assert.equal(control("notes").value, "Llegada por la tarde");

  await fill("phone", "+51 987654321");
  await choosePhoneCountry("chile", "Chile +56");
  assert.equal(control("phone").value, "9 8765 4321");
  await submit();
  await until(() => writes.length === 1, "Correcting the phone must allow saving in Chile");
  assert.equal(writes[0].guest.phone, "+56987654321");
});

it("creates a reservation without a phone or any missing-phone warning", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking();
  await fill("fullName", "Ada Lovelace");
  await submit();
  await until(() => writes.length === 1, "A blank phone must not block saving");
  assert.equal("phone" in writes[0].guest, false);
  assert.ok(!/sin teléfono|teléfono requerido/i.test(container.textContent));
});

async function editPhone(
  text: string,
  caret: number,
  inputType = "insertText",
  isComposing = false,
) {
  const phone = control("phone");
  await React.act(async () => {
    phone.dispatchEvent(new window.InputEvent("beforeinput", { bubbles: true, inputType }));
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
      phone,
      text,
    );
    phone.setSelectionRange(caret, caret);
    phone.dispatchEvent(new window.InputEvent("input", { bubbles: true, inputType, isComposing }));
  });
}

async function typePhone(text: string) {
  const phone = control("phone");
  for (const character of text) {
    await editPhone(phone.value + character, phone.value.length + 1);
    assert.equal(phone.selectionStart, phone.value.length, "Typing must keep the caret at the end");
  }
}

it("groups phone digits while typing and saves the canonical phone", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking();
  await fill("fullName", "Ada Lovelace");
  await typePhone("991039021");
  assert.equal(control("phone").value, "991 039 021");
  await submit();
  await until(() => writes.length === 1, "The masked phone must save");
  assert.equal(writes[0].guest.phone, "+51991039021");
});

it("selects the country of a pasted international phone and shows its national digits", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking();
  await fill("fullName", "Ada Lovelace");
  const phone = control("phone");
  const paste = new window.ClipboardEvent("paste", { bubbles: true, cancelable: true });
  await React.act(async () => phone.dispatchEvent(paste));
  assert.equal(paste.defaultPrevented, false, "The browser must insert pasted text");
  await editPhone("+56 9 8765 4321", 15, "insertFromPaste");
  assert.equal(phone.value, "9 8765 4321");
  assert.equal(phone.selectionStart, phone.value.length);
  assert.equal(phoneCountry().getAttribute("aria-label"), "País del teléfono: Chile +56");
  await submit();
  await until(() => writes.length === 1, "The pasted phone must save");
  assert.equal(writes[0].guest.phone, "+56987654321");
});

it("resubmits an unformatted legacy phone exactly once an edit is undone", async () => {
  const saved = detail();
  const legacy: StayingGuest = {
    id: "9b73e6c7-c684-4c4b-a205-b63e3c91a839",
    fullName: "Luis Pérez",
    email: null,
    phone: "991 039 021",
    documentType: null,
    documentNumber: null,
  };
  saved.stayingGuests = [legacy];
  const writes: StayingGuest[][] = [];
  await render(
    React.createElement(forms.GuestEntryForm, {
      detail: saved,
      guest: legacy,
      disabled: false,
      onDirtyChange: () => {},
      onSave: async (guests: StayingGuest[]) => {
        writes.push(guests);
        return savedAs({ ...saved, stayingGuests: guests });
      },
    }),
  );
  const phone = control("phone");
  await editPhone("991 039 0215", 12);
  assert.equal(phone.value, "9910390215");
  await editPhone("991039021", 9, "deleteContentBackward");
  assert.equal(phone.value, "991 039 021", "Undoing the edit must restore the stored text");
  await fill("fullName", "Luis Corregido");
  await submit();
  await until(() => writes.length === 1, "The guest must save");
  assert.equal(writes[0][0].phone, "991 039 021");
});

it("saves staying-guest phones on their own, keeping an unchanged legacy phone", async () => {
  let saved = detail();
  saved.guest.phone = "+51987654321";
  const legacy: StayingGuest = {
    id: "9b73e6c7-c684-4c4b-a205-b63e3c91a839",
    fullName: "Luis Pérez",
    email: null,
    phone: "pedir en recepción",
    documentType: null,
    documentNumber: null,
  };
  saved.stayingGuests = [legacy];
  const writes: StayingGuest[][] = [];
  const editor = (guest?: StayingGuest) =>
    React.createElement(forms.GuestEntryForm, {
      key: guest?.id ?? "new",
      detail: saved,
      guest,
      disabled: false,
      onDirtyChange: () => {},
      onSave: async (guests: StayingGuest[]) => {
        if (guests.some((entry) => entry.phone === "+51999111222"))
          return {
            status: "rejected" as const,
            fields: { phone: "El número tiene demasiados dígitos para el país seleccionado." },
          };
        writes.push(guests);
        saved = { ...saved, stayingGuests: guests };
        return savedAs(saved);
      },
    });

  await render(editor(legacy));
  assert.equal(control("phone").value, "pedir en recepción");
  await fill("fullName", "Luis Corregido");
  await submit();
  await until(() => writes.length === 1, "An unchanged legacy phone must not block a name edit");
  assert.equal(writes[0][0].phone, "pedir en recepción");

  await render(editor());
  await fill("fullName", "Ana Pérez");
  await fill("phone", "987 654 321");
  await submit();
  await until(() => writes.length === 2, "Guests may share the booking contact phone");
  assert.deepEqual(
    writes[1].map((entry) => entry.phone),
    ["pedir en recepción", "+51987654321"],
  );
  assert.equal(saved.guest.phone, "+51987654321");

  await render(editor(saved.stayingGuests[1]));
  assert.equal(control("phone").value, "987 654 321");
  await fill("phone", "999 111 222");
  await submit();
  await until(
    () =>
      container.textContent.includes(
        "El número tiene demasiados dígitos para el país seleccionado.",
      ),
    "A server phone rejection must appear on the field",
  );
  assert.equal(control("phone").value, "999 111 222");
  await fill("phone", "");
  await submit();
  await until(() => writes.length === 3, "Clearing a phone must save");
  assert.equal(writes[2][1].phone, null);
});

it("preserves the remaining room draft when removing the first room", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking();
  await fill("fullName", "Ada Lovelace");
  await React.act(async () => button("Agregar habitación").click());
  await fill("rooms[1].room.adults", "2");
  await fill("rooms[1].room.children", "1");
  await page.menuAction("Acciones de la habitación 1", "Quitar habitación");
  assert.equal(
    container.querySelector('[aria-label="Acciones de la habitación 1"]'),
    null,
    "The last room cannot be removed",
  );
  assert.equal(control("rooms[0].room.adults").value, "2");
  assert.equal(control("rooms[0].room.children").value, "1");
  assert.equal(control("fullName").value, "Ada Lovelace");
  await until(() => !button("Crear reserva").disabled, "The remaining room must finish repricing");
  assert.equal(creationTotal(), "S/150");
  await submit();
  await until(() => writes.length === 1, "The remaining room must save normally");
  assert.deepEqual(writes[0].rooms, [
    { roomTypeId: "double", roomId: null, adults: 2, children: 1 },
  ]);
});

it("caps the creation discount at the subtotal without reducing the entered amount", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking();
  await fill("fullName", "Booking Contact");
  await applyDiscount("200");
  assert.equal(creationTotal(), "S/0");
  assert.equal(appliedDiscount(), "-S/150");
  assert.deepEqual(cancellationText(), ["Cancelación / No se presentó", "Sin cargo"]);
  await openDiscount();
  assert.equal(discountInput()!.value, "200");
  await React.act(async () =>
    discountInput()!.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await until(() => !discountInput(), "Esc must close the discount popover");
  await submit();
  await until(() => writes.length === 1, "Reservation must save");
  assert.equal(writes[0].discountCents, 20000);
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

it("replaces sold-out room controls with an empty state and restores them when dates are available", async () => {
  mockCreationApi(async () => Response.json(detail()));
  let finish!: (response: Response) => void;
  page.api.on("GET", "/availability", ({ url }) =>
    url.searchParams.get("checkOut") === "2026-10-16"
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : undefined,
  );
  await renderNewBooking();
  await fill("fullName", "Ada Lovelace");
  await fill("notes", "Llegada por la tarde");
  await fill("rooms[0].room.adults", "2");
  await fill("rooms[0].room.children", "1");
  assert.match(fieldTrigger("Hab.").textContent, /101/);
  await React.act(async () => fieldTrigger("Check-out").click());
  const day = [...window.document.querySelectorAll<HTMLButtonElement>("button[data-day]")].find(
    (button) => button.textContent.trim() === "16",
  )!;
  await React.act(async () => day.click());
  await until(() => !!finish, "New dates must request fresh availability");
  assert.equal(fieldTrigger("Tipo").disabled, true);
  assert.equal(fieldTrigger("Hab.").disabled, true);
  assert.equal(button("Crear reserva").disabled, true);
  assert.ok(!container.textContent.includes("Sin habitaciones disponibles"));
  await React.act(async () =>
    finish(
      Response.json({
        checkIn: "2026-10-14",
        checkOut: "2026-10-16",
        nights: 2,
        currency: "PEN",
        roomTypes: [
          {
            id: "double",
            name: "Doble",
            maxAdults: 2,
            maxChildren: 2,
            free: 0,
            freeRoomIds: [],
            totalCents: 30000,
            nights: [],
          },
        ],
      }),
    ),
  );
  await until(
    () => container.textContent.includes("Sin habitaciones disponibles"),
    "Sold-out dates must show an empty state",
  );
  const roomSection = container.querySelector('section[aria-label="Habitaciones"]')!;
  assert.ok(roomSection.querySelector("h3"));
  assert.ok(roomSection.querySelector('[role="status"]'));
  assert.ok(
    roomSection.textContent.includes("Prueba con otras fechas para encontrar disponibilidad."),
  );
  assert.equal(roomSection.querySelectorAll("input, button").length, 0);
  assert.equal(control("fullName").value, "Ada Lovelace");
  assert.equal(control("notes").value, "Llegada por la tarde");
  assert.ok(container.querySelector("aside"));
  assert.equal(button("Crear reserva").disabled, true);
  assert.ok(summaryText().includes("Selecciona los tipos de habitación para ver el total."));

  await React.act(async () => fieldTrigger("Check-out").click());
  const availableDay = [
    ...window.document.querySelectorAll<HTMLButtonElement>("button[data-day]"),
  ].find((button) => button.textContent.trim() === "17")!;
  await React.act(async () => availableDay.click());
  await until(
    () => client.isFetching() === 0 && !button("Agregar habitación").disabled,
    "Available dates must restore the room controls",
  );
  assert.ok(!container.textContent.includes("Sin habitaciones disponibles"));
  assert.match(fieldTrigger("Tipo").textContent, /Selecciona un tipo/);
  assert.match(fieldTrigger("Hab.").textContent, /Sin asignar/);
  assert.equal(control("rooms[0].room.adults").value, "2");
  assert.equal(control("rooms[0].room.children").value, "1");
  assert.equal(control("fullName").value, "Ada Lovelace");
  assert.equal(control("notes").value, "Llegada por la tarde");
});

it("points a new booking to setup when no rooms exist", async () => {
  page.api.catalog.rooms = [];
  await render(
    React.createElement(newBookings.NewBooking, {
      target: { mode: "new" },
      onCreated: () => {},
      onCancel: () => {},
      onDirtyChange: () => {},
      onSavingChange: () => {},
    }),
  );
  await until(() =>
    container.textContent.includes("Aún no hay habitaciones. Agrégalas en Configuración."),
  );
  assert.equal(container.textContent.includes("Sin habitaciones disponibles"), false);
});

it("validates the primary contact and room capacity before creating a reservation", async () => {
  let writes = 0;
  mockCreationApi(async () => {
    writes++;
    return Response.json(detail());
  });
  await renderNewBooking();
  await submit();
  assert.equal(control("fullName").getAttribute("aria-invalid"), "true");
  await until(
    () => window.document.activeElement === control("fullName"),
    "Submitting must focus the first invalid editable field",
  );
  await fill("fullName", "Ada Lovelace");
  await fill("email", "invalid");
  await fill("rooms[0].room.adults", "3");
  await fill("rooms[0].room.children", "3");
  await submit();
  assert.equal(writes, 0);
  assert.ok(container.textContent.includes("Ingresa un correo válido."));
  assert.ok(container.textContent.includes("no tiene capacidad"));
  await fill("email", "");
  await fill("rooms[0].room.adults", "2");
  await submit();
  assert.equal(writes, 0, "Excess children must still block saving after correcting adults");
  await fill("rooms[0].room.children", "2");
  await submit();
  await until(() => writes === 1, "Optional contact details may be empty");
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

it("disables adding a room when availability without this reservation is exhausted", async () => {
  mockApi(
    async () => {
      throw new Error("Unchanged reservation must not write or preview");
    },
    { roomCount: 2 },
  );
  const lookups = page.api.requests("GET", "/availability");
  page.api.on("GET", "/availability", () => doubleAvailability(1, ["room-1"]));
  await render(stayEditor(detail()));
  await until(
    () =>
      window.document.querySelector('[name="rooms[0].room.adults"]') !== null &&
      client.isFetching() === 0,
  );
  assert.equal(button("Agregar habitación").disabled, true);
  assert.equal(lookups.at(-1)?.url.searchParams.get("excludeReservationId"), "reservation-1");
});

function useDoubleAndSingleRooms() {
  page.api.catalog.roomTypes = [
    doubleType,
    { id: "single", name: "Simple", maxAdults: 1, maxChildren: 0, baseRateCents: 10000 },
  ];
  page.api.catalog.rooms = [
    { id: "room-1", number: "101", roomTypeId: "double" },
    { id: "room-2", number: "102", roomTypeId: "single" },
  ];
}

it("adds the available type instead of a sold-out type and releases draft inventory on removal", async () => {
  const initial = detail();
  initial.rooms[0].adults = 2;
  initial.rooms[0].children = 1;
  mockApi(async () => previewResponse(initial));
  useDoubleAndSingleRooms();
  await render(stayEditor(initial));
  await until(
    () => !button("Agregar habitación").disabled,
    "Available room type must allow adding",
  );
  await React.act(async () => button("Agregar habitación").click());
  assert.match(fieldTrigger("Tipo", 1).textContent, /Simple/);
  assert.match(fieldTrigger("Hab.", 1).textContent, /Sin asignar/);
  assert.equal(control("rooms[1].room.adults").value, "1");
  assert.equal(control("rooms[1].room.children").value, "0");
  assert.equal(button("Agregar habitación").disabled, true);
  await React.act(async () => button("Agregar habitación").click());
  assert.equal(container.querySelectorAll('[name$=".room.adults"]').length, 2);
  const openTypeOptions = async (index: number) => {
    await React.act(async () => fieldTrigger("Tipo", index).click());
    return [
      ...window.document.querySelectorAll<HTMLElement>(
        '[data-slot="select-content"][data-open] [role="option"]',
      ),
    ];
  };
  const firstOptions = await openTypeOptions(0);
  assert.deepEqual(
    firstOptions.map((item) => item.textContent.trim()),
    ["Doble"],
  );
  await React.act(async () => firstOptions[0].click());
  const secondOptions = await openTypeOptions(1);
  assert.deepEqual(
    secondOptions.map((item) => item.textContent.trim()),
    ["Simple"],
  );
  await React.act(async () => secondOptions[0].click());
  await page.menuAction("Acciones de la habitación 2", "Quitar habitación");
  assert.equal(button("Agregar habitación").disabled, false);
  const releasedOptions = await openTypeOptions(0);
  assert.deepEqual(
    releasedOptions.map((item) => item.textContent.trim()),
    ["Doble", "Simple"],
  );
});

it("waits for availability on the current dates before allowing another room", async () => {
  mockApi(async () => previewResponse(detail()), { roomCount: 3 });
  let finish!: (response: Response) => void;
  page.api.on("GET", "/availability", ({ url }) => {
    if (url.searchParams.get("checkOut") === "2026-10-17")
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    return doubleAvailability(2, ["room-1", "room-2", "room-3"]);
  });
  await render(stayEditor(detail()));
  await until(
    () => !button("Agregar habitación").disabled,
    "A spare room must allow adding another",
  );
  await React.act(async () => fieldTrigger("Check-out").click());
  const day = [...window.document.querySelectorAll<HTMLButtonElement>("button[data-day]")].find(
    (button) => button.textContent.trim() === "17",
  )!;
  assert.ok(day);
  await React.act(async () => day.click());
  await until(() => !!finish, "Changed dates must request current availability");
  assert.equal(button("Agregar habitación").disabled, true);
  assert.equal(fieldTrigger("Tipo").hasAttribute("disabled"), true);
  await React.act(async () => finish(Response.json(doubleAvailability(1, ["room-1"]))));
  await until(() => client.isFetching() === 0, "Current availability must finish loading");
  await flush();
  assert.equal(button("Agregar habitación").disabled, true, "The new dates leave no spare room");
  assert.equal(fieldTrigger("Tipo").hasAttribute("disabled"), false);
});

it("keeps pricing an added room when its occupancy is invalid and blocks saving", async () => {
  const previews: WorkflowCommand[] = [];
  mockApi(
    async (path, command) => {
      assert.ok(path.endsWith("/preview"));
      previews.push(command);
      const added = command.actions.find((action) => action.type === "add-room")!;
      assert.equal(added.type, "add-room");
      if (added.type !== "add-room") throw new Error("Expected added room");
      return previewResponse(
        {
          ...detail(),
          subtotalCents: 60000,
          totalCents: 60000,
          balanceCents: 60000,
          rooms: [...detail().rooms, { ...detail().rooms[0], id: "new-line", ...added.room }],
        },
        added.room.adults > 2
          ? [
              {
                code: "too many guests for this room type",
                roomIndex: 1,
                field: "occupancy",
              },
            ]
          : [],
      );
    },
    { roomCount: 2 },
  );
  await render(stayEditor(detail()));
  await until(() => !button("Agregar habitación").disabled, "Room inventory must load");
  await React.act(async () => button("Agregar habitación").click());
  await until(() => !button("Guardar cambios").disabled, "Added room must be priced");
  await fill("rooms[1].room.adults", "3");
  await until(
    () => previews.length === 2 && !container.textContent.includes("Calculando…"),
    "Invalid occupancy must still receive a price",
  );
  const subtotal = Array.from(container.querySelectorAll("dt")).find(
    (item) => item.textContent === "Total",
  )!;
  assert.equal(subtotal.nextElementSibling?.textContent.replace(/\s/g, ""), "S/600");
  assert.ok(container.textContent.includes("La habitación no tiene capacidad"));
  assert.equal(button("Guardar cambios").disabled, true);
  await fill("rooms[1].room.adults", "2");
  await until(() => !button("Guardar cambios").disabled, "Corrected occupancy must allow saving");
  assert.equal(container.textContent.includes("La habitación no tiene capacidad"), false);
});

function hasButton(label: string) {
  return [...window.document.querySelectorAll("button")].some(
    (item) => item.textContent.trim() === label,
  );
}

function footerActions() {
  const edit = summaryButton("Editar reserva");
  return [...edit.parentElement!.querySelectorAll("button")].map((item) => item.textContent.trim());
}

it.each([
  { status: "confirmed", actions: ["Editar reserva", "Hacer check-in"] },
  { status: "checked_in", actions: ["Editar reserva", "Hacer check-out"] },
  { status: "checked_out", actions: ["Editar reserva"] },
  { status: "cancelled", actions: ["Editar reserva"] },
] as const)(
  "offers only the applicable lifecycle action for a $status reservation",
  async (scenario) => {
    mockApi(
      async () => {
        throw new Error("Opening the summary must not write");
      },
      { reservation: () => ({ ...detail(), status: scenario.status }) },
    );
    await openSummary();
    assert.deepEqual(footerActions(), scenario.actions);
  },
);

it.each(["desktop", "phone"] as const)(
  "summarizes contact, rooms, occupancy, account and reservation notes without editors on %s",
  async (viewport) => {
    const saved = detail();
    saved.guest.phone = "+51987654321";
    saved.guest.nationality = "CL";
    saved.notes = "Llegada después de las 22:00.\nSolicita una cuna.";
    saved.guest.notes = "Nota del contacto, no de la reserva";
    saved.paidCents = 10000;
    saved.balanceCents = 20000;
    saved.rooms.push({
      ...saved.rooms[0],
      id: "line-2",
      roomId: null,
      roomNumber: null,
      adults: 2,
      children: 1,
    });
    mockApi(
      async () => {
        throw new Error("Viewing a summary must not write");
      },
      { reservation: () => saved },
    );
    if (viewport === "phone") page.mobile();
    await openSummary();
    const popup = summary()!;
    assert.match(popup.textContent, /Reserva #TEST0001\s*Confirmada/);
    assert.equal(
      popup.querySelector('img[alt="Nacionalidad: Chile"]')?.nextElementSibling?.textContent,
      "Test Guest",
    );
    assert.match(popup.textContent, /14 oct – 16 oct 2026 · 2 noches/);
    assert.equal(popup.querySelector('a[href^="tel:"]')?.getAttribute("href"), "tel:+51987654321");
    assert.deepEqual(roomLines(), ["Hab.101Doble1adulto", "SinasignarDoble2adultos·1niño"]);
    assert.deepEqual(summaryAmounts(), { Total: "S/300", Pagado: "S/100" });
    assert.equal(
      popup.querySelector('[aria-label="Saldo de la reserva"]')!.textContent.replace(/\s/g, ""),
      "SaldopendienteS/200",
    );
    const notes = popup.querySelector('[aria-labelledby$="-notes"]');
    assert.equal(notes?.querySelector("h3")?.textContent, "Notas de la reserva");
    assert.equal(notes?.querySelector("p")?.textContent, saved.notes);
    assert.doesNotMatch(popup.textContent, /Nota del contacto/);
    assert.equal(popup.querySelector("input, textarea, select, [role='tab']"), null);
    for (const editor of ["Registrar pago", "Agregar huésped", "Editar estadía", "Cambiar estado"])
      assert.equal(hasButton(editor), false, `${editor} belongs on the reservation page`);
  },
);

it.each([null, "", " \n "])(
  "omits the notes section when reservation notes are %j",
  async (notes) => {
    mockApi(async () => assert.fail("Viewing a summary must not write"), {
      reservation: () => ({ ...detail(), notes }),
    });
    await openSummary();
    assert.equal(summary()!.querySelector('[aria-labelledby$="-notes"]'), null);
  },
);

it.each([
  {
    scenario: "an outstanding",
    changes: { balanceCents: 30000 },
    paid: "S/0",
    text: "SaldopendienteS/300",
  },
  {
    scenario: "a discounted",
    changes: {
      subtotalCents: 33000,
      savedDiscountCents: 9000,
      discountCents: 3000,
      balanceCents: 30000,
    },
    paid: "S/0",
    text: "SaldopendienteS/300",
  },
  {
    scenario: "a settled",
    changes: { balanceCents: 0, paidCents: 30000 },
    paid: "S/300",
    text: "CuentasaldadaS/0",
  },
  {
    scenario: "a credit",
    changes: { balanceCents: -5000, paidCents: 35000, refundDueCents: 5000 },
    paid: "S/350",
    text: "PordevolverS/50",
  },
  {
    scenario: "a requested-refund",
    changes: {
      balanceCents: -5000,
      paidCents: 35000,
      refundDueCents: 5000,
      pendingRefundCents: 5000,
    },
    paid: "S/350",
    text: "ReembolsosolicitadoS/50",
  },
  {
    scenario: "a coupon-and-refund adjusted",
    changes: {
      balanceCents: 0,
      paidCents: 25000,
      couponAppliedCents: 10000,
      refundedCents: 3000,
      couponIssuedCents: 2000,
    },
    paid: "S/250",
    text: "CuentasaldadaS/0",
  },
])("reads $scenario balance without calling it money owed", async ({ changes, paid, text }) => {
  mockApi(
    async () => {
      throw new Error("Viewing a summary must not write");
    },
    { reservation: () => ({ ...detail(), ...changes }) },
  );
  await openSummary();
  assert.deepEqual(summaryAmounts(), {
    ...("discountCents" in changes ? { Subtotal: "S/330", Descuento: "-S/30" } : {}),
    Total: "S/300",
    Pagado: paid,
    ...("couponAppliedCents" in changes
      ? { "Pagado con cupón": "S/100", Reembolsado: "-S/30", "Pasado a cupón": "-S/20" }
      : {}),
  });
  assert.equal(
    summary()!.querySelector('[aria-label="Saldo de la reserva"]')!.textContent.replace(/\s/g, ""),
    text,
  );
});

it("keeps loading summaries dismissible and requests the newly selected reservation", async () => {
  let closed = 0;
  const first = page.api.hold("GET", "/reservations/reservation-1");
  const second = { ...detail(), id: "reservation-2", code: "SECOND02" };
  page.api.on("GET", "/reservations/reservation-2", () => second);
  await render(summaryDialog({ onClose: () => closed++ }));
  await until(() => !!first.request);
  assert.ok(summary()?.querySelector('[aria-label="Cargando reserva"][aria-busy]'));
  assert.equal(hasButton("Editar reserva"), false);
  await React.act(async () => summaryButton("Cerrar").click());
  assert.equal(closed, 1);
  await render(
    React.createElement(summaries.ReservationSummary, {
      reservationId: "reservation-2",
      onClose: () => {},
      onEdit: () => {},
    }),
  );
  await until(() => !!summary()?.textContent.includes("#SECOND02"));
  await React.act(async () => first.release(Response.json(detail())));
  assert.match(summary()!.textContent, /#SECOND02/);
  assert.doesNotMatch(summary()!.textContent, /#TEST0001/);
});

it("disables lifecycle changes after a failed refresh and recovers through retry", async () => {
  mockApi(async () => assert.fail("A stale summary must not write"));
  await openSummary();
  page.api.failOnce("GET", "/reservations/reservation-1", 503);
  await React.act(async () =>
    client.invalidateQueries({ queryKey: ["reservation", "reservation-1"] }),
  );
  await until(() => hasButton("Reintentar"));
  assert.equal(button("Hacer check-in").disabled, true);
  assert.equal(button("Editar reserva").disabled, false);
  await React.act(async () => button("Hacer check-in").click());
  assert.equal(page.api.requests("POST", /\/commands$/).length, 0);
  await React.act(async () => button("Reintentar").click());
  await until(() => !button("Hacer check-in").disabled);
});

it("offers a retry and a way out when the summary cannot load", async () => {
  let fail = true;
  let closed = 0;
  page.api.on("GET", "/reservations/reservation-1", () =>
    fail ? Response.json({ error: "Temporary failure" }, { status: 503 }) : detail(),
  );
  await render(summaryDialog({ onClose: () => closed++ }));
  await until(() => hasButton("Reintentar"), "A failed load must offer a retry");
  assert.equal(hasButton("Hacer check-in"), false);
  assert.equal(hasButton("Editar reserva"), false);
  fail = false;
  await React.act(async () => button("Reintentar").click());
  await until(() => !!summary()?.textContent.includes("#TEST0001"), "Retrying must load it");
  await React.act(async () => summaryButton("Cerrar").click());
  assert.equal(closed, 1);
});

async function openSummaryWithToasts(handlers: Parameters<typeof summaryDialog>[0] = {}) {
  await render(await browser.withToasts(summaryDialog(handlers)));
  await until(() => !!summary()?.textContent.includes("#TEST0001"), "The summary must load");
}

function roomLines() {
  return [...(summary()?.querySelectorAll("li") ?? [])].map((item) =>
    item.textContent.replace(/\s/g, ""),
  );
}

function summaryAmounts() {
  return Object.fromEntries(
    [...summary()!.querySelectorAll("dl dt")].map((label) => [
      label.textContent,
      label.nextElementSibling!.textContent.replace(/\s/g, ""),
    ]),
  );
}

function summaryButton(label: string) {
  const found = [...(summary()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (item) => (item.getAttribute("aria-label") ?? item.textContent.trim()) === label,
  );
  assert.ok(found, `Missing summary button ${label}`);
  return found;
}

function alertButton(label: string) {
  const found = [
    ...window.document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
  ].find((item) => item.textContent.trim() === label);
  assert.ok(found, `Missing confirmation button ${label}`);
  return found;
}

const bodyText = () => window.document.body.textContent;

it.each([
  {
    from: "confirmed",
    action: "Hacer check-in",
    done: "Check-in registrado",
    undoResponse: null,
    outcome: "Check-in deshecho",
  },
  {
    from: "checked_in",
    action: "Hacer check-out",
    done: "Check-out registrado",
    undoResponse: "room is already assigned for those dates",
    outcome: "Esta habitación está ocupada para esas fechas",
  },
] as const)(
  "undoes a $action from its success toast by restoring the previous status",
  async ({ from, action, done, undoResponse, outcome }) => {
    let saved: ReservationDetail = { ...detail(), status: from, paidCents: 30000, balanceCents: 0 };
    const writes: WorkflowCommand[] = [];
    mockApi(
      async (path, command) => {
        if (path.endsWith("/preview")) return previewResponse(saved);
        writes.push(command);
        if (writes.length === 2 && undoResponse)
          return Response.json({ error: undoResponse }, { status: 409 });
        for (const item of command.actions)
          if (item.type === "set-status") saved = { ...saved, status: item.status };
        return Response.json(saved);
      },
      { reservation: () => saved },
    );
    await openSummaryWithToasts();
    await React.act(async () => button(action).click());
    await until(() => bodyText().includes(done), "The success toast must appear");
    assert.notEqual(saved.status, from);
    await until(() => !button("Deshacer").disabled);
    await React.act(async () => button("Deshacer").click());
    await until(() => bodyText().includes(outcome), "Undoing must report its outcome");
    assert.deepEqual(writes[1].actions, [{ type: "set-status", status: from }]);
    assert.equal(writes.length, 2);
  },
);

it("closes the undo notice when the reservation summary unmounts", async () => {
  let saved = detail();
  const writes: WorkflowCommand[] = [];
  mockApi(
    async (path, command) => {
      if (path.endsWith("/preview")) return previewResponse(saved);
      writes.push(command);
      for (const action of command.actions)
        if (action.type === "set-status") saved = { ...saved, status: action.status };
      return Response.json(saved);
    },
    { reservation: () => saved },
  );
  await openSummaryWithToasts();
  await React.act(async () => button("Hacer check-in").click());
  await until(() => page.notifications().includes("Check-in registrado"));
  const undo = button("Deshacer");
  await render(await browser.withToasts(null));
  await until(
    () => !page.notifications().includes("Check-in registrado"),
    "Closing the reservation must retire its undo",
  );
  await React.act(async () => undo.click());
  assert.equal(writes.length, 1);
  assert.equal(saved.status, "checked_in");
});

it("warns about a dirty room before checking in the whole reservation from the phone drawer", async () => {
  page.mobile();
  let saved = detail();
  saved.rooms = [
    { ...saved.rooms[0], housekeepingStatus: "dirty" },
    { ...saved.rooms[0], id: "line-2", roomId: null, roomNumber: null },
  ];
  const writes: WorkflowCommand[] = [];
  mockApi(
    async (path, command) => {
      assert.ok(path.endsWith("/commands"));
      writes.push(command);
      for (const action of command.actions)
        if (action.type === "set-status") saved = { ...saved, status: action.status };
      return Response.json(saved);
    },
    { reservation: () => saved },
  );
  await openSummaryWithToasts();
  await React.act(async () => button("Hacer check-in").click());
  assert.match(
    window.document.querySelector('[role="alertdialog"]')!.textContent,
    /La habitación 101 está sucia/,
  );
  await React.act(async () => alertButton("Volver").click());
  assert.equal(writes.length, 0);
  await React.act(async () => button("Hacer check-in").click());
  await React.act(async () => alertButton("Hacer check-in").click());
  await until(() => bodyText().includes("Check-in registrado"));
  assert.deepEqual(writes, [
    { requestId: writes[0].requestId, actions: [{ type: "set-status", status: "checked_in" }] },
  ]);
  await until(
    () => footerActions().includes("Hacer check-out"),
    "The summary shows the new status",
  );
});

it("confirms an outstanding balance before checking out from the summary", async () => {
  let saved: ReservationDetail = { ...detail(), status: "checked_in" };
  const writes: WorkflowCommand[] = [];
  mockApi(
    async (path, command) => {
      assert.ok(path.endsWith("/commands"));
      writes.push(command);
      for (const action of command.actions)
        if (action.type === "set-status") saved = { ...saved, status: action.status };
      return Response.json(saved);
    },
    { reservation: () => saved },
  );
  await openSummaryWithToasts();
  await React.act(async () => button("Hacer check-out").click());
  assert.match(
    window.document.querySelector('[role="alertdialog"]')!.textContent,
    /Quedan S\/\s*300 por pagar\. ¿Hacer check-out de todos modos\?/,
  );
  await React.act(async () => alertButton("Volver").click());
  assert.equal(writes.length, 0);
  await React.act(async () => button("Hacer check-out").click());
  await React.act(async () => alertButton("Hacer check-out").click());
  await until(() => bodyText().includes("Check-out registrado"));
  assert.deepEqual(writes[0].actions, [{ type: "set-status", status: "checked_out" }]);
  assert.deepEqual(footerActions(), ["Editar reserva"]);
});

it("keeps confirmation, a pending check-in and its undo usable across viewport changes", async () => {
  page.mobile();
  let saved = detail();
  saved.rooms[0].housekeepingStatus = "dirty";
  const writes: WorkflowCommand[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockApi(
    async (path, command) => {
      assert.ok(path.endsWith("/commands"));
      writes.push(command);
      for (const action of command.actions)
        if (action.type === "set-status") saved = { ...saved, status: action.status };
      if (writes.length === 1) await held;
      return Response.json(saved);
    },
    { reservation: () => saved },
  );
  await openSummaryWithToasts();
  await React.act(async () => button("Hacer check-in").click());
  await React.act(async () => window.happyDOM.setWindowSize({ width: 1024, height: 768 }));
  assert.match(
    window.document.querySelector('[role="alertdialog"]')!.textContent,
    /101 está sucia/,
  );
  await React.act(async () => alertButton("Hacer check-in").click());
  await until(() => writes.length === 1 && summaryButton("Editar reserva").disabled);
  await React.act(async () => window.happyDOM.setWindowSize({ width: 390, height: 844 }));
  assert.equal(summaryButton("Editar reserva").disabled, true);
  await React.act(async () => release());
  await until(() => bodyText().includes("Check-in registrado"));
  await React.act(async () => window.happyDOM.setWindowSize({ width: 1024, height: 768 }));
  await until(() => !button("Deshacer").disabled);
  await React.act(async () => button("Deshacer").click());
  await until(() => bodyText().includes("Check-in deshecho"));
  assert.deepEqual(writes[1].actions, [{ type: "set-status", status: "confirmed" }]);
  assert.equal(saved.status, "confirmed");
});

it.each(["occupancy", "dates"] as const)(
  "revalidates a grandfathered room when changing %s",
  async (change) => {
    const initial = detail();
    initial.rooms[0].adults = 2;
    initial.rooms[0].children = 3;
    let writes = 0;
    mockApi(async (path) => {
      if (path.endsWith("/preview"))
        return previewResponse(initial, [
          { code: "too many guests for this room type", roomIndex: 0, field: "occupancy" },
        ]);
      writes++;
      return Response.json(initial);
    });
    await render(stayEditor(initial));
    await flush();
    assert.equal(container.textContent.includes("no tiene capacidad"), false);
    if (change === "occupancy") await fill("rooms[0].room.children", "4");
    else {
      await React.act(async () => fieldTrigger("Check-out").click());
      const day = Array.from(
        window.document.querySelectorAll<HTMLButtonElement>("button[data-day]"),
      ).find((button) => button.textContent.trim() === "17");
      assert.ok(day);
      await React.act(async () => day.click());
    }
    await until(
      () => window.document.body.textContent.includes("no tiene capacidad"),
      "Changed rooms must use current limits",
    );
    await submit();
    assert.equal(writes, 0);
  },
);

it("previews and saves added unassigned rooms after check-in and allows clearing assignments", async () => {
  const initial: ReservationDetail = { ...detail(), status: "checked_in" };
  const writes: WorkflowCommand[] = [];
  const previews: WorkflowCommand[] = [];
  mockApi(
    async (path, command) => {
      if (path.endsWith("/commands")) writes.push(command);
      else previews.push(command);
      const hasAdded = command.actions.some((action) => action.type === "add-room");
      const unassigned = { ...initial.rooms[0], roomId: null, roomNumber: null };
      const saved = {
        ...initial,
        rooms: hasAdded ? [unassigned, { ...unassigned, id: "line-2" }] : [unassigned],
        subtotalCents: hasAdded ? 60000 : 30000,
        totalCents: hasAdded ? 60000 : 30000,
        balanceCents: hasAdded ? 60000 : 30000,
      };
      return path.endsWith("/preview") ? previewResponse(saved) : Response.json(saved);
    },
    { roomCount: 2 },
  );
  await renderCachedEditor(() => initial);
  await choose("Hab.", "Sin asignar");
  await React.act(async () => button("Agregar habitación").click());
  await until(() => !button("Guardar cambios").disabled, "Added room must have a valid preview");
  assert.ok(
    previews.some((command) => command.actions.some((action) => action.type === "add-room")),
  );
  const subtotal = Array.from(window.document.querySelectorAll("dt")).find(
    (item) => item.textContent === "Total",
  )!;
  assert.equal(subtotal.nextElementSibling?.textContent.replace(/\s/g, ""), "S/600");
  await submit();
  await until(() => writes.length === 1, "Unassigned rooms must save after check-in");
  assert.ok(
    writes[0].actions.some((action) => action.type === "edit-room" && action.room.roomId === null),
  );
  assert.ok(
    writes[0].actions.some((action) => action.type === "add-room" && action.room.roomId === null),
  );
  await until(() => button("Guardar cambios").disabled, "Successful save must reset changes");
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

for (const succeeds of [true, false]) {
  it(`locks the ${succeeds ? "desktop sheet" : "phone drawer"} while check-in saves and unlocks after ${succeeds ? "success" : "failure"}`, async () => {
    if (!succeeds) page.mobile();
    let finish!: (response: Response) => void;
    let requests = 0;
    let closed = 0;
    let edited = 0;
    try {
      mockApi(async (path) => {
        assert.equal(path, "/reservations/reservation-1/commands");
        requests++;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      });
      await openSummaryWithToasts({
        onClose: () => {
          closed++;
        },
        onEdit: () => {
          edited++;
        },
      });
      await React.act(async () => button("Hacer check-in").click());
      await until(() => requests === 1, "Check-in must begin");
      await until(() => summaryButton("Editar reserva").disabled, "A pending check-in must lock");
      assert.equal(summaryButton("Cerrar").disabled, true);
      assert.equal(summaryButton("Hacer check-in").disabled, true);
      const pendingUnload = new window.Event("beforeunload", { cancelable: true });
      await React.act(async () => window.dispatchEvent(pendingUnload));
      assert.equal(pendingUnload.defaultPrevented, true);
      await React.act(async () => {
        summary()!.dispatchEvent(
          new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        summaryButton("Editar reserva").click();
      });
      assert.equal(closed, 0);
      assert.equal(edited, 0);
      await React.act(async () =>
        finish(
          succeeds
            ? Response.json({ ...detail(), status: "checked_in" })
            : Response.json({ error: "Temporary save failure" }, { status: 503 }),
        ),
      );
      await until(() => !summaryButton("Editar reserva").disabled, "A finished save must unlock");
      const settledUnload = new window.Event("beforeunload", { cancelable: true });
      await React.act(async () => window.dispatchEvent(settledUnload));
      assert.equal(settledUnload.defaultPrevented, false);
      await until(() =>
        bodyText().includes(succeeds ? "Check-in registrado" : "No se pudo cambiar el estado"),
      );
      assert.deepEqual(footerActions().at(-1), succeeds ? "Hacer check-out" : "Hacer check-in");
      await React.act(async () => summaryButton("Cerrar").click());
      assert.equal(closed, 1);
    } finally {
      if (finish) await React.act(async () => finish(Response.json(detail())));
    }
  });
}

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
