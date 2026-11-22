import type { WorkflowAction } from "@pms/shared";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { getDb } from "../db";
import { reservations } from "../db/schema";
import type { presentReservation } from "../present";
import { atBaseRate, createTestDb, seedRooms, seedRoomType, type TestDb } from "../test-support/d1";
import { offerAmounts } from "../public-offers";
import { ratePlans } from "./rate-plans";
import {
  balanceCentsSql,
  reservationBill,
  stayBill,
  type BillableReservation,
} from "./reservation-bill";

const nights = (...entries: [string, number][]) =>
  entries.map(([date, priceCents]) => ({ date, priceCents }));

function loaded(
  reservation: Partial<BillableReservation["reservation"]>,
  rest: Partial<Omit<BillableReservation, "reservation">> = {},
): BillableReservation {
  return {
    reservation: {
      status: "confirmed",
      discountCents: 0,
      paymentSchedule: "first_night_deposit",
      ...reservation,
    },
    lines: [{ nights: nights(["2026-10-20", 10000], ["2026-10-21", 10000]) }],
    payments: [],
    cancellations: [],
    refunds: [],
    couponMovements: [],
    ...rest,
  };
}

const twoRooms = [
  { nights: nights(["2026-10-21", 12000], ["2026-10-20", 10000]) },
  { nights: nights(["2026-10-20", 9000], ["2026-10-21", 8000]) },
];

describe("confirmed reservation bill", () => {
  it("bills S/390 of rooms less a S/50 discount, with each room's first night as the deposit", () => {
    expect(
      reservationBill(
        loaded({ discountCents: 5000 }, { lines: twoRooms, payments: [{ amountCents: 4000 }] }),
      ),
    ).toEqual({
      subtotalCents: 39000,
      discountCents: 5000,
      totalCents: 34000,
      paidCents: 4000,
      refundedCents: 0,
      couponIssuedCents: 0,
      couponAppliedCents: 0,
      balanceCents: 30000,
      creditCents: 0,
      initialPaymentDueCents: 15000,
      pendingRefundCents: 0,
      refundDueCents: 0,
      requiredInitialPaymentCents: 19000,
      remainingScheduledCents: 15000,
    });
  });

  it("requires the whole S/340 total upfront under a full-upfront schedule", () => {
    expect(
      reservationBill(
        loaded({ discountCents: 5000, paymentSchedule: "full_upfront" }, { lines: twoRooms }),
      ),
    ).toMatchObject({
      totalCents: 34000,
      requiredInitialPaymentCents: 34000,
      initialPaymentDueCents: 34000,
      remainingScheduledCents: 0,
    });
  });

  it("caps a S/500 discount at the S/200 subtotal so only the S/30 paid becomes credit", () => {
    expect(
      reservationBill(loaded({ discountCents: 50000 }, { payments: [{ amountCents: 3000 }] })),
    ).toMatchObject({
      subtotalCents: 20000,
      discountCents: 20000,
      totalCents: 0,
      balanceCents: -3000,
      creditCents: 3000,
      refundDueCents: 3000,
      requiredInitialPaymentCents: 0,
      remainingScheduledCents: 0,
    });
  });
});

describe("released reservation bill", () => {
  const cancellation = (
    policyChargeCents: number,
    waivers: number[],
    restoredAt: string | null,
  ) => ({
    policyChargeCents,
    restoredAt,
    waivers: waivers.map((amountCents) => ({ amountCents })),
  });

  it("replaces rooms and discount with the active cancellation's charge after waivers", () => {
    expect(
      reservationBill(
        loaded(
          { status: "cancelled", discountCents: 5000, paymentSchedule: "full_upfront" },
          {
            payments: [{ amountCents: 15000 }],
            cancellations: [
              cancellation(99000, [], "2026-10-09T10:00:00.000Z"),
              cancellation(20000, [5000, 3000], null),
            ],
          },
        ),
      ),
    ).toMatchObject({
      subtotalCents: 12000,
      discountCents: 0,
      totalCents: 12000,
      paidCents: 15000,
      balanceCents: -3000,
      refundDueCents: 3000,
      initialPaymentDueCents: 0,
      requiredInitialPaymentCents: 0,
      remainingScheduledCents: 0,
    });
  });

  it("owes nothing for a no-show without a recorded cancellation", () => {
    expect(reservationBill(loaded({ status: "no_show" }))).toMatchObject({
      totalCents: 0,
      balanceCents: 0,
    });
  });

  it("settles credit only with completed refunds, reporting requested ones as pending", () => {
    expect(
      reservationBill(
        loaded(
          { status: "cancelled" },
          {
            payments: [{ amountCents: 20000 }],
            cancellations: [cancellation(0, [], null)],
            refunds: [
              { amountCents: 5000, status: "completed" },
              { amountCents: 4000, status: "requested" },
              { amountCents: 1000, status: "failed" },
            ],
          },
        ),
      ),
    ).toMatchObject({
      paidCents: 20000,
      refundedCents: 5000,
      pendingRefundCents: 4000,
      balanceCents: -15000,
      creditCents: 15000,
      refundDueCents: 15000,
    });
  });
});

describe("coupon settlement", () => {
  it("settles S/150 of a S/200 refund due by issuing a coupon", () => {
    expect(
      reservationBill(
        loaded(
          { status: "cancelled" },
          {
            payments: [{ amountCents: 20000 }],
            cancellations: [{ policyChargeCents: 0, restoredAt: null, waivers: [] }],
            couponMovements: [{ kind: "issue", amountCents: 15000 }],
          },
        ),
      ),
    ).toMatchObject({ paidCents: 20000, couponIssuedCents: 15000, balanceCents: -5000 });
  });

  it("applies redeemed coupon value net of returns toward the balance and deposit", () => {
    expect(
      reservationBill(
        loaded(
          {},
          {
            payments: [{ amountCents: 5000 }],
            couponMovements: [
              { kind: "redeem", amountCents: 10000 },
              { kind: "return", amountCents: 4000 },
            ],
          },
        ),
      ),
    ).toMatchObject({
      totalCents: 20000,
      paidCents: 5000,
      couponAppliedCents: 6000,
      balanceCents: 9000,
      requiredInitialPaymentCents: 10000,
      initialPaymentDueCents: 0,
    });
  });
});

describe("bills before money moves", () => {
  it("prices a stay with a capped discount and its payment schedule", () => {
    expect(
      stayBill(twoRooms, { discountCents: 30000, paymentSchedule: "first_night_deposit" }),
    ).toMatchObject({
      subtotalCents: 39000,
      discountCents: 30000,
      totalCents: 9000,
      balanceCents: 9000,
      requiredInitialPaymentCents: 9000,
      remainingScheduledCents: 0,
    });
  });

  it("bills and cancels a two-room quote as each room's first night added together, or the whole stay", () => {
    const priced = (...entries: [string, number][]) =>
      nights(...entries).map((night) => ({ ...night, adjustmentCents: 0, discountCents: 0 }));
    const quote = {
      checkIn: "2026-10-20",
      rooms: [
        { nights: priced(["2026-10-20", 9000], ["2026-10-21", 9000], ["2026-10-22", 9000]) },
        { nights: priced(["2026-10-20", 12000], ["2026-10-21", 15000], ["2026-10-22", 15000]) },
      ],
    };
    expect(offerAmounts({ ...quote, terms: ratePlans.flexible }, "2026-10-10")).toMatchObject({
      totalCents: 69000,
      requiredInitialPaymentCents: 21000,
      remainingScheduledCents: 48000,
      cancellation: { chargeCents: 21000 },
    });
    expect(offerAmounts({ ...quote, terms: ratePlans.non_refundable }, "2026-10-10")).toMatchObject(
      {
        totalCents: 69000,
        requiredInitialPaymentCents: 69000,
        remainingScheduledCents: 0,
        cancellation: { chargeCents: 69000 },
      },
    );
  });
});

describe("SQL balance", () => {
  type Detail = ReturnType<typeof presentReservation>;
  let db: TestDb;

  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  async function stay(checkIn: string, checkOut: string, nightCents: number) {
    const response = await atBaseRate(db.sqlite, "type", nightCents, () =>
      db.request("/reservations", "POST", {
        requestId: crypto.randomUUID(),
        checkIn,
        checkOut,
        guest: { fullName: "Ada Lovelace" },
        rooms: [{ roomTypeId: "type", adults: 1, children: 0 }],
      }),
    );
    expect(response.status).toBe(201);
    return response.json() as Promise<Detail>;
  }
  async function command(d: Detail, actions: WorkflowAction[]) {
    const response = await db.request(`/reservations/${d.id}/commands`, "POST", {
      requestId: crypto.randomUUID(),
      actions,
    });
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    return body as Detail;
  }
  const pay = (amountCents: number): WorkflowAction => ({
    type: "add-payment",
    payment: { amountCents, method: "cash", paymentDate: "2026-10-10" },
  });
  const discount = (amountCents: number): WorkflowAction => ({ type: "set-discount", amountCents });
  const cancel: WorkflowAction = { type: "set-status", status: "cancelled" };

  it("agrees with the reservation bill for every kind of charge and settlement", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
    db = await createTestDb();
    seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
    seedRooms(
      db.sqlite,
      "type",
      Object.fromEntries(["101", "102", "103", "104", "105"].map((n) => [`room-${n}`, n])),
    );

    const owing = await command(await stay("2026-10-20", "2026-10-22", 10000), [
      discount(5000),
      pay(4000),
    ]);
    const capped = await command(await stay("2026-10-20", "2026-10-22", 10000), [
      pay(3000),
      discount(50000),
    ]);
    const waived = await command(await stay("2026-10-10", "2026-10-12", 20000), [
      pay(5000),
      cancel,
      { type: "waive-cancellation-charge", amountCents: 8000, reason: "Flight cancelled" },
    ]);
    const noShow = await command(await stay("2026-10-10", "2026-10-13", 10000), [
      { type: "set-status", status: "no_show" },
    ]);
    let refunded = await command(await stay("2026-10-20", "2026-10-22", 10000), [
      pay(20000),
      cancel,
    ]);
    const refund = (amountCents: number): WorkflowAction => ({
      type: "request-refund",
      paymentId: refunded.payments[0].id,
      amountCents,
      method: "transfer",
      reason: "Cancelled in time",
    });
    refunded = await command(refunded, [refund(5000)]);
    refunded = await command(refunded, [
      {
        type: "complete-refund",
        refundId: refunded.refunds[0].id,
        refundDate: "2026-10-10",
        reference: "OP-1",
      },
      refund(4000),
    ]);
    const issuer = await command(await stay("2026-10-20", "2026-10-22", 10000), [
      pay(20000),
      cancel,
    ]);
    const issued = await command(issuer, [
      { type: "issue-coupon", amountCents: 20000, guestAccepted: true },
    ]);
    const redeemer = await command(await stay("2026-10-25", "2026-10-27", 10000), [
      { type: "redeem-coupon", code: issued.coupons[0].code, amountCents: 12000 },
    ]);
    const returned = await command(redeemer, [discount(10000)]);
    expect(
      returned.couponMovements
        .toSorted((a, b) => a.kind.localeCompare(b.kind))
        .map(({ kind, amountCents }) => [kind, amountCents]),
    ).toEqual([
      ["redeem", 12000],
      ["return", 2000],
    ]);

    const expected = new Map([
      [owing.id, 11000],
      [capped.id, -3000],
      [waived.id, 7000],
      [noShow.id, 10000],
      [refunded.id, -15000],
      [issuer.id, 0],
      [redeemer.id, 0],
    ]);
    const details = await Promise.all(
      [...expected.keys()].map(
        async (id) => (await (await db.request(`/reservations/${id}`)).json()) as Detail,
      ),
    );
    const rows = await getDb(db.env.DB)
      .select({ id: reservations.id, balanceCents: balanceCentsSql })
      .from(reservations);

    expect(new Map(details.map((d) => [d.id, d.balanceCents]))).toEqual(expected);
    expect(new Map(rows.map((row) => [row.id, row.balanceCents]))).toEqual(expected);
  });
});
