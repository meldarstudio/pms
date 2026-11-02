import { describe, expect, it } from "vite-plus/test";
import { addDays, filterWeekdays, inclusiveDates } from "./dates";

describe("dates", () => {
  it("selects requested weekdays from both ends of a rate range", () => {
    expect(filterWeekdays(inclusiveDates("2026-10-02", "2026-10-04"), [5, 0])).toEqual([
      "2026-10-02",
      "2026-10-04",
    ]);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});
