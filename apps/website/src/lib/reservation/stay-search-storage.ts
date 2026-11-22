import {
  firstOnlineArrival,
  occupancyOnly,
  readSearch,
  searchParams,
  type StaySearch,
} from "./search";
import { readSession, writeSession } from "./session-storage";

const STAY_SEARCH_KEY = "hm.reservation.search";

export function storeSearch(search: StaySearch) {
  writeSession(STAY_SEARCH_KEY, searchParams(occupancyOnly(search)).toString());
}

export function resumeSearch(params: URLSearchParams, roomIds: readonly string[]): StaySearch {
  const requested = readSearch(params, roomIds);
  const stored = readSession<unknown>(STAY_SEARCH_KEY);
  if ((requested.checkIn && requested.checkOut) || typeof stored !== "string") return requested;
  const kept = occupancyOnly(readSearch(new URLSearchParams(stored), []));
  const datesStillBookable = Boolean(kept.checkIn) && kept.checkIn >= firstOnlineArrival();
  return {
    ...kept,
    checkIn: datesStillBookable ? kept.checkIn : "",
    checkOut: datesStillBookable ? kept.checkOut : "",
    featured: requested.featured,
  };
}
