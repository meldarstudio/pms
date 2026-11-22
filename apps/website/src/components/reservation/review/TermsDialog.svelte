<script lang="ts">
  import {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogTitle,
  } from "@ui-sdk/svelte/dialog";
  import { X } from "phosphor-svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { CheckoutView } from "@/lib/reservation/checkout";
  import { wideScreen } from "@/lib/screen";
  import Cancellation from "./Cancellation.svelte";
  import { getReview } from "./review-context";
  import { cardTitle, quietLink } from "./styles";
  import { stayLabels } from "./stay";

  let {
    view,
    open = $bindable(false),
    finalFocus,
  }: {
    view: CheckoutView | null;
    open: boolean;
    finalFocus: () => HTMLAnchorElement;
  } = $props();
  const { say, lang, conditionsHref } = getReview();
  const money = $derived(view ? stayLabels(view, say, lang).money : null);
  const wide = new MediaQuery(wideScreen, true);
</script>

<Dialog presentation={wide.current ? "dialog" : "sheet"} bind:open>
  <DialogBackdrop
    class="fixed inset-0 bg-stone-950/60 supports-backdrop-filter:backdrop-blur-xs"
  />
  <DialogContent
    data-terms
    {finalFocus}
    class="terms-dialog border border-stone-200 bg-white text-base text-stone-900"
  >
    <div
      class="flex shrink-0 items-center justify-between gap-4 border-b border-stone-200 bg-white py-2 pr-2 pl-6"
    >
      <DialogTitle class={cardTitle}>{say("reservation.review.terms")}</DialogTitle>
      <DialogClose
        class="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center text-stone-700 hover:bg-stone-100 hover:text-stone-900"
        data-close-terms
        aria-label={say("reservation.review.closeTerms")}
      >
        <X aria-hidden="true" class="size-5" />
      </DialogClose>
    </div>
    <div class="min-h-0 overflow-y-auto overscroll-contain">
      <div class="px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div class="flex flex-col gap-3 text-sm leading-relaxed text-stone-700">
          <p data-schedule>
            {view && money
              ? say(
                  view.ratePlan === "flexible" && view.rooms.length > 1
                    ? "reservation.review.schedule.flexibleRooms"
                    : `reservation.review.schedule.${view.ratePlan}`,
                  {
                    now: money(view.quote.requiredInitialPaymentCents),
                    remaining: money(view.quote.remainingScheduledCents),
                  },
                )
              : ""}
          </p>
          <p data-terms-cancellation>
            {#if view && money}<Cancellation
                {view}
                charge={money(view.quote.cancellation.chargeCents)}
              />{/if}
          </p>
          <p>{say("reservation.cancel.settlement")}</p>
          <p>{say("reservation.review.lifecycle")}</p>
        </div>
        <a href={conditionsHref} target="_blank" rel="noopener" class={`mt-3 ${quietLink}`}>
          {say("reservation.review.conditionsLink")}
          <span class="sr-only"> ({say("reservation.review.whatsapp.newTab")})</span>
        </a>
      </div>
    </div>
  </DialogContent>
</Dialog>

<style>
  :global(.terms-dialog) {
    display: flex;
    flex-direction: column;
    width: min(36rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow: clip;
  }

  :global(.terms-dialog[data-presentation="sheet"]) {
    width: 100%;
    max-height: calc(100dvh - 1rem);
  }

  :global(.terms-dialog[data-presentation="sheet"])::before {
    content: "";
    flex: none;
    width: 3rem;
    height: 0.25rem;
    margin: 0.5rem auto 0;
    background: var(--color-stone-200);
  }
</style>
