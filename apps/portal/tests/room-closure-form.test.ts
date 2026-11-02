import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { closureNights, roomClosureFormSchema } from "../src/lib/room-closure-form.ts";

const values = { starts: "2026-03-01", ends: "2026-03-02", reason: "" };

describe("room closure form", () => {
  it("requires real dates and a range of one to sixty calendar nights", () => {
    for (const value of [
      { ...values, starts: "" },
      { ...values, ends: "" },
      { ...values, starts: "2026-02-30" },
      { ...values, ends: values.starts },
      { ...values, ends: "2026-02-28" },
      { ...values, ends: "2026-05-01" },
    ])
      assert.equal(roomClosureFormSchema.safeParse(value).success, false);
    assert.equal(roomClosureFormSchema.safeParse(values).success, true);
    assert.equal(roomClosureFormSchema.safeParse({ ...values, ends: "2026-04-30" }).success, true);
    assert.equal(closureNights("2026-03-01", "2026-04-30"), 60);
    const result = roomClosureFormSchema.safeParse({
      ...values,
      ends: values.starts,
    });
    assert.equal(result.success, false);
    if (!result.success) assert.deepEqual(result.error.issues[0].path, ["ends"]);
  });
});
