import type { Lang } from "@/i18n/utils";
import { dateElement, fillNodes } from "./format";
import type { PlanOffer } from "./offers";

export function cancellationNodes(
  cancellation: PlanOffer["cancellation"],
  copy: {
    text: (key: string, values?: Record<string, string>) => string;
    amount: string;
    lang: Lang;
  },
) {
  const { freeCancellation, freeUntil } = cancellation;
  if (freeCancellation === "available" && freeUntil)
    return fillNodes(copy.text("reservation.cancel.available"), {
      date: dateElement(freeUntil, copy.lang),
      amount: copy.amount,
    });
  return [
    copy.text(
      freeCancellation === "ended" ? "reservation.cancel.ended" : "reservation.cancel.none",
      { amount: copy.amount },
    ),
  ];
}
