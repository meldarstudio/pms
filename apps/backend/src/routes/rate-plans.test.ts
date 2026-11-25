import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { app } from "../index";
import { WEBSITE_ORIGIN } from "../test-support/auth";
import { createTestDb, seedRooms, seedRoomType, type TestDb } from "../test-support/d1";

let db: TestDb;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

const save = (reductionPercent: number) =>
  db.request("/rate-plans/non-refundable", "PUT", { reductionPercent });

it("keeps the property-wide price adjustment read-only for staff", async () => {
  expect((await save(20)).status).toBe(403);
  expect(await (await db.request("/rate-plans")).json()).toMatchObject([
    { plan: "flexible", priceAdjustmentPercent: 0 },
    { plan: "non_refundable", priceAdjustmentPercent: -10 },
  ]);
});

it("rejects an adjustment that would make every Non-refundable night free", async () => {
  await db.signIn("owner");
  const response = await save(100);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "rate reduction must be a whole percentage from 1 to 99",
  });
  expect(await (await db.request("/rate-plans")).json()).toMatchObject([
    { plan: "flexible", priceAdjustmentPercent: 0 },
    { plan: "non_refundable", priceAdjustmentPercent: -10 },
  ]);
});

it("uses the saved adjustment for both inventory and online offers without changing Flexible", async () => {
  seedRoomType(db.sqlite, { id: "type", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type", { "room-101": "101" });
  db.env.PUBLISHED_ROOM_TYPE_IDS = "type";
  db.sqlite.exec(
    "INSERT INTO room_type_rates (id, room_type_id, date, price_cents) VALUES ('rate', 'type', '2026-10-21', 15000)",
  );
  await db.signIn("owner");
  expect((await save(15)).status).toBe(200);
  const saved = await save(20);
  expect(saved.status).toBe(200);
  const plans = [
    { plan: "flexible", priceAdjustmentPercent: 0 },
    { plan: "non_refundable", priceAdjustmentPercent: -20 },
  ];
  expect(await saved.json()).toMatchObject(plans);
  expect(await (await db.request("/rate-plans")).json()).toMatchObject(plans);

  const inventory = await db.request("/inventory?from=2026-10-20&to=2026-10-21");
  expect(inventory.status).toBe(200);
  expect(await inventory.json()).toMatchObject({
    ratePlans: plans,
    roomTypes: [
      {
        nights: [
          { planPrices: { flexible: 10000, non_refundable: 8000 } },
          { planPrices: { flexible: 15000, non_refundable: 12000 } },
        ],
      },
    ],
  });
  const search = await app.request(
    "/public/offers?checkIn=2026-10-20&checkOut=2026-10-22",
    { headers: { origin: WEBSITE_ORIGIN, "cf-connecting-ip": "203.0.113.9" } },
    db.env,
  );
  expect(search.status).toBe(200);
  expect(await search.json()).toMatchObject({
    roomTypes: [
      {
        offers: [
          { ratePlan: "flexible", totalCents: 25000 },
          { ratePlan: "non_refundable", totalCents: 20000, requiredInitialPaymentCents: 20000 },
        ],
      },
    ],
  });
});
