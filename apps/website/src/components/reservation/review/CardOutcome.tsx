import { ClockIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { outcomePresentation } from "@/lib/reservation/checkout-copy";
import type { State } from "@/lib/reservation/checkout-flow";
import { outcomeActions } from "@/lib/reservation/checkout-selectors";
import { formatMoney } from "@/lib/reservation/format";
import type { GuestPayment } from "@/lib/reservation/payment";
import { useReview } from "./context";
import type { FocusRegistry } from "./focus";
import { card, eyebrow, primary } from "./styles";

export function CardOutcome({
  state,
  payment,
  focus,
  onRetry,
  onBank,
  onCheck,
}: {
  state: State;
  payment: GuestPayment;
  focus: FocusRegistry;
  onRetry: () => void;
  onBank: () => void;
  onCheck: () => void;
}) {
  const { say } = useReview();
  const pending = payment.state === "authentication_required";
  const { copyKey: key } = outcomePresentation(payment);
  const Icon = pending ? ClockIcon : WarningCircleIcon;
  const actions = outcomeActions(state);
  return (
    <section
      className={`${card} [[data-contact-form]:not([hidden])+&]:border-t`}
      aria-labelledby="review-outcome-title"
      data-outcome
      hidden={!state.outcomeShown}
    >
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 md:gap-4" data-outcome-box>
        <Icon
          aria-hidden="true"
          className={`mt-1 size-6 ${pending ? "text-amber-700" : "text-red-700"}`}
        />
        <div>
          <p className={eyebrow}>{say(`${key}.eyebrow`)}</p>
          <h2
            ref={focus.ref("outcomeTitle")}
            id="review-outcome-title"
            className="mt-2 text-2xl leading-snug font-semibold text-pretty text-stone-900"
            tabIndex={-1}
            data-outcome-title
          >
            {say(`${key}.title`)}
          </h2>
          <p className="mt-3 max-w-prose leading-relaxed text-stone-600" data-outcome-body>
            {say(`${key}.body`)}
          </p>
          <p className="mt-3 max-w-prose leading-relaxed text-stone-600">
            {say(`${key}.reassurance`)}
          </p>
          <dl className="mt-5 border-t border-stone-200 py-4" data-outcome-amounts>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <dt className="text-sm text-stone-700">{say(`${key}.amount`)}</dt>
              <dd className="text-xl font-semibold text-stone-900">
                {formatMoney(payment.amountCents, payment.currency)}
              </dd>
            </div>
          </dl>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {actions.retry && (
              <button
                type="button"
                className={`${primary} w-full py-3 sm:w-auto`}
                data-outcome-retry
                onClick={onRetry}
              >
                {say("reservation.outcome.retry")}
              </button>
            )}
            {actions.bank && (
              <button
                ref={focus.ref("outcomeBank")}
                type="button"
                className={`${primary} w-full py-3 sm:w-auto`}
                data-outcome-bank
                onClick={onBank}
              >
                {say("reservation.outcome.verifyBank")}
              </button>
            )}
            {actions.check && (
              <button
                type="button"
                className={
                  actions.bank
                    ? "font-source-sans-3 inline-flex min-h-11 items-center text-sm font-semibold text-stone-900 underline underline-offset-4 hover:text-accent-800"
                    : `${primary} w-full py-3 sm:w-auto`
                }
                data-outcome-check
                onClick={onCheck}
              >
                {say("reservation.outcome.check")}
              </button>
            )}
          </div>
          <div className="mt-5 text-sm leading-relaxed text-stone-600" data-outcome-contact>
            <p>
              <span className="text-stone-900">{state.contact.fullName}</span>
              {state.contact.email && <> · {state.contact.email}</>}
            </p>
            <p>{say("reservation.outcome.contactSaved")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
