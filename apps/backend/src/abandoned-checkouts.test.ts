import type { PublicCheckoutCreate } from "@pms/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { purgeAbandonedCheckouts } from "./abandoned-checkouts";
import { culqiClient } from "./culqi";
import { getDb } from "./db";
import worker from "./index";
import { setPublicPaymentAdmission } from "./operation-controls";
import { startPaymentAttempt, type PaymentContext } from "./payment-attempts";
import {
  acceptCheckoutQuote,
  checkoutForToken,
  latestAcceptance,
  latestQuote,
  requoteCheckout,
  startCheckout,
} from "./public-checkouts";
import { CULQI_TEST_KEY, fakeCulqi, type FakeCulqi } from "./test-support/culqi";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "./test-support/d1";

const DAY_MS = 24 * 60 * 60 * 1000;
const started = new Date("2026-10-01T15:00:00Z");
const daysLater = (days: number) => new Date(started.getTime() + days * DAY_MS);

const stay: PublicCheckoutCreate = {
  roomTypeId: "type",
  checkIn: "2026-12-20",
  checkOut: "2026-12-22",
  adults: 2,
  children: 0,
  ratePlan: "non_refundable",
  language: "es",
};
const contact = { fullName: "Ana Torres", email: "ana@example.com", phone: "987 654 321" };

const CHECKOUT_HISTORY = [
  "public_checkouts",
  "quotes",
  "checkout_acceptances",
  "payment_attempts",
  "reservations",
  "reservation_access",
  "payments",
  "confirmation_emails",
];

let db: TestDb;
let culqi: FakeCulqi;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(started);
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type", { "room-101": "101" });
  culqi = fakeCulqi();
  await setPublicPaymentAdmission(getDb(db.env.DB), true, { accountId: "owner", now: new Date() });
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const purge = (now: Date) => purgeAbandonedCheckouts(getDb(db.env.DB), now);

const checkoutContext = () => ({
  today: new Date().toISOString().slice(0, 10),
  firstNewArrival: new Date().toISOString().slice(0, 10),
  now: new Date(),
  published: ["type"],
});

const paymentContext = (): PaymentContext => ({
  culqi: culqiClient({ secretKey: CULQI_TEST_KEY, fetch: culqi.fetch }),
  currency: "PEN",
  timeZone: "America/Lima",
});

async function checkout() {
  const opened = await startCheckout(getDb(db.env.DB), stay, checkoutContext());
  return checkoutForToken(getDb(db.env.DB), `Bearer ${opened.token}`, checkoutContext());
}

type Checkout = Awaited<ReturnType<typeof checkout>>;

async function accept(opened: Checkout) {
  const { id: quoteId } = await latestQuote(getDb(db.env.DB), opened.id);
  await acceptCheckoutQuote(
    getDb(db.env.DB),
    opened,
    { quoteId, language: "es", contact, agreed: true },
    checkoutContext(),
  );
}

async function pay(opened: Checkout, sourceId: string) {
  const { id: quoteId } = await latestQuote(getDb(db.env.DB), opened.id);
  const acceptance = await latestAcceptance(getDb(db.env.DB), opened.id);
  return startPaymentAttempt(getDb(db.env.DB), { quoteId, sourceId }, paymentContext(), {
    checkoutId: opened.id,
    acceptanceId: acceptance!.id,
    language: "es",
  });
}

async function declinedCheckout() {
  const opened = await checkout();
  await requoteCheckout(getDb(db.env.DB), opened, checkoutContext());
  await accept(opened);
  expect(await pay(opened, "tkn_test_decline")).toMatchObject({ status: "failed" });
  return opened.id;
}

function checkoutRows(checkoutId: string) {
  const count = (sql: string) => (db.sqlite.prepare(sql).get(checkoutId) as { n: number }).n;
  return {
    checkouts: count("SELECT count(*) n FROM public_checkouts WHERE id = ?"),
    quotes: count("SELECT count(*) n FROM quotes WHERE checkout_id = ?"),
    acceptances: count("SELECT count(*) n FROM checkout_acceptances WHERE checkout_id = ?"),
    attempts: count("SELECT count(*) n FROM payment_attempts WHERE checkout_id = ?"),
  };
}

const history = () =>
  Object.fromEntries(
    CHECKOUT_HISTORY.map((table) => [
      table,
      db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );

describe("abandoned checkout purge", () => {
  it("deletes an abandoned checkout after 30 idle days without deleting legacy quotes", async () => {
    const abandoned = await declinedCheckout();
    const legacyCheckout = await checkout();
    const { id: legacyQuote } = await latestQuote(getDb(db.env.DB), legacyCheckout.id);
    const legacyRow = db.sqlite.prepare("SELECT * FROM quotes WHERE id = ?");
    db.sqlite.prepare("UPDATE quotes SET checkout_id = NULL WHERE id = ?").run(legacyQuote);
    const legacyBefore = legacyRow.get(legacyQuote);
    vi.setSystemTime(daysLater(20));
    const recent = await declinedCheckout();
    const recentRows = checkoutRows(recent);
    expect(checkoutRows(abandoned)).toEqual({
      checkouts: 1,
      quotes: 2,
      acceptances: 1,
      attempts: 1,
    });

    await purge(daysLater(31));

    expect(checkoutRows(abandoned)).toEqual({
      checkouts: 0,
      quotes: 0,
      acceptances: 0,
      attempts: 0,
    });
    expect(checkoutRows(recent)).toEqual(recentRows);
    expect(legacyRow.get(legacyQuote)).toEqual(legacyBefore);
  });

  it("keeps a checkout opened 29 days ago", async () => {
    const opened = await declinedCheckout();
    const before = history();

    await purge(daysLater(29));

    expect(history()).toEqual(before);
    expect(checkoutRows(opened).checkouts).toBe(1);
  });

  it.each(["confirmed", "unfulfilled", "cancelled"])(
    "keeps a checkout with a %s reservation whole, including its earlier failed attempt and confirmation email",
    async (status) => {
      const opened = await checkout();
      await accept(opened);
      expect(await pay(opened, "tkn_test_decline")).toMatchObject({ status: "failed" });
      const paid = await pay(opened, `tkn_test_${crypto.randomUUID()}`);
      expect(paid).toMatchObject({ status: "saved" });
      db.sqlite
        .prepare("UPDATE reservations SET status = ? WHERE id = ?")
        .run(status, paid.reservation!.id);
      const before = history();
      expect(before["confirmation_emails"]).toHaveLength(1);

      await purge(daysLater(400));

      expect(history()).toEqual(before);
    },
  );

  it.each(["unknown", "review", "succeeded", "saved"])(
    "keeps a checkout with a %s payment attempt however old",
    async (status) => {
      const opened = await declinedCheckout();
      db.sqlite
        .prepare("UPDATE payment_attempts SET status = ? WHERE checkout_id = ?")
        .run(status, opened);
      const before = history();

      await purge(daysLater(400));

      expect(history()).toEqual(before);
    },
  );

  it.each([
    {
      race: "the guest refreshes its quote",
      during: (opened: Checkout) => requoteCheckout(getDb(db.env.DB), opened, checkoutContext()),
      kept: { checkouts: 1, quotes: 2, acceptances: 2, attempts: 1 },
    },
    {
      race: "reconciliation finds its attempt paid",
      during: (opened: Checkout) =>
        db.sqlite
          .prepare("UPDATE payment_attempts SET status = 'succeeded' WHERE checkout_id = ?")
          .run(opened.id),
      kept: { checkouts: 1, quotes: 1, acceptances: 1, attempts: 1 },
    },
  ])("keeps a checkout when $race between choosing and deleting it", async ({ during, kept }) => {
    const opened = await checkout();
    await accept(opened);
    expect(await pay(opened, "tkn_test_decline")).toMatchObject({ status: "failed" });
    vi.setSystemTime(daysLater(31));
    const race = vi.fn(() => during(opened));
    db.beforeCommit(race);

    await purge(daysLater(31));

    expect(race).toHaveBeenCalledOnce();
    expect(checkoutRows(opened.id)).toEqual(kept);
  });

  it("runs in the Worker's scheduled run", async () => {
    const abandoned = await declinedCheckout();
    vi.setSystemTime(daysLater(31));
    const scheduled: Promise<unknown>[] = [];

    worker.scheduled({} as ScheduledController, db.env, {
      waitUntil: (task: Promise<unknown>) => scheduled.push(task),
    } as unknown as ExecutionContext);
    await Promise.all(scheduled);

    expect(checkoutRows(abandoned).checkouts).toBe(0);
  });
});
