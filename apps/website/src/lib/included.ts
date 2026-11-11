import type { ui } from "@/i18n/ui";

type UiKey = keyof (typeof ui)["en"];
type Detail = { id: string; labelKey: UiKey };

/** What every room has; shown once in each room's details, not repeated per room. */
export const roomAmenities = [
  { id: "bathroom", labelKey: "rooms.included.bathroom" },
  { id: "towels", labelKey: "rooms.included.towels" },
  { id: "tv", labelKey: "rooms.included.tv" },
  { id: "wifi", labelKey: "rooms.included.wifi" },
  { id: "views", labelKey: "rooms.included.views" },
] as const satisfies readonly Detail[];

export const hotelServices = [
  { id: "reception", labelKey: "rooms.hotel.reception" },
  { id: "elevator", labelKey: "rooms.hotel.elevator" },
  { id: "parking", labelKey: "rooms.hotel.parking" },
] as const satisfies readonly Detail[];

export type StayDetailId = (typeof roomAmenities | typeof hotelServices)[number]["id"];
