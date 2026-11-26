<script lang="ts">
  import type { Lang } from "@/i18n/utils";
  import { fill, formatDate, formatMoney } from "@/lib/reservation/format";
  import type { PlanOffer } from "@/lib/reservation/offers";
  import type { RoomsBookingText } from "./text";

  let {
    offer,
    text,
    lang,
    currency,
    includeWeekday = true,
    showSaving = false,
  }: {
    offer: PlanOffer;
    text: RoomsBookingText;
    lang: Lang;
    currency: string;
    includeWeekday?: boolean;
    showSaving?: boolean;
  } = $props();

  const { cancellation, savingCents } = $derived(offer);
</script>

{#if cancellation.freeCancellation === "available" && cancellation.freeUntil}
  {@const [before, after] = text["reservation.rate.freeUntil"].split("{date}")}
  <span class="font-semibold text-green-800">
    {before}<time datetime={cancellation.freeUntil}>
      {formatDate(cancellation.freeUntil, lang, { includeWeekday })}
    </time>{after}
  </span>
{:else}
  {text[
    cancellation.freeCancellation === "ended"
      ? "reservation.rate.freeEnded"
      : "reservation.rate.noFree"
  ]}
{/if}
{#if showSaving && savingCents > 0}
  · <span class="font-semibold text-green-800">
    {fill(text["reservation.rate.saving"], { amount: formatMoney(savingCents, currency) })}
  </span>
{/if}
