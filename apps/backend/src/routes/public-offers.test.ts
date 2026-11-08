import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { app } from "../index";
import { PORTAL_ORIGIN, WEBSITE_ORIGIN } from "../test-support/auth";
import {
  createTestDb,
  seedReservation,
  seedRooms,
  seedRoomType,
  type TestDb,
} from "../test-support/d1";

let db: TestDb;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  db = await createTestDb();
  seedRoomType(db.sqlite, { id: "type-king", name: "King", maxAdults: 2, baseRateCents: 10000 });
  seedRooms(db.sqlite, "type-king", { "room-101": "101" });
  db.env.PUBLISHED_ROOM_TYPE_IDS = "type-king";
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

const stay = { checkIn: "2026-10-20", checkOut: "2026-10-22", adults: "2", children: "0" };

function search(query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const params = new URLSearchParams({ ...stay, ...query });
  return app.request(
    `/public/offers?${params.toString()}`,
    { headers: { origin: WEBSITE_ORIGIN, "cf-connecting-ip": "203.0.113.9", ...headers } },
    db.env,
  );
}

async function offers(query: Record<string, string> = {}) {
  const response = await search(query);
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    roomTypes: { id: string; availability: string; offers: Record<string, unknown>[] }[];
  }>;
}

describe("public offer search", () => {
  it("compares Flexible and Non-refundable for the same room and dates, rounding half up", async () => {
    db.sqlite.exec(
      "INSERT INTO room_type_rates (id, room_type_id, date, price_cents) VALUES ('rate', 'type-king', '2026-10-21', 12345)",
    );

    const response = await search();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
      nights: 2,
      adults: 2,
      children: 0,
      currency: "PEN",
      roomTypes: [
        {
          id: "type-king",
          maxAdults: 2,
          maxChildren: 2,
          availability: "available",
          offers: [
            {
              ratePlan: "flexible",
              totalCents: 22345,
              requiredInitialPaymentCents: 10000,
              remainingScheduledCents: 12345,
              savingCents: 0,
              cancellation: {
                freeCancellation: "available",
                freeUntil: "2026-10-18",
                chargeCents: 10000,
              },
            },
            {
              ratePlan: "non_refundable",
              totalCents: 20111,
              requiredInitialPaymentCents: 20111,
              remainingScheduledCents: 0,
              savingCents: 2234,
              cancellation: { freeCancellation: "none", freeUntil: null, chargeCents: 20111 },
            },
          ],
        },
      ],
    });
  });

  it("offers only room types explicitly published by ID, never by name", async () => {
    seedRoomType(db.sqlite, { id: "type-new", name: "Suite", maxAdults: 2, baseRateCents: 9000 });
    seedRooms(db.sqlite, "type-new", { "room-201": "201" });
    db.env.PUBLISHED_ROOM_TYPE_IDS = " type-missing, type-king ,King";

    expect((await offers()).roomTypes.map((type) => type.id)).toEqual(["type-king"]);

    db.env.PUBLISHED_ROOM_TYPE_IDS = "";
    expect((await offers()).roomTypes).toEqual([]);
  });

  it.each([
    ["three adults", { adults: "3" }],
    ["three children", { children: "3" }],
  ])("marks a room type too small for %s without pricing it", async (_name, occupancy) => {
    seedRoomType(db.sqlite, {
      id: "type-family",
      name: "Family",
      maxAdults: 4,
      baseRateCents: 12000,
    });
    db.sqlite.exec("UPDATE room_types SET max_children = 3 WHERE id = 'type-family'");
    seedRooms(db.sqlite, "type-family", { "room-301": "301" });
    db.env.PUBLISHED_ROOM_TYPE_IDS = "type-king,type-family";

    const { roomTypes } = await offers(occupancy);

    expect(
      roomTypes.map(({ id, availability, offers }) => [id, availability, offers.length]),
    ).toEqual([
      ["type-king", "too_many_guests", 0],
      ["type-family", "available", 2],
    ]);
  });

  it.each([
    ["confirmed", "sold_out", 0],
    ["checked_in", "sold_out", 0],
    ["cancelled", "available", 2],
    ["unfulfilled", "available", 2],
  ])(
    "treats the last room held by a %s stay on one night as %s",
    async (status, availability, offerCount) => {
      seedReservation(db.sqlite, {
        id: "res",
        code: "ABC123",
        guestName: "Ana Torres",
        checkIn: "2026-10-21",
        checkOut: "2026-10-23",
        createdAt: "2026-10-01",
        roomTypeId: "type-king",
        status,
      });

      const [king] = (await offers()).roomTypes;

      expect(king!.availability).toBe(availability);
      expect(king!.offers.length).toBe(offerCount);
    },
  );

  it("is sold out when the only room is closed, and available on the departure day", async () => {
    db.sqlite.exec(
      "INSERT INTO room_closures (id, room_id, starts, ends, created_at) VALUES ('closure', 'room-101', '2026-10-21', '2026-10-23', '2026-10-01')",
    );

    expect((await offers()).roomTypes[0]!.availability).toBe("sold_out");
    expect(
      (await offers({ checkIn: "2026-10-23", checkOut: "2026-10-24" })).roomTypes[0]!.availability,
    ).toBe("available");
  });

  it.each([
    ["Lima's 23:30 still allows tomorrow", "2026-10-11T04:30:00Z", "2026-10-11", 200],
    ["Lima's midnight makes that date today", "2026-10-11T05:00:00Z", "2026-10-11", 400],
    ["today is never offered", "2026-10-10T15:00:00Z", "2026-10-10", 400],
  ])("follows the property calendar: %s", async (_name, now, checkIn, status) => {
    vi.setSystemTime(new Date(now));

    const response = await search({ checkIn, checkOut: "2026-10-13" });

    expect(response.status).toBe(status);
    if (status === 400) {
      expect(await response.json()).toEqual({ error: "online check-in must be after today" });
      expect(response.headers.get("X-Error-Field")).toBe("checkIn");
    }
  });

  it.each([
    ["no nights", "2026-10-20", "2026-10-20", 400, "stay must be at least one night"],
    [
      "departure before arrival",
      "2026-10-20",
      "2026-10-19",
      400,
      "stay must be at least one night",
    ],
    ["61 nights", "2026-10-20", "2026-12-20", 400, "stay cannot be longer than 60 nights"],
    ["an impossible date", "2026-02-30", "2026-03-02", 400, "invalid date"],
    ["60 nights", "2026-10-20", "2026-12-19", 200, undefined],
  ])("validates stay length: %s", async (_name, checkIn, checkOut, status, error) => {
    const response = await search({ checkIn, checkOut });

    expect(response.status).toBe(status);
    if (error) expect(await response.json()).toEqual({ error });
  });

  it.each([
    ["no adults", { adults: "0" }],
    ["negative children", { children: "-1" }],
    ["fractional adults", { adults: "1.5" }],
  ])("rejects %s", async (_name, occupancy) => {
    expect((await search(occupancy)).status).toBe(400);
  });

  it.each([
    ["two days before arrival is the last free day", "2026-10-12", "available", "2026-10-10"],
    ["tomorrow's arrival has no free cancellation left", "2026-10-11", "ended", "2026-10-09"],
    ["November 10 is free through November 8", "2026-11-10", "available", "2026-11-08"],
  ])("states the Flexible deadline: %s", async (_name, checkIn, freeCancellation, freeUntil) => {
    const { roomTypes } = await offers({ checkIn, checkOut: "2026-11-11" });

    expect(roomTypes[0]!.offers[0]).toMatchObject({
      ratePlan: "flexible",
      cancellation: { freeCancellation, freeUntil, chargeCents: 10000 },
    });
  });

  it("reveals no rooms, guests, counts or staff data, and sets no cookie", async () => {
    seedRooms(db.sqlite, "type-king", { "room-102": "102" });
    seedReservation(db.sqlite, {
      id: "res",
      code: "SECRET",
      guestName: "Ana Torres",
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
      createdAt: "2026-10-01",
      roomTypeId: "type-king",
      roomId: "room-101",
    });

    const response = await search({}, { cookie: "session=forged" });
    const keys = new Set<string>();
    const strings: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      if (typeof value !== "object" || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        if (!Array.isArray(value)) keys.add(key);
        walk(child);
      }
    };
    walk(await response.json());

    expect(response.status).toBe(200);
    expect([...keys].sort()).toEqual([
      "adults",
      "availability",
      "cancellation",
      "chargeCents",
      "checkIn",
      "checkOut",
      "children",
      "currency",
      "freeCancellation",
      "freeUntil",
      "id",
      "maxAdults",
      "maxChildren",
      "nights",
      "offers",
      "ratePlan",
      "remainingScheduledCents",
      "requiredInitialPaymentCents",
      "roomTypes",
      "savingCents",
      "totalCents",
    ]);
    expect(strings.sort()).toEqual([
      "2026-10-18",
      "2026-10-20",
      "2026-10-22",
      "PEN",
      "available",
      "available",
      "flexible",
      "non_refundable",
      "none",
      "type-king",
    ]);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("public access boundary", () => {
  it.each([
    ["GET", "/reservations"],
    ["GET", "/availability?checkIn=2026-10-20&checkOut=2026-10-22"],
    ["GET", "/guests?q=Ana"],
    ["GET", "/rate-plans"],
    ["POST", "/room-types"],
    ["GET", "/public/../reservations"],
  ])("keeps %s %s behind staff sign-in", async (method, path) => {
    const response = await app.request(
      path,
      { method, headers: { origin: WEBSITE_ORIGIN, "cf-connecting-ip": "203.0.113.9" } },
      db.env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers unknown public paths with not found", async () => {
    const response = await app.request("/public/reservations", {}, db.env);

    expect(response.status).toBe(404);
  });

  it("lets the website read search results without credentials", async () => {
    const preflight = await app.request(
      "/public/offers",
      {
        method: "OPTIONS",
        headers: { origin: WEBSITE_ORIGIN, "access-control-request-method": "GET" },
      },
      db.env,
    );
    const response = await search();

    expect(preflight.status).toBe(204);
    for (const answer of [preflight, response]) {
      expect(answer.headers.get("access-control-allow-origin")).toBe(WEBSITE_ORIGIN);
      expect(answer.headers.get("access-control-allow-credentials")).toBeNull();
    }
    expect(response.headers.get("access-control-expose-headers")).toContain("Retry-After");
  });

  it("does not grant the portal origin public CORS, nor the website staff CORS", async () => {
    const fromPortal = await search({}, { origin: PORTAL_ORIGIN });
    const websiteToStaff = await app.request(
      "/session",
      { headers: { origin: WEBSITE_ORIGIN } },
      db.env,
    );

    expect(fromPortal.headers.get("access-control-allow-origin")).toBeNull();
    expect(websiteToStaff.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("public search rate limit", () => {
  it("keys the allowance on the trusted connecting IP, ignoring client-supplied headers", async () => {
    const limit = vi.fn(async () => ({ success: true }));
    db.env.SEARCH_LIMITER = { limit };

    await search({}, { "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2" });
    await search({}, { "cf-connecting-ip": "198.51.100.7", "user-agent": "another-device" });

    expect(limit.mock.calls).toEqual([[{ key: "203.0.113.9" }], [{ key: "198.51.100.7" }]]);
  });

  it("answers a throttled search with 429 and a retry delay, before validating it", async () => {
    db.env.SEARCH_LIMITER = { limit: async () => ({ success: false }) };

    const response = await search({ checkIn: "not-a-date" });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "too many searches" });
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("access-control-allow-origin")).toBe(WEBSITE_ORIGIN);
  });
});
