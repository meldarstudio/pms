import { getRelativeLocaleUrl } from "astro:i18n";
import type { Lang } from "@/i18n/utils";
import type { Room } from "@/lib/rooms";

export const reservesOnline = (room: Pick<Room, "pmsRoomTypeId">) => Boolean(room.pmsRoomTypeId);

/** The rooms page, where guests choose dates, compare live rates and book. */
export function roomsHref(lang: Lang, room?: Room["id"]) {
  const path = getRelativeLocaleUrl(lang, "habitaciones");
  return room ? `${path}?room=${room}` : path;
}

export const reviewStepHref = (lang: Lang) => getRelativeLocaleUrl(lang, "reservar/revisar");

export const summaryStepHref = (lang: Lang) => getRelativeLocaleUrl(lang, "reservar/resumen");

export const privacyHref = (lang: Lang) => getRelativeLocaleUrl(lang, "privacidad");

export const conditionsHref = (lang: Lang) => getRelativeLocaleUrl(lang, "condiciones-de-reserva");
