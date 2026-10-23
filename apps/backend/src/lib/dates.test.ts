import { describe, expect, it } from "vite-plus/test";
import { addDays, filterWeekdays, inclusiveDates, isValidDate } from "./dates";

describe("dates", () => {
  it("rejects a calendar date that does not exist", () => {
    expect(isValidDate("2026-02-31")).toBe(false);
    expect(isValidDate("2026-10-12")).toBe(true);
  });

  it("selects requested weekdays from both ends of a rate range", () => {
    expect(filterWeekdays(inclusiveDates("2026-10-02", "2026-10-04"), [5, 0])).toEqual([
      "2026-10-02",
      "2026-10-04",
    ]);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});
