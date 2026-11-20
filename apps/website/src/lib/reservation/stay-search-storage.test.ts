import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { resumeSearch } from "./stay-search-storage";

beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) =>
      key === "hm.reservation.search"
        ? JSON.stringify("checkIn=2026-10-10&checkOut=2026-10-12&adults=2&children=0")
        : null,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("keeps a still-bookable same-day stay just before Lima's cutoff", () => {
  vi.setSystemTime(new Date("2026-10-11T03:59:59Z"));

  expect(resumeSearch(new URLSearchParams(), [])).toMatchObject({
    checkIn: "2026-10-10",
    checkOut: "2026-10-12",
  });
});

it("drops both saved dates when Lima closes same-day arrival", () => {
  vi.setSystemTime(new Date("2026-10-11T04:00:00Z"));

  expect(resumeSearch(new URLSearchParams(), [])).toMatchObject({
    checkIn: "",
    checkOut: "",
  });
});
