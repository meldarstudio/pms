import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vite-plus/test";
import { configurePropertyCalendar } from "../src/lib/property-calendar.ts";
import {
  calendarSearch,
  inventorySearch,
  reservationsSearch,
  validDay,
} from "../src/lib/route-search.ts";

beforeEach(() => {
  configurePropertyCalendar("America/Lima");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T01:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("route search validation", () => {
  it("accepts real calendar dates and rejects malformed dates", () => {
    assert.equal(validDay("2026-04-30"), "2026-04-30");
    assert.equal(validDay("2026-02-30"), undefined);
    assert.equal(validDay("30-04-2026"), undefined);
  });

  it("applies route-specific span defaults", () => {
    assert.deepEqual(calendarSearch({ from: "2026-04-30", span: "14" }), {
      from: "2026-04-30",
      span: 14,
    });
    assert.equal(calendarSearch({ span: 99 }).span, 7);
    assert.deepEqual(inventorySearch({ from: "2026-04-30", span: "7" }), {
      from: "2026-04-30",
      span: 7,
    });
    assert.equal(inventorySearch({}).span, 14);
  });

  it("normalizes reservation filters and pagination", () => {
    assert.deepEqual(reservationsSearch({ q: "ana", status: "checked_in", page: 3 }), {
      view: "arrivals",
      q: "ana",
      statuses: "checked_in",
      day: "2026-10-31",
      balance: "all",
      assignment: "all",
      sort: "guestName",
      direction: "asc",
      size: 50,
      page: 3,
    });
    assert.equal(reservationsSearch({ q: 1 }).q, "");
    for (const page of [-1, 1.5, "nope", Number.MAX_SAFE_INTEGER])
      assert.equal(reservationsSearch({ page }).page, 0);
    assert.equal(reservationsSearch({ page: "2" }).page, 2);
    assert.equal(
      reservationsSearch({ statuses: "cancelled,confirmed,confirmed,bogus" }).statuses,
      "confirmed,cancelled",
    );
    assert.equal(
      reservationsSearch({ statuses: "bogus" }).statuses,
      "confirmed,checked_in,checked_out",
    );
    assert.equal(reservationsSearch({ statuses: "all" }).statuses, "all");
    assert.equal(reservationsSearch({ statuses: "" }).statuses, "all");
    assert.equal(
      reservationsSearch({ statuses: "confirmed,checked_in,checked_out,cancelled" }).statuses,
      "all",
    );
    assert.equal(
      reservationsSearch({ view: "in-house", statuses: "cancelled" }).statuses,
      "checked_in",
    );
    assert.equal(reservationsSearch({ view: "all" }).sort, "checkIn");
    assert.equal(reservationsSearch({ sort: "bogus", direction: "bogus", size: 999 }).size, 50);
  });

  it("defaults a missing, empty, invalid, or all check-in to the property date", () => {
    const today = "2026-10-31";
    assert.equal(reservationsSearch({}).day, today);
    assert.equal(reservationsSearch({ checkIn: "all" }).day, today);
    assert.equal(reservationsSearch({ checkIn: "" }).day, today);
    assert.equal(reservationsSearch({ checkIn: "2026-04-30" }).day, "2026-04-30");
    assert.equal(reservationsSearch({ checkIn: "2026-02-30" }).day, today);
    assert.equal(reservationsSearch({ checkIn: "nope" }).day, today);
  });

  it("uses current property defaults at midnight without changing explicit URL dates", () => {
    for (const search of [calendarSearch, inventorySearch]) {
      assert.equal(search({}).from, "2026-10-31");
      assert.equal(search({ from: "2026-12-31" }).from, "2026-12-31");
    }
    vi.setSystemTime(new Date("2026-11-01T04:59:59.999Z"));
    assert.equal(reservationsSearch({}).day, "2026-10-31");
    vi.setSystemTime(new Date("2026-11-01T05:00:00Z"));
    assert.equal(calendarSearch({}).from, "2026-11-01");
    assert.equal(inventorySearch({}).from, "2026-11-01");
    assert.equal(reservationsSearch({}).day, "2026-11-01");
    assert.equal(reservationsSearch({ day: "2026-10-31" }).day, "2026-10-31");
  });

  it.each([
    ["America/Lima", "2027-01-01T01:00:00Z", "2026-12-31"],
    ["America/New_York", "2026-03-08T04:59:59Z", "2026-03-07"],
    ["America/New_York", "2026-03-08T05:00:00Z", "2026-03-08"],
    ["America/New_York", "2026-03-09T03:59:59Z", "2026-03-08"],
    ["America/New_York", "2026-03-09T04:00:00Z", "2026-03-09"],
  ])("normalizes operational dates in %s at %s", (timeZone, instant, today) => {
    configurePropertyCalendar(timeZone);
    vi.setSystemTime(new Date(instant));
    assert.equal(calendarSearch({}).from, today);
    assert.equal(inventorySearch({}).from, today);
    assert.equal(reservationsSearch({}).day, today);
    assert.equal(calendarSearch({ from: "2026-10-31" }).from, "2026-10-31");
  });
});
