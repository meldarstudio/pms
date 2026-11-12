import { Fragment, type ReactNode } from "react";
import type { CheckoutView } from "@/lib/reservation/checkout";
import { formatDate } from "@/lib/reservation/format";
import { useReview } from "./context";

function fillParts(template: string, values: Record<string, ReactNode>) {
  return template
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part, index) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1];
      return (
        <Fragment key={index}>{key !== undefined && key in values ? values[key] : part}</Fragment>
      );
    });
}

export function Cancellation({ view, charge }: { view: CheckoutView; charge: string }) {
  const { say, lang } = useReview();
  const { freeCancellation, freeUntil } = view.quote.cancellation;
  if (freeCancellation === "available" && freeUntil)
    return fillParts(say("reservation.cancel.available"), {
      date: <time dateTime={freeUntil}>{formatDate(freeUntil, lang)}</time>,
      amount: charge,
    });
  return say(
    freeCancellation === "ended" ? "reservation.cancel.ended" : "reservation.cancel.none",
    {
      amount: charge,
    },
  );
}
