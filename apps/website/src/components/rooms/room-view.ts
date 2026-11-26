import type { Lang } from "@/i18n/utils";
import type { StayDetailId } from "@/lib/included";
import type { OfferSearchResult, SearchOutcome } from "@/lib/reservation/offers";
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

type ReferenceRates =
  | { kind: "found"; amounts: Partial<Record<RoomId, string>> }
  | { kind: "unavailable" };

export type RoomsBookingProps = {
  lang: Lang;
  apiBase: string;
  reviewHref: string;
  rooms: RoomView[];
  details: StayDetails;
  text: RoomsBookingText;
  searchCopy: StaySearchCopy;
  action: string;
  initial: { search: StaySearch; outcome: SearchOutcome | null };
  referenceRates: ReferenceRates;
};

export type Phase =
  | { kind: "idle" }
  | { kind: "loading"; search: StaySearch }
  | { kind: "problem"; title: RoomsBookingKey; body: RoomsBookingKey; retry: boolean }
  | { kind: "found"; search: StaySearch; result: OfferSearchResult };

const button =
  "font-source-sans-3 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 px-6 text-sm font-semibold tracking-widest uppercase disabled:cursor-not-allowed";
export const primary = `${button} bg-accent-500 text-accent-950 hover:bg-accent-400`;
export const secondary = `${button} border border-stone-900 text-stone-900 hover:border-accent-500 hover:bg-accent-500 hover:text-accent-950`;
export const unavailable = `${button} w-full bg-stone-100 text-stone-500`;

export const belowHeader =
  "scroll-mt-[calc(8rem+env(safe-area-inset-top))] md:scroll-mt-[calc(9.5rem+env(safe-area-inset-top))]";
