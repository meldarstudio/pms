import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vite-plus/test";
import type {
  ReservationDetail,
  WorkflowAction,
  WorkflowCommand,
  WorkflowPreview,
} from "../src/lib/api.ts";
import { createBrowserTest, type BrowserPage, type BrowserTest } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let React: BrowserTest["React"];
let commands: typeof import("../src/lib/reservation-commands.ts");
/** Command bodies sent to any reservation, in order. */
let sent: WorkflowCommand[];

beforeAll(async () => {
  browser = await createBrowserTest();
  ({ React } = browser);
  commands = (await browser.server.ssrLoadModule(
    "/src/lib/reservation-commands.ts",
  )) as typeof commands;
});

beforeEach(() => {
  page = browser.createPage();
  sent = page.api.bodies<WorkflowCommand>("POST", "/reservations/:id/commands");
  page.api.on("POST", "/reservations/:id/commands", ({ params }) => reservation(params.id));
});

afterEach(async () => {
  await page.cleanup();
});

afterAll(async () => {
  await browser?.close();
});

function reservation(id: string, changes: Partial<ReservationDetail> = {}) {
  return {
    id,
    code: id.toUpperCase(),
    status: "confirmed",
    guestId: "contact-ada",
    guest: { id: "contact-ada", fullName: "Ada Lovelace", email: null, phone: null },
    stayingGuests: [],
    checkIn: "2026-10-22",
    checkOut: "2026-10-24",
    totalCents: 30000,
    subtotalCents: 30000,
    discountCents: 0,
    paidCents: 0,
    balanceCents: 30000,
    payments: [],
    rooms: [],
    ...changes,
  } as unknown as ReservationDetail;
}

const payment: WorkflowAction = {
  type: "add-payment",
  payment: { amountCents: 10000, method: "cash", paymentDate: "2026-10-20" },
};

const stayingGuests: WorkflowAction = {
  type: "set-guests",
  guests: [{ id: "guest-1", fullName: "Ana", email: null, phone: null, reservationRoomId: null }],
};

/** The response a dropped connection gives after the server may have committed. */
function dropNextCommand() {
  page.api.once("POST", "/reservations/:id/commands", () => {
    throw new TypeError("Failed to fetch");
  });
}

type Commands = ReturnType<typeof commands.useReservationCommands>;
type Result = Awaited<ReturnType<Commands["send"]>>;

/** Renders one editor using the module, beside any other views, and returns its hook value. */
async function mountEditor(id = "res-1", Beside: () => null = () => null) {
  const editor: { current: Commands } = { current: undefined as never };
  function Editor() {
    editor.current = commands.useReservationCommands(id);
    return React.createElement("output", null, editor.current.saving ? "saving" : "idle");
  }
  await page.render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Beside),
      React.createElement(Editor),
    ),
  );
  return editor;
}

async function unmount() {
  await page.render(null);
}

type Started = { result: Promise<Result> };

/** Starts a send inside act so the saving flag can render, without waiting for it. */
async function start(editor: { current: Commands }, actions: WorkflowAction[]) {
  const started = {} as Started;
  await React.act(async () => {
    started.result = editor.current.send(actions);
  });
  return started;
}

async function settle(started: Started) {
  let value!: Result;
  await React.act(async () => {
    value = await started.result;
  });
  return value;
}

async function send(editor: { current: Commands }, actions: WorkflowAction[]) {
  return settle(await start(editor, actions));
}

describe("duplicate-safe retry", () => {
  it("resends a lost Payment with the same request ID after its editor closes and reopens", async () => {
    dropNextCommand();
    const first = await mountEditor();
    const failed = await send(first, [payment]);
    assert.equal(failed.status, "failed");
    await unmount();

    const reopened = await mountEditor();
    const retried = await send(reopened, [payment]);

    assert.equal(retried.status, "saved");
    assert.equal(sent.length, 2);
    assert.equal(sent[1].requestId, sent[0].requestId);
    assert.deepEqual(sent[1].actions, [payment]);
  });

  it("records an intentional second identical Payment with a new request ID after the first saved", async () => {
    const editor = await mountEditor();
    assert.equal((await send(editor, [payment])).status, "saved");
    assert.equal((await send(editor, [payment])).status, "saved");

    assert.equal(sent.length, 2);
    assert.notEqual(sent[1].requestId, sent[0].requestId);
  });

  it("keeps a pending Payment retry independent of a Staying guest save", async () => {
    const editor = await mountEditor();
    dropNextCommand();
    await send(editor, [payment]);
    dropNextCommand();
    await send(editor, [stayingGuests]);
    await send(editor, [stayingGuests]);
    await send(editor, [payment]);

    const [lostPayment, lostGuests, guestsRetry, paymentRetry] = sent;
    assert.notEqual(lostGuests.requestId, lostPayment.requestId);
    assert.equal(guestsRetry.requestId, lostGuests.requestId);
    assert.equal(paymentRetry.requestId, lostPayment.requestId);
  });

  it("forgets unsettled saves when the query client is cleared, as on sign-out", async () => {
    const editor = await mountEditor();
    dropNextCommand();
    await send(editor, [payment]);
    page.client.clear();
    await send(editor, [payment]);

    assert.equal(sent.length, 2);
    assert.notEqual(sent[1].requestId, sent[0].requestId);
  });
});

describe("ordering", () => {
  const discount: WorkflowAction = { type: "set-discount", amountCents: 2000 };

  it("sends a second save to the same Reservation only after the first settles", async () => {
    const held = page.api.hold("POST", "/reservations/:id/commands");
    const editor = await mountEditor();
    const first = await start(editor, [discount]);
    const second = await start(editor, [stayingGuests]);
    await page.until(() => held.request !== undefined, "Expected the first save to be sent");
    await page.flush(20);
    assert.equal(sent.length, 1);
    assert.equal(page.container.textContent, "saving");

    held.release(Response.json(reservation("res-1", { discountCents: 2000 })));
    assert.equal((await settle(first)).status, "saved");
    assert.equal((await settle(second)).status, "saved");

    assert.deepEqual(
      sent.map((command) => command.actions[0].type),
      ["set-discount", "set-guests"],
    );
    assert.equal(page.container.textContent, "idle");
  });

  it("joins a double-click to the running save instead of sending it again", async () => {
    const held = page.api.hold("POST", "/reservations/:id/commands");
    const editor = await mountEditor();
    const first = await start(editor, [payment]);
    const again = await start(editor, [payment]);
    await page.until(() => held.request !== undefined, "Expected the save to be sent");

    held.release(Response.json(reservation("res-1", { paidCents: 10000 })));
    const [firstResult, againResult] = [await settle(first), await settle(again)];

    assert.equal(sent.length, 1);
    assert.deepEqual(againResult, firstResult);
    assert.equal(firstResult.status === "saved" && firstResult.reservation.paidCents, 10000);
  });

  it("does not delay saves to a different Reservation", async () => {
    page.api.hold("POST", "/reservations/res-1/commands");
    const first = await mountEditor("res-1");
    void (await start(first, [discount]));
    const other = await mountEditor("res-2");

    assert.equal((await send(other, [discount])).status, "saved");
  });
});

describe("server rejections", () => {
  const contact: WorkflowAction = {
    type: "contact",
    contact: { fullName: "Ada Lovelace", email: "ada@", phone: "+51 999" },
  };
  const dates: WorkflowAction = { type: "dates", checkIn: "2026-10-22", checkOut: "2027-01-22" };

  it.each([
    {
      name: "a future Payment date on the Payment date",
      actions: [payment],
      error: "payment date cannot be in the future",
      fields: { date: "La fecha del pago no puede ser futura." },
    },
    {
      name: "a zero amount on the amount",
      actions: [payment],
      error: "amount cannot be zero",
      fields: { amount: "El importe debe ser distinto de cero." },
    },
    {
      name: "a missing Payment method on the Payment method",
      actions: [payment],
      error: "method is required",
      fields: { method: "Selecciona un método de pago." },
    },
    {
      name: "an invalid Booking contact email on the email",
      actions: [contact],
      error: "invalid email",
      fields: { email: "Ingresa un correo válido." },
    },
    {
      name: "an invalid Contact phone on the phone",
      actions: [contact],
      error: "phone number is too short",
      field: "phone",
      fields: {
        phone: "El número está incompleto. Si es un teléfono fijo, incluye el código de área.",
      },
    },
    {
      name: "a Staying guest outside the Reservation's Reserved rooms on the room",
      actions: [stayingGuests],
      error: "guest room must belong to this reservation",
      fields: { reservationRoomId: "Asigna al huésped a una habitación de esta reserva." },
    },
    {
      name: "a stay longer than 60 nights on the Checkout date",
      actions: [dates],
      error: "stay cannot be longer than 60 nights",
      fields: { checkOut: "La estancia no puede superar las 60 noches." },
    },
    {
      name: "a stay shorter than one night on the Checkout date",
      actions: [dates],
      error: "stay must be at least one night",
      fields: { checkOut: "La estancia debe tener al menos una noche." },
    },
  ])("places $name", async ({ actions, error, field, fields }) => {
    page.api.failOnce(
      "POST",
      "/reservations/:id/commands",
      400,
      { error },
      field ? { "X-Error-Field": field } : undefined,
    );
    const editor = await mountEditor();

    assert.deepEqual(await send(editor, actions), { status: "rejected", fields });
  });

  it.each([
    {
      name: "a rejection without a field",
      actions: [payment],
      fail: () =>
        page.api.failOnce("POST", "/reservations/:id/commands", 409, {
          error: "reservation changed while saving; please try again",
        }),
      message: "La reserva cambió mientras se guardaba. Intenta guardar de nuevo.",
    },
    {
      name: "a field rejection the sent actions do not edit",
      actions: [stayingGuests],
      fail: () =>
        page.api.failOnce("POST", "/reservations/:id/commands", 400, {
          error: "payment date cannot be in the future",
        }),
      message: "La fecha del pago no puede ser futura.",
    },
    {
      name: "a lost connection",
      actions: [payment],
      fail: dropNextCommand,
      message: "No se pudo conectar con el servidor. Inténtalo de nuevo.",
    },
  ])("reports $name as one Spanish message", async ({ actions, fail, message }) => {
    fail();
    const editor = await mountEditor();

    assert.deepEqual(await send(editor, actions), { status: "failed", message });
  });
});

/** Answers previews with the balance after the Payments recorded so far. */
function previewAfterPayments() {
  const previews = page.api.bodies<WorkflowCommand>("POST", "/reservations/:id/preview");
  page.api.on("POST", "/reservations/:id/preview", ({ params }): WorkflowPreview => {
    const paidCents = sent.filter((command) => command.actions[0].type === "add-payment").length;
    return {
      billing: {
        ...reservation(params.id),
        discountCents: 2000,
        totalCents: 28000,
        paidCents: paidCents * 10000,
        balanceCents: 28000 - paidCents * 10000,
      },
      validation: {
        issues: paidCents ? [] : [{ code: "no availability", roomIndex: 0, field: "roomTypeId" }],
      },
    };
  });
  return previews;
}

describe("bill preview", () => {
  const discount: WorkflowAction = { type: "set-discount", amountCents: 2000 };

  it("returns the resulting bill and validation issues, and re-reads after a save to the Reservation", async () => {
    const previews = previewAfterPayments();
    const preview: { current?: ReturnType<typeof commands.useReservationPreview> } = {};
    const editor: { current: Commands } = { current: undefined as never };
    function DiscountEditor() {
      preview.current = commands.useReservationPreview("res-1", [discount], true);
      editor.current = commands.useReservationCommands("res-1");
      return null;
    }
    await page.render(React.createElement(DiscountEditor));
    await page.until(() => preview.current?.data !== undefined, "Expected a preview");
    assert.equal(preview.current?.data?.billing.balanceCents, 28000);
    assert.deepEqual(preview.current?.data?.validation.issues, [
      { code: "no availability", roomIndex: 0, field: "roomTypeId" },
    ]);
    assert.deepEqual(previews[0].actions, [discount]);

    assert.equal((await send(editor, [payment])).status, "saved");
    await page.until(
      () => preview.current?.data?.billing.balanceCents === 18000,
      "Expected the preview to re-read after the Payment",
    );
    assert.deepEqual(preview.current?.data?.validation.issues, []);
    assert.equal(previews.length, 2);
  });

  it("does not ask the server while disabled", async () => {
    const previews = previewAfterPayments();
    function Hidden() {
      commands.useReservationPreview("res-1", [discount], false);
      return null;
    }
    await page.render(React.createElement(Hidden));
    await page.flush(20);

    assert.equal(previews.length, 0);
  });
});

describe("refresh after saving", () => {
  let queries: typeof import("../src/lib/queries.ts");

  beforeAll(async () => {
    queries = (await browser.server.ssrLoadModule("/src/lib/queries.ts")) as typeof queries;
  });

  /** Renders an editor beside the views a save must refresh; returns what they show. */
  async function mountWithViews(otherReservations: { id: string; guestId: string }[] = []) {
    page.api.on("GET", "/reservations/:id", ({ params }) =>
      reservation(params.id, {
        guestId: otherReservations.find((other) => other.id === params.id)?.guestId,
      }),
    );
    const shown: { reservation?: ReservationDetail } = {};
    function Views() {
      shown.reservation = queries.useReservation("res-1").data;
      queries.useReservationList({ sort: "checkIn", direction: "asc", limit: 25, offset: 0 });
      queries.useCalendar("2026-10-20", "2026-10-26");
      for (const other of otherReservations) queries.useReservation(other.id);
      return null;
    }
    const editor = await mountEditor("res-1", Views);
    await page.until(() => shown.reservation !== undefined, "Expected the Reservation");
    return { editor, shown };
  }

  it("shows the saved Reservation and re-reads the reservations list and calendar", async () => {
    const lists = page.api.requests("GET", "/reservations");
    const calendars = page.api.requests("GET", "/calendar");
    const reads = page.api.requests("GET", "/reservations/res-1");
    const { editor, shown } = await mountWithViews();
    await page.until(() => lists.length === 1 && calendars.length === 1);
    page.api.once("POST", "/reservations/:id/commands", () =>
      reservation("res-1", { paidCents: 10000, balanceCents: 20000 }),
    );

    await send(editor, [payment]);

    await page.until(() => lists.length === 2 && calendars.length === 2);
    await page.until(() => shown.reservation?.balanceCents === 20000, "Expected the saved bill");
    // The page shows the saved Reservation from the save itself, without re-reading it.
    assert.equal(reads.length, 1);
  });

  it("re-reads the Booking contact's other Reservations after a contact change", async () => {
    const sameContact = page.api.requests("GET", "/reservations/res-2");
    const { editor } = await mountWithViews([{ id: "res-2", guestId: "contact-ada" }]);
    await page.until(() => sameContact.length === 1);

    await send(editor, [
      { type: "contact", contact: { fullName: "Ada Byron", email: null, phone: null } },
    ]);

    await page.until(() => sameContact.length === 2, "Expected the other Reservation re-read");
  });
});

describe("room assignment", () => {
  const target = {
    id: "line-1",
    reservationId: "res-1",
    guestName: "Ada Lovelace",
    status: "confirmed",
    checkIn: "2026-10-22",
    checkOut: "2026-10-24",
    roomId: null,
    roomTypeId: "double",
    roomIndex: 0,
    roomCount: 1,
  };
  const line = { id: "line-1", roomTypeId: "double", roomId: null, adults: 2, children: 0 };

  type Assignment = ReturnType<typeof commands.useRoomAssignmentCommand>;

  async function mountCalendar() {
    const calendar: { current: Assignment } = { current: undefined as never };
    function Calendar() {
      calendar.current = commands.useRoomAssignmentCommand();
      return null;
    }
    await page.render(React.createElement(Calendar));
    return calendar;
  }

  async function assign(calendar: { current: Assignment }) {
    let result!: Result;
    await React.act(async () => {
      result = await calendar.current.assign(target, "room-2");
    });
    return result;
  }

  it("re-reads the Reservation and sends a new request ID on every attempt, even after a lost connection", async () => {
    const reads = page.api.requests("GET", "/reservations/res-1");
    page.api.on("GET", "/reservations/res-1", () =>
      reservation("res-1", { rooms: [line] } as never),
    );
    const calendar = await mountCalendar();
    dropNextCommand();

    assert.equal((await assign(calendar)).status, "failed");
    assert.equal((await assign(calendar)).status, "saved");

    assert.equal(reads.length, 2);
    assert.equal(sent.length, 2);
    assert.notEqual(sent[1].requestId, sent[0].requestId);
    assert.deepEqual(sent[1].actions, [
      {
        type: "edit-room",
        lineId: "line-1",
        room: { roomTypeId: "double", roomId: "room-2", adults: 2, children: 0 },
      },
    ]);
  });

  it("does not save over a colleague's assignment made since the calendar was read", async () => {
    page.api.on("GET", "/reservations/res-1", () =>
      reservation("res-1", { rooms: [{ ...line, roomId: "room-10" }] } as never),
    );
    const calendar = await mountCalendar();

    assert.deepEqual(await assign(calendar), {
      status: "failed",
      message: "La habitación cambió. Actualiza la reserva.",
    });
    assert.equal(sent.length, 0);
  });

  it("waits for a running save to the same Reservation before re-reading it", async () => {
    const reads = page.api.requests("GET", "/reservations/res-1");
    page.api.on("GET", "/reservations/res-1", () =>
      reservation("res-1", { rooms: [line] } as never),
    );
    const held = page.api.hold("POST", "/reservations/:id/commands");
    const calendar: { current: Assignment } = { current: undefined as never };
    function Calendar() {
      calendar.current = commands.useRoomAssignmentCommand();
      return null;
    }
    const editor = await mountEditor("res-1", Calendar);
    const discount = await start(editor, [{ type: "set-discount", amountCents: 2000 }]);
    let assigned!: Promise<Result>;
    await React.act(async () => {
      assigned = calendar.current.assign(target, "room-2");
    });
    await page.until(() => held.request !== undefined, "Expected the Discount save to be sent");
    await page.flush(20);
    assert.equal(reads.length, 0);

    held.release(Response.json(reservation("res-1")));
    await settle(discount);
    assert.equal((await settle({ result: assigned })).status, "saved");
    assert.equal(reads.length, 1);
  });
});
