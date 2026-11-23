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
  checkIn: "2026-10-20",
  checkOut: "2026-10-22",
  ratePlan: "non_refundable",
  language: "es",
  rooms: [{ roomTypeId: "type", adults: 2, children: 0 }],
};
const guest = { fullName: "Ana Torres", email: "ana@example.com" };

async function checkout() {
  const { view } = await startCheckout(getDb(db.env.DB), stay, {
    today: "2026-10-10",
    firstNewArrival: "2026-10-10",
    now: new Date(),
    published: ["type"],
  });
  return view;
}
const quote = async () => (await checkout()).quote;
const save = (quoteId: string) => saveQuote(getDb(db.env.DB), quoteId, guest);

async function reservation(id: string) {
  const response = await db.request(`/reservations/${id}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<Detail>;
}

describe("quotes", () => {
  it("prices two Non-refundable nights at S/100 as S/180 to pay, held for 10 minutes", async () => {
    const { rooms, quote: quoted } = await checkout();

    expect(rooms[0]!.nights).toEqual([
      { date: "2026-10-20", priceCents: 9000 },
      { date: "2026-10-21", priceCents: 9000 },
    ]);
    expect(quoted).toMatchObject({
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
      channel: "online",
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

  it("keeps a web reservation's channel, which payment recovery uses to find rebookings", async () => {
    const id = await save((await quote()).id);

    const relabel = await db.request(`/reservations/${id}/commands`, "POST", {
      requestId: crypto.randomUUID(),
      actions: [{ type: "set-channel", channel: "expedia" }],
    });

    expect(relabel.status).toBe(400);
    expect((await reservation(id)).channel).toBe("online");
  });

  it("saves only the first of two quotes for the last room", async () => {
    const first = await quote();
    const second = await quote();

    await save(first.id);

    await expect(save(second.id)).rejects.toThrow("no availability");
    await expect(quote()).rejects.toThrow("no availability");
  });

  it("saves one reservation with every room from a retried quote, even when the retry commits first", async () => {
    seedRoomType(db.sqlite, { id: "queen", name: "Queen", maxAdults: 2, baseRateCents: 9000 });
    seedRooms(db.sqlite, "queen", { "room-201": "201" });
    const { view } = await startCheckout(
      getDb(db.env.DB),
      { ...stay, rooms: [...stay.rooms, { roomTypeId: "queen", adults: 1, children: 0 }] },
      {
        today: "2026-10-10",
        firstNewArrival: "2026-10-10",
        now: new Date(),
        published: ["type", "queen"],
      },
    );
    const quoted = view.quote;
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
    expect(
      db.sqlite.prepare("SELECT room_type_id FROM reservation_rooms ORDER BY rowid").all(),
    ).toEqual([{ room_type_id: "type" }, { room_type_id: "queen" }]);
  });
});
