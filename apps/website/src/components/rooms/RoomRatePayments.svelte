<script lang="ts">
  import { formatMoney } from "@/lib/reservation/format";
  import type { PlanOffer } from "@/lib/reservation/offers";
  import type { RoomsBookingText } from "./text";

  let {
    offer,
    text,
    currency,
  }: {
    offer: PlanOffer;
    text: RoomsBookingText;
    currency: string;
  } = $props();

  const { requiredInitialPaymentCents, remainingScheduledCents } = $derived(offer);
</script>

<span class="flex flex-col gap-1 text-sm text-stone-600">
  <span class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
    <span>{text["reservation.rate.due"]}</span>
    <span class="ml-auto whitespace-nowrap">{formatMoney(requiredInitialPaymentCents, currency)}</span>
  </span>
  {#if remainingScheduledCents > 0}
    <span class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span>{text["reservation.offer.remaining"]}</span>
      <span class="ml-auto whitespace-nowrap">{formatMoney(remainingScheduledCents, currency)}</span>
    </span>
  {/if}
</span>
