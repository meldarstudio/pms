import type { PaymentAttemptCreate, QuoteCreate } from "@pms/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { culqiClient } from "./culqi";
import { getDb } from "./db";
import worker from "./index";
import {
  authenticatePaymentAttempt,
  paymentAttemptStatus,
  reconcilePaymentAttempts,
  startPaymentAttempt,
  type PaymentContext,
} from "./payment-attempts";
import type { presentReservation } from "./present";
import { createQuote } from "./quotes";
import { CULQI_TEST_KEY, fakeCulqi, type FakeCulqi } from "./test-support/culqi";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "./test-support/d1";

type Detail = ReturnType<typeof presentReservation>;

let db: TestDb;
let culqi: FakeCulqi;
let lookups: (() => Promise<unknown>)[];

beforeEach(async () => {
  vi.useFakeTimers();
  // 10:00 on 10 Oct in Lima.
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type", { "room-101": "101" });
  culqi = fakeCulqi();
  lookups = [];
});

afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const stay: QuoteCreate = {
  roomTypeId: "type",
  checkIn: "2026-10-20",
  checkOut: "2026-10-22",
  adults: 2,
  children: 0,
  ratePlan: "non_refundable",
};
const guest = { fullName: "Ana Torres", email: "ana@example.com" };

const context = (): PaymentContext => ({
  culqi: culqiClient({ secretKey: CULQI_TEST_KEY, fetch: culqi.fetch }),
  currency: "PEN",
  timeZone: "America/Lima",
  later: (lookup) => lookups.push(lookup),
});
const quote = async (input: Partial<QuoteCreate> = {}) =>
  (
    await createQuote(
      getDb(db.env.DB),
      { ...stay, ...input },
      { today: "2026-10-10", now: new Date() },
    )
  ).id;
const pay = (quoteId: string, input: Partial<PaymentAttemptCreate> = {}) =>
  startPaymentAttempt(
    getDb(db.env.DB),
    { quoteId, sourceId: `tkn_test_${crypto.randomUUID()}`, guest, ...input },
    context(),
  );

const poll = (attemptId: string) => paymentAttemptStatus(getDb(db.env.DB), attemptId, context());

const reconcile = () => reconcilePaymentAttempts(getDb(db.env.DB), context());

async function refundDue() {
  const response = await db.request("/reservations?refund=due");
  return ((await response.json()) as { id: string }[]).map((row) => row.id);
}

async function reservation(id: string) {
  const response = await db.request(`/reservations/${id}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<Detail>;
}

describe("payment attempts", () => {
  it("charges the quote's S/180 initial payment and confirms the reservation", async () => {
    const attempt = await pay(await quote());

    expect(attempt).toMatchObject({ status: "saved", reservation: { status: "confirmed" } });
    expect(culqi.requests).toHaveLength(1);
    expect(culqi.requests[0]!.body).toMatchObject({
      amount: 18000,
      currency_code: "PEN",
      email: "ana@example.com",
      capture: true,
      metadata: { attempt_id: attempt.id },
    });
    const detail = await reservation(attempt.reservation!.id);
    expect(detail).toMatchObject({
      status: "confirmed",
      source: "online",
      guest: { fullName: "Ana Torres" },
      payments: [
        {
          amountCents: 18000,
          method: "card",
          paymentDate: "2026-10-10",
          culqiChargeId: culqi.charges[0]!.id,
        },
      ],
    });
    expect(detail.balanceCents).toBe(0);
  });

  it("fails a declined card and accepts another card for the same quote", async () => {
    const quoteId = await quote();

    const declined = await pay(quoteId, { sourceId: "tkn_test_decline" });
    expect(declined).toMatchObject({
      status: "failed",
      failure: { code: "card_declined", message: "Tu tarjeta fue rechazada." },
      reservation: null,
    });

    const paid = await pay(quoteId);
    expect(paid).toMatchObject({ status: "saved", reservation: { status: "confirmed" } });
    expect(culqi.charges.map((charge) => charge.outcome?.code)).toEqual([
      "card_declined",
      "AUT0000",
    ]);
  });

  it("continues a 3DS review with the same token and attempt", async () => {
    const attempt = await pay(await quote(), {
      sourceId: "tkn_test_3ds",
      deviceFingerprint: "device-1",
    });
    expect(attempt).toMatchObject({ status: "review", reservation: null });

    const authenticated = await authenticatePaymentAttempt(
      getDb(db.env.DB),
      attempt.id,
      { eci: "05", cavv: "cavv-1", protocolVersion: "2.1.0", directoryServerTransactionId: "ds-1" },
      context(),
    );

    expect(authenticated).toMatchObject({
      id: attempt.id,
      status: "saved",
      reservation: { status: "confirmed" },
    });
    expect(culqi.requests.map((request) => request.body)).toMatchObject([
      { source_id: "tkn_test_3ds", antifraud_details: { device_finger_print_id: "device-1" } },
      {
        source_id: "tkn_test_3ds",
        metadata: { attempt_id: attempt.id },
        antifraud_details: { device_finger_print_id: "device-1" },
        authentication_3DS: { eci: "05", cavv: "cavv-1" },
      },
    ]);
  });

  it("refuses an expired quote before calling Culqi", async () => {
    const quoteId = await quote();
    vi.advanceTimersByTime(10 * 60_000);

    await expect(pay(quoteId)).rejects.toMatchObject({ status: 400, message: "quote has expired" });
    expect(culqi.requests).toEqual([]);
  });

  it("finds a charge whose response was lost and confirms it without charging again", async () => {
    const quoteId = await quote();
    culqi.next("POST /charges", "lose");

    const attempt = await pay(quoteId);
    expect(attempt).toMatchObject({ status: "unknown", delayed: false, reservation: null });
    await expect(pay(quoteId)).rejects.toMatchObject({
      status: 409,
      message: "a payment for this quote is still being confirmed",
    });

    // The lookup about 10 seconds after the lost response.
    expect(lookups).toHaveLength(1);
    await lookups[0]!();

    const resolved = await poll(attempt.id);
    expect(resolved).toMatchObject({ status: "saved", reservation: { status: "confirmed" } });
    expect(culqi.charges).toHaveLength(1);
    expect(culqi.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    expect(culqi.requests[1]).toMatchObject({ method: "GET", path: "/v2/charges" });
  });

  it.each([["timeout" as const], [500 as const], [429 as const], [401 as const]])(
    "keeps an attempt Unknown after a %s from Culqi until a poll finds no charge",
    async (reply) => {
      culqi.next("POST /charges", reply);

      const attempt = await pay(await quote());
      expect(attempt.status).toBe("unknown");
      vi.advanceTimersByTime(2 * 60_000 + 1);

      expect(await poll(attempt.id)).toMatchObject({ status: "unknown", delayed: true });
      expect(culqi.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    },
  );

  it("does not treat another attempt's charge or a denied charge as this attempt's", async () => {
    const quoteId = await quote();
    culqi.next("POST /charges", "lose");
    const attempt = await pay(quoteId, { sourceId: "tkn_test_decline" });
    expect(attempt.status).toBe("unknown");
    // A different attempt for the same amount and email.
    culqi.charges.push({
      ...culqi.charges[0]!,
      id: "chr_test_other",
      outcome: { type: "venta_exitosa", code: "AUT0000" },
      metadata: { attempt_id: crypto.randomUUID() },
    });

    expect(await poll(attempt.id)).toMatchObject({ status: "unknown", reservation: null });
  });

  it("saves a charge for a room booked meanwhile as Unfulfilled with the payment due back", async () => {
    const quoteId = await quote();
    // Another guest takes the last King room before the first guest pays.
    await pay(await quote(), { guest: { fullName: "Luis Rojas", email: "luis@example.com" } });

    const attempt = await pay(quoteId);

    expect(attempt).toMatchObject({ status: "saved", reservation: { status: "unfulfilled" } });
    const detail = await reservation(attempt.reservation!.id);
    expect(detail).toMatchObject({
      status: "unfulfilled",
      totalCents: 0,
      paidCents: 18000,
      refundDueCents: 18000,
      payments: [{ amountCents: 18000, culqiChargeId: culqi.charges[1]!.id }],
    });
    expect(await refundDue()).toEqual([attempt.reservation!.id]);
  });

  it("saves a late charge as Unfulfilled when the guest already rebooked those dates", async () => {
    seedRooms(db.sqlite, "type", { "room-102": "102" });
    const first = await quote();
    culqi.next("POST /charges", "lose");
    const lost = await pay(first);
    // The guest gives up waiting and books the same stay again.
    const rebooked = await pay(await quote({ checkIn: "2026-10-21", checkOut: "2026-10-23" }), {
      guest: { ...guest, email: "ANA@example.com" },
    });
    expect(rebooked.reservation?.status).toBe("confirmed");

    await reconcile();

    expect(await poll(lost.id)).toMatchObject({
      status: "saved",
      reservation: { status: "unfulfilled" },
    });
  });

  it("saves a charge found after check-in has passed as Unfulfilled", async () => {
    culqi.next("POST /charges", "lose");
    const lost = await pay(await quote({ checkIn: "2026-10-11", checkOut: "2026-10-13" }));
    // 01:00 on 12 Oct in Lima, within the 48 hours of lookups.
    vi.setSystemTime(new Date("2026-10-12T06:00:00Z"));

    await reconcile();

    expect(await poll(lost.id)).toMatchObject({ reservation: { status: "unfulfilled" } });
  });

  it("retries a failed reservation save into exactly one reservation", async () => {
    db.beforeCommit(() => {
      throw new Error("D1 is unavailable");
    });

    const attempt = await pay(await quote());
    expect(attempt).toMatchObject({ status: "succeeded", reservation: null });

    await reconcile();
    await reconcile();

    const saved = await poll(attempt.id);
    expect(saved).toMatchObject({ status: "saved", reservation: { status: "confirmed" } });
    const list = await db.request("/reservations");
    expect(((await list.json()) as { id: string }[]).map((row) => row.id)).toEqual([
      saved.reservation!.id,
    ]);
  });

  it("stops looking up an Unknown attempt after 48 hours", async () => {
    culqi.next("POST /charges", 500);
    await pay(await quote());
    vi.advanceTimersByTime(48 * 60 * 60_000 + 1);
    const before = culqi.requests.length;

    await reconcile();

    expect(culqi.requests).toHaveLength(before);
  });

  it("resolves Unknown attempts from the Worker's scheduled run", async () => {
    culqi.next("POST /charges", "lose");
    const lost = await pay(await quote());
    vi.stubGlobal("fetch", culqi.fetch);
    const tasks: Promise<unknown>[] = [];

    worker.scheduled({} as ScheduledController, { ...db.env, CULQI_SECRET_KEY: CULQI_TEST_KEY }, {
      waitUntil: (task: Promise<unknown>) => tasks.push(task),
    } as unknown as ExecutionContext);
    await Promise.all(tasks);

    // Read the reservations, since a poll would look the charge up itself.
    const list = await db.request("/reservations");
    expect(await list.json()).toMatchObject([{ status: "confirmed", source: "online" }]);
    expect(lost.status).toBe("unknown");
  });

  it("refuses an invalid phone before charging, since the reservation could not be saved", async () => {
    await expect(pay(await quote(), { guest: { ...guest, phone: "12" } })).rejects.toMatchObject({
      status: 400,
    });
    expect(culqi.requests).toEqual([]);
  });

  it("refuses to start without a Culqi key and leaves the quote payable", async () => {
    const quoteId = await quote();
    const unconfigured = { ...context(), culqi: culqiClient({ secretKey: undefined }) };

    await expect(
      startPaymentAttempt(
        getDb(db.env.DB),
        { quoteId, sourceId: "tkn_test_card", guest },
        unconfigured,
      ),
    ).rejects.toMatchObject({ status: 503, message: "Culqi is not configured" });
    expect(await pay(quoteId)).toMatchObject({ status: "saved" });
  });

  it("dates the payment by the charge call when it is found on a later day", async () => {
    culqi.next("POST /charges", "lose");
    const lost = await pay(await quote());
    // 00:30 on 11 Oct in Lima.
    vi.setSystemTime(new Date("2026-10-11T05:30:00Z"));

    const found = await poll(lost.id);

    const detail = await reservation(found.reservation!.id);
    expect(detail.payments).toMatchObject([{ paymentDate: "2026-10-10" }]);
  });
});
