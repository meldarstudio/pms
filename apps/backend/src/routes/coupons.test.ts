import type { WorkflowAction } from "@pms/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { presentReservation } from "../present";
import { atBaseRate, createTestDb, seedRooms, seedRoomType, type TestDb } from "../test-support/d1";

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

async function stay(checkIn: string, checkOut: string, nightCents = 10000) {
  const response = await atBaseRate(db.sqlite, "type", nightCents, () =>
    db.request("/reservations", "POST", {
      requestId: crypto.randomUUID(),
      channel: "walk_in",
      checkIn,
      checkOut,
      guest: { fullName: "Ada Lovelace" },
      rooms: [{ roomTypeId: "type", adults: 1, children: 0 }],
    }),
  );
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
      channel: "walk_in",
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
});

describe("coupon records", () => {
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
});
