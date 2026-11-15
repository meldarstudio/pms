import type { Lang } from "@/i18n/utils";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  items?: string[];
};

export type LegalDocument = {
  title: string;
  description: string;
  effective: string;
  intro: string;
  sections: LegalSection[];
};

export type LocalizedLegalDocument = Record<Lang, LegalDocument>;
