<script lang="ts">
  import type { CheckoutView } from "@/lib/reservation/checkout";
  import { formatDate } from "@/lib/reservation/format";
  import { getReview } from "./review-context";

  let { view, charge }: { view: CheckoutView; charge: string } = $props();
  const { say, lang } = getReview();
  const { freeCancellation, freeUntil } = $derived(view.quote.cancellation);
  const parts = say("reservation.cancel.available").split(/(\{date\}|\{amount\})/);
</script>

{#if freeCancellation === "available" && freeUntil}
  {#each parts as part}{#if part === "{date}"}<time datetime={freeUntil}>
        {formatDate(freeUntil, lang)}
      </time>{:else if part === "{amount}"}{charge}{:else}{part}{/if}{/each}
{:else}
  {say(freeCancellation === "ended" ? "reservation.cancel.ended" : "reservation.cancel.none", {
    amount: charge,
  })}
{/if}
