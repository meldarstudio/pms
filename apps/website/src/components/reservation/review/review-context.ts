import { getContext, setContext } from "svelte";
import type { Lang } from "@/i18n/utils";
import type { Say } from "./text";

type ReviewContext = { lang: Lang; say: Say; privacyHref: string; conditionsHref: string };
const key = Symbol("review");
export const setReview = (context: ReviewContext) => setContext(key, context);
export const getReview = () => getContext<ReviewContext>(key);

export function replaceFocusedAction() {
  let pending = false;
  return {
    expectReplacement() {
      pending = true;
    },
    restore(element: HTMLElement) {
      if (!pending) return;
      pending = false;
      if (document.activeElement === document.body) element.focus();
    },
  };
}
