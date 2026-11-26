import { Effect } from "effect";
import { PmsClient } from "@/lib/pms-client";
import { rooms } from "@/lib/rooms";
import { fetchOffers } from "./offers";
import { fetchReferenceRates } from "./reference-rates";
import { hasStayDates, readSearch } from "./search";

const roomIds = rooms.map((room) => room.id);

export async function loadRoomPage(url: URL, apiBase: string, connectingIp: string | null) {
  const client = PmsClient.layer(apiBase, {
    headers: connectingIp ? { "cf-connecting-ip": connectingIp } : {},
  });
  const params = url.searchParams;
  const search = readSearch(params, roomIds);
  const [reference, outcome] = await Promise.all([
    Effect.runPromise(fetchReferenceRates().pipe(Effect.provide(client))),
    !hasStayDates(params)
      ? null
      : search.checkIn && search.checkOut
        ? Effect.runPromise(fetchOffers(search).pipe(Effect.provide(client)))
        : ({ kind: "invalid", error: "" } as const),
  ]);
  return { initial: { search, outcome }, reference };
}
