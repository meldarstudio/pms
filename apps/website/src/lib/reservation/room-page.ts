import { Effect } from "effect";
import { PmsClient } from "@/lib/pms-client";
import { rooms } from "@/lib/rooms";
import { fetchOffers, type SearchOutcome } from "./offers";
import { fetchReferenceRates, type ReferenceRateRead } from "./reference-rates";
import { readSearch, type StaySearch } from "./search";

const roomIds = rooms.map((room) => room.id);

function guestClient(apiBase: string, connectingIp: string | null) {
  return PmsClient.layer(apiBase, {
    headers: connectingIp ? { "cf-connecting-ip": connectingIp } : {},
  });
}

const loopbackApi = (apiBase: string) => {
  const { hostname } = new URL(apiBase);
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
};

export async function loadRoomPage(
  url: URL,
  apiBase: string,
  connectingIp: string | null,
  offerRead: string | null = null,
): Promise<{ search: StaySearch; outcome: SearchOutcome | null; reference: ReferenceRateRead }> {
  const params = url.searchParams;
  const search = readSearch(params, roomIds);
  const explicit = params.has("checkIn") || params.has("checkOut");
  const complete = Boolean(search.checkIn && search.checkOut);
  const offerBase =
    offerRead === "fail" && loopbackApi(apiBase) ? "http://127.0.0.1:9" : apiBase;
  const [reference, offers] = await Promise.all([
    Effect.runPromise(fetchReferenceRates().pipe(Effect.provide(guestClient(apiBase, connectingIp)))),
    explicit && complete
      ? Effect.runPromise(fetchOffers(search).pipe(Effect.provide(guestClient(offerBase, connectingIp))))
      : Promise.resolve(null),
  ]);
  return {
    search,
    reference,
    outcome: !explicit ? null : complete ? offers : { kind: "invalid", error: "" },
  };
}
