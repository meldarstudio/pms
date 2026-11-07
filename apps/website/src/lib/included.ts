import type { ui } from "@/i18n/ui";

type UiKey = keyof (typeof ui)["en"];

export const roomAmenityKeys = [
  "rooms.included.bathroom",
  "rooms.included.tv",
  "rooms.included.wifi",
] as const satisfies readonly UiKey[];

export const hotelAmenityKeys = [
  "rooms.included.desk",
  "rooms.included.elevator",
  "rooms.included.parking",
  "rooms.hotel.pets",
] as const satisfies readonly UiKey[];
