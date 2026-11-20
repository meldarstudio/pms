import assert from "node:assert/strict";
import { afterEach, beforeAll, beforeEach, describe, it } from "vite-plus/test";
import type {
  ReservationDetail,
  WorkflowAction,
  WorkflowCommand,
  WorkflowPreview,
} from "../src/lib/api.ts";
import { sharedBrowserTest, type BrowserPage, type BrowserTest } from "./browser.ts";

let browser: BrowserTest;
let page: BrowserPage;
let React: BrowserTest["React"];
let commands: typeof import("../src/lib/reservation-commands.ts");
let sent: WorkflowCommand[];

beforeAll(async () => {
  browser = await sharedBrowserTest();
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
  guests: [{ id: "guest-1", fullName: "Ana", email: null, phone: null }],
};

function dropNextCommand() {
  page.api.once("POST", "/reservations/:id/commands", () => {
    throw new TypeError("Failed to fetch");
  });
}

type Commands = ReturnType<typeof commands.useReservationCommands>;
type Result = Awaited<ReturnType<Commands["send"]>>;

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
  it("replays keyed recovery with original actions only while an uncertain command remains", async () => {
    const first = await mountEditor();
    dropNextCommand();
    await React.act(async () => {
      assert.equal((await first.current.send([payment], "financial-return")).status, "failed");
    });
    await unmount();
    const reopened = await mountEditor();
    assert.equal(reopened.current.canReplay([], "financial-return"), true);
    await React.act(async () => {
      assert.equal((await reopened.current.replay("financial-return")).status, "saved");
    });
    assert.deepEqual(sent[1], sent[0]);
    assert.equal(reopened.current.canReplay([], "financial-return"), false);
    await React.act(async () => {
      assert.equal((await reopened.current.replay("financial-return")).status, "failed");
    });
    assert.equal(
      sent.length,
      2,
      "Recovery without retained uncertainty never creates a new payment",
    );
    dropNextCommand();
    await React.act(async () => {
      await reopened.current.send([payment], "financial-return");
    });
    page.client.clear();
    await React.act(async () => {
      assert.equal((await reopened.current.replay("financial-return")).status, "failed");
    });
    assert.equal(sent.length, 3, "Cleared recovery must not mint a new request ID");
  });

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
});

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

  it("ignores an older in-flight preview when a separately saved Payment refreshes it", async () => {
    previewAfterPayments();
    const older = page.api.hold("POST", "/reservations/:id/preview");
    const preview: { current?: ReturnType<typeof commands.useReservationPreview> } = {};
    const editor: { current: Commands } = { current: undefined as never };
    function DiscountEditor() {
      preview.current = commands.useReservationPreview("res-1", [discount], true);
      editor.current = commands.useReservationCommands("res-1");
      return null;
    }
    await page.render(React.createElement(DiscountEditor));
    await page.until(() => older.request !== undefined, "Expected the first preview request");

    assert.equal((await send(editor, [payment])).status, "saved");
    await page.until(
      () => preview.current?.data?.billing.balanceCents === 18000,
      "Expected the preview after the Payment",
    );
    older.release(
      Response.json({
        billing: { ...reservation("res-1"), balanceCents: 28000 },
        validation: { issues: [] },
      }),
    );
    await page.flush(20);

    assert.equal(preview.current?.data?.billing.balanceCents, 18000);
    assert.equal(preview.current?.isFetching, false);
  });
});

describe("refresh after saving", () => {
  let queries: typeof import("../src/lib/queries.ts");

  beforeAll(async () => {
    queries = (await browser.server.ssrLoadModule("/src/lib/queries.ts")) as typeof queries;
  });

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
    assert.equal(reads.length, 1);
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
        expectedRoomId: null,
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
});
