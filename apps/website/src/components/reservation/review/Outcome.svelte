<script lang="ts">
  import { outcomePresentation } from "@/lib/reservation/checkout-copy";
  import type { State } from "@/lib/reservation/checkout-flow";
  import { outcomeActions } from "@/lib/reservation/checkout-selectors";
  import { formatMoney } from "@/lib/reservation/format";
  import { getReview, replaceFocusedAction } from "./review-context";
  import { card, secondary } from "./styles";
  import CardOutcome from "./CardOutcome.svelte";

  let {
    state,
    onRetry,
    onBank,
    onCheck,
    onCopy,
    onAccessRetry,
  }: {
    state: State;
    onRetry: () => void;
    onBank: () => void;
    onCheck: () => void;
    onCopy: () => void;
    onAccessRetry: () => void;
  } = $props();
  const { say } = getReview();
  const payment = $derived(state.payment);
  const presentation = $derived(payment ? outcomePresentation(payment) : null);
  const actions = $derived(outcomeActions(state));
  const replacedRetry = replaceFocusedAction();
</script>

{#if payment && (payment.state === "authentication_required" || payment.state === "declined")}
  <CardOutcome {state} {payment} {onRetry} {onBank} {onCheck} />
{:else}
  <section
    class={`${card} border-stone-200 [[data-contact-form]:not([hidden])+&]:border-t`}
    aria-labelledby="review-outcome-title"
    data-outcome
    hidden={!state.outcomeShown}
  >
    <div class={["border-l-4 bg-stone-50 p-4", presentation?.tone]} data-outcome-box>
      <h2
        id="review-outcome-title"
        class="text-xl font-semibold text-stone-900"
        tabindex="-1"
        data-outcome-title
        data-checkout-focus="outcomeTitle"
      >
        {presentation ? say(presentation.titleKey) : ""}
      </h2>
      <p class="mt-2 leading-relaxed text-stone-700" data-outcome-body>
        {presentation ? say(presentation.bodyKey) : ""}
      </p>
      <dl class="mt-4 divide-y divide-stone-200" data-outcome-amounts>
        {#if payment && presentation}
          {#each presentation.rows as { labelKey, value } (labelKey)}
            <div class="flex items-baseline justify-between gap-4 py-2">
              <dt class="text-stone-700">{say(labelKey)}</dt>
              <dd class="text-right font-semibold text-stone-900">
                {typeof value === "string" ? value : formatMoney(value.cents, payment.currency)}
              </dd>
            </div>
          {/each}
        {/if}
      </dl>
      <div class="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          class={secondary}
          data-outcome-check
          hidden={!actions.check}
          onclick={onCheck}
        >
          {say("reservation.outcome.check")}
        </button>
      </div>
      <p class="mt-4 text-sm text-stone-700" role="status" data-access-status>
        {state.access.kind === "loading"
          ? say("reservation.access.loading")
          : state.access.kind === "unavailable"
            ? say("reservation.access.unavailable.saved")
            : ""}
      </p>
      {#if state.access.kind === "unavailable"}
        <button
          {@attach replacedRetry.restore}
          type="button"
          class={secondary}
          data-access-retry
          onclick={() => {
            replacedRetry.expectReplacement();
            onAccessRetry();
          }}
        >
          {say("reservation.access.retry")}
        </button>
      {/if}
      <div
        class="mt-4 border border-stone-300 bg-white p-4"
        data-access
        hidden={!state.access.panel}
      >
        <p class="leading-relaxed text-stone-700">{say("reservation.summary.possession")}</p>
        <p class="mt-2 leading-relaxed text-stone-700">{say("reservation.summary.staff")}</p>
        {#if state.access.kind === "available"}
          <button
            {@attach replacedRetry.restore}
            type="button"
            class={`mt-4 ${secondary}`}
            data-access-copy
            onclick={onCopy}
          >
            {say("reservation.summary.copy")}
          </button>
        {/if}
        <p
          class="mt-2 font-medium text-stone-900"
          role="status"
          data-access-copied
          hidden={!state.access.copied}
        >
          {say("reservation.summary.copied")}
        </p>
      </div>
    </div>
  </section>
{/if}
