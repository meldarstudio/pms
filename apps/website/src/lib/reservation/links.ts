import { PUBLIC_PMS_API_URL } from "astro:env/client";
import { getRelativeLocaleUrl } from "astro:i18n";
import type { Lang } from "@/i18n/utils";
import type { Room } from "@/lib/rooms";

export const onlineReservations = Boolean(PUBLIC_PMS_API_URL);

export const reservesOnline = (room: Pick<Room, "pmsRoomTypeId">) =>
  onlineReservations && Boolean(room.pmsRoomTypeId);

export function searchStepHref(lang: Lang, room?: Room["id"]) {
  const path = getRelativeLocaleUrl(lang, "reservar");
  return room ? `${path}?room=${room}` : path;
}

export const chooseStepHref = (lang: Lang) => getRelativeLocaleUrl(lang, "reservar/habitacion");

export const reviewStepHref = (lang: Lang) => getRelativeLocaleUrl(lang, "reservar/revisar");
