import type { ImageMetadata } from "astro";
import kingImage from "@/assets/highlights-room-photo.webp";
import kingFrontViewImage from "@/assets/king-front-view.webp";
import doubleSideImage from "@/assets/double-side-view.webp";
import doubleTopImage from "@/assets/double-top-view.webp";
import doubleCloseImage from "@/assets/double-close.webp";
import familyFrontImage from "@/assets/family-room-front.webp";
import familySideImage from "@/assets/family-room-side.webp";
import familyCloseImage from "@/assets/family-room-close.webp";
import kingBalconyImage from "@/assets/hero-image.webp";
import type { ui } from "@/i18n/ui";

type UiKey = keyof (typeof ui)["en"];

export type RoomPhoto = {
  src: ImageMetadata;
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

const kingPhoto: RoomPhoto = {
  src: kingImage,
  altKey: "rooms.photo.king",
};
const kingFrontViewPhoto: RoomPhoto = {
  src: kingFrontViewImage,
  altKey: "rooms.photo.kingFrontView",
};
const doubleSidePhoto: RoomPhoto = {
  src: doubleSideImage,
  altKey: "rooms.photo.doubleSide",
};
const doubleTopPhoto: RoomPhoto = {
  src: doubleTopImage,
  altKey: "rooms.photo.doubleTop",
};
const doubleClosePhoto: RoomPhoto = {
  src: doubleCloseImage,
  altKey: "rooms.photo.doubleClose",
};
const familyFrontPhoto: RoomPhoto = {
  src: familyFrontImage,
  altKey: "rooms.photo.familyFront",
};
const familySidePhoto: RoomPhoto = {
  src: familySideImage,
  altKey: "rooms.photo.familySide",
};
const familyClosePhoto: RoomPhoto = {
  src: familyCloseImage,
  altKey: "rooms.photo.familyClose",
};
const kingBalconyPhoto: RoomPhoto = {
  src: kingBalconyImage,
  altKey: "rooms.photo.kingBalcony",
};

export const rooms: Room[] = [
  {
    id: "king",
    pmsRoomTypeId: "935c7f23-8acc-4c78-b456-9bc588cccc2d",
    gallery: [kingBalconyPhoto, kingFrontViewPhoto, kingPhoto],
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
    gallery: [doubleSidePhoto, doubleTopPhoto, doubleClosePhoto],
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
    gallery: [familyFrontPhoto, familySidePhoto, familyClosePhoto],
    nameKey: "rooms.family.name",
    leadKey: "rooms.family.lead",
    bedsKey: "rooms.family.beds",
    areaKey: "rooms.family.area",
    areaSqm: 22,
    sleeps: 4,
  },
];
