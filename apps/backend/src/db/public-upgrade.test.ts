import { afterEach, expect, it, vi } from "vite-plus/test";
import worker from "../index";
import {
  createTestDb,
  seedReservation,
  seedRooms,
  seedRoomType,
  type TestDb,
} from "../test-support/d1";
import { CULQI_TEST_KEY, fakeCulqi } from "../test-support/culqi";
import { fakeResend, RESEND_LOOPBACK, RESEND_TEST_KEY } from "../test-support/resend";

let db: TestDb | undefined;

afterEach(() => {
  db?.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("preserves populated pre-public money and receipts, the signed-in session and settled legacy attempts through the complete upgrade", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb({ migrateThrough: "0017_contact_nationality" });
  expect(
    db.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'public_checkouts'").all(),
  ).toEqual([]);
  seedRoomType(db.sqlite, { id: "type", name: "Standard", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type", { room: "101", other: "102", third: "103" });
  seedReservation(db.sqlite, {
    id: "desk",
    code: "DESK01",
    guestName: "Desk contact",
    checkIn: "2026-10-10",
    checkOut: "2026-10-12",
    createdAt: "2026-10-09",
    roomTypeId: "type",
    nightCents: 9000,
  });
  seedReservation(db.sqlite, {
    id: "generic-online",
    code: "ONLINE",
    guestName: "Historical online contact",
    checkIn: "2026-10-25",
    checkOut: "2026-10-26",
    createdAt: "2026-10-09",
    roomTypeId: "type",
    nightCents: 9000,
  });
  db.sqlite.exec(`
    UPDATE reservations SET notes = 'kept' WHERE id = 'desk';
    UPDATE reservations SET source = 'online', rate_plan = 'non_refundable', cancellation_charge_basis = 'full_stay', free_cancellation_days = NULL, free_cancellation_hours = NULL, payment_schedule = 'full_upfront', price_adjustment_percent = -10 WHERE id = 'generic-online';
    UPDATE reservation_room_nights SET adjustment_cents = 1000 WHERE reservation_room_id = 'generic-online';
    INSERT INTO payments (id, reservation_id, amount_cents, method, payment_date, created_at)
      VALUES ('cash', 'desk', 25000, 'cash', '2026-10-10', '2026-10-10');
    INSERT INTO refunds (id, reservation_id, payment_id, amount_cents, method, reason, status, requested_at, requested_account_id, resolved_at, resolved_account_id, refund_date)
      VALUES ('refund', 'desk', 'cash', 2000, 'cash', 'correction', 'completed', '2026-10-10', 'staff-account', '2026-10-10', 'staff-account', '2026-10-10');
    INSERT INTO coupons (id, code, source_reservation_id, value_cents, balance_cents, issued_at, expires_on, account_id)
      VALUES ('coupon', 'LEGACY01', 'desk', 3000, 3000, '2026-10-10', '2027-10-10', 'staff-account');
    INSERT INTO coupon_movements (id, coupon_id, reservation_id, kind, amount_cents, recorded_at, recorded_on, account_id)
      VALUES ('movement', 'coupon', 'desk', 'issue', 3000, '2026-10-10', '2026-10-10', 'staff-account');
    INSERT INTO quotes (id, room_type_id, check_in, check_out, adults, children, nights, terms, created_at, expires_at)
      VALUES ('old-quote', 'type', '2026-10-20', '2026-10-22', 2, 0,
        '[{"date":"2026-10-20","priceCents":9000,"adjustmentCents":1000,"discountCents":0},{"date":"2026-10-21","priceCents":9000,"adjustmentCents":1000,"discountCents":0}]',
        '{"plan":"non_refundable","cancellationPolicy":{"chargeBasis":"full_stay","freeUntilDaysBeforeCheckIn":null},"paymentSchedule":"full_upfront","priceAdjustmentPercent":-10}',
        '2026-10-10T14:59:00.000Z', '2026-10-10T15:09:00.000Z');
    INSERT INTO payment_attempts (id, quote_id, amount_cents, currency, email, guest, source_id, status, created_at, called_at, failure_code)
      VALUES ('old-attempt', 'old-quote', 18000, 'PEN', 'legacy@example.com',
        '{"fullName":"Legacy contact","email":"legacy@example.com","phone":"+51987654321"}',
        'tkn_test_old', 'failed', '2026-10-10T15:00:00.000Z', '2026-10-10T15:00:00.000Z', 'card_declined');
  `);
  const command = { requestId: crypto.randomUUID(), actions: [{ type: "notes", notes: "kept" }] };
  db.sqlite
    .prepare(
      "INSERT INTO reservation_requests (id, reservation_id, payload, created_at) VALUES (?, 'desk', ?, '2026-10-10')",
    )
    .run(command.requestId, JSON.stringify(command));
  const tables = [
    "guests",
    "reservation_rooms",
    "reservation_room_nights",
    "payments",
    "refunds",
    "coupons",
    "coupon_movements",
    "reservation_requests",
  ];
  const before = tables.map((table) =>
    db!.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
  );
  const savedTerms =
    "SELECT id, source, rate_plan, cancellation_charge_basis, free_cancellation_days, payment_schedule, price_adjustment_percent FROM reservations ORDER BY id";
  const termsBefore = db.sqlite.prepare(savedTerms).all();
  const quoteBefore = db.sqlite
    .prepare("SELECT nights, terms FROM quotes WHERE id = 'old-quote'")
    .get();

  db.migrate();

  expect(
    tables.map((table) => db!.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()),
  ).toEqual(before);
  expect(db.sqlite.prepare(savedTerms).all()).toEqual(termsBefore);
  expect(
    db.sqlite.prepare("SELECT nights, terms FROM quotes WHERE id = 'old-quote'").get(),
  ).toEqual(quoteBefore);
  expect(db.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(
    (
      await db.request("/reservations/desk/commands", "POST", {
        requestId: crypto.randomUUID(),
        actions: [{ type: "notes", notes: "later staff edit" }],
      })
    ).status,
  ).toBe(200);
  const replay = await db.request("/reservations/desk/commands", "POST", command);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({
    id: "desk",
    totalCents: 18000,
    paidCents: 25000,
    refundedCents: 2000,
  });
  expect(db.sqlite.prepare("SELECT notes FROM reservations WHERE id = 'desk'").get()).toEqual({
    notes: "later staff edit",
  });
  expect(
    (
      await db.request("/reservations/desk/commands", "POST", {
        ...command,
        actions: [{ type: "notes", notes: "different" }],
      })
    ).status,
  ).toBe(409);

  const culqi = fakeCulqi();
  const resend = fakeResend();
  db.env.CULQI_SECRET_KEY = CULQI_TEST_KEY;
  db.env.RESEND_API_KEY = RESEND_TEST_KEY;
  db.env.RESEND_API_URL = RESEND_LOOPBACK;
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) =>
    new URL(input instanceof Request ? input.url : input).hostname === "127.0.0.1"
      ? resend.fetch(input, init)
      : culqi.fetch(input, init)) as typeof fetch);
  await db.signIn("owner");
  expect((await db.request("/controls/public-payments")).status).toBe(200);
  expect(await (await db.request("/controls/public-payments")).json()).toMatchObject({
    admitted: false,
  });
  vi.setSystemTime(new Date("2026-10-10T15:12:00Z"));
  for (let tick = 0; tick < 2; tick++) {
    const tasks: Promise<unknown>[] = [];
    worker.scheduled({} as ScheduledController, db.env, {
      waitUntil: (task: Promise<unknown>) => tasks.push(task),
    } as unknown as ExecutionContext);
    await Promise.all(tasks);
  }
  expect(
    db.sqlite
      .prepare(
        "SELECT status, reservation_id, checkout_id, confirmation_email_eligible FROM payment_attempts WHERE id = 'old-attempt'",
      )
      .get(),
  ).toEqual({
    status: "failed",
    reservation_id: null,
    checkout_id: null,
    confirmation_email_eligible: 0,
  });
  expect(
    db.sqlite.prepare("SELECT count(*) AS n FROM reservations WHERE quote_id = 'old-quote'").get(),
  ).toEqual({ n: 0 });
  expect(db.sqlite.prepare("SELECT count(*) AS n FROM reservation_access").get()).toEqual({ n: 0 });
  expect(db.sqlite.prepare("SELECT count(*) AS n FROM confirmation_emails").get()).toEqual({
    n: 0,
  });
  expect(resend.requests).toEqual([]);
  expect(culqi.requests).toEqual([]);
  const staffCreate = {
    requestId: crypto.randomUUID(),
    checkIn: "2026-10-10",
    checkOut: "2026-10-11",
    guest: { fullName: "New desk contact" },
    rooms: [
      { roomTypeId: "type", adults: 1, children: 0 },
      { roomTypeId: "type", adults: 1, children: 0 },
    ],
  };
  const created = await db.request("/reservations", "POST", staffCreate);
  expect(created.status).toBe(201);
  const desk = (await created.json()) as { id: string };
  expect((await db.request("/reservations", "POST", staffCreate)).status).toBe(201);
  expect(
    db.sqlite.prepare("SELECT count(*) AS n FROM reservations WHERE id = ?").get(desk.id),
  ).toEqual({ n: 1 });
  expect(
    (await db.request("/reservations", "POST", { ...staffCreate, requestId: crypto.randomUUID() }))
      .status,
  ).toBe(409);
});
