import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { utcToday } from "../src/lib/reservation-form-schemas.ts";
import {
  calendarSearch,
  inventorySearch,
  reservationsSearch,
  validDay,
} from "../src/lib/route-search.ts";

describe("route search validation", () => {
  it("discards unsupported no-show filters", () => {
    assert.equal(reservationsSearch({ status: "no_show" }).status, "all");
  });

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
    const today = utcToday();
    assert.deepEqual(reservationsSearch({ q: "ana", status: "checked_in", page: 3 }), {
      q: "ana",
      status: "checked_in",
      checkIn: today,
      page: 3,
    });
    assert.deepEqual(reservationsSearch({ q: 1, status: "invalid", page: -1 }), {
      q: "",
      status: "all",
      checkIn: today,
      page: 0,
    });
    assert.deepEqual(reservationsSearch({ page: 1.5 }), {
      q: "",
      status: "all",
      checkIn: today,
      page: 0,
    });
    assert.deepEqual(reservationsSearch({ page: "2" }), {
      q: "",
      status: "all",
      checkIn: today,
      page: 2,
    });
  });

  it("defaults a missing, empty, invalid, or all check-in to UTC today", () => {
    const today = utcToday();
    assert.equal(reservationsSearch({}).checkIn, today);
    assert.equal(reservationsSearch({ checkIn: "all" }).checkIn, today);
    assert.equal(reservationsSearch({ checkIn: "" }).checkIn, today);
    assert.equal(reservationsSearch({ checkIn: "2026-04-30" }).checkIn, "2026-04-30");
    assert.equal(reservationsSearch({ checkIn: "2026-02-30" }).checkIn, today);
    assert.equal(reservationsSearch({ checkIn: "nope" }).checkIn, today);
  });
});
