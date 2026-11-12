import { useRef, useState, type ReactNode } from "react";
import { XIcon } from "@phosphor-icons/react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { CheckoutView } from "@/lib/reservation/checkout";
import { formatDate } from "@/lib/reservation/format";
import { Cancellation } from "./Cancellation";
import { useReview } from "./context";
import { cardTitle } from "./styles";
import { stayLabels } from "./stay";

export function TermsDialog({
  view,
  children,
}: {
  view: CheckoutView | null;
  children: ReactNode;
}) {
  const { say, lang } = useReview();
  const [open, setOpen] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  const money = view ? stayLabels(view, say, lang).money : null;
  return (
    <>
      <a
        ref={link}
        href="#review-payment"
        className="text-accent-800 decoration-accent-800/40 hover:decoration-accent-800 font-medium underline underline-offset-4"
        aria-haspopup="dialog"
        data-open-terms
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </a>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-terms
          showCloseButton={false}
          finalFocus={link}
          overlayClassName="bg-stone-950/60 supports-backdrop-filter:backdrop-blur-none"
          className="block max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] max-w-[calc(100%-6px-2em)] overflow-y-auto bg-white p-0 text-base text-stone-900 ring-0 sm:max-w-[calc(100%-6px-2em)]"
        >
          <div className="sticky top-0 flex items-center justify-between gap-4 border-b border-stone-200 bg-white py-2 pr-2 pl-6">
            <DialogTitle className={cardTitle}>{say("reservation.review.terms")}</DialogTitle>
            <DialogClose
              className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center text-stone-700 hover:bg-stone-100 hover:text-stone-900"
              data-close-terms
            >
              <XIcon aria-hidden="true" className="size-5" />
              <span className="sr-only">{say("reservation.review.closeTerms")}</span>
            </DialogClose>
          </div>
          <div className="px-6 pt-5 pb-6">
            <h3 className="font-semibold text-stone-900">{say("reservation.review.nightly")}</h3>
            <ul className="mt-2 divide-y divide-stone-200 text-sm text-stone-800" data-nightly>
              {view?.quote.nights.map((night) => (
                <li key={night.date} className="flex justify-between gap-4 py-2">
                  <time dateTime={night.date}>{formatDate(night.date, lang)}</time>
                  <span>{money?.(night.priceCents)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-3 text-sm leading-relaxed text-stone-700">
              <p data-schedule>
                {view && money
                  ? say(`reservation.review.schedule.${view.ratePlan}`, {
                      now: money(view.quote.requiredInitialPaymentCents),
                      remaining: money(view.quote.remainingScheduledCents),
                    })
                  : ""}
              </p>
              <p data-terms-cancellation>
                {view && money && (
                  <Cancellation view={view} charge={money(view.quote.cancellation.chargeCents)} />
                )}
              </p>
              <p>{say("reservation.cancel.settlement")}</p>
              <p>{say("reservation.review.lifecycle")}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
