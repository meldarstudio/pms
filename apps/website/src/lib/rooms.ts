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

export type Room = {
  id: "king" | "double" | "family";
  gallery: RoomPhoto[];
  nameKey: UiKey;
  bestForKey: UiKey;
  leadKey: UiKey;
  bedsKey: UiKey;
  areaKey: UiKey;
  priceKey: UiKey;
  prefillKey: UiKey;
  ctaKey: UiKey;
  /** Floor area in square meters, for structured data. */
  areaSqm: number;
  /** Lowest nightly rate in PEN, taxes included, for structured data. */
  priceFrom: number;
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
    gallery: [kingBalconyPhoto, kingFrontViewPhoto, kingPhoto],
    nameKey: "rooms.king.name",
    bestForKey: "rooms.king.bestFor",
    leadKey: "rooms.king.lead",
    bedsKey: "rooms.king.beds",
    areaKey: "rooms.king.area",
    priceKey: "rooms.king.price",
    prefillKey: "rooms.king.prefill",
    ctaKey: "rooms.king.cta",
    areaSqm: 18,
    priceFrom: 100,
  },
  {
    id: "double",
    gallery: [doubleSidePhoto, doubleTopPhoto, doubleClosePhoto],
    nameKey: "rooms.double.name",
    bestForKey: "rooms.double.bestFor",
    leadKey: "rooms.double.lead",
    bedsKey: "rooms.double.beds",
    areaKey: "rooms.double.area",
    priceKey: "rooms.double.price",
    prefillKey: "rooms.double.prefill",
    ctaKey: "rooms.double.cta",
    areaSqm: 20,
    priceFrom: 120,
  },
  {
    id: "family",
    gallery: [familyFrontPhoto, familySidePhoto, familyClosePhoto],
    nameKey: "rooms.family.name",
    bestForKey: "rooms.family.bestFor",
    leadKey: "rooms.family.lead",
    bedsKey: "rooms.family.beds",
    areaKey: "rooms.family.area",
    priceKey: "rooms.family.price",
    prefillKey: "rooms.family.prefill",
    ctaKey: "rooms.family.cta",
    areaSqm: 22,
    priceFrom: 120,
  },
];
