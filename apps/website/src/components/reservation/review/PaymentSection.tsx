import type { ChangeEvent, RefObject } from "react";
import type { CheckoutView } from "@/lib/reservation/checkout";
import type { State } from "@/lib/reservation/checkout-flow";
import { payActionVisible, payBusy } from "@/lib/reservation/checkout-selectors";
import { Cancellation } from "./Cancellation";
import { useReview } from "./context";
import type { FocusRegistry } from "./focus";
import { card, cardTitle, error, headline, primary, row } from "./styles";
import { stayLabels } from "./stay";
import { TermsDialog } from "./TermsDialog";

export function PaymentSection({
  state,
  focus,
  securityContainer,
  onAgree,
}: {
  state: State;
  focus: FocusRegistry;
  securityContainer: RefObject<HTMLDivElement | null>;
  onAgree: (agreed: boolean) => void;
}) {
  const { say, lang } = useReview();
  const view: CheckoutView | null = state.view;
  const money = view ? stayLabels(view, say, lang).money : null;
  const [agreeBefore, agreeAfter] = say("reservation.review.agree").split("{terms}");
  const agreeError = state.fieldErrors.agree;
  const dueNow = view ? view.quote.requiredInitialPaymentCents : 0;
  return (
    <section className={card} aria-labelledby="review-payment">
      <h2 id="review-payment" className={cardTitle}>
        {say("reservation.review.payment")}
      </h2>
      <p
        className="mt-4 border-l-4 border-amber-600 bg-amber-50 p-4 font-semibold text-stone-900"
        tabIndex={-1}
        data-changed
        hidden={!state.changed}
      >
        {say("reservation.review.changed")}
      </p>
      <dl className="mt-4 bg-stone-100 px-4 py-3">
        <div className={headline}>
          <dt className="font-medium text-stone-900">{say("reservation.review.dueNow")}</dt>
          <dd className="text-2xl font-semibold whitespace-nowrap text-stone-900" data-amount="now">
            {view && money ? money(dueNow) : ""}
          </dd>
        </div>
        <div
          className={`${row} text-sm`}
          data-balance
          hidden={view?.quote.remainingScheduledCents === 0}
        >
          <dt className="text-stone-600">{say("reservation.review.balance")}</dt>
          <dd className="text-stone-900" data-amount="remaining">
            {view && money ? money(view.quote.remainingScheduledCents) : ""}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-stone-700" data-cancellation>
        {view && money && (
          <Cancellation view={view} charge={money(view.quote.cancellation.chargeCents)} />
        )}
      </p>
      <div className="mt-5 flex items-start gap-3">
        <input
          ref={focus.ref("agree")}
          id="agree"
          name="agree"
          type="checkbox"
          required
          className="accent-accent-700 mt-0.5 size-6 shrink-0"
          aria-describedby="agree-error"
          checked={state.agreed}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onAgree(event.target.checked)}
        />
        <label htmlFor="agree" className="cursor-pointer leading-relaxed text-stone-900">
          {agreeBefore}
          <TermsDialog view={view}>{say("reservation.review.termsLink")}</TermsDialog>
          {agreeAfter}
        </label>
      </div>
      <p id="agree-error" className={error} hidden={!agreeError}>
        {agreeError ? say(agreeError) : ""}
      </p>
      <p className="mt-5 font-medium text-red-800 empty:mt-0" role="alert" data-form-error>
        {state.formError ? say(state.formError) : ""}
      </p>
      <div data-pay-action hidden={!payActionVisible(state)}>
        <div
          ref={securityContainer}
          className="mt-5 min-h-16"
          role="group"
          aria-label={say("reservation.pay.security")}
          data-security-check
        />
        <button
          ref={focus.ref("payButton")}
          type="submit"
          className={`mt-4 w-full ${primary}`}
          data-pay-button
          disabled={payBusy(state)}
        >
          {view && money ? say("reservation.pay.button", { amount: money(dueNow) }) : ""}
        </button>
        <p className="mt-3 text-center text-sm text-stone-600">{say("reservation.pay.provider")}</p>
      </div>
    </section>
  );
}
