import { Effect } from "effect";
import { PmsClient } from "@/lib/pms-client";
import { rooms } from "@/lib/rooms";
import { fetchOffers } from "./offers";
import { hasStayDates, readSearch } from "./search";

const roomIds = rooms.map((room) => room.id);

export async function loadRoomPage(url: URL, apiBase: string, connectingIp: string | null) {
  const params = url.searchParams;
  const search = readSearch(params, roomIds);
  if (!hasStayDates(params)) return { search, outcome: null };
  if (!search.checkIn || !search.checkOut) {
    return { search, outcome: { kind: "invalid", error: "" } as const };
  }

  const client = PmsClient.layer(apiBase, {
    headers: connectingIp ? { "cf-connecting-ip": connectingIp } : {},
  });
  const outcome = await Effect.runPromise(fetchOffers(search).pipe(Effect.provide(client)));
  return { search, outcome };
}
