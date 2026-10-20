import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vite-plus/test";
import type {
  HTMLInputElement,
  HTMLTextAreaElement,
  HTMLButtonElement,
  HTMLElement,
} from "happy-dom";
import { createBrowserTest, type BrowserTest, type BrowserPage } from "./browser.ts";
import { ReservationStatusSelection } from "../src/lib/reservation-status-selection.ts";
import type {
  ReservationDetail,
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
let routing: BrowserTest["routing"];
let forms: typeof import("../src/components/reservation-entry-forms.tsx");
let dialogs: typeof import("../src/components/room-booking-dialog.tsx");
let newBookings: typeof import("../src/components/new-booking.tsx");
let queries: typeof import("../src/lib/queries.ts");
let calendars: typeof import("../src/components/room-calendar.tsx");
let inventories: typeof import("../src/components/inventory.tsx");
let reservationLists: typeof import("../src/components/reservations.tsx");
let closures: typeof import("../src/components/room-closure-dialog.tsx");
type CreateBookingInput = Parameters<typeof import("../src/lib/api.ts").createWorkflowBooking>[0];
let root: BrowserPage["root"];
let container: BrowserPage["container"];
let client: BrowserPage["client"];
let render: BrowserPage["render"];
let withClient: BrowserPage["withClient"];
let flush: BrowserPage["flush"];
let until: BrowserPage["until"];

beforeAll(async () => {
  browser = await createBrowserTest();
  ({ window, React, query, routing } = browser);
  const { server } = browser;
  forms = (await server.ssrLoadModule(
    "/src/components/reservation-entry-forms.tsx",
  )) as typeof forms;
  dialogs = (await server.ssrLoadModule(
    "/src/components/room-booking-dialog.tsx",
  )) as typeof dialogs;
  newBookings = (await server.ssrLoadModule(
    "/src/components/new-booking.tsx",
  )) as typeof newBookings;
  queries = (await server.ssrLoadModule("/src/lib/queries.ts")) as typeof queries;
  calendars = (await server.ssrLoadModule("/src/components/room-calendar.tsx")) as typeof calendars;
  closures = (await server.ssrLoadModule(
    "/src/components/room-closure-dialog.tsx",
  )) as typeof closures;
  inventories = (await server.ssrLoadModule("/src/components/inventory.tsx")) as typeof inventories;
  reservationLists = (await server.ssrLoadModule(
    "/src/components/reservations.tsx",
  )) as typeof reservationLists;
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
});

afterEach(async () => {
  await page.cleanup();
  vi.useRealTimers();
});

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
    guestId: "contact-1",
    guest: {
      id: "contact-1",
      fullName: "Test Guest",
      phone: null,
      email: null,
      notes: null,
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

async function renderWithRouter(element: React.ReactNode) {
  const rootRoute = routing.createRootRoute({ component: () => element });
  const setupRoute = routing.createRoute({
    getParentRoute: () => rootRoute,
    path: "/setup",
  });
  const router = routing.createRouter({
    routeTree: rootRoute.addChildren([setupRoute]),
    history: routing.createMemoryHistory({ initialEntries: ["/"] }),
  });
  await page.renderRouter(router);
}

function control(name: string) {
  const input = window.document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  );
  assert.ok(input, `Missing field ${name}`);
  return input;
}

async function fill(name: string, value: string) {
  await fillControl(control(name), value);
}

async function fillControl(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    input.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

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

function button(label: string) {
  const element = Array.from(window.document.querySelectorAll("button")).find(
    (button) => button.textContent.trim() === label,
  );
  assert.ok(element, `Missing button ${label}`);
  return element;
}

async function statusAction(label: string) {
  await React.act(async () => button("Cambiar estado").click());
  const item = Array.from(window.document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (node) => node.textContent.trim() === label,
  );
  assert.ok(item, `Missing status action ${label}`);
  await React.act(async () => item.click());
}

it("adds consecutive guests with distinct IDs and resets the real form across rerenders", async () => {
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
    },
  });
  await render(React.createElement(forms.GuestEntryForm, props()));
  for (const name of ["First Guest", "Second Guest"]) {
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
});

it("clears each successful payment without restoring the original suggested balance", async () => {
  let saved = detail();
  const amounts: number[] = [];
  const props = () => ({
    detail: saved,
    disabled: false,
    onDirtyChange: () => {},
    onReady: async (_title: string, actions: WorkflowCommand["actions"]) => {
      const action = actions[0];
      assert.equal(action.type, "add-payment");
      if (action.type !== "add-payment") return;
      amounts.push(action.payment.amountCents);
      saved = {
        ...saved,
        balanceCents: saved.balanceCents - action.payment.amountCents,
      };
      root.render(withClient(React.createElement(forms.PaymentForm, props())));
    },
  });
  await render(React.createElement(forms.PaymentForm, props()));
  assert.equal(control("amount").value, "300.00");
  for (const amount of ["100", "50"]) {
    await fill("amount", amount);
    await submit();
    assert.equal(control("amount").value, "");
    await flush();
    assert.equal(control("amount").value, "");
  }
  assert.deepEqual(amounts, [10000, 5000]);
});

for (const [method, label] of [
  ["yape", "Yape"],
  ["plin", "Plin"],
] as const) {
  it(`records a ${label} payment through the real form without requiring a reference`, async () => {
    const writes: WorkflowCommand["actions"][] = [];
    const paymentDate = "2026-10-31";
    await render(
      React.createElement(forms.PaymentForm, {
        detail: detail(),
        disabled: false,
        onDirtyChange: () => {},
        onReady: async (_title, actions) => {
          writes.push(actions);
        },
      }),
    );
    await fill("amount", "100.25");
    await choose("Método", label);
    await submit();
    assert.deepEqual(writes, [
      [
        {
          type: "add-payment",
          payment: { amountCents: 10025, method, paymentDate },
        },
      ],
    ]);
  });
}

it("refreshes an untouched payment suggestion and preserves a manually entered amount", async () => {
  const props = {
    disabled: false,
    onDirtyChange: () => {},
    onReady: async () => {},
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
});

it("preserves a backdated payment and refreshes future-date limits on resume without losing the draft", async () => {
  const writes: WorkflowCommand["actions"][] = [];
  await render(
    React.createElement(forms.PaymentForm, {
      detail: detail(),
      disabled: false,
      onDirtyChange: () => {},
      onReady: async (_title, actions) => {
        writes.push(actions);
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
  await submit();
  assert.deepEqual(writes, [
    [
      {
        type: "add-payment",
        payment: {
          amountCents: 2500,
          method: "cash",
          paymentDate: "2026-10-30",
        },
      },
    ],
  ]);
});

it.each(["submit", "blur"] as const)(
  "revalidates an edited payment's %s error at the new property day without rewriting its saved date or draft",
  async (validation) => {
    const payment = {
      id: crypto.randomUUID(),
      amountCents: 1000,
      method: "cash" as const,
      paymentDate: "2026-11-01",
      reference: null,
      notes: null,
      reservationId: "reservation-1",
      createdAt: "2026-11-01T01:00:00Z",
    };
    const saved = { ...detail(), payments: [payment] };
    mockApi(async () => Response.json(saved));
    await render(
      React.createElement(dialogs.BookingEditor, { detail: saved, onRefresh: () => {} }),
    );
    await React.act(async () => button("Pagos").click());
    const actions = window.document.querySelector<HTMLButtonElement>(
      'button[aria-label^="Acciones del pago"]',
    );
    assert.ok(actions);
    await React.act(async () => actions.click());
    const edit = Array.from(
      window.document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((item) => item.textContent.trim() === "Editar");
    assert.ok(edit);
    await React.act(async () => edit.click());
    const editor = () => window.document.querySelector('[role="dialog"]')!;
    const amount = editor().querySelector<HTMLInputElement>('[name="amount"]')!;
    await fillControl(amount, "25");
    if (validation === "submit") {
      await React.act(async () => button("Guardar").click());
    } else {
      await React.act(async () => button("1 nov 2026").click());
      await React.act(async () => button("1 nov 2026").click());
    }
    await until(
      () => editor().textContent.includes("La fecha del pago no puede ser futura."),
      "Editing uses the same future-date rule",
    );
    vi.setSystemTime(new Date("2026-11-01T05:00:00Z"));
    await React.act(async () => window.dispatchEvent(new window.Event("focus")));
    await until(
      () => !editor().textContent.includes("La fecha del pago no puede ser futura."),
      "Validation refreshes at the new property day",
    );
    assert.equal(amount.value, "25");
    assert.ok(
      Array.from(editor().querySelectorAll("button")).some(
        (element) => element.textContent.trim() === "1 nov 2026",
      ),
    );
  },
);

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return new URL(typeof input === "string" ? input : "url" in input ? input.url : input.href);
}

function mockApi(
  handler: (path: string, command: WorkflowCommand) => Promise<Response>,
  {
    roomCount = 1,
    reservation = detail,
  }: { roomCount?: number; reservation?: () => ReservationDetail } = {},
) {
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (init?.method === "POST") {
      assert.ok(typeof init.body === "string");
      return handler(url.pathname, JSON.parse(init.body));
    }
    if (url.pathname === "/room-types")
      return Response.json([{ id: "double", name: "Doble", maxAdults: 2, maxChildren: 2 }]);
    if (url.pathname === "/rooms")
      return Response.json(
        Array.from({ length: roomCount }, (_, index) => ({
          id: `room-${index + 1}`,
          number: `${101 + index}`,
          roomTypeId: "double",
        })),
      );
    if (url.pathname === "/reservations/reservation-1") return Response.json(reservation());
    if (url.pathname === "/reservations" || url.pathname === "/room-closures")
      return Response.json([]);
    throw new Error(`Unexpected request ${url.pathname}`);
  };
}

function previewResponse(billing: WorkflowBilling, issues: WorkflowIssue[] = []) {
  return Response.json({ billing, validation: { issues } });
}

function summaryAmount(label: string) {
  const term = Array.from(container.querySelectorAll("dt")).find(
    (item) => item.textContent === label,
  );
  assert.ok(term, `Missing bill label ${label}`);
  return term.nextElementSibling?.textContent.replace(/\s/g, "");
}

it.each([
  {
    scenario: "unpaid bill",
    status: "confirmed",
    paidCents: 0,
    subtotalCents: 8000,
    discountCents: 8000,
    balanceLabel: "Cuenta saldada",
    applied: "-S/80",
    balance: "S/0",
  },
  {
    scenario: "paid bill",
    status: "confirmed",
    paidCents: 3000,
    subtotalCents: 8000,
    discountCents: 8000,
    balanceLabel: "Saldo a favor",
    applied: "-S/80",
    balance: "S/30",
  },
  {
    scenario: "cancelled bill",
    status: "cancelled",
    paidCents: 3000,
    subtotalCents: 0,
    discountCents: 0,
    balanceLabel: "Saldo a favor",
    applied: "S/0",
    balance: "S/30",
  },
])(
  "distinguishes the saved discount from the server-applied discount on a $scenario",
  async ({ status, paidCents, subtotalCents, discountCents, balanceLabel, applied, balance }) => {
    const initial = detail();
    const saved = {
      ...initial,
      status,
      savedDiscountCents: 10000,
      subtotalCents,
      discountCents,
      totalCents: 0,
      paidCents,
      balanceCents: -paidCents,
      creditCents: paidCents,
      rooms: [{ ...initial.rooms[0], subtotalCents, totalCents: subtotalCents }],
    };
    let writes = 0;
    mockApi(async () => {
      writes++;
      throw new Error("Viewing a saved discount must not write it back");
    });
    await render(
      React.createElement(dialogs.BookingEditor, { detail: saved, onRefresh: () => {} }),
    );
    const discount = container.querySelector<HTMLInputElement>(
      '[aria-label="Descuento en soles"]',
    )!;
    assert.equal(discount.value, "100");
    assert.ok(container.textContent.includes("Descuento guardado"));
    assert.equal(summaryAmount("Descuento aplicado"), applied);
    assert.equal(summaryAmount("Total de reserva"), "S/0");
    assert.equal(summaryAmount(balanceLabel), balance);
    await React.act(async () => {
      discount.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
    });
    await flush();
    assert.equal(discount.value, "100");
    assert.equal(writes, 0);
  },
);

it("autosaves an above-subtotal discount without capping the saved input or losing a notes draft", async () => {
  const initial = detail();
  let saved = {
    ...initial,
    savedDiscountCents: 10000,
    subtotalCents: 8000,
    discountCents: 8000,
    totalCents: 0,
    balanceCents: 0,
    rooms: [{ ...initial.rooms[0], subtotalCents: 8000, totalCents: 8000 }],
  };
  const writes: WorkflowCommand[] = [];
  mockApi(async (path, command) => {
    assert.ok(path.endsWith("/commands"));
    writes.push(command);
    assert.deepEqual(command.actions, [{ type: "set-discount", amountCents: 12000 }]);
    saved = { ...saved, savedDiscountCents: 12000 };
    return Response.json(saved);
  });
  client.setQueryData(["reservation", saved.id], saved);
  function Editor() {
    const reservation = query.useQuery<ReservationDetail>({
      queryKey: ["reservation", saved.id],
      queryFn: async () => saved,
      staleTime: Infinity,
    });
    return React.createElement(dialogs.BookingEditor, {
      detail: reservation.data!,
      onRefresh: () => {},
    });
  }
  await render(React.createElement(Editor));
  await fill("notes", "Call the booking contact before arrival");
  const discount = container.querySelector<HTMLInputElement>('[aria-label="Descuento en soles"]')!;
  await fillControl(discount, "120");
  await React.act(async () => {
    discount.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
  await until(() => writes.length === 1 && !discount.disabled, "Discount autosave must finish");
  assert.equal(discount.value, "120");
  assert.equal(summaryAmount("Descuento aplicado"), "-S/80");
  assert.equal(summaryAmount("Total de reserva"), "S/0");
  assert.equal(control("notes").value, "Call the booking contact before arrival");
  assert.equal(saved.notes, null);
  assert.ok(container.querySelector('[aria-label="Cambios sin guardar"]'));
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
  await render(
    React.createElement(dialogs.BookingEditor, { detail: initial, onRefresh: () => {} }),
  );
  await React.act(async () => {
    container.querySelector<HTMLElement>('[aria-label="Quitar habitación 2"]')!.click();
  });
  await until(() => !button("Guardar detalles").disabled, "Room-removal preview must load");
  assert.ok(container.textContent.includes("Vista previa"));
  assert.equal(summaryAmount("Importe habitaciones"), "S/80");
  assert.equal(summaryAmount("Descuento aplicado"), "-S/80");
  assert.equal(summaryAmount("Total de reserva"), "S/0");
  assert.equal(summaryAmount("Cuenta saldada"), "S/0");
  assert.equal(
    container.querySelector<HTMLInputElement>('[aria-label="Descuento en soles"]')!.value,
    "100",
  );
});

it.each(["confirmed", "checked_in"])(
  "keeps Huéspedes for the optional staying-guest list on a %s reservation",
  async (status) => {
    const initial = { ...detail(), status };
    initial.guest.fullName = "Booking Contact";
    if (status === "confirmed")
      initial.stayingGuests = [
        {
          id: "staying-1",
          fullName: "Staying Guest",
          phone: null,
          email: null,
          reservationRoomId: null,
        },
      ];
    mockApi(async () => {
      throw new Error("Viewing the guest list must not save changes");
    });
    await render(
      React.createElement(dialogs.BookingEditor, {
        detail: initial,
        initialTab: "guests",
        onRefresh: () => {},
      }),
    );
    const tab = button("Huéspedes");
    assert.equal(tab.getAttribute("role"), "tab");
    assert.equal(tab.getAttribute("aria-selected"), "true");
    if (status === "confirmed") {
      const list = container.querySelector('ul[aria-label="Huéspedes registrados"]');
      assert.ok(list);
      assert.ok(list.textContent.includes("Staying Guest"));
      assert.equal(list.textContent.includes("Booking Contact"), false);
    } else {
      assert.ok(container.textContent.includes("Sin huéspedes registrados"));
    }
  },
);

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

it("reopens a cached reservation with the room saved by the assignment panel", async () => {
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
  mockApi(async (path, command) => {
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
  });
  const fetchApi = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (!init?.method && requestUrl(input).pathname === "/reservations/reservation-1")
      return Response.json(saved);
    return fetchApi(input, init);
  };
  function AssignmentAndDialog() {
    const assign = queries.useAssignRoom();
    const [open, setOpen] = React.useState(true);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        {
          onClick: async () => {
            await assign.mutateAsync({
              reservationId: saved.id,
              lineId: "line-1",
              roomId: "room-1",
            });
            setOpen(true);
          },
        },
        "Assign room",
      ),
      React.createElement(dialogs.RoomBookingDialog, {
        target: open
          ? {
              mode: "edit",
              reservationId: saved.id,
              roomId: "room-1",
              number: "101",
              typeName: "Doble",
            }
          : null,
        onClose: () => setOpen(false),
        onViewReservation: () => {},
      }),
    );
  }
  await render(React.createElement(AssignmentAndDialog));
  await until(
    () => window.document.querySelector('[name="notes"]') !== null,
    "Initial reservation must load",
  );
  assert.match(fieldTrigger("Hab.").textContent, /^Sin asignar/);
  await React.act(async () => button("Cerrar").click());
  await until(
    () => window.document.querySelector('[name="notes"]') === null,
    "Closing must unmount the editor",
  );
  await React.act(async () => button("Assign room").click());
  await until(
    () => window.document.querySelector('[name="notes"]') !== null,
    "Assigned reservation must reopen",
  );
  await flush();
  assert.match(fieldTrigger("Hab.").textContent, /^101/);
  assert.equal(button("Guardar detalles").disabled, true);
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

function mockCreationApi(handler: (input: CreateBookingInput) => Promise<Response>) {
  mockApi(async (path, input) => {
    assert.equal(path, "/reservations");
    return handler(input as unknown as CreateBookingInput);
  });
  const fetchApi = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.pathname === "/availability") {
      const checkIn = url.searchParams.get("checkIn")!;
      const checkOut = url.searchParams.get("checkOut")!;
      const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
      return Response.json({
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
            totalCents: nights * 15000,
            nights: [],
          },
        ],
      });
    }
    return fetchApi(input, init);
  };
}

async function renderNewBooking(onCreated: (id: string) => void = () => {}) {
  await render(
    React.createElement(newBookings.NewBooking, {
      target: createTarget,
      onCreated,
      onCancel: () => {},
      onDirtyChange: () => {},
      onSavingChange: () => {},
    }),
  );
  await until(() => !button("Crear reserva").disabled, "New booking quote must load");
}

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
  assert.equal(
    control("fullName").closest("fieldset")?.querySelector("legend")?.textContent,
    "Contacto principal",
  );
  await fill("fullName", "  Ada Lovelace  ");
  await fill("email", "  ada@example.com  ");
  await fill("phone", "+51 999 888 777");
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
  const discount = container.querySelector<HTMLInputElement>('[aria-label="Descuento en soles"]')!;
  await fillControl(discount, "30");
  await React.act(async () => {
    discount.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
  await until(() => !button("Crear reserva").disabled, "Valid discount must finish updating");
  assert.ok(container.textContent.replace(/\s/g, "").includes("S/570"));
  await submit();
  await until(
    () => created === "reservation-1",
    "Successful creation must report the saved reservation",
  );
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].guest, {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+51 999 888 777",
  });
  assert.equal(writes[0].notes, "Llegada después de las 22:00");
  assert.equal(writes[0].discountCents, 3000);
  assert.equal(writes[0].checkOut, "2026-10-16");
  assert.deepEqual(
    writes[0].rooms.map((room) => room.roomId),
    ["room-1", null],
  );
});

it("caps the creation preview without reducing the entered initial discount", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await renderNewBooking();
  await fill("fullName", "Booking Contact");
  const discount = container.querySelector<HTMLInputElement>('[aria-label="Descuento en soles"]')!;
  await fillControl(discount, "200");
  await React.act(async () => {
    discount.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
  await until(() => !button("Crear reserva").disabled, "Initial discount must finish updating");
  assert.equal(summaryAmount("Importe habitaciones"), "S/150");
  assert.equal(summaryAmount("Total de reserva"), "S/0");
  assert.equal(summaryAmount("Descuento aplicado"), "-S/150");
  assert.equal(discount.value, "200");
  await submit();
  await until(() => writes.length === 1, "Reservation must save");
  assert.equal(writes[0].discountCents, 20000);
});

it("opens a blank room-type menu without a validation error and prices the selected type", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail(), { status: 201 });
  });
  await render(
    React.createElement(newBookings.NewBooking, {
      target: { mode: "new" },
      onCreated: () => {},
      onCancel: () => {},
      onDirtyChange: () => {},
      onSavingChange: () => {},
    }),
  );
  assert.ok(button("31 oct 2026"));
  const type = fieldTrigger("Tipo");
  await until(() => !type.disabled, "Room types must load");
  assert.equal(
    type.querySelector('[data-slot="select-value"]')?.textContent.trim(),
    "Selecciona un tipo",
  );
  assert.equal(button("Crear reserva").disabled, true);
  await React.act(async () => {
    type.focus();
    type.click();
  });
  const option = Array.from(window.document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (item) => item.textContent.trim() === "Doble",
  )!;
  assert.ok(option);
  // Opening a portalled menu transfers focus away from its trigger.
  await React.act(async () => {
    type.dispatchEvent(
      new window.FocusEvent("focusout", {
        bubbles: true,
        relatedTarget: option,
      }),
    );
  });
  assert.equal(type.getAttribute("aria-invalid"), "false");
  assert.equal(
    window.document.body.textContent.includes("Selecciona un tipo de habitación válido."),
    false,
  );
  await React.act(async () => option.click());
  await until(() => !button("Crear reserva").disabled, "Choosing a type must price the stay");
  assert.equal(type.querySelector('[data-slot="select-value"]')?.textContent.trim(), "Doble");
  assert.equal(type.getAttribute("aria-invalid"), "false");
  await fill("fullName", "Ada Lovelace");
  await React.act(async () => {
    control("fullName").dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
  await submit();
  await until(() => writes.length === 1, "A booking started without a room type must save");
  assert.equal(writes[0].rooms[0].roomTypeId, "double");
  assert.equal(writes[0].rooms[0].roomId, null);
  assert.equal(writes[0].checkIn, "2026-10-31");
  assert.equal(writes[0].checkOut, "2026-11-01");
});

it("filters sold-out types, occupied and closed room numbers, and inventory already used by this draft", async () => {
  mockCreationApi(async () => Response.json(detail()));
  const fetchApi = globalThis.fetch;
  const types = [
    { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2, free: 2 },
    { id: "suite", name: "Suite", maxAdults: 4, maxChildren: 2, free: 0 },
    { id: "family", name: "Familiar", maxAdults: 4, maxChildren: 2, free: 1 },
  ];
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.pathname === "/room-types") return Response.json(types);
    if (url.pathname === "/rooms")
      return Response.json([
        ...[1, 2, 3, 4].map((n) => ({
          id: `room-${n}`,
          number: `10${n}`,
          roomTypeId: "double",
        })),
        { id: "suite-1", number: "201", roomTypeId: "suite" },
        { id: "family-1", number: "301", roomTypeId: "family" },
      ]);
    if (url.pathname === "/availability")
      return Response.json({
        checkIn: "2026-10-14",
        checkOut: "2026-10-15",
        nights: 1,
        currency: "PEN",
        roomTypes: types.map((type) => ({
          ...type,
          totalCents: 15000,
          nights: [],
        })),
      });
    if (url.pathname === "/reservations" && !init?.method)
      return Response.json([
        { ...detail(), checkIn: "2026-10-14", checkOut: "2026-10-16" },
        // A checkout on the arrival date must leave room 103 available.
        {
          ...detail(),
          id: "departed",
          checkIn: "2026-10-12",
          checkOut: "2026-10-14",
          rooms: [{ roomId: "room-3", roomTypeId: "double" }],
        },
      ]);
    if (url.pathname === "/room-closures")
      return Response.json([
        {
          id: "closure",
          roomId: "room-2",
          starts: "2026-10-14",
          ends: "2026-10-15",
          reason: null,
        },
      ]);
    return fetchApi(input, init);
  };
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
  await React.act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Quitar habitación 2"]')!.click(),
  );
  assert.equal(button("Agregar habitación").disabled, false);
});

it("replaces sold-out room controls with an empty state and restores them when dates are available", async () => {
  mockCreationApi(async () => Response.json(detail()));
  const fetchApi = globalThis.fetch;
  let finish!: (response: Response) => void;
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.pathname === "/availability" && url.searchParams.get("checkOut") === "2026-10-16")
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    return fetchApi(input, init);
  };
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

const doubleType = { id: "double", name: "Doble", maxAdults: 2, maxChildren: 2 };
const noTypesTitle = "Configura tu alojamiento";
const noRoomsTitle = "Aún no hay habitaciones";

// A null room-type list makes /room-types fail.
function mockSetupApi(
  roomTypes: unknown[] | null,
  rooms: unknown[],
  inventoryTypes: unknown[] = [],
) {
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    if (url.pathname === "/room-types")
      return roomTypes ? Response.json(roomTypes) : Response.json({ error: "x" }, { status: 500 });
    if (url.pathname === "/rooms") return Response.json(rooms);
    if (url.pathname === "/reservations" || url.pathname === "/room-closures")
      return Response.json([]);
    if (url.pathname === "/inventory")
      return Response.json({
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        currency: "PEN",
        roomTypes: inventoryTypes,
      });
    if (url.pathname === "/availability")
      return Response.json({
        checkIn: url.searchParams.get("checkIn"),
        checkOut: url.searchParams.get("checkOut"),
        nights: 2,
        currency: "PEN",
        roomTypes: [],
      });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
}

const renderCalendar = () =>
  React.createElement(calendars.RoomCalendar, {
    start: new Date(2026, 9, 14),
    span: 7,
    onStartChange: () => {},
    onSpanChange: () => {},
    onOpenReservation: () => {},
  });
const renderReservations = () =>
  React.createElement(reservationLists.Reservations, {
    search: {
      view: "arrivals",
      day: "2026-10-14",
      q: "",
      statuses: new ReservationStatusSelection().toSearch(),
      balance: "all",
      assignment: "all",
      sort: "guestName",
      direction: "asc",
      size: 50,
      page: 0,
    },
    onSearchChange: () => {},
    onOpenReservation: () => {},
  });
const renderInventory = () =>
  React.createElement(inventories.Inventory, {
    start: new Date(2026, 9, 14),
    span: 14,
    onStartChange: () => {},
    onSpanChange: () => {},
  });

it("updates calendar past-day restrictions at property midnight without changing its explicit range", async () => {
  vi.setSystemTime(new Date("2026-11-01T04:59:59.990Z"));
  mockSetupApi([doubleType], [{ id: "room-1", number: "101", roomTypeId: "double" }]);
  const changes: string[] = [];
  await render(
    React.createElement(calendars.RoomCalendar, {
      start: new Date(2026, 9, 30),
      span: 7,
      onStartChange: (date) => {
        changes.push(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`);
      },
      onSpanChange: () => {},
      onOpenReservation: () => {},
    }),
  );
  const slot = (day: string) => {
    const element = window.document.querySelector<HTMLButtonElement>(
      `button[aria-label="Nueva reserva para habitación 101 el ${day}"]`,
    );
    assert.ok(element, `Missing booking day ${day}`);
    return element;
  };
  await until(
    () => !!container.querySelector('button[aria-label*="habitación 101 el"]'),
    "Calendar loads",
  );
  assert.equal(slot("30 oct 2026").disabled, true);
  assert.equal(slot("31 oct 2026").disabled, false);
  vi.setSystemTime(new Date("2026-11-01T05:00:00Z"));
  await until(
    () => slot("31 oct 2026").disabled,
    "Property midnight disables yesterday without focus or sign-in",
  );
  assert.ok(button("30 oct 2026"));
  assert.deepEqual(changes, []);
  await React.act(async () => button("Hoy").click());
  assert.deepEqual(changes, ["2026-11-1"]);
});

it("round-trips saved closure dates through the picker and submitted request", async () => {
  const writes: unknown[] = [];
  const closure = {
    id: "closure",
    roomId: "room-1",
    starts: "2026-10-31",
    ends: "2026-11-02",
    reason: "Repairs",
  };
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "PATCH") {
      assert.ok(typeof init.body === "string");
      writes.push(JSON.parse(init.body));
      return Response.json({ ...closure, starts: "2026-10-30" });
    }
    throw new Error("Unexpected closure request");
  };
  await render(
    React.createElement(closures.RoomClosureDialog, {
      target: { mode: "edit", closure, number: "101", typeName: "Doble" },
      onClose: () => {},
    }),
  );
  assert.ok(button("31 oct 2026"));
  assert.ok(button("2 nov 2026"));
  await React.act(async () => button("31 oct 2026").click());
  const selected = window.document.querySelector<HTMLButtonElement>(
    'button[data-day="30/10/2026"]',
  );
  assert.ok(selected);
  await React.act(async () => selected.click());
  assert.ok(button("30 oct 2026"));
  await React.act(async () => button("Guardar").click());
  await until(() => writes.length === 1, "Closure saves");
  assert.deepEqual(writes, [{ starts: "2026-10-30", ends: "2026-11-02", reason: "Repairs" }]);
});

it("opens an unselected picker in the property month and marks the property date as today", async () => {
  await render(
    React.createElement(closures.RoomClosureDialog, {
      target: { mode: "create", roomId: "room-1", number: "101", typeName: "Doble" },
      onClose: () => {},
    }),
  );
  await React.act(async () => button("Seleccionar fecha").click());
  assert.match(
    window.document.querySelector('[data-slot="calendar"]')!.textContent,
    /octubre 2026/,
  );
  const today = window.document.querySelector<HTMLButtonElement>('button[data-day="31/10/2026"]');
  assert.ok(today);
  assert.match(today.getAttribute("aria-label") ?? "", /hoy|today/i);
});

it("uses the property date for arrival badges and refreshes them on resume", async () => {
  const saved = {
    ...detail(),
    checkIn: "2026-10-31",
    checkOut: "2026-11-02",
    guestName: "Ada Lovelace",
    rooms: detail().rooms.map((room) => ({ ...room, roomId: null })),
  };
  mockSetupApi([doubleType], [{ id: "room-1", number: "101", roomTypeId: "double" }]);
  const fetchApi = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    requestUrl(input).pathname === "/reservations" ? Response.json([saved]) : fetchApi(input, init);
  await render(
    React.createElement(calendars.RoomCalendar, {
      start: new Date(2026, 9, 31),
      span: 7,
      onStartChange: () => {},
      onSpanChange: () => {},
      onOpenReservation: () => {},
    }),
  );
  await until(
    () => !!container.querySelector('button[aria-label="Mostrar reservas sin asignar, 1"]'),
    "Unassigned arrival loads",
  );
  await React.act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Mostrar reservas sin asignar, 1"]')!
      .click(),
  );
  assert.match(container.textContent, /Llega hoy/);
  vi.setSystemTime(new Date("2026-11-01T05:00:00Z"));
  await React.act(async () => window.document.dispatchEvent(new window.Event("visibilitychange")));
  assert.equal(container.textContent.includes("Llega hoy"), false);
});

it("keeps inventory rate labels and submitted date ranges unchanged", async () => {
  const writes: unknown[] = [];
  mockSetupApi(
    [doubleType],
    [],
    [
      {
        ...doubleType,
        baseRateCents: 15000,
        capacity: 1,
        nights: [
          { date: "2026-10-31", priceCents: 18000, override: true, free: 1, booked: 0, closed: 0 },
        ],
      },
    ],
  );
  const fetchApi = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (init?.method === "PUT") {
      assert.equal(requestUrl(input).pathname, "/room-types/double/rates");
      assert.ok(typeof init.body === "string");
      writes.push(JSON.parse(init.body));
      return Response.json({ updated: 1 });
    }
    return fetchApi(input, init);
  };
  await render(
    React.createElement(inventories.Inventory, {
      start: new Date(2026, 9, 31),
      span: 7,
      onStartChange: () => {},
      onSpanChange: () => {},
    }),
  );
  await until(
    () => !!container.querySelector('button[aria-label^="Doble, 31 oct 2026"]'),
    "Saved rate loads",
  );
  await React.act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label^="Doble, 31 oct 2026"]')!.click(),
  );
  await until(() => !!window.document.querySelector('[name="price"]'), "Rate editor opens");
  assert.equal(control("price").value, "180.00");
  assert.match(window.document.querySelector('[role="dialog"]')!.textContent, /31 oct 2026/);
  await fill("price", "200");
  await React.act(async () => button("Guardar").click());
  await until(() => writes.length === 1, "Rate saves");
  assert.deepEqual(writes, [{ from: "2026-10-31", to: "2026-10-31", priceCents: 20000 }]);
});

it.each([
  ["calendar", renderCalendar, [], noTypesTitle],
  ["calendar", renderCalendar, [doubleType], noRoomsTitle],
  ["reservations list", renderReservations, [], noTypesTitle],
  ["reservations list", renderReservations, [doubleType], noRoomsTitle],
])(
  "replaces the %s with a setup prompt without its controls (room types: %j)",
  async (_screen, element, roomTypes, title) => {
    mockSetupApi(roomTypes, []);
    await renderWithRouter(element());
    await until(() => container.textContent.includes(title), "Setup prompt must appear");
    assert.equal(container.querySelectorAll("button, input, h1").length, 0);
  },
);

it("replaces the inventory grid with a setup prompt when there are no room types", async () => {
  mockSetupApi([], []);
  await renderWithRouter(renderInventory());
  await until(() => container.textContent.includes(noTypesTitle), "Setup prompt must appear");
  assert.equal(container.querySelectorAll("button").length, 0);
});

it("keeps the inventory grid so rates can be set when room types exist without rooms", async () => {
  mockSetupApi(
    [doubleType],
    [],
    [{ ...doubleType, baseRateCents: 15000, capacity: 0, nights: [] }],
  );
  await render(renderInventory());
  await until(() => container.textContent.includes("Doble"), "Room type row must render");
  assert.ok(!container.textContent.includes(noTypesTitle));
  assert.ok(!container.textContent.includes(noRoomsTitle));
});

it("does not call a property unconfigured when room types fail to load", async () => {
  mockSetupApi(null, []);
  await render(renderCalendar());
  await until(() => container.textContent.includes("Reintentar"), "Load failure must stay visible");
  assert.ok(!container.textContent.includes(noTypesTitle));
  assert.ok(!container.textContent.includes(noRoomsTitle));
});

it.each([
  ["room types", [], [], "Aún no hay tipos de habitación. Agrégalos en Configuración."],
  ["rooms", [doubleType], [], "Aún no hay habitaciones. Agrégalas en Configuración."],
])(
  "points a new booking to setup, not to dates, when there are no %s",
  async (_missing, roomTypes, rooms, message) => {
    mockSetupApi(roomTypes, rooms);
    await render(
      React.createElement(newBookings.NewBooking, {
        target: { mode: "new" },
        onCreated: () => {},
        onCancel: () => {},
        onDirtyChange: () => {},
        onSavingChange: () => {},
      }),
    );
    await until(() => container.textContent.includes(message), "Setup guidance must appear");
    assert.ok(!container.textContent.includes("Sin habitaciones disponibles"));
  },
);

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
  await submit();
  assert.equal(writes, 0);
  assert.ok(container.textContent.includes("Ingresa un correo válido."));
  assert.ok(container.textContent.includes("no tiene capacidad"));
  await fill("email", "");
  await fill("rooms[0].room.adults", "2");
  await submit();
  await until(() => writes === 1, "Optional contact details may be empty");
});

it("blocks excess children but accepts two adults plus two children in the real booking form", async () => {
  const writes: CreateBookingInput[] = [];
  mockCreationApi(async (input) => {
    writes.push(input);
    return Response.json(detail());
  });
  await renderNewBooking();
  await fill("fullName", "Family Guest");
  await fill("rooms[0].room.adults", "2");
  await fill("rooms[0].room.children", "3");
  await submit();
  assert.equal(writes.length, 0);
  assert.ok(container.textContent.includes("no tiene capacidad"));
  await fill("rooms[0].room.children", "2");
  await submit();
  await until(() => writes.length === 1, "The permitted family arrangement must save");
  assert.equal(writes[0].rooms[0].adults, 2);
  assert.equal(writes[0].rooms[0].children, 2);
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
  for (let attempt = 1; attempt <= 2; attempt++) {
    await submit();
    await until(
      () => writes.length === attempt && !button("Crear reserva").disabled,
      "Failed save must allow retrying",
    );
    assert.equal(control("notes").value, "Llegada tarde");
  }
  assert.deepEqual(writes[0], writes[1]);
  await fill("notes", "Llegada a las 23:00");
  await submit();
  await until(() => writes.length === 3, "Updated draft must save");
  assert.notEqual(writes[2].requestId, writes[1].requestId);
});

it("protects a new reservation draft, blocks closing during creation, and closes after saving", async () => {
  let finish!: (response: Response) => void;
  let closed = 0;
  let created = 0;
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
      onViewReservation: () => {
        created++;
      },
    });
  }
  await render(React.createElement(NewDialog));
  await until(() => !button("Crear reserva").disabled, "New dialog must load");
  await fill("fullName", "Ada Lovelace");
  await React.act(async () => button("Cancelar").click());
  assert.equal(closed, 0);
  assert.ok(window.document.body.textContent.includes("Descartar y salir"));
  await React.act(async () => button("Seguir editando").click());
  const popup = window.document.querySelector('[role="dialog"]')!;
  await React.act(async () =>
    popup
      .querySelector("form")!
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })),
  );
  await until(() => !!finish && button("Cerrar").disabled, "Saving must lock closing");
  await React.act(async () =>
    popup.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  assert.equal(closed, 0);
  await React.act(async () => finish(Response.json(detail(), { status: 201 })));
  await until(
    () => closed === 1 && !window.document.querySelector('[role="dialog"]'),
    "Successful creation must close the dialog",
  );
  assert.equal(created, 0, "Creating must not navigate to the reservation page");
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
  const fetchApi = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (!init?.method && requestUrl(input).pathname === "/reservations")
      return Response.json([
        {
          id: "next-reservation",
          status: "confirmed",
          checkIn: "2026-10-16",
          checkOut: "2026-10-18",
          rooms: [{ id: "next-line", roomTypeId: "double", roomId: "room-1" }],
        },
      ]);
    return fetchApi(input, init);
  };
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: initial,
      onRefresh: () => {},
    }),
  );
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
  assert.equal(button("Guardar detalles").disabled, true);
  const error = window.document.getElementById(room.getAttribute("aria-describedby")!)!;
  assert.ok(error.textContent.includes("ocupada para esas fechas"));
  assert.equal(container.querySelector("aside")!.contains(error), false);
  const subtotal = Array.from(container.querySelectorAll("dt")).find(
    (item) => item.textContent === "Importe habitaciones",
  )!;
  assert.equal(subtotal.nextElementSibling?.textContent.replace(/\s/g, ""), "S/450");
  assert.equal(summaryAmount("Saldo pendiente"), "S/450");
  assert.ok(container.textContent.includes("Vista previa"));
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
    assert.equal(button("Guardar detalles").disabled, true);
  };
  assertQuoteVisible();
  await flush(150);
  assertQuoteVisible();
  await until(() => previews.length === 2, "Assignment must be revalidated");
  assertQuoteVisible();
  await React.act(async () => finishPreview());
  await until(
    () => !button("Guardar detalles").disabled,
    "Clearing the assignment must resolve the conflict",
  );
  assert.equal(room.getAttribute("aria-invalid"), "false");
  assert.equal(window.document.body.textContent.includes("ocupada para esas fechas"), false);
  assert.equal(subtotal.nextElementSibling?.textContent.replace(/\s/g, ""), "S/450");
  assert.equal(previews.length, 2);
});

it.each(["saved assigned room", "saved unassigned room", "unassigned reservation", "room closure"])(
  "disables adding a room in the edit dialog when availability is exhausted by a %s",
  async (scenario) => {
    const initial = detail();
    if (scenario === "saved unassigned room") {
      initial.rooms[0].roomId = null;
      initial.rooms[0].roomNumber = null;
    }
    mockApi(
      async () => {
        throw new Error("An unchanged reservation must not write or preview");
      },
      { roomCount: scenario === "unassigned reservation" || scenario === "room closure" ? 2 : 1 },
    );
    const fetchApi = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = requestUrl(input).pathname;
      if (path === "/reservations/reservation-1") return Response.json(initial);
      if (path === "/reservations")
        return Response.json([
          initial,
          ...(scenario === "unassigned reservation"
            ? [
                {
                  ...detail(),
                  id: "other-reservation",
                  rooms: [{ ...detail().rooms[0], id: "other-line", roomId: null }],
                },
              ]
            : []),
        ]);
      if (path === "/room-closures" && scenario === "room closure")
        return Response.json([
          {
            id: "closure",
            roomId: "room-2",
            starts: "2026-10-15",
            ends: "2026-10-16",
            reason: null,
          },
        ]);
      return fetchApi(input, init);
    };
    await render(
      React.createElement(dialogs.RoomBookingDialog, {
        target: {
          mode: "edit",
          reservationId: "reservation-1",
          roomId: "room-1",
          number: "101",
          typeName: "Doble",
        },
        onClose: () => {},
        onViewReservation: () => {},
      }),
    );
    await until(
      () => window.document.querySelector('[name="notes"]') !== null && client.isFetching() === 0,
      "The reservation and inventory must finish loading",
    );
    await flush();
    assert.equal(button("Agregar habitación").disabled, true);
  },
);

it("adds the available type instead of a sold-out type and releases draft inventory on removal", async () => {
  const initial = detail();
  initial.rooms[0].adults = 2;
  initial.rooms[0].children = 1;
  mockApi(async () => previewResponse(initial));
  const fetchApi = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const path = requestUrl(input).pathname;
    if (path === "/room-types")
      return Response.json([
        doubleType,
        { id: "single", name: "Simple", maxAdults: 1, maxChildren: 0 },
      ]);
    if (path === "/rooms")
      return Response.json([
        { id: "room-1", number: "101", roomTypeId: "double" },
        { id: "room-2", number: "102", roomTypeId: "single" },
      ]);
    if (path === "/reservations") return Response.json([initial]);
    return fetchApi(input, init);
  };
  await render(
    React.createElement(dialogs.BookingEditor, { detail: initial, onRefresh: () => {} }),
  );
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
  await React.act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Quitar habitación 2"]')!.click(),
  );
  assert.equal(button("Agregar habitación").disabled, false);
});

it("counts availability per night and waits for current dates before allowing another room", async () => {
  mockApi(async () => previewResponse(detail()), { roomCount: 3 });
  const fetchApi = globalThis.fetch;
  let finish!: (response: Response) => void;
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.pathname === "/reservations") {
      if (url.searchParams.get("to") === "2026-10-17")
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      // These unassigned rooms occupy successive nights, not two rooms at once.
      return Response.json([
        {
          ...detail(),
          id: "first-night",
          checkOut: "2026-10-15",
          rooms: [{ roomTypeId: "double", roomId: null }],
        },
        {
          ...detail(),
          id: "second-night",
          checkIn: "2026-10-15",
          rooms: [{ roomTypeId: "double", roomId: null }],
        },
      ]);
    }
    if (url.pathname === "/room-closures")
      return Response.json([
        {
          id: "closure-1",
          roomId: "room-2",
          starts: "2026-10-16",
          ends: "2026-10-17",
          reason: null,
        },
        {
          id: "closure-2",
          roomId: "room-3",
          starts: "2026-10-16",
          ends: "2026-10-17",
          reason: null,
        },
      ]);
    return fetchApi(input, init);
  };
  await render(
    React.createElement(dialogs.BookingEditor, { detail: detail(), onRefresh: () => {} }),
  );
  await until(
    () => !button("Agregar habitación").disabled,
    "Successive stays must leave one room available",
  );
  await React.act(async () => fieldTrigger("Check-out").click());
  const day = [...window.document.querySelectorAll<HTMLButtonElement>("button[data-day]")].find(
    (button) => button.textContent.trim() === "17",
  )!;
  assert.ok(day);
  await React.act(async () => day.click());
  await until(() => !!finish, "Changed dates must request current reservations");
  assert.equal(button("Agregar habitación").disabled, true);
  await React.act(async () => finish(Response.json([])));
  await until(() => client.isFetching() === 0, "Current availability must finish loading");
  await flush();
  assert.equal(button("Agregar habitación").disabled, true, "Closures exhaust the added night");
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
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: detail(),
      onRefresh: () => {},
    }),
  );
  await until(() => !button("Agregar habitación").disabled, "Room inventory must load");
  await React.act(async () => button("Agregar habitación").click());
  await until(() => !button("Guardar detalles").disabled, "Added room must be priced");
  await fill("rooms[1].room.adults", "3");
  await until(
    () => previews.length === 2 && !container.textContent.includes("Calculando…"),
    "Invalid occupancy must still receive a price",
  );
  const subtotal = Array.from(container.querySelectorAll("dt")).find(
    (item) => item.textContent === "Importe habitaciones",
  )!;
  assert.equal(subtotal.nextElementSibling?.textContent.replace(/\s/g, ""), "S/600");
  assert.ok(container.textContent.includes("La habitación no tiene capacidad"));
  assert.equal(button("Guardar detalles").disabled, true);
  await fill("rooms[1].room.adults", "2");
  await until(() => !button("Guardar detalles").disabled, "Corrected occupancy must allow saving");
  assert.equal(container.textContent.includes("La habitación no tiene capacidad"), false);
});

it("checks in an unassigned compact reservation directly and never reverts its status on a later details save", async () => {
  let saved = detail();
  saved.rooms[0].roomId = null;
  saved.rooms[0].roomNumber = null;
  const writes: WorkflowCommand[] = [];
  mockApi(
    async (path, command) => {
      assert.ok(path.endsWith("/commands"));
      writes.push(command);
      for (const action of command.actions) {
        if (action.type === "set-status") saved = { ...saved, status: action.status };
        if (action.type === "notes") saved = { ...saved, notes: action.notes };
      }
      return Response.json(saved);
    },
    { reservation: () => saved },
  );
  await render(
    React.createElement(dialogs.RoomBookingDialog, {
      target: {
        mode: "edit",
        reservationId: saved.id,
        roomId: "room-1",
        number: "101",
        typeName: "Doble",
      },
      onClose: () => {},
      onViewReservation: () => {},
    }),
  );
  await until(() => window.document.body.textContent.includes("Hacer check-in"));
  await React.act(async () => button("Hacer check-in").click());
  await until(() => window.document.body.textContent.includes("Hacer check-out"));
  assert.deepEqual(writes[0].actions, [{ type: "set-status", status: "checked_in" }]);
  await fill("notes", "Llegó sin equipaje");
  await React.act(async () => button("Guardar detalles").click());
  await until(() => writes.length === 2 && button("Descartar cambios").disabled);
  assert.deepEqual(writes[1].actions, [{ type: "notes", notes: "Llegó sin equipaje" }]);
  assert.equal(saved.status, "checked_in");
  assert.equal(saved.checkIn, "2026-10-14");
  assert.equal(saved.checkOut, "2026-10-16");
});

it("checks out directly in the compact dialog, blocks duplicate/close attempts and retries the same ID", async () => {
  let saved = { ...detail(), status: "checked_in" };
  const writes: WorkflowCommand[] = [];
  let finish!: (response: Response) => void;
  let closed = 0;
  mockApi(
    async (_path, command) => {
      writes.push(command);
      if (writes.length === 1)
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      saved = { ...saved, status: "checked_out" };
      return Response.json(saved);
    },
    { reservation: () => saved },
  );
  try {
    await render(
      React.createElement(dialogs.RoomBookingDialog, {
        target: {
          mode: "edit",
          reservationId: saved.id,
          roomId: "room-1",
          number: "101",
          typeName: "Doble",
        },
        onClose: () => {
          closed++;
        },
        onViewReservation: () => {},
      }),
    );
    await until(() => window.document.body.textContent.includes("Hacer check-out"));
    const checkout = button("Hacer check-out");
    await React.act(async () => {
      checkout.click();
      checkout.click();
    });
    await until(() => button("Cerrar").disabled);
    assert.equal(writes.length, 1);
    assert.equal(button("Cambiar estado").disabled, true);
    assert.equal(button("Guardando estado…").disabled, true);
    const unloading = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unloading);
    assert.equal(
      unloading.defaultPrevented,
      true,
      "Pending lifecycle writes must protect browser unload",
    );
    await React.act(async () => {
      window.document
        .querySelector('[role="dialog"]')!
        .dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(closed, 0);
    await React.act(async () =>
      finish(Response.json({ error: "Temporary save failure" }, { status: 503 })),
    );
    await until(() => window.document.body.textContent.includes("Hacer check-out"));
    await React.act(async () => button("Hacer check-out").click());
    await until(() => saved.status === "checked_out" && !button("Cerrar").disabled);
    assert.deepEqual(writes[0], writes[1]);
    assert.deepEqual(writes[1].actions, [{ type: "set-status", status: "checked_out" }]);
    assert.equal(saved.balanceCents, 30000);
    assert.equal(saved.checkOut, "2026-10-16");
    const finished = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(finished);
    assert.equal(finished.defaultPrevented, false);
  } finally {
    if (finish) await React.act(async () => finish(Response.json(saved)));
  }
});

it.each(["notes", "guest", "payment", "discount"] as const)(
  "preserves a dirty compact %s draft and disables lifecycle actions until saved or discarded",
  async (draft) => {
    const writes: WorkflowCommand[] = [];
    mockApi(async (_path, command) => {
      writes.push(command);
      return Response.json(detail());
    });
    await render(React.createElement(dialogs.BookingEditor, { detail: detail() }));
    if (draft === "notes") await fill("notes", "No perder esta nota");
    if (draft === "guest") {
      await React.act(async () => button("Huéspedes").click());
      await fill("fullName", "Huésped pendiente");
    }
    if (draft === "payment") {
      await React.act(async () => button("Pagos").click());
      await fill("amount", "75");
    }
    if (draft === "discount") {
      const input = container.querySelector<HTMLInputElement>('[aria-label="Descuento en soles"]')!;
      await fillControl(input, "10");
    }
    await until(
      () => button("Cambiar estado").disabled,
      "Dirty draft must block lifecycle actions",
    );
    assert.equal(button("Hacer check-in").disabled, true);
    assert.match(container.textContent, /Guarda o descarta los cambios antes de cambiar el estado/);
    await React.act(async () => button("Hacer check-in").click());
    assert.equal(writes.length, 0);
    if (draft === "notes") {
      assert.equal(control("notes").value, "No perder esta nota");
      await React.act(async () => button("Descartar cambios").click());
      await until(
        () => !button("Hacer check-in").disabled,
        "Discard must unlock lifecycle actions",
      );
      await React.act(async () => button("Hacer check-in").click());
      await until(() => writes.length === 1, "Check-in must work after explicit discard");
    }
    if (draft === "guest") assert.equal(control("fullName").value, "Huésped pendiente");
    if (draft === "payment") assert.equal(control("amount").value, "75");
    if (draft === "discount")
      assert.equal(
        container.querySelector<HTMLInputElement>('[aria-label="Descuento en soles"]')!.value,
        "10",
      );
  },
);

it.each(["guest", "payment"] as const)(
  "protects a dirty nested compact %s editor from lifecycle actions",
  async (kind) => {
    const initial = detail();
    initial.stayingGuests = [
      {
        id: "9b73e6c7-c684-4c4b-a205-b63e3c91a839",
        fullName: "Luis Pérez",
        email: null,
        phone: null,
        documentType: null,
        documentNumber: null,
        reservationRoomId: null,
      },
    ];
    initial.payments = [
      {
        id: "payment-1",
        reservationId: initial.id,
        amountCents: 5000,
        method: "cash",
        paymentDate: "2026-10-14",
        reference: null,
        notes: null,
        createdAt: "2026-10-14T12:00:00Z",
      },
    ];
    let writes = 0;
    mockApi(async () => {
      writes++;
      return Response.json(initial);
    });
    await render(React.createElement(dialogs.BookingEditor, { detail: initial }));
    await React.act(async () => button(kind === "guest" ? "Huéspedes" : "Pagos").click());
    const actions = window.document.querySelector<HTMLButtonElement>(
      kind === "guest"
        ? '[aria-label="Acciones de Luis Pérez"]'
        : '[aria-label^="Acciones del pago"]',
    )!;
    assert.ok(actions);
    await React.act(async () => actions.click());
    const edit = Array.from(
      window.document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((item) => item.textContent === "Editar")!;
    await React.act(async () => edit.click());
    const popup = window.document.querySelector('[role="dialog"]')!;
    const input = popup.querySelector<HTMLInputElement>(
      kind === "guest" ? '[name="fullName"]' : '[name="amount"]',
    )!;
    await fillControl(input, kind === "guest" ? "Luis Corregido" : "80");
    await until(() => button("Cambiar estado").disabled);
    await React.act(async () => button("Hacer check-in").click());
    assert.equal(writes, 0);
    assert.equal(input.value, kind === "guest" ? "Luis Corregido" : "80");
    assert.match(container.textContent, /Guarda o descarta los cambios/);
  },
);

for (const [status, label, code, field] of [
  ["confirmed", "Confirmada…", "not enough rooms available for those dates", "roomTypeId"],
  ["checked_in", "Check-in…", "room is already assigned for those dates", "roomId"],
  ["checked_out", "Check-out…", "not enough rooms available for those dates", "roomTypeId"],
] as const) {
  it(`requires fresh compact restoration confirmation to ${status} and blocks ${field} conflicts`, async () => {
    const initial = {
      ...detail(),
      status: "cancelled",
      cancelledAt: "2026-10-14T12:00:00Z",
      subtotalCents: 0,
      totalCents: 0,
      balanceCents: 0,
    };
    const previews: WorkflowCommand[] = [];
    const writes: WorkflowCommand[] = [];
    mockApi(async (path, command) => {
      if (path.endsWith("/preview")) {
        previews.push(command);
        return previewResponse(detail(), [{ code, field, roomIndex: 0 }]);
      }
      writes.push(command);
      return Response.json(initial);
    });
    await render(React.createElement(dialogs.BookingEditor, { detail: initial }));
    await statusAction(label);
    await until(() => window.document.body.textContent.includes("Habitación 1:"));
    assert.equal(writes.length, 0);
    assert.deepEqual(previews[0].actions, [{ type: "set-status", status }]);
    assert.equal(button("Guardar cambios").disabled, true);
    await React.act(async () => button("Guardar cambios").click());
    assert.equal(writes.length, 0);
    if (status === "confirmed") {
      await React.act(async () => button("Cerrar").click());
      await statusAction(label);
      await until(() => previews.length === 2);
      assert.notEqual(previews[0].requestId, previews[1].requestId);
    }
  });
}

it.each(["notes", "status"] as const)(
  "allows %s corrections without changing a saved room above its current child limit",
  async (correction) => {
    const initial = detail();
    initial.rooms[0].adults = 2;
    initial.rooms[0].children = 3;
    const actions: WorkflowCommand["actions"] =
      correction === "notes"
        ? [{ type: "notes", notes: "Late arrival" }]
        : [{ type: "set-status", status: "checked_in" }];
    const writes: WorkflowCommand[] = [];
    mockApi(async (path, command) => {
      const saved = {
        ...initial,
        notes: correction === "notes" ? "Late arrival" : null,
        status: correction === "status" ? "checked_in" : "confirmed",
      };
      if (path.endsWith("/preview")) return previewResponse(saved);
      writes.push(command);
      return Response.json(saved);
    });
    await render(
      React.createElement(dialogs.BookingEditor, {
        detail: initial,
        onRefresh: () => {},
      }),
    );
    if (correction === "notes") await fill("notes", "Late arrival");
    else await statusAction("Check-in");
    if (correction === "notes")
      await until(
        () => !button("Guardar detalles").disabled,
        "Unchanged occupancy must not block corrections",
      );
    assert.equal(container.textContent.includes("no tiene capacidad"), false);
    if (correction === "notes") await submit();
    await until(() => writes.length === 1, "The correction must save");
    assert.deepEqual(writes[0].actions, actions);
  },
);

it.each(["occupancy", "assignment", "dates", "restoration"] as const)(
  "revalidates a grandfathered room when changing %s",
  async (change) => {
    const initial = detail();
    initial.rooms[0].adults = 2;
    initial.rooms[0].children = 3;
    if (change === "restoration") initial.status = "cancelled";
    let writes = 0;
    mockApi(async (path) => {
      if (path.endsWith("/preview"))
        return previewResponse(initial, [
          { code: "too many guests for this room type", roomIndex: 0, field: "occupancy" },
        ]);
      writes++;
      return Response.json(initial);
    });
    await render(
      React.createElement(dialogs.BookingEditor, {
        detail: initial,
        onRefresh: () => {},
      }),
    );
    await flush();
    assert.equal(container.textContent.includes("no tiene capacidad"), false);
    if (change === "occupancy") await fill("rooms[0].room.children", "4");
    else if (change === "assignment") await choose("Hab.", "Sin asignar");
    else if (change === "restoration") await statusAction("Confirmada…");
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
    if (change === "restoration") {
      assert.equal(button("Guardar cambios").disabled, true);
      await React.act(async () => button("Guardar cambios").click());
    } else await submit();
    assert.equal(writes, 0);
  },
);

it("previews and saves added unassigned rooms after check-in and allows clearing assignments", async () => {
  const initial = { ...detail(), status: "checked_in" };
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
  // Match the dialog's subscription to the saved reservation cache.
  client.setQueryData(["reservation", initial.id], initial);
  function Editor() {
    const reservation = query.useQuery<ReservationDetail>({
      queryKey: ["reservation", initial.id],
      queryFn: async () => initial,
      staleTime: Infinity,
    });
    return React.createElement(dialogs.BookingEditor, {
      detail: reservation.data!,
      onRefresh: () => {},
    });
  }
  await render(React.createElement(Editor));
  await choose("Hab.", "Sin asignar");
  await React.act(async () => button("Agregar habitación").click());
  await until(() => !button("Guardar detalles").disabled, "Added room must have a valid preview");
  assert.ok(
    previews.some((command) => command.actions.some((action) => action.type === "add-room")),
  );
  const subtotal = Array.from(window.document.querySelectorAll("dt")).find(
    (item) => item.textContent === "Importe habitaciones",
  )!;
  assert.equal(subtotal.nextElementSibling?.textContent.replace(/\s/g, ""), "S/600");
  assert.ok(window.document.body.textContent.includes("Vista previa"));
  await submit();
  await until(() => writes.length === 1, "Unassigned rooms must save after check-in");
  assert.ok(
    writes[0].actions.some((action) => action.type === "edit-room" && action.room.roomId === null),
  );
  assert.ok(
    writes[0].actions.some((action) => action.type === "add-room" && action.room.roomId === null),
  );
  await until(() => button("Guardar detalles").disabled, "Successful save must reset changes");
});

it("retries a failed validation preview without losing edits and re-enables saving", async () => {
  const previews: WorkflowCommand[] = [];
  mockApi(async (path, command) => {
    assert.equal(path, "/reservations/reservation-1/preview");
    previews.push(command);
    return previews.length === 1
      ? Response.json({ error: "Temporary preview failure" }, { status: 503 })
      : previewResponse(detail());
  });
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: detail(),
      onRefresh: () => {},
    }),
  );
  await flush();
  await fill("rooms[0].room.adults", "2");
  await until(
    () => window.document.body.textContent.includes("Temporary preview failure"),
    "Preview failure must appear",
  );
  assert.equal(button("Guardar detalles").disabled, true);
  await React.act(async () => button("Reintentar").click());
  await until(() => !button("Guardar detalles").disabled, "Successful retry must permit saving");
  assert.equal(control("rooms[0].room.adults").value, "2");
  assert.equal(previews.length, 2);
  assert.deepEqual(previews[0], previews[1]);
});

for (const succeeds of [true, false]) {
  it(`blocks closing during a save and unlocks after ${succeeds ? "success" : "failure"}`, async () => {
    let finish!: (response: Response) => void;
    let requests = 0;
    let closed = 0;
    let viewed = 0;
    try {
      mockApi(async (path) => {
        assert.equal(path, "/reservations/reservation-1/commands");
        requests++;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      });
      await render(
        React.createElement(dialogs.RoomBookingDialog, {
          target: {
            mode: "edit",
            reservationId: "reservation-1",
            roomId: "room-1",
            number: "101",
            typeName: "Doble",
          },
          onClose: () => {
            closed++;
          },
          onViewReservation: () => {
            viewed++;
          },
        }),
      );
      await until(
        () =>
          !!container.querySelector('[name="notes"]') ||
          !!window.document.querySelector('[name="notes"]'),
        "Reservation must load",
      );
      // Dialog content renders through a portal.
      const popup = window.document.querySelector('[role="dialog"]')!;
      const input = popup.querySelector<HTMLTextAreaElement>('[name="notes"]')!;
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(
          input,
          "Saved note",
        );
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
      await React.act(async () =>
        popup
          .querySelector("form")!
          .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })),
      );
      await until(() => requests === 1, "Save must begin");
      await until(() => button("Cerrar").disabled, "Pending save must disable closing");
      await React.act(async () => {
        popup.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        const link = popup.querySelector<HTMLButtonElement>('[aria-label="Ver reserva completa"]')!;
        link.click();
      });
      assert.equal(closed, 0);
      assert.equal(viewed, 0);
      assert.equal(window.document.body.textContent.includes("Descartar y salir"), false);
      await React.act(async () =>
        finish(
          succeeds
            ? Response.json({ ...detail(), notes: "Saved note" })
            : Response.json({ error: "Temporary save failure" }, { status: 503 }),
        ),
      );
      await until(() => !button("Cerrar").disabled, "Completed save must unlock closing");
      await React.act(async () => button("Cerrar").click());
      if (!succeeds) {
        assert.equal(closed, 0);
        await React.act(async () => button("Descartar y salir").click());
      }
      assert.equal(closed, 1);
    } finally {
      if (finish) await React.act(async () => finish(Response.json(detail())));
    }
  });
}

it("retries a failed cancellation preview without reopening the confirmation", async () => {
  let requests = 0;
  mockApi(async (path) => {
    assert.equal(path, "/reservations/reservation-1/preview");
    return ++requests === 1
      ? Response.json({ error: "Temporary cancellation failure" }, { status: 503 })
      : previewResponse({
          ...detail(),
          status: "cancelled",
          totalCents: 0,
          balanceCents: 0,
        });
  });
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: detail(),
      onRefresh: () => {},
    }),
  );
  await statusAction("Cancelar reserva…");
  await until(
    () => window.document.body.textContent.includes("Temporary cancellation failure"),
    "Cancellation preview error must appear",
  );
  assert.equal(button("Confirmar").disabled, true);
  await React.act(async () => button("Reintentar").click());
  await until(
    () => !button("Confirmar").disabled,
    "Successful cancellation preview retry must permit confirming",
  );
  assert.equal(requests, 2);
});

it("preserves a failed payment draft and clears it only after a successful retry", async () => {
  let calls = 0;
  await render(
    React.createElement(forms.PaymentForm, {
      detail: detail(),
      disabled: false,
      onDirtyChange: () => {},
      onReady: async () => {
        if (++calls === 1) throw new Error("Temporary payment failure");
      },
    }),
  );
  await fill("amount", "75");
  await submit();
  await flush();
  assert.equal(control("amount").value, "75");
  await submit();
  await flush();
  assert.equal(control("amount").value, "");
  assert.equal(calls, 2);
});

it("retains the cancellation reason and retries the same command after a failed save", async () => {
  const previews: WorkflowCommand[] = [];
  const writes: WorkflowCommand[] = [];
  mockApi(async (path, command) => {
    if (path.endsWith("/preview")) {
      previews.push(command);
      return previewResponse({
        ...detail(),
        status: "cancelled",
        totalCents: 0,
        balanceCents: 0,
      });
    }
    assert.equal(path, "/reservations/reservation-1/commands");
    writes.push(command);
    return writes.length === 1
      ? Response.json({ error: "Temporary cancellation save failure" }, { status: 503 })
      : Response.json({ ...detail(), status: "cancelled" });
  });
  await render(
    React.createElement(dialogs.BookingEditor, {
      detail: detail(),
      onRefresh: () => {},
    }),
  );
  await statusAction("Cancelar reserva…");
  await until(() => !button("Confirmar").disabled, "Cancellation preview must finish");
  const reason = "  Cambio de planes  ";
  await fill("reason", reason);
  await React.act(async () => button("Confirmar").click());
  await until(
    () => writes.length === 1 && !button("Confirmar").disabled,
    "Failed cancellation save must allow retrying",
  );
  assert.equal(control("reason").value, reason);
  await React.act(async () => button("Confirmar").click());
  await until(
    () => !window.document.querySelector('[role="dialog"]'),
    "Successful cancellation must close the confirmation",
  );
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1]);
  assert.deepEqual(writes[1].actions, [
    { type: "set-status", status: "cancelled", reason: "Cambio de planes" },
  ]);
  assert.deepEqual(previews[0].actions, [{ type: "set-status", status: "cancelled" }]);
});

for (const discountSucceeds of [true, false]) {
  it(`blocks lifecycle overlap while a discount autosave ${discountSucceeds ? "succeeds" : "fails"}`, async () => {
    let saved = detail();
    const writes: WorkflowCommand[] = [];
    let finishDiscount: (() => void) | undefined;
    mockApi(async (path, command) => {
      if (path.endsWith("/preview"))
        return previewResponse({
          ...saved,
          status: "cancelled",
          subtotalCents: 0,
          discountCents: 0,
          totalCents: 0,
          balanceCents: 0,
        });
      assert.ok(path.endsWith("/commands"));
      writes.push(command);
      // Model the backend loading its full snapshot when each request starts.
      const original = structuredClone(saved);
      const action = command.actions[0];
      if (action.type === "set-discount")
        return new Promise<Response>((resolve) => {
          let finished = false;
          finishDiscount = () => {
            if (finished) return;
            finished = true;
            if (!discountSucceeds) {
              resolve(Response.json({ error: "Temporary discount failure" }, { status: 503 }));
              return;
            }
            saved = {
              ...original,
              savedDiscountCents: action.amountCents,
              discountCents: action.amountCents,
              totalCents: original.subtotalCents - action.amountCents,
              balanceCents: original.subtotalCents - action.amountCents,
            };
            resolve(Response.json(saved));
          };
        });
      assert.equal(action.type, "set-status");
      saved = {
        ...original,
        status: "cancelled",
        cancelledAt: "2026-10-14T12:00:00Z",
        subtotalCents: 0,
        discountCents: 0,
        totalCents: 0,
        balanceCents: 0,
      };
      return Response.json(saved);
    });
    client.setQueryData(["reservation", saved.id], saved);
    function Editor() {
      const reservation = query.useQuery<ReservationDetail>({
        queryKey: ["reservation", saved.id],
        queryFn: async () => saved,
        staleTime: Infinity,
      });
      return React.createElement(dialogs.BookingEditor, {
        detail: reservation.data!,
        onRefresh: () => {},
      });
    }
    try {
      await render(React.createElement(Editor));
      const discount = container.querySelector<HTMLInputElement>(
        '[aria-label="Descuento en soles"]',
      )!;
      assert.ok(discount);
      await fillControl(discount, "10");
      await React.act(async () => {
        discount.dispatchEvent(
          new window.FocusEvent("focusout", {
            bubbles: true,
          }),
        );
      });
      await until(() => writes.length === 1, "Discount autosave must start");
      assert.equal(button("Cambiar estado").disabled, true);
      assert.equal(button("Hacer check-in").disabled, true);
      await React.act(async () => button("Cambiar estado").click());
      await flush(30);
      assert.equal(
        writes.length,
        1,
        "Cancellation must not reach the server while discount autosave is pending",
      );
      assert.equal(window.document.querySelector('[role="dialog"]'), null);
      await React.act(async () => finishDiscount!());
      await until(() => !discount.disabled, "Autosave must settle");
      if (!discountSucceeds) {
        assert.equal(discount.value, "10");
        assert.equal(button("Cambiar estado").disabled, true);
        // Explicitly discard the rejected discount before changing status.
        await fillControl(discount, "0");
      }
      await until(() => !button("Cambiar estado").disabled, "Clean drafts must unlock lifecycle");
      await statusAction("Cancelar reserva…");
      await until(() => !button("Confirmar").disabled, "Fresh cancellation preview must finish");
      await React.act(async () => button("Confirmar").click());
      await until(
        () => writes.length === 2 && !window.document.querySelector('[role="dialog"]'),
        "Cancellation must finish only after autosave settles and explicit confirmation",
      );
      assert.equal(writes[1].actions[0].type, "set-status");
      assert.equal(saved.status, "cancelled");
      assert.equal(saved.savedDiscountCents, discountSucceeds ? 1000 : 0);
      assert.equal(saved.discountCents, 0);
      assert.equal(
        client.getQueryData<ReservationDetail>(["reservation", saved.id])?.status,
        "cancelled",
      );
    } finally {
      if (finishDiscount) await React.act(async () => finishDiscount!());
    }
  });
}
