import type { WorkflowAction } from "@pms/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { presentReservation } from "../present";
import { CULQI_TEST_KEY, fakeCulqi, type FakeCulqi } from "../test-support/culqi";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "../test-support/d1";

type Detail = ReturnType<typeof presentReservation>;

let db: TestDb;
let culqi: FakeCulqi;

beforeEach(async () => {
  vi.useFakeTimers();
  // 10:00 on 10 Oct in Lima.
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type", { "room-101": "101" });
  culqi = fakeCulqi();
  vi.stubGlobal("fetch", culqi.fetch);
  db.env.CULQI_SECRET_KEY = CULQI_TEST_KEY;
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Two S/100 nights paid S/300 by card: S/100 is due back. */
async function paidOnline(amountCents = 30000) {
  const response = await db.request("/reservations", "POST", {
    requestId: crypto.randomUUID(),
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    guest: { fullName: "Ana Torres", email: "ana@example.com" },
    rooms: [{ roomTypeId: "type", adults: 2, children: 0, nightlyRateCents: 10000 }],
  });
  expect(response.status).toBe(201);
  const { id } = (await response.json()) as Detail;
  const charged = await culqi.fetch("https://api.culqi.com/v2/charges", {
    method: "POST",
    headers: { authorization: `Bearer ${CULQI_TEST_KEY}` },
    body: JSON.stringify({
      amount: amountCents,
      currency_code: "PEN",
      email: "ana@example.com",
      source_id: `tkn_test_${crypto.randomUUID()}`,
      capture: true,
    }),
  });
  const charge = (await charged.json()) as { id: string };
  culqi.requests.length = 0;
  const paymentId = crypto.randomUUID();
  db.sqlite
    .prepare(
      `INSERT INTO payments (id, reservation_id, amount_cents, method, reference, payment_date,
        created_at, culqi_charge_id) VALUES (?, ?, ?, 'card', ?, '2026-10-10', ?, ?)`,
    )
    .run(paymentId, id, amountCents, charge.id, new Date().toISOString(), charge.id);
  return { id, paymentId, chargeId: charge.id };
}

async function command(id: string, actions: WorkflowAction[], requestId = crypto.randomUUID()) {
  const response = await db.request(`/reservations/${id}/commands`, "POST", {
    requestId,
    actions,
  });
  return { status: response.status, body: (await response.json()) as Detail & { error?: string } };
}

const culqiRefund = (paymentId: string, amountCents = 10000): WorkflowAction => ({
  type: "request-culqi-refund",
  paymentId,
  amountCents,
  reason: "Overpaid",
});
const refundCalls = () =>
  culqi.requests
    .filter((r) => r.path === "/v2/refunds")
    .map((r) => ({ method: r.method, path: r.path, body: r.body }));

describe("staff Culqi refunds", () => {
  it("refunds S/100 through Culqi and records it completed with Culqi's refund ID", async () => {
    const { id, paymentId, chargeId } = await paidOnline();

    const { status, body } = await command(id, [culqiRefund(paymentId)]);

    expect(status).toBe(200);
    expect(refundCalls()).toEqual([
      {
        method: "POST",
        path: "/v2/refunds",
        body: { amount: 10000, charge_id: chargeId, reason: "solicitud_comprador" },
      },
    ]);
    const refundId = culqi.refunds[0]!.id;
    expect(body.refunds).toEqual([
      expect.objectContaining({
        paymentId,
        amountCents: 10000,
        method: "card",
        status: "completed",
        refundDate: "2026-10-10",
        completionReference: refundId,
        culqiChargeId: chargeId,
        culqiRefundId: refundId,
        resolvedBy: body.refunds[0]!.requestedBy,
      }),
    ]);
    expect(body).toMatchObject({ refundedCents: 10000, refundDueCents: 0, pendingRefundCents: 0 });
  });

  it("completes a refund whose response was lost when the charge shows it refunded", async () => {
    const { id, paymentId, chargeId } = await paidOnline();
    culqi.next("POST /refunds", "lose");

    const { body } = await command(id, [culqiRefund(paymentId)]);

    expect(refundCalls()).toHaveLength(1);
    expect(body.refunds[0]).toMatchObject({
      status: "completed",
      completionReference: chargeId,
      culqiRefundId: null,
    });
    expect(body.refundDueCents).toBe(0);
  });

  it("leaves a declined refund pending for staff to record from CulqiPanel", async () => {
    const { id, paymentId } = await paidOnline();
    culqi.next("POST /refunds", "decline");

    const { body } = await command(id, [culqiRefund(paymentId)]);

    expect(body.refunds[0]).toMatchObject({ status: "requested", completionReference: null });
    expect(body).toMatchObject({ pendingRefundCents: 10000, refundDueCents: 10000 });
    const completed = await command(id, [
      {
        type: "complete-refund",
        refundId: body.refunds[0]!.id,
        refundDate: "2026-10-10",
        reference: "REF-123",
      },
    ]);
    expect(completed.body.refunds[0]).toMatchObject({
      status: "completed",
      completionReference: "REF-123",
    });
    expect(refundCalls()).toHaveLength(1);
  });

  it("leaves an unanswered refund pending when the charge shows nothing refunded", async () => {
    const { id, paymentId } = await paidOnline();
    culqi.next("POST /refunds", 500);

    const { body } = await command(id, [culqiRefund(paymentId)]);
    expect(body.refunds[0]).toMatchObject({ status: "requested" });

    const failed = await command(id, [
      { type: "fail-refund", refundId: body.refunds[0]!.id, reason: "Culqi rejected it" },
    ]);
    expect(failed.body.refunds[0]).toMatchObject({ status: "failed" });
    expect(failed.body.refundDueCents).toBe(10000);
  });

  it("refuses a second Culqi refund while one on the payment is pending", async () => {
    const { id, paymentId } = await paidOnline();
    culqi.next("POST /refunds", "decline");
    await command(id, [culqiRefund(paymentId, 5000)]);

    const again = await command(id, [culqiRefund(paymentId, 5000)]);
    const both = await command(id, [
      { type: "fail-refund", refundId: (await detail(id)).refunds[0]!.id, reason: "Declined" },
      culqiRefund(paymentId, 5000),
      culqiRefund(paymentId, 5000),
    ]);

    expect(again).toMatchObject({
      status: 400,
      body: { error: "a Culqi refund for this payment is pending" },
    });
    expect(both).toMatchObject({
      status: 400,
      body: { error: "a Culqi refund for this payment is pending" },
    });
    expect(refundCalls()).toHaveLength(1);
  });

  it("refuses more than the Culqi payment has left to refund", async () => {
    const { id, paymentId } = await paidOnline(5000);
    // S/250 cash on top leaves S/100 due, but the card paid only S/50.
    await command(id, [
      {
        type: "add-payment",
        payment: { amountCents: 25000, method: "cash", paymentDate: "2026-10-10" },
      },
    ]);

    const beyond = await command(id, [culqiRefund(paymentId, 6000)]);

    expect(beyond).toMatchObject({
      status: 400,
      body: { error: "refund exceeds the payment's remaining amount" },
    });
    expect(refundCalls()).toHaveLength(0);
  });

  it("refuses refunds Culqi cannot process", async () => {
    const { id, paymentId } = await paidOnline();
    const cash = await command(id, [
      {
        type: "add-payment",
        payment: { amountCents: 1000, method: "cash", paymentDate: "2026-10-10" },
      },
    ]);
    const cashId = cash.body.payments.find((p) => p.method === "cash")!.id;

    expect(await command(id, [culqiRefund(cashId, 1000)])).toMatchObject({
      status: 400,
      body: { error: "payment is not a Culqi payment" },
    });
    expect(await command(id, [culqiRefund(paymentId, 99)])).toMatchObject({
      status: 400,
      body: { error: "Culqi refund must be at least 100 cents" },
    });
    delete db.env.CULQI_SECRET_KEY;
    expect(await command(id, [culqiRefund(paymentId)])).toMatchObject({
      status: 503,
      body: { error: "Culqi is not configured" },
    });
    expect((await detail(id)).refunds).toEqual([]);
    expect(refundCalls()).toHaveLength(0);
  });

  it("calls Culqi once per request: never on preview or replay", async () => {
    const { id, paymentId } = await paidOnline();
    const preview = await db.request(`/reservations/${id}/preview`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [culqiRefund(paymentId)],
    });
    expect(preview.status).toBe(200);
    expect(refundCalls()).toHaveLength(0);

    const requestId = crypto.randomUUID();
    await command(id, [culqiRefund(paymentId)], requestId);
    const replayed = await command(id, [culqiRefund(paymentId)], requestId);

    expect(replayed.status).toBe(200);
    expect(replayed.body.refunds).toHaveLength(1);
    expect(refundCalls()).toHaveLength(1);
  });

  it("never edits or deletes a Culqi payment", async () => {
    const { id, paymentId } = await paidOnline();

    const edited = await command(id, [
      {
        type: "edit-payment",
        paymentId,
        payment: { amountCents: 100, method: "card", paymentDate: "2026-10-10" },
      },
    ]);
    const deleted = await command(id, [{ type: "delete-payment", paymentId }]);

    expect(edited).toMatchObject({
      status: 400,
      body: { error: "Culqi payment cannot be changed" },
    });
    expect(deleted).toMatchObject({
      status: 400,
      body: { error: "Culqi payment cannot be changed" },
    });
  });
});

async function detail(id: string) {
  const response = await db.request(`/reservations/${id}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<Detail>;
}
