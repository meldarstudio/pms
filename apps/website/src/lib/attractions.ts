import type { ImageMetadata } from "astro";
import mamahuarmi from "@/assets/mamahuarmi.webp";
import juventud from "@/assets/la-juventud.webp";
import tingo from "@/assets/tingo.webp";
import type { ui } from "@/i18n/ui";

type UiKey = keyof (typeof ui)["en"];

export type Attraction = {
  id: "mamahuarmi" | "la-juventud" | "tingo";
  name: string;
  image: ImageMetadata;
  driveKey: UiKey;
  bodyKey: UiKey;
  imageAltKey: UiKey;
};

export const attractions: Attraction[] = [
  {
    id: "mamahuarmi",
    name: "Mamahuarmi",
    image: mamahuarmi,
    driveKey: "churin.mamahuarmi.drive",
    bodyKey: "churin.mamahuarmi.body",
    imageAltKey: "churin.mamahuarmi.imageAlt",
  },
  {
    id: "la-juventud",
    name: "La Juventud",
    image: juventud,
    driveKey: "churin.juventud.drive",
    bodyKey: "churin.juventud.body",
    imageAltKey: "churin.juventud.imageAlt",
  },
  {
    id: "tingo",
    name: "Tingo",
    image: tingo,
    driveKey: "churin.tingo.drive",
    bodyKey: "churin.tingo.body",
    imageAltKey: "churin.tingo.imageAlt",
  },
];
