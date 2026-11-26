import type { ImageMetadata } from "astro";
import kingImage from "@/assets/highlights-room-photo.webp?room-gallery";
import kingFrontViewImage from "@/assets/king-front-view.webp?room-gallery";
import doubleSideImage from "@/assets/double-side-view.webp?room-gallery";
import doubleTopImage from "@/assets/double-top-view.webp?room-gallery";
import doubleCloseImage from "@/assets/double-close.webp?room-gallery";
import familyFrontImage from "@/assets/family-room-front.webp?room-gallery";
import familySideImage from "@/assets/family-room-side.webp?room-gallery";
import familyCloseImage from "@/assets/family-room-close.webp?room-gallery";
import kingBalconyImage from "@/assets/hero-image.webp?room-gallery";
import type { ui } from "@/i18n/ui";

type UiKey = keyof (typeof ui)["en"];

export type RoomPhoto = {
  src: ImageMetadata;
  variants: { src: string; srcSet: string; sizes: string; full: string };
  altKey: UiKey;
};

export type RoomId = "king" | "double" | "family";

export type Room = {
  id: RoomId;
  pmsRoomTypeId?: string;
  gallery: RoomPhoto[];
  nameKey: UiKey;
  leadKey: UiKey;
  bedsKey: UiKey;
  areaKey: UiKey;
  areaSqm: number;
  sleeps: number;
};

const galleryPhoto = ({ original, ...variants }: typeof kingImage, altKey: UiKey): RoomPhoto => ({
  src: original,
  variants,
  altKey,
});

export const rooms: Room[] = [
  {
    id: "king",
    pmsRoomTypeId: "935c7f23-8acc-4c78-b456-9bc588cccc2d",
    gallery: [
      galleryPhoto(kingBalconyImage, "rooms.photo.kingBalcony"),
      galleryPhoto(kingFrontViewImage, "rooms.photo.kingFrontView"),
      galleryPhoto(kingImage, "rooms.photo.king"),
    ],
    nameKey: "rooms.king.name",
    leadKey: "rooms.king.lead",
    bedsKey: "rooms.king.beds",
    areaKey: "rooms.king.area",
    areaSqm: 18,
    sleeps: 3,
  },
  {
    id: "double",
    pmsRoomTypeId: "a50f22a2-c02c-4cb1-ab98-e9da48f0228d",
    gallery: [
      galleryPhoto(doubleSideImage, "rooms.photo.doubleSide"),
      galleryPhoto(doubleTopImage, "rooms.photo.doubleTop"),
      galleryPhoto(doubleCloseImage, "rooms.photo.doubleClose"),
    ],
    nameKey: "rooms.double.name",
    leadKey: "rooms.double.lead",
    bedsKey: "rooms.double.beds",
    areaKey: "rooms.double.area",
    areaSqm: 20,
    sleeps: 4,
  },
  {
    id: "family",
    pmsRoomTypeId: "e93f440e-5546-45b3-8969-68a871d4ae81",
    gallery: [
      galleryPhoto(familyFrontImage, "rooms.photo.familyFront"),
      galleryPhoto(familySideImage, "rooms.photo.familySide"),
      galleryPhoto(familyCloseImage, "rooms.photo.familyClose"),
    ],
    nameKey: "rooms.family.name",
    leadKey: "rooms.family.lead",
    bedsKey: "rooms.family.beds",
    areaKey: "rooms.family.area",
    areaSqm: 22,
    sleeps: 4,
  },
];
