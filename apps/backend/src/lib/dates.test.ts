import { describe, expect, it } from "vite-plus/test";
import {
  addDays,
  filterWeekdays,
  inclusiveDates,
  isValidDate,
  nightsBetween,
  weekday,
} from "./dates";

describe("dates", () => {
  it("rejects a calendar date that does not exist", () => {
    expect(isValidDate("2026-02-31")).toBe(false);
    expect(isValidDate("2026-10-12")).toBe(true);
  });

  it("counts nights up to but not including check-out", () => {
    expect(nightsBetween("2026-10-12", "2026-10-13")).toEqual(["2026-10-12"]);
    expect(nightsBetween("2026-10-12", "2026-10-14")).toEqual(["2026-10-12", "2026-10-13"]);
    expect(nightsBetween("2026-10-12", "2026-10-12")).toEqual([]);
  });

  it("includes both ends of a rate range", () => {
    expect(inclusiveDates("2026-10-02", "2026-10-04")).toEqual([
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("keeps Friday and Saturday when those weekdays are requested", () => {
    expect(weekday("2026-10-02")).toBe(5);
    expect(weekday("2026-10-03")).toBe(6);
    expect(filterWeekdays(inclusiveDates("2026-10-02", "2026-10-04"), [5, 6])).toEqual([
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});
