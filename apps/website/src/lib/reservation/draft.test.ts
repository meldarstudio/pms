import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { resumeSearch } from "./draft";
import { firstOnlineArrival } from "./search";

const LIMA_10_59_PM = "2026-10-11T03:59:59Z";
const LIMA_11_PM = "2026-10-11T04:00:00Z";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function savedSearchFor(checkIn: string, checkOut: string) {
  sessionStorage.setItem(
    "hm.reservation.search",
    JSON.stringify(`checkIn=${checkIn}&checkOut=${checkOut}&adults=2&children=0`),
  );
}

describe.each(["America/Lima", "Asia/Tokyo", "Pacific/Honolulu"])(
  "online arrival window in a %s browser",
  (browserZone) => {
    beforeEach(() => vi.stubEnv("TZ", browserZone));

    it.each([
      ["10:59 p.m. Lima keeps today's search", LIMA_10_59_PM, "2026-10-10", "2026-10-10"],
      ["11:00 p.m. Lima drops it and opens tomorrow", LIMA_11_PM, "2026-10-11", ""],
    ])("%s", (_name, now, earliest, keptCheckIn) => {
      vi.setSystemTime(new Date(now));
      savedSearchFor("2026-10-10", "2026-10-12");

      const resumed = resumeSearch(new URLSearchParams(), []);

      expect(firstOnlineArrival()).toBe(earliest);
      expect(resumed.checkIn).toBe(keptCheckIn);
      expect(resumed.checkOut).toBe(keptCheckIn ? "2026-10-12" : "");
    });
  },
);
