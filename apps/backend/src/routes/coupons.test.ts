import type { WorkflowAction } from "@pms/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { presentReservation } from "../present";
import {
  createTestDb,
  seedReservation,
  seedRooms,
  seedRoomType,
  type TestDb,
} from "../test-support/d1";

type Detail = ReturnType<typeof presentReservation>;

let db: TestDb;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type", { "room-101": "101", "room-102": "102", "room-103": "103" });
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

async function stay(checkIn: string, checkOut: string, nightlyRateCents = 10000) {
  const response = await db.request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    checkIn,
    checkOut,
    guest: { fullName: "Ada Lovelace" },
    rooms: [{ roomTypeId: "type", adults: 1, children: 0, nightlyRateCents }],
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<Detail>;
}

async function command(d: { id: string }, actions: WorkflowAction[], status = 200) {
  const response = await db.request(`/reservations/${d.id}/commands`, "POST", {
    requestId: crypto.randomUUID(),
    actions,
  });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(status);
  return body as Detail;
}

const pay = (amountCents: number, method: "cash" | "card" = "cash"): WorkflowAction => ({
  type: "add-payment",
  payment: { amountCents, method, paymentDate: "2026-10-10" },
});
const cancel: WorkflowAction = { type: "set-status", status: "cancelled" };
const issue = (amountCents: number): WorkflowAction => ({
  type: "issue-coupon",
  amountCents,
  guestAccepted: true,
});

async function freeCancellationOwing(paidCents: number) {
  const d = await stay("2026-10-20", "2026-10-22");
  return command(d, [pay(paidCents), cancel]);
}

describe("issuing future-stay coupons", () => {
  it("turns S/200 owed back into a S/200 coupon with no refund or payment recorded", async () => {
    const owed = await freeCancellationOwing(20000);
    expect(owed.refundDueCents).toBe(20000);

    const issued = await command(owed, [issue(20000)]);

    expect(issued).toMatchObject({
      paidCents: 20000,
      refundedCents: 0,
      pendingRefundCents: 0,
      couponIssuedCents: 20000,
      balanceCents: 0,
      refundDueCents: 0,
      refunds: [],
      payments: owed.payments,
    });
    expect(issued.coupons).toEqual([
      {
        id: expect.any(String),
        code: expect.stringMatching(/^[A-Z2-9]{10}$/),
        valueCents: 20000,
        balanceCents: 20000,
        issuedAt: "2026-10-10T15:00:00.000Z",
        issuedBy: "hotelmanantial",
        expiresOn: "2027-10-10",
      },
    ]);
  });

  it("lists a reservation whose refund due became a coupon as settled, and the rest as still due", async () => {
    const whole = await freeCancellationOwing(20000);
    const part = await freeCancellationOwing(20000);
    await command(whole, [issue(20000)]);
    const partial = await command(part, [issue(5000)]);
    expect(partial).toMatchObject({ couponIssuedCents: 5000, refundDueCents: 15000 });

    const list = async (query: string) =>
      ((await (await db.request(`/reservations?${query}`)).json()) as Detail[]).map((r) => [
        r.id,
        r.refundDueCents,
        r.coupons.map((c) => c.valueCents),
      ]);
    expect(await list("refund=due")).toEqual([[part.id, 15000, [5000]]]);
    expect(await list("balance=settled")).toEqual([[whole.id, 0, [20000]]]);
  });

  it("limits coupons to the refund due less requested refunds and value already converted", async () => {
    const owed = await freeCancellationOwing(20000);
    const requested = await command(owed, [
      {
        type: "request-refund",
        paymentId: owed.payments[0].id,
        amountCents: 6000,
        method: "transfer",
        reason: "Guest asked for part in cash",
      },
    ]);
    expect(await command(requested, [issue(14001)], 400)).toEqual({
      error: "coupon exceeds the refund due",
    });
    const first = await command(requested, [issue(10000)]);
    expect(await command(first, [issue(4001)], 400)).toEqual({
      error: "coupon exceeds the refund due",
    });
    vi.setSystemTime(new Date("2026-10-10T16:00:00Z"));
    const second = await command(first, [issue(4000)]);
    expect(second).toMatchObject({
      couponIssuedCents: 14000,
      pendingRefundCents: 6000,
      refundDueCents: 6000,
    });
    expect(second.coupons.map((c) => c.valueCents)).toEqual([10000, 4000]);
    expect(await command(second, [issue(1)], 400)).toEqual({
      error: "coupon exceeds the refund due",
    });
  });

  it("issues after a reasoned waiver of a late charge in the same command, never above what is owed", async () => {
    const d = await stay("2026-10-11", "2026-10-13", 20000);
    const late = await command(d, [pay(20000), cancel]);
    expect(late.refundDueCents).toBe(0);
    expect(await command(late, [issue(1)], 400)).toEqual({
      error: "coupon exceeds the refund due",
    });
    const waived = await command(late, [
      { type: "waive-cancellation-charge", amountCents: 20000, reason: "Family emergency" },
      issue(20000),
    ]);
    expect(waived).toMatchObject({ refundDueCents: 0, couponIssuedCents: 20000 });
  });

  it("requires the guest's recorded acceptance", async () => {
    const owed = await freeCancellationOwing(20000);
    const response = await db.request(`/reservations/${owed.id}/commands`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [{ type: "issue-coupon", amountCents: 20000, guestAccepted: false }],
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "guest acceptance is required" });
  });
});

const redeem = (code: string, amountCents: number): WorkflowAction => ({
  type: "redeem-coupon",
  code,
  amountCents,
});

async function couponWorth(valueCents: number) {
  const owed = await freeCancellationOwing(valueCents);
  const issued = await command(owed, [issue(valueCents)]);
  return issued.coupons[0];
}

async function lookup(code: string) {
  const response = await db.request(`/coupons/${code}`);
  return { status: response.status, body: await response.json() };
}

describe("redeeming future-stay coupons", () => {
  it("applies S/150 of a S/200 coupon to a Non-refundable stay, leaving S/50 with the original expiry", async () => {
    const coupon = await couponWorth(20000);
    vi.setSystemTime(new Date("2026-12-01T15:00:00Z"));
    await db.signIn();
    const response = await db.request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      checkIn: "2027-01-10",
      checkOut: "2027-01-12",
      guest: { fullName: "Grace Hopper" },
      ratePlan: "non_refundable",
      rooms: [{ roomTypeId: "type", adults: 1, children: 0 }],
    });
    const later = (await response.json()) as Detail;
    expect(later).toMatchObject({ totalCents: 18000, requiredInitialPaymentCents: 18000 });

    const redeemed = await command(later, [redeem(coupon.code.toLowerCase(), 15000)]);

    expect(redeemed).toMatchObject({
      totalCents: 18000,
      paidCents: 0,
      couponAppliedCents: 15000,
      balanceCents: 3000,
      requiredInitialPaymentCents: 18000,
      initialPaymentDueCents: 3000,
      payments: [],
      coupons: [],
      couponMovements: [
        {
          couponId: coupon.id,
          code: coupon.code,
          kind: "redeem",
          amountCents: 15000,
          recordedAt: "2026-12-01T15:00:00.000Z",
          recordedOn: "2026-12-01",
          recordedBy: "hotelmanantial",
        },
      ],
    });
    expect(await lookup(coupon.code)).toEqual({
      status: 200,
      body: {
        ...coupon,
        balanceCents: 5000,
        sourceReservationId: expect.any(String),
        sourceReservationCode: expect.stringMatching(/^[A-Z0-9]{6}$/),
        movements: [
          expect.objectContaining({ kind: "issue", amountCents: 20000 }),
          expect.objectContaining({ kind: "redeem", amountCents: 15000, reservationId: later.id }),
        ],
      },
    });
    const paid = await command(redeemed, [pay(3000)]);
    expect(paid).toMatchObject({ balanceCents: 0, initialPaymentDueCents: 0 });
  });

  it("accepts a stay starting on the expiry date and rejects one starting the day after", async () => {
    const coupon = await couponWorth(20000);
    expect(coupon.expiresOn).toBe("2027-10-10");
    const onExpiry = await stay("2027-10-10", "2027-10-12");
    const dayAfter = await stay("2027-10-11", "2027-10-13");
    expect(await command(dayAfter, [redeem(coupon.code, 10000)], 400)).toEqual({
      error: "stay starts after the coupon expires",
    });
    const redeemed = await command(onExpiry, [redeem(coupon.code, 10000)]);
    expect(redeemed.couponAppliedCents).toBe(10000);
    expect(
      await command(
        redeemed,
        [{ type: "dates", checkIn: "2027-10-11", checkOut: "2027-10-13" }],
        400,
      ),
    ).toEqual({ error: "stay starts after the coupon expires" });
  });

  it("rejects an unknown code and more than the coupon's balance", async () => {
    const coupon = await couponWorth(20000);
    const later = await stay("2026-11-01", "2026-11-04");
    expect(await command(later, [redeem("NOPE", 100)], 404)).toEqual({
      error: "coupon not found",
    });
    expect(await command(later, [redeem(coupon.code, 20001)], 400)).toEqual({
      error: "coupon redemption exceeds its balance",
    });
  });

  it("rejects more than the stay still owes", async () => {
    const coupon = await couponWorth(20000);
    const paidPart = await command(await stay("2026-11-01", "2026-11-04"), [pay(15000)]);
    expect(await command(paidPart, [redeem(coupon.code, 15001)], 400)).toEqual({
      error: "coupon redemption exceeds the balance owed",
    });
    expect((await lookup(coupon.code)).body).toMatchObject({ balanceCents: 20000 });
  });

  it("allows one coupon per stay, redeemed again up to its balance", async () => {
    const coupon = await couponWorth(20000);
    const other = await couponWorth(5000);
    const used = await command(await stay("2026-11-01", "2026-11-04"), [
      redeem(coupon.code, 10000),
    ]);
    expect(await command(used, [redeem(other.code, 1000)], 400)).toEqual({
      error: "reservation already uses another coupon",
    });
    expect(await command(used, [redeem(coupon.code, 5000)])).toMatchObject({
      couponAppliedCents: 15000,
      balanceCents: 15000,
    });
    expect((await lookup(coupon.code)).body).toMatchObject({ balanceCents: 5000 });
    expect((await lookup(other.code)).body).toMatchObject({ balanceCents: 5000 });
  });

  it.each([
    {
      stay: "the reservation that issued it",
      target: async (sourceReservationId: string) => ({ id: sourceReservationId }),
      error: "coupon cannot be redeemed on the reservation that issued it",
    },
    {
      stay: "a cancelled reservation",
      target: async () => command(await stay("2026-11-10", "2026-11-12"), [cancel]),
      error: "coupon requires an active reservation",
    },
  ])("rejects redemption on $stay", async ({ target, error }) => {
    const coupon = await couponWorth(5000);
    const source = (await lookup(coupon.code)).body as { sourceReservationId: string };
    expect(
      await command(await target(source.sourceReservationId), [redeem(coupon.code, 1000)], 400),
    ).toEqual({ error });
  });

  it("never overspends when two stays redeem the same coupon at once", async () => {
    const coupon = await couponWorth(20000);
    const first = await stay("2026-11-01", "2026-11-03");
    const second = await stay("2026-11-05", "2026-11-07");
    db.beforeCommit(async () => {
      expect(await command(second, [redeem(coupon.code, 15000)])).toMatchObject({
        couponAppliedCents: 15000,
      });
    });

    expect(await command(first, [redeem(coupon.code, 15000)], 400)).toEqual({
      error: "coupon redemption exceeds its balance",
    });

    expect((await lookup(coupon.code)).body).toMatchObject({ balanceCents: 5000 });
    expect(await command(first, [redeem(coupon.code, 5000)])).toMatchObject({
      couponAppliedCents: 5000,
    });
    expect((await lookup(coupon.code)).body).toMatchObject({ balanceCents: 0 });
  });

  it("applies a retried redemption once", async () => {
    const coupon = await couponWorth(20000);
    const later = await stay("2026-11-01", "2026-11-03");
    const body = { requestId: crypto.randomUUID(), actions: [redeem(coupon.code, 15000)] };
    const send = async () =>
      (
        await db.request(`/reservations/${later.id}/commands`, "POST", body)
      ).json() as Promise<Detail>;

    const [once, again] = [await send(), await send()];

    expect(again).toEqual(once);
    expect(again.couponMovements).toHaveLength(1);
    expect((await lookup(coupon.code)).body).toMatchObject({ balanceCents: 5000 });
  });
});

describe("charging a coupon-funded stay that is cancelled or not shown", () => {
  it("takes a S/150 charge from a S/200 coupon first, returns S/50 to it and leaves the S/300 card payment due back", async () => {
    const coupon = await couponWorth(20000);
    const funded = await command(await stay("2026-10-11", "2026-10-15", 15000), [
      redeem(coupon.code, 20000),
      pay(30000, "card"),
    ]);
    vi.setSystemTime(new Date("2026-10-10T16:00:00Z"));

    const preview = await db.request(`/reservations/${funded.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [cancel],
    });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      billing: {
        couponMovements: [
          expect.objectContaining({ kind: "redeem" }),
          expect.objectContaining({
            kind: "return",
            amountCents: 5000,
            code: coupon.code,
            expiresOn: "2027-10-10",
          }),
        ],
      },
    });
    const cancelled = await command(funded, [cancel]);

    expect(cancelled).toMatchObject({
      totalCents: 15000,
      paidCents: 30000,
      couponAppliedCents: 15000,
      refundDueCents: 30000,
      couponMovements: [
        expect.objectContaining({ kind: "redeem", amountCents: 20000 }),
        expect.objectContaining({
          kind: "return",
          amountCents: 5000,
          recordedBy: "hotelmanantial",
        }),
      ],
    });
    expect((await lookup(coupon.code)).body).toMatchObject({
      balanceCents: 5000,
      expiresOn: coupon.expiresOn,
    });
  });

  it("returns the whole coupon on a free cancellation and what a waiver releases", async () => {
    const coupon = await couponWorth(20000);
    const free = await command(await stay("2026-11-01", "2026-11-03"), [
      redeem(coupon.code, 20000),
    ]);
    expect(await command(free, [cancel])).toMatchObject({
      totalCents: 0,
      couponAppliedCents: 0,
      refundDueCents: 0,
    });
    const late = await command(await stay("2026-10-11", "2026-10-13"), [
      redeem(coupon.code, 20000),
    ]);
    const charged = await command(late, [cancel]);
    expect(charged).toMatchObject({ couponAppliedCents: 10000, refundDueCents: 0 });
    expect(
      await command(charged, [
        { type: "waive-cancellation-charge", amountCents: 4000, reason: "Goodwill" },
      ]),
    ).toMatchObject({ couponAppliedCents: 6000, refundDueCents: 0 });
    expect((await lookup(coupon.code)).body).toMatchObject({ balanceCents: 14000 });
  });

  it("returns value to a coupon after expiry, where it stays expired", async () => {
    const coupon = await couponWorth(20000);
    const funded = await command(await stay("2027-10-10", "2027-10-13"), [
      redeem(coupon.code, 20000),
    ]);
    const inHouse = await stay("2027-10-10", "2027-10-14");
    vi.setSystemTime(new Date("2027-10-11T15:00:00Z"));
    await db.signIn();

    const missed = await command(funded, [{ type: "set-status", status: "no_show" }]);

    expect(missed.couponAppliedCents).toBe(missed.totalCents);
    expect((await lookup(coupon.code)).body).toMatchObject({
      balanceCents: 20000 - missed.totalCents,
      expiresOn: "2027-10-10",
    });
    expect(
      await command(await stay("2027-10-12", "2027-10-13"), [redeem(coupon.code, 100)], 400),
    ).toEqual({ error: "coupon has expired" });
    expect(await command(inHouse, [redeem(coupon.code, 100)], 400)).toEqual({
      error: "coupon has expired",
    });
  });
});

describe("coupon records", () => {
  it("lists an issued coupon once with its issuer when its redeemer is on the same page", async () => {
    const issued = await command(await freeCancellationOwing(20000), [issue(20000)]);
    const coupon = issued.coupons[0];
    for (let i = 0; i < 48; i++)
      seedReservation(db.sqlite, {
        id: `filler-${i}`,
        code: `F${String(i).padStart(5, "0")}`,
        guestName: `List filler ${i}`,
        checkIn: "2026-10-25",
        checkOut: "2026-10-26",
        createdAt: "2026-10-10",
        status: "cancelled",
      });
    const redeemed = await command(await stay("2026-11-01", "2026-11-03"), [
      redeem(coupon.code, 15000),
    ]);

    const response = await db.request("/reservations?paginated=true&limit=50");
    expect(response.status).toBe(200);
    const list = (await response.json()) as { rows: Detail[]; total: number };

    expect(list.total).toBe(50);
    expect(list.rows[0]).toMatchObject({
      id: issued.id,
      couponIssuedCents: 20000,
      refundDueCents: 0,
    });
    expect(list.rows[0].coupons).toEqual([{ ...coupon, balanceCents: 5000 }]);
    expect(list.rows[0].couponMovements).toEqual(issued.couponMovements);
    expect(list.rows[49]).toMatchObject({
      id: redeemed.id,
      couponAppliedCents: 15000,
      balanceCents: 5000,
      coupons: [],
      couponMovements: redeemed.couponMovements,
    });
  });

  it("refuses to restore a reservation that issued or redeemed a coupon", async () => {
    const owed = await freeCancellationOwing(20000);
    const issued = await command(owed, [issue(5000)]);
    const restore: WorkflowAction = { type: "set-status", status: "confirmed" };
    expect(await command(issued, [restore], 400)).toEqual({
      error: "reservation with coupons cannot be restored",
    });
    const funded = await command(await stay("2026-11-01", "2026-11-03"), [
      redeem(issued.coupons[0].code, 5000),
    ]);
    const cancelled = await command(funded, [cancel]);
    expect(await command(cancelled, [restore], 400)).toEqual({
      error: "reservation with coupons cannot be restored",
    });
  });

  it("locks the payments of a reservation that issued a coupon", async () => {
    const owed = await freeCancellationOwing(20000);
    const [payment] = owed.payments;
    const edit: WorkflowAction = {
      type: "edit-payment",
      paymentId: payment.id,
      payment: { amountCents: 25000, method: "cash", paymentDate: "2026-10-10" },
    };
    const remove: WorkflowAction = { type: "delete-payment", paymentId: payment.id };
    expect(await command(owed, [remove, issue(1000)], 400)).toEqual({
      error: "payment cannot be changed after issuing a coupon",
    });
    const issued = await command(owed, [issue(1000)]);
    for (const change of [edit, remove])
      expect(await command(issued, [change], 400)).toEqual({
        error: "payment cannot be changed after issuing a coupon",
      });
    expect(await command(issued, [pay(500)])).toMatchObject({ refundDueCents: 19500 });
  });
});

describe("the payments report", () => {
  it("lists coupon movements by property date, apart from cash", async () => {
    const coupon = await couponWorth(20000);
    const funded = await command(await stay("2026-11-01", "2026-11-03"), [
      redeem(coupon.code, 15000),
    ]);
    vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
    await db.signIn();
    await command(funded, [cancel]);

    const report = async (from: string, to: string) =>
      (await db.request(`/payments?from=${from}&to=${to}`)).json();

    expect(await report("2026-10-10", "2026-10-11")).toMatchObject({
      totalCents: 20000,
      refundedCents: 0,
      couponIssuedCents: 20000,
      couponRedeemedCents: 15000,
      couponReturnedCents: 15000,
      couponMovements: [
        {
          id: expect.any(String),
          couponId: coupon.id,
          code: coupon.code,
          reservationId: expect.any(String),
          reservationCode: expect.any(String),
          guestName: "Ada Lovelace",
          kind: "issue",
          amountCents: 20000,
          recordedOn: "2026-10-10",
          recordedBy: "hotelmanantial",
        },
        expect.objectContaining({ kind: "redeem", amountCents: 15000, reservationId: funded.id }),
        expect.objectContaining({ kind: "return", amountCents: 15000, recordedOn: "2026-10-11" }),
      ],
    });
    expect(await report("2026-10-11", "2026-10-11")).toMatchObject({
      totalCents: 0,
      couponIssuedCents: 0,
      couponRedeemedCents: 0,
      couponReturnedCents: 15000,
      couponMovements: [expect.objectContaining({ kind: "return" })],
    });
  });
});

describe("previewing coupon actions", () => {
  it("shows issuance and redemption effects without saving them", async () => {
    const preview = async (d: { id: string }, actions: WorkflowAction[]) => {
      const response = await db.request(`/reservations/${d.id}/preview`, "POST", {
        requestId: crypto.randomUUID(),
        actions,
      });
      return ((await response.json()) as { billing: Detail }).billing;
    };
    const owed = await freeCancellationOwing(20000);
    expect(await preview(owed, [issue(20000)])).toMatchObject({
      couponIssuedCents: 20000,
      refundDueCents: 0,
      coupons: [expect.objectContaining({ valueCents: 20000, expiresOn: "2027-10-10" })],
    });
    expect(await (await db.request(`/reservations/${owed.id}`)).json()).toMatchObject({
      coupons: [],
      refundDueCents: 20000,
    });

    const coupon = (await command(owed, [issue(20000)])).coupons[0];
    const later = await stay("2026-11-01", "2026-11-03");
    expect(await preview(later, [redeem(coupon.code, 12000)])).toMatchObject({
      couponAppliedCents: 12000,
      balanceCents: 8000,
      initialPaymentDueCents: 0,
      couponMovements: [expect.objectContaining({ kind: "redeem", code: coupon.code })],
    });
    expect((await lookup(coupon.code)).body).toMatchObject({ balanceCents: 20000 });
  });

  async function previewRejection(d: { id: string }, actions: WorkflowAction[]) {
    const response = await db.request(`/reservations/${d.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    return { status: response.status, body: await response.json() };
  }

  it.each([
    {
      name: "an unknown code",
      setup: async () => ({ target: await stay("2026-11-01", "2026-11-03"), code: "NOPE" }),
      status: 404,
      error: "coupon not found",
    },
    {
      name: "a code longer than the command allows",
      setup: async () => ({ target: await stay("2026-11-01", "2026-11-03"), code: "A".repeat(41) }),
      status: 400,
      error: "coupon not found",
    },
    {
      name: "the reservation that issued it",
      setup: async () => {
        const owed = await freeCancellationOwing(20000);
        const coupon = (await command(owed, [issue(5000)])).coupons[0];
        return { target: owed, code: coupon.code };
      },
      status: 400,
      error: "coupon cannot be redeemed on the reservation that issued it",
    },
    {
      name: "a cancelled reservation, even after the coupon expired",
      setup: async () => {
        const coupon = await couponWorth(5000);
        const cancelled = await command(await stay("2027-10-12", "2027-10-14"), [cancel]);
        vi.setSystemTime(new Date("2027-10-11T15:00:00Z"));
        await db.signIn();
        return { target: cancelled, code: coupon.code };
      },
      status: 400,
      error: "coupon requires an active reservation",
    },
    {
      name: "a reservation that already uses another coupon",
      setup: async () => {
        const coupon = await couponWorth(5000);
        const other = await couponWorth(5000);
        const used = await command(await stay("2026-11-01", "2026-11-03"), [
          redeem(other.code, 1000),
        ]);
        return { target: used, code: coupon.code };
      },
      status: 400,
      error: "reservation already uses another coupon",
    },
    {
      name: "an expired coupon",
      setup: async () => {
        const coupon = await couponWorth(5000);
        const active = await stay("2027-10-12", "2027-10-14");
        vi.setSystemTime(new Date("2027-10-11T15:00:00Z"));
        await db.signIn();
        return { target: active, code: coupon.code };
      },
      status: 400,
      error: "coupon has expired",
    },
    {
      name: "a stay starting after the coupon expires",
      setup: async () => {
        const coupon = await couponWorth(5000);
        return { target: await stay("2027-10-11", "2027-10-13"), code: coupon.code };
      },
      status: 400,
      error: "stay starts after the coupon expires",
    },
    {
      name: "a coupon with no balance left",
      setup: async () => {
        const coupon = await couponWorth(5000);
        await command(await stay("2026-11-01", "2026-11-03"), [redeem(coupon.code, 5000)]);
        return { target: await stay("2026-11-05", "2026-11-07"), code: coupon.code };
      },
      status: 400,
      error: "coupon redemption exceeds its balance",
    },
    {
      name: "more than the stay owes after the redemption",
      setup: async () => {
        const coupon = await couponWorth(5000);
        const paid = await command(await stay("2026-11-01", "2026-11-03"), [pay(19500)]);
        return { target: paid, code: coupon.code };
      },
      status: 400,
      error: "coupon redemption exceeds the balance owed",
    },
  ])("rejects redeeming on $name in the preview", async ({ setup, status, error }) => {
    const { target, code } = await setup();
    expect(await previewRejection(target, [redeem(code, 1000)])).toEqual({
      status,
      body: { error },
    });
  });

  it("judges a redemption on the bill after every action in the command", async () => {
    const coupon = await couponWorth(30000);
    const twoNights = await stay("2026-11-01", "2026-11-03");
    expect(twoNights.balanceCents).toBe(20000);
    const longer = { type: "dates", checkIn: "2026-11-01", checkOut: "2026-11-04" } as const;
    const preview = await db.request(`/reservations/${twoNights.id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [longer, redeem(coupon.code, 30000)],
    });
    expect(preview.status).toBe(200);
    expect(((await preview.json()) as { billing: Detail }).billing).toMatchObject({
      couponAppliedCents: 30000,
      balanceCents: 0,
    });

    const nearExpiry = await stay("2027-10-09", "2027-10-11");
    const pastExpiry = { type: "dates", checkIn: "2027-10-11", checkOut: "2027-10-13" } as const;
    expect(await previewRejection(nearExpiry, [pastExpiry, redeem(coupon.code, 1000)])).toEqual({
      status: 400,
      body: { error: "stay starts after the coupon expires" },
    });

    const other = await couponWorth(5000);
    expect(
      await previewRejection(nearExpiry, [redeem(other.code, 1000), redeem(coupon.code, 1000)]),
    ).toEqual({ status: 400, body: { error: "reservation already uses another coupon" } });
  });
});
