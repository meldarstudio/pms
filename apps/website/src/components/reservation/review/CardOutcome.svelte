<script lang="ts">
  import { Clock, WarningCircle } from "phosphor-svelte";
  import { outcomePresentation } from "@/lib/reservation/checkout-copy";
  import type { State } from "@/lib/reservation/checkout-flow";
  import { outcomeActions } from "@/lib/reservation/checkout-selectors";
  import { formatMoney } from "@/lib/reservation/format";
  import type { GuestPayment } from "@/lib/reservation/payment";
  import { getReview } from "./review-context";
  import { card, eyebrow, primary } from "./styles";

  let {
    state,
    payment,
    onRetry,
    onBank,
    onCheck,
  }: {
    state: State;
    payment: GuestPayment;
    onRetry: () => void;
    onBank: () => void;
    onCheck: () => void;
  } = $props();
  const { say } = getReview();
  const pending = $derived(payment.state === "authentication_required");
  const presentation = $derived(outcomePresentation(payment));
  const key = $derived(presentation.copyKey);
  const Icon = $derived(pending ? Clock : WarningCircle);
  const actions = $derived(outcomeActions(state));
</script>

<section
  class={`${card} [[data-contact-form]:not([hidden])+&]:border-t`}
  aria-labelledby="review-outcome-title"
  data-outcome
  hidden={!state.outcomeShown}
>
  <div class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 md:gap-4" data-outcome-box>
    <Icon aria-hidden="true" class={`mt-1 size-6 ${pending ? "text-amber-700" : "text-red-700"}`} />
    <div>
      <p class={eyebrow}>{say(`${key}.eyebrow`)}</p>
      <h2
        id="review-outcome-title"
        class="mt-2 text-2xl leading-snug font-semibold text-pretty text-stone-900"
        tabindex="-1"
        data-outcome-title
        data-checkout-focus="outcomeTitle"
      >
        {say(`${key}.title`)}
      </h2>
      <p class="mt-3 max-w-prose leading-relaxed text-stone-600" data-outcome-body>
        {say(`${key}.body`)}
      </p>
      <p class="mt-3 max-w-prose leading-relaxed text-stone-600">{say(`${key}.reassurance`)}</p>
      <dl class="mt-5 border-t border-stone-200 py-4" data-outcome-amounts>
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <dt class="text-sm text-stone-700">{say(`${key}.amount`)}</dt>
          <dd class="text-xl font-semibold text-stone-900">
            {formatMoney(payment.amountCents, payment.currency)}
          </dd>
        </div>
      </dl>
      <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {#if actions.retry}
          <button
            type="button"
            class={`${primary} w-full py-3 sm:w-auto`}
            data-outcome-retry
            onclick={onRetry}
          >
            {say(presentation.retryKey)}
          </button>
        {/if}
        {#if actions.bank}
          <button
            type="button"
            class={`${primary} w-full py-3 sm:w-auto`}
            data-outcome-bank
            data-checkout-focus="outcomeBank"
            onclick={onBank}
          >
            {say("reservation.outcome.verifyBank")}
          </button>
        {/if}
        {#if actions.check}
          <button
            type="button"
            class={actions.bank
              ? "font-source-sans-3 inline-flex min-h-11 items-center text-sm font-semibold text-stone-900 underline underline-offset-4 hover:text-accent-800"
              : `${primary} w-full py-3 sm:w-auto`}
            data-outcome-check
            onclick={onCheck}
          >
            {say("reservation.outcome.check")}
          </button>
        {/if}
      </div>
      <div class="mt-5 text-sm leading-relaxed text-stone-600" data-outcome-contact>
        <p>
          <span class="text-stone-900">{state.contact.fullName}</span>{state.contact.email
            ? ` · ${state.contact.email}`
            : ""}
        </p>
        <p>{say("reservation.outcome.contactSaved")}</p>
      </div>
    </div>
  </div>
</section>
