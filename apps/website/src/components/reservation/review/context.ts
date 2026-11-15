import { createContext, useContext } from "react";
import type { Lang } from "@/i18n/utils";
import type { Say } from "./text";

export type ReviewContext = { lang: Lang; say: Say; privacyHref: string; conditionsHref: string };

export const ReviewContext = createContext<ReviewContext | null>(null);

export function useReview() {
  const context = useContext(ReviewContext);
  if (!context) throw new Error("useReview needs a ReviewContext provider");
  return context;
}
