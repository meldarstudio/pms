import type { RoomRequest } from "@pms/shared";
import type { QuotedRoom } from "./db/schema";

export function legacyFirstRoomColumns(rooms: RoomRequest[]) {
  const [first] = rooms;
  if (!first) throw new Error("a stay needs at least one room");
  return {
    legacyFirstRoomTypeId: first.roomTypeId,
    legacyFirstRoomAdults: first.adults,
    legacyFirstRoomChildren: first.children,
  };
}

export const legacyFirstQuotedRoomColumns = (rooms: QuotedRoom[]) => ({
  ...legacyFirstRoomColumns(rooms),
  legacyFirstRoomNights: rooms[0]!.nights,
});

export type LegacyOneRoomOccupancy = { adults?: number; children?: number };

type OfferedType = { maxAdults: number; maxChildren: number; remaining: number };

export function legacyOneRoomOffers<Type extends OfferedType, Result extends { roomTypes: Type[] }>(
  result: Result,
  { adults, children }: LegacyOneRoomOccupancy,
) {
  if (adults === undefined) return result;
  const guests = { adults, children: children ?? 0 };
  return {
    ...result,
    ...guests,
    roomTypes: result.roomTypes.map((type) => ({
      ...type,
      availability:
        guests.adults > type.maxAdults || guests.children > type.maxChildren
          ? "too_many_guests"
          : type.remaining > 0
            ? "available"
            : "sold_out",
    })),
  };
}

type PresentedRoom = Pick<QuotedRoom, "roomTypeId" | "adults" | "children"> & {
  nights: { date: string; priceCents: number }[];
};

export function legacyOneRoomCheckoutFields<View extends { rooms: PresentedRoom[]; quote: object }>(
  view: View,
) {
  const [only, ...others] = view.rooms;
  if (!only || others.length) return view;
  return {
    ...view,
    roomTypeId: only.roomTypeId,
    adults: only.adults,
    children: only.children,
    quote: { ...view.quote, nights: only.nights },
  };
}
