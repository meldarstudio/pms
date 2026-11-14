import type { PublicCheckoutCreate } from "@pms/shared";
import type { SQLInputValue } from "node:sqlite";
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
import { createQuote, saveQuote } from "./quotes";
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

const legacyRows = (quoteId: string) =>
  db.sqlite
    .prepare(
      "SELECT (SELECT count(*) FROM quotes WHERE id = ?1) quotes, (SELECT count(*) FROM payment_attempts WHERE quote_id = ?1) attempts",
    )
    .get(quoteId);

async function legacyQuote(attemptStatus?: string) {
  const { id } = await createQuote(getDb(db.env.DB), stay, {
    today: "2026-10-01",
    now: new Date(),
  });
  if (attemptStatus)
    db.sqlite
      .prepare(
        `INSERT INTO payment_attempts (id, quote_id, amount_cents, currency, email, source_id, status, created_at, called_at)
         VALUES (?, ?, 10000, 'PEN', 'ana@example.com', 'tkn_legacy', ?, ?, ?)`,
      )
      .run(`attempt-${id}`, id, attemptStatus, started.toISOString(), started.toISOString());
  return id;
}

function recordQueryPlans() {
  const plans: string[] = [];
  const prepare = db.env.DB.prepare.bind(db.env.DB);
  db.env.DB.prepare = (query: string) => {
    const statement = prepare(query);
    const bind = statement.bind.bind(statement);
    statement.bind = (...params: unknown[]) => {
      const steps = db.sqlite
        .prepare(`EXPLAIN QUERY PLAN ${query}`)
        .all(...(params as SQLInputValue[])) as { parent: number; detail: string }[];
      plans.push(
        ...steps
          .filter((step) => step.parent === 0 && step.detail.startsWith("SEARCH"))
          .map((step) => step.detail),
      );
      expect(steps.map((step) => step.detail)).not.toContainEqual(
        expect.stringMatching(/^SCAN|TEMP B-TREE/),
      );
      return bind(...params);
    };
    return statement;
  };
  return plans;
}

describe("abandoned checkout purge", () => {
  it("deletes an abandoned checkout's quotes, acceptance and failed attempt once it has been idle over 30 days", async () => {
    const abandoned = await declinedCheckout();
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
  });

  it("changes nothing on a run with nothing due", async () => {
    await declinedCheckout();
    await legacyQuote("failed");
    vi.setSystemTime(daysLater(20));
    await declinedCheckout();
    await purge(daysLater(31));
    const afterFirstRun = history();

    await purge(daysLater(31));

    expect(history()).toEqual(afterFirstRun);
  });

  it("keeps a checkout opened 29 days ago", async () => {
    const opened = await declinedCheckout();
    const before = history();

    await purge(daysLater(29));

    expect(history()).toEqual(before);
    expect(checkoutRows(opened).checkouts).toBe(1);
  });

  it.each([
    [
      "a quote refreshed",
      "UPDATE quotes SET created_at = ? WHERE rowid = (SELECT max(rowid) FROM quotes WHERE checkout_id = ?)",
    ],
    [
      "an agreement accepted",
      "UPDATE checkout_acceptances SET accepted_at = ? WHERE checkout_id = ?",
    ],
    [
      "bank authentication continued",
      "UPDATE payment_attempts SET called_at = ? WHERE checkout_id = ?",
    ],
  ])("keeps an older checkout alive for 30 days after %s", async (_activity, touch) => {
    const opened = await declinedCheckout();
    db.sqlite.prepare(touch).run(daysLater(21).toISOString(), opened);
    const before = checkoutRows(opened);

    await purge(daysLater(31));
    expect(checkoutRows(opened)).toEqual(before);

    await purge(daysLater(52));
    expect(checkoutRows(opened).checkouts).toBe(0);
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

  describe("attempts recorded against its quote before attempts named their checkout", () => {
    async function checkoutWithQuoteAttempt(status: string) {
      const opened = await checkout();
      const { id: quoteId } = await latestQuote(getDb(db.env.DB), opened.id);
      db.sqlite
        .prepare(
          `INSERT INTO payment_attempts (id, quote_id, amount_cents, currency, email, source_id, status, created_at, called_at)
           VALUES ('quote-attempt', ?, 10000, 'PEN', 'ana@example.com', 'tkn_legacy', ?, ?, ?)`,
        )
        .run(quoteId, status, started.toISOString(), started.toISOString());
      return opened.id;
    }
    const quoteAttempts = () =>
      db.sqlite.prepare("SELECT count(*) n FROM payment_attempts WHERE id = 'quote-attempt'").get();

    it("deletes a failed one with the checkout", async () => {
      const opened = await checkoutWithQuoteAttempt("failed");
      const failures = vi.spyOn(console, "error");

      await purge(daysLater(31));

      expect(failures).not.toHaveBeenCalled();
      expect(checkoutRows(opened).checkouts).toBe(0);
      expect(quoteAttempts()).toEqual({ n: 0 });
    });

    it.each(["unknown", "review", "succeeded", "saved"])(
      "keeps the checkout with a %s one however old",
      async (status) => {
        await checkoutWithQuoteAttempt(status);
        const before = history();
        const failures = vi.spyOn(console, "error");

        await purge(daysLater(400));

        expect(failures).not.toHaveBeenCalled();
        expect(history()).toEqual(before);
      },
    );
  });

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

  describe("quotes from before public checkouts", () => {
    it("deletes one that expired over 30 days ago, with its failed attempt", async () => {
      const unpaid = await legacyQuote();
      const declined = await legacyQuote("failed");

      await purge(daysLater(31));

      expect(legacyRows(unpaid)).toEqual({ quotes: 0, attempts: 0 });
      expect(legacyRows(declined)).toEqual({ quotes: 0, attempts: 0 });
    });

    it("keeps one that expired 29 days ago", async () => {
      const quote = await legacyQuote("failed");

      await purge(daysLater(29));

      expect(legacyRows(quote)).toEqual({ quotes: 1, attempts: 1 });
    });

    it.each(["unknown", "review", "succeeded", "saved"])(
      "keeps one with a %s payment attempt however old",
      async (status) => {
        const quote = await legacyQuote(status);

        await purge(daysLater(400));

        expect(legacyRows(quote)).toEqual({ quotes: 1, attempts: 1 });
      },
    );

    it("keeps one that became a reservation", async () => {
      const quote = await legacyQuote("failed");
      await saveQuote(getDb(db.env.DB), quote, {
        fullName: "Ana Torres",
        email: "ana@example.com",
      });
      const before = history();

      await purge(daysLater(400));

      expect(history()).toEqual(before);
    });
  });

  it("looks for due checkouts and quotes through indexes that leave out reserved checkouts", async () => {
    const opened = await checkout();
    await accept(opened);
    expect(await pay(opened, `tkn_test_${crypto.randomUUID()}`)).toMatchObject({
      status: "saved",
    });
    const plans = recordQueryPlans();

    await purge(daysLater(400));

    expect(plans).toEqual([
      expect.stringMatching(
        /^SEARCH public_checkouts USING INDEX public_checkouts_never_reserved_age /,
      ),
      expect.stringMatching(
        /^SEARCH quotes USING INDEX quotes_checkout \(checkout_id=\? AND created_at<\?\)/,
      ),
    ]);
    expect(
      db.sqlite
        .prepare(
          "SELECT id FROM public_checkouts INDEXED BY public_checkouts_never_reserved_age WHERE reserved_once = 0 AND created_at < ?",
        )
        .all(daysLater(400).toISOString()),
    ).toEqual([]);
  });

  it("leaves checkouts reserved before this purge existed out of its age index", async () => {
    db.close();
    db = await createTestDb({ migrateThrough: "0036_status_guards" });
    seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
    db.sqlite.exec(`
      INSERT INTO public_checkouts (id, token_hash, room_type_id, check_in, check_out, adults, children, rate_plan, language, created_at)
        VALUES ('reserved', 'hash-1', 'type', '2026-12-20', '2026-12-22', 2, 0, 'flexible', 'es', '2026-01-01T00:00:00.000Z'),
               ('abandoned', 'hash-2', 'type', '2026-12-20', '2026-12-22', 2, 0, 'flexible', 'es', '2026-01-01T00:00:00.000Z');
      INSERT INTO guests (id, full_name, created_at) VALUES ('guest', 'Ana Torres', '2026-01-01');
      INSERT INTO reservations (id, code, guest_id, check_in, check_out, source, public_checkout_id, created_at)
        VALUES ('reservation', 'ONLINE', 'guest', '2026-12-20', '2026-12-22', 'online', 'reserved', '2026-01-01');
    `);

    db.migrate();

    expect(
      db.sqlite
        .prepare(
          "SELECT id FROM public_checkouts INDEXED BY public_checkouts_never_reserved_age WHERE reserved_once = 0 AND created_at < ?",
        )
        .all(started.toISOString()),
    ).toEqual([{ id: "abandoned" }]);
    await purge(started);
    expect(db.sqlite.prepare("SELECT id FROM public_checkouts").all()).toEqual([
      { id: "reserved" },
    ]);
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
