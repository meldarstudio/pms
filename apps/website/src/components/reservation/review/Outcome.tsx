import { cn } from "cn";
import type { RefCallback } from "react";
import { outcomePresentation } from "@/lib/reservation/checkout-copy";
import type { State } from "@/lib/reservation/checkout-flow";
import { outcomeActions } from "@/lib/reservation/checkout-selectors";
import { formatMoney } from "@/lib/reservation/format";
import { useReview } from "./context";
import { useDroppedFocusRestore, type FocusRegistry } from "./focus";
import { card, primary, secondary } from "./styles";

export function Outcome({
  state,
  focus,
  onRetry,
  onBank,
  onCheck,
  onCopy,
  onAccessRetry,
}: {
  state: State;
  focus: FocusRegistry;
  onRetry: () => void;
  onBank: () => void;
  onCheck: () => void;
  onCopy: () => void;
  onAccessRetry: () => void;
}) {
  const { say } = useReview();
  const { payment } = state;
  const presentation = payment ? outcomePresentation(payment) : null;
  const actions = outcomeActions(state);
  const titleRef: RefCallback<HTMLElement> = focus.ref("outcomeTitle");
  const replacedRetry = useDroppedFocusRestore();
  return (
    <section
      className={`${card} border-stone-200 [[data-contact-form]:not([hidden])+&]:border-t`}
      aria-labelledby="review-outcome-title"
      data-outcome
      hidden={!state.outcomeShown}
    >
      <div className={cn("border-l-4 bg-stone-50 p-4", presentation?.tone)} data-outcome-box>
        <h2
          ref={titleRef}
          id="review-outcome-title"
          className="text-xl font-semibold text-stone-900"
          tabIndex={-1}
          data-outcome-title
        >
          {presentation ? say(presentation.titleKey) : ""}
        </h2>
        <p className="mt-2 leading-relaxed text-stone-700" data-outcome-body>
          {presentation ? say(presentation.bodyKey) : ""}
        </p>
        <dl className="mt-4 divide-y divide-stone-200" data-outcome-amounts>
          {payment &&
            presentation?.rows.map(({ labelKey, value }) => (
              <div key={labelKey} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-stone-700">{say(labelKey)}</dt>
                <dd className="text-right font-semibold text-stone-900">
                  {typeof value === "string" ? value : formatMoney(value.cents, payment.currency)}
                </dd>
              </div>
            ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className={primary}
            data-outcome-retry
            hidden={!actions.retry}
            onClick={onRetry}
          >
            {say("reservation.outcome.retry")}
          </button>
          <button
            ref={focus.ref("outcomeBank")}
            type="button"
            className={secondary}
            data-outcome-bank
            hidden={!actions.bank}
            onClick={onBank}
          >
            {say("reservation.outcome.verifyBank")}
          </button>
          <button
            type="button"
            className={secondary}
            data-outcome-check
            hidden={!actions.check}
            onClick={onCheck}
          >
            {say("reservation.outcome.check")}
          </button>
        </div>
        <p className="mt-4 text-sm text-stone-700" role="status" data-access-status>
          {state.access.kind === "loading"
            ? say("reservation.access.loading")
            : state.access.kind === "unavailable"
              ? say("reservation.access.unavailable.saved")
              : ""}
        </p>
        {state.access.kind === "unavailable" && (
          <button
            ref={replacedRetry.restore}
            type="button"
            className={secondary}
            data-access-retry
            onClick={() => {
              replacedRetry.expectReplacement();
              onAccessRetry();
            }}
          >
            {say("reservation.access.retry")}
          </button>
        )}
        <div
          className="mt-4 border border-stone-300 bg-white p-4"
          data-access
          hidden={!state.access.panel}
        >
          <p className="leading-relaxed text-stone-700">{say("reservation.summary.possession")}</p>
          <p className="mt-2 leading-relaxed text-stone-700">{say("reservation.summary.staff")}</p>
          {state.access.kind === "available" && (
            <button
              ref={replacedRetry.restore}
              type="button"
              className={`mt-4 ${secondary}`}
              data-access-copy
              onClick={onCopy}
            >
              {say("reservation.summary.copy")}
            </button>
          )}
          <p
            className="mt-2 font-medium text-stone-900"
            role="status"
            data-access-copied
            hidden={!state.access.copied}
          >
            {say("reservation.summary.copied")}
          </p>
        </div>
      </div>
    </section>
  );
}
