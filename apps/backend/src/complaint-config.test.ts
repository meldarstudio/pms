import { expect, it } from "vite-plus/test";
import { complaintResponseDueDate } from "./complaint-config";

it.each([
  ["skips weekends from the day after filing", "2026-02-02T15:00:00Z", "2026-02-23"],
  [
    "files late evening on the property date, not the UTC date",
    "2026-02-03T04:30:00Z",
    "2026-02-23",
  ],
  ["starts a weekend filing on the following Monday", "2026-02-07T15:00:00Z", "2026-02-27"],
  [
    "counts national holidays as business days so the deadline is never later than the legal one",
    "2026-07-20T15:00:00Z",
    "2026-08-10",
  ],
])("%s", (_, filedAt, dueDate) => {
  expect(complaintResponseDueDate(filedAt, "America/Lima")).toBe(dueDate);
});
