import type { PublicCheckoutCreate } from "@pms/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getDb } from "./db";
import type { presentReservation } from "./present";
import { startCheckout } from "./public-checkouts";
import { saveQuote } from "./quotes";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "./test-support/d1";

type Detail = ReturnType<typeof presentReservation>;

let db: TestDb;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type", { "room-101": "101" });
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

const stay: PublicCheckoutCreate = {
  roomTypeId: "type",
  checkIn: "2026-10-20",
  checkOut: "2026-10-22",
  adults: 2,
  children: 0,
  ratePlan: "non_refundable",
  language: "es",
};
const guest = { fullName: "Ana Torres", email: "ana@example.com" };

async function quote() {
  const { view } = await startCheckout(getDb(db.env.DB), stay, {
    today: "2026-10-10",
    now: new Date(),
    published: ["type"],
  });
  return view.quote;
}
const save = (quoteId: string) => saveQuote(getDb(db.env.DB), quoteId, guest);

async function reservation(id: string) {
  const response = await db.request(`/reservations/${id}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<Detail>;
}

describe("quotes", () => {
  it("prices two Non-refundable nights at S/100 as S/180 to pay, held for 10 minutes", async () => {
    const quoted = await quote();

    expect(quoted).toMatchObject({
      nights: [
        { date: "2026-10-20", priceCents: 9000 },
        { date: "2026-10-21", priceCents: 9000 },
      ],
      totalCents: 18000,
      requiredInitialPaymentCents: 18000,
      remainingScheduledCents: 0,
      expiresAt: "2026-10-10T15:10:00.000Z",
      expired: false,
    });
  });

  it("saves the online reservation at the quoted prices after a rate change", async () => {
    const quoted = await quote();
    db.sqlite.exec(
      "INSERT INTO room_type_rates (id, room_type_id, date, price_cents) VALUES ('rate', 'type', '2026-10-20', 20000)",
    );

    const saved = await reservation(await save(quoted.id));

    expect(saved).toMatchObject({
      status: "confirmed",
      source: "online",
      guest: { fullName: "Ana Torres", email: "ana@example.com" },
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
      ratePlan: { plan: "non_refundable" },
      totalCents: 18000,
      requiredInitialPaymentCents: 18000,
      rooms: [{ roomTypeId: "type", roomId: null, adults: 2, children: 0 }],
    });
    expect(saved.rooms[0]!.nights.map((night) => night.priceCents)).toEqual([9000, 9000]);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM reservation_access").get()).toEqual({
      n: 0,
    });
  });

  it("saves only the first of two quotes for the last room", async () => {
    const first = await quote();
    const second = await quote();

    await save(first.id);

    await expect(save(second.id)).rejects.toThrow("no availability");
    await expect(quote()).rejects.toThrow("no availability");
  });

  it("saves one reservation from a retried quote, even when the retry commits first", async () => {
    const quoted = await quote();
    let retry: Promise<string> | undefined;
    db.beforeCommit(() => (retry = save(quoted.id)));

    const id = await save(quoted.id);

    expect(await retry).toBe(id);
    expect(await save(quoted.id)).toBe(id);
    expect(
      db.sqlite
        .prepare("SELECT count(*) AS count FROM reservations WHERE quote_id = ?")
        .get(quoted.id),
    ).toEqual({ count: 1 });
  });
});
