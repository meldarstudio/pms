import type { Lang } from "@/i18n/utils";
import type { StayDetailId } from "@/lib/included";
import type { OfferSearchResult } from "@/lib/reservation/offers";
import type { StaySearch } from "@/lib/reservation/search";
import type { StaySearchCopy } from "@/lib/reservation/stay-copy";
import type { RoomId } from "@/lib/rooms";
import type { RoomsBookingKey, RoomsBookingText } from "./text";

export type RoomPhotoView = {
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
  alt: string;
  full: string;
};

export type RoomView = {
  id: RoomId;
  name: string;
  beds: string;
  area: string;
  sleeps: number;
  pmsRoomTypeId: string | null;
  photos: RoomPhotoView[];
};

export type StayDetail = { id: StayDetailId; label: string };
export type StayDetails = { inRoom: StayDetail[]; hotel: StayDetail[] };

export type RoomsBookingProps = {
  lang: Lang;
  apiBase: string;
  reviewHref: string;
  conditionsHref: string;
  rooms: RoomView[];
  details: StayDetails;
  text: RoomsBookingText;
  searchCopy: StaySearchCopy;
};

export type Phase =
  | { kind: "idle" }
  | { kind: "loading"; search: StaySearch; previous?: OfferSearchResult }
  | { kind: "problem"; title: RoomsBookingKey; body: RoomsBookingKey; retry: boolean }
  | { kind: "found"; search: StaySearch; result: OfferSearchResult };

export type RoomState = "available" | "sold_out" | "too_many_guests" | "offline";

const button =
  "font-source-sans-3 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 px-6 text-sm font-semibold tracking-widest uppercase disabled:cursor-not-allowed";
export const primary = `${button} bg-accent-500 text-accent-950 hover:bg-accent-400`;
export const secondary = `${button} border border-stone-900 text-stone-900 hover:border-accent-500 hover:bg-accent-500 hover:text-accent-950`;
export const unavailable = `${button} w-full bg-stone-100 text-stone-500`;

export const belowHeader =
  "scroll-mt-[calc(8rem+env(safe-area-inset-top))] md:scroll-mt-[calc(9.5rem+env(safe-area-inset-top))]";
