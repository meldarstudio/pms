<script lang="ts">
  import { CircleNotch } from "phosphor-svelte";
  import type { State } from "@/lib/reservation/checkout-flow";
  import { payActionVisible, payBusy, sendingPayment } from "@/lib/reservation/checkout-selectors";
  import Cancellation from "./Cancellation.svelte";
  import { getReview } from "./review-context";
  import { card, cardTitle, error, headline, primary, row } from "./styles";
  import { stayLabels } from "./stay";
  import TermsDialog from "./TermsDialog.svelte";

  let { state: checkout, onAgree }: { state: State; onAgree: (agreed: boolean) => void } = $props();
  const { say, lang } = getReview();
  const view = $derived(checkout.view);
  const money = $derived(view ? stayLabels(view, say, lang).money : null);
  const [agreeBefore, agreeAfter] = say("reservation.review.agree").split("{terms}");
  const agreeError = $derived(checkout.fieldErrors.agree);
  const dueNow = $derived(view?.quote.requiredInitialPaymentCents ?? 0);
  const busy = $derived(payBusy(checkout));
  let termsOpen = $state(false);
  let termsLink: HTMLAnchorElement;
</script>

<section class={card} aria-labelledby="review-payment">
  <h2 id="review-payment" class={cardTitle}>{say("reservation.review.payment")}</h2>
  <p
    class="mt-4 border-l-4 border-amber-600 bg-amber-50 p-4 font-semibold text-stone-900"
    tabindex="-1"
    data-changed
    hidden={!checkout.changed}
  >
    {say("reservation.review.changed")}
  </p>
  <dl class="mt-4 bg-stone-100 px-4 py-3">
    <div class={headline}>
      <dt class="font-medium text-stone-900">{say("reservation.review.dueNow")}</dt>
      <dd class="text-2xl font-semibold whitespace-nowrap text-stone-900" data-amount="now">
        {money ? money(dueNow) : ""}
      </dd>
    </div>
    <div class={`${row} text-sm`} data-balance hidden={view?.quote.remainingScheduledCents === 0}>
      <dt class="text-stone-600">{say("reservation.review.balance")}</dt>
      <dd class="text-stone-900" data-amount="remaining">
        {view && money ? money(view.quote.remainingScheduledCents) : ""}
      </dd>
    </div>
  </dl>
  <p class="mt-4 text-sm leading-relaxed text-stone-700" data-cancellation>
    {#if view && money}
      {@const amount = money(view.quote.cancellation.chargeCents)}
      {#if view.quote.cancellation.freeCancellation === "ended"}
        <strong class="mb-1 block font-semibold text-amber-900">
          {say("reservation.review.cancellationEnded")}
        </strong>
        {say("reservation.review.lateCancellationCharge", { amount })}
      {:else if view.ratePlan === "non_refundable"}
        <strong class="mb-1 block font-semibold text-stone-900">
          {say("reservation.plan.non_refundable")}
        </strong>
        {say("reservation.review.nonRefundableCancellation", { amount })}
      {:else}
        <Cancellation {view} charge={amount} />
      {/if}
    {/if}
  </p>
  <div class="mt-5 flex items-start gap-3">
    <input
      id="agree"
      name="agree"
      type="checkbox"
      required
      class="accent-accent-700 mt-0.5 size-6 shrink-0"
      aria-describedby="agree-error"
      checked={checkout.agreed}
      data-checkout-focus="agree"
      onkeydown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (!event.repeat) event.currentTarget.click();
      }}
      onchange={(event) => onAgree(event.currentTarget.checked)}
    />
    <label for="agree" class="cursor-pointer leading-relaxed text-stone-900">
      {agreeBefore}<a
        bind:this={termsLink}
        href="#review-payment"
        class="text-accent-800 decoration-accent-800/40 hover:decoration-accent-800 font-medium underline underline-offset-4"
        aria-haspopup="dialog"
        data-open-terms
        onclick={(event) => {
          event.preventDefault();
          termsOpen = true;
        }}
      >
        {say("reservation.review.termsLink")}
      </a>{agreeAfter}
    </label>
  </div>
  <TermsDialog {view} bind:open={termsOpen} finalFocus={() => termsLink} />
  <p id="agree-error" class={error} hidden={!agreeError}>{agreeError ? say(agreeError) : ""}</p>
  <p class="mt-5 font-medium text-red-800 empty:mt-0" role="alert" data-form-error>
    {checkout.formError ? say(checkout.formError) : ""}
  </p>
  <div data-pay-action hidden={!payActionVisible(checkout)}>
    <div
      class="mt-5 min-h-16"
      role="group"
      aria-label={say("reservation.pay.security")}
      data-security-check
    ></div>
    <button
      type="submit"
      class={`mt-4 w-full py-3 text-center ${primary}`}
      data-pay-button
      data-checkout-focus="payButton"
      disabled={busy}
    >
      {#if busy}
        <CircleNotch
          aria-hidden="true"
          class="size-4.5 shrink-0 animate-spin motion-reduce:animate-none"
        />
        {say("reservation.pay.busy")}
      {:else if money}
        {say("reservation.pay.button", { amount: money(dueNow) })}
      {/if}
    </button>
    <p
      class="mt-3 text-center text-sm font-medium text-stone-900"
      aria-hidden="true"
      data-pay-progress
      hidden={!sendingPayment(checkout)}
    >
      {say("reservation.pay.sending")}
    </p>
    <p class="mt-3 text-center text-sm text-stone-600">{say("reservation.pay.provider")}</p>
  </div>
</section>
