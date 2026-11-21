<script lang="ts">
  import { CaretDown } from "phosphor-svelte";
  import { getReview } from "./review-context";
  import { card, cardTitle, eyebrow, headline, label } from "./styles";

  let { payments }: { payments: boolean } = $props();
  const { say } = getReview();
  const [leadBefore, leadAfter] = say("reservation.review.contactLead").split("{privacy}");
  const [agreeBefore, agreeAfter] = say("reservation.review.agree").split("{terms}");
  const textFields = ["fullName", "email"] as const;
</script>

{#snippet bar(size: string)}
  <span class={`animate-pulse bg-stone-200 motion-reduce:animate-none ${size}`}></span>
{/snippet}

{#snippet text(width: string)}
  {@render bar(`inline-block h-lh max-w-full align-top ${width}`)}
{/snippet}

{#snippet detail(key: "checkIn" | "checkOut" | "guests" | "plan", width: string)}
  <div>
    <p class="text-stone-600">{say(`reservation.review.${key}`)}</p>
    <p class="mt-1 font-medium">{@render text(width)}</p>
  </div>
{/snippet}

<div
  aria-hidden="true"
  class="mt-4 grid items-start gap-4 md:mt-6 md:gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12"
  data-review-loading
>
  <div
    class="min-w-0 border border-stone-200 bg-white p-4 md:p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1"
  >
    <div class="flex items-start gap-4">
      {@render bar("block size-14 shrink-0 md:size-20")}
      <div class="min-w-0 flex-1">
        <p class={eyebrow}>{say("reservation.review.stay")}</p>
        <p class="mt-1 text-lg font-semibold md:mt-2 md:text-xl">{@render text("w-48")}</p>
        <p class="mt-1 hidden text-sm lg:block">{@render text("w-40")}</p>
      </div>
    </div>
    <p class="mt-3 text-sm leading-relaxed lg:hidden">{@render text("w-64")}</p>
    <p class="mt-1 text-sm lg:hidden">{@render text("w-52")}</p>
    <div class="mt-3 border-t border-stone-200 pt-3 lg:mt-5 lg:pt-5">
      <div class={headline}>
        <p class="text-sm font-medium text-stone-900">{say("reservation.offer.total")}</p>
        <p class="text-2xl font-semibold">{@render text("w-28")}</p>
      </div>
    </div>
    <p class="mt-1 text-sm">{@render text("w-56")}</p>
    <div class="mt-5 hidden border-t border-stone-200 pt-5 text-sm lg:block">
      <div class="grid grid-cols-2 gap-4">
        {@render detail("checkIn", "w-32")}
        {@render detail("checkOut", "w-32")}
      </div>
      <p class="mt-2">{@render text("w-20")}</p>
      <div class="mt-4 grid grid-cols-2 gap-4">
        {@render detail("guests", "w-24")}
        {@render detail("plan", "w-28")}
      </div>
    </div>
  </div>
  <div class="min-w-0 border border-stone-200 bg-white lg:col-start-1 lg:row-start-1">
    {#if payments}
      <div class="divide-y divide-stone-200">
        <div class={card}>
          <p class={cardTitle}>{say("reservation.review.contact")}</p>
          <p class="mt-2 leading-relaxed text-stone-600">
            {leadBefore}<span class="text-accent-800 underline underline-offset-4">
              {say("reservation.review.privacyLink")}
            </span>{leadAfter}
          </p>
          <div class="mt-4 flex flex-col gap-4 md:mt-6 md:gap-5">
            {#each textFields as id (id)}
              <div>
                <span class={label}>{say(`reservation.review.${id}`)}</span>
                {@render bar("mt-2 block h-12 w-full")}
              </div>
            {/each}
            <div>
              <span class={label}>{say("reservation.review.phone")}</span>
              {@render bar("mt-2 block h-12 w-full")}
            </div>
            <div class="border-t border-stone-200">
              <div
                class="flex min-h-11 items-center justify-between gap-2 py-2 font-medium text-stone-900"
              >
                {say("reservation.review.notes")}
                <CaretDown class="size-4 shrink-0 text-stone-500" />
              </div>
            </div>
          </div>
        </div>
        <div class={card}>
          <p class={cardTitle}>{say("reservation.review.payment")}</p>
          <div class="mt-4 bg-stone-100 px-4 py-3">
            <div class={headline}>
              <p class="font-medium text-stone-900">{say("reservation.review.dueNow")}</p>
              <p class="text-2xl font-semibold">{@render text("w-28")}</p>
            </div>
          </div>
          <div class="mt-4 text-sm leading-relaxed">
            <p class="mb-1">{@render text("w-40")}</p>
            <p>{@render text("w-full")}</p>
            <p class="sm:hidden">{@render text("w-3/4")}</p>
          </div>
          <div class="mt-5 flex items-start gap-3">
            {@render bar("mt-0.5 block size-6 shrink-0")}
            <p class="leading-relaxed text-stone-900">
              {agreeBefore}<span class="font-medium text-accent-800 underline underline-offset-4">
                {say("reservation.review.termsLink")}
              </span>{agreeAfter}
            </p>
          </div>
          <div class="mt-5 min-h-16"></div>
          {@render bar("mt-4 block h-12 w-full")}
          <p class="mt-3 text-center text-sm text-stone-600">{say("reservation.pay.provider")}</p>
        </div>
      </div>
    {:else}
      <div class={card}>
        <p class={cardTitle}>{say("reservation.review.whatsapp.title")}</p>
        <p class="mt-4 leading-relaxed text-stone-700">{say("reservation.review.whatsapp.body")}</p>
        {@render bar("mt-6 block h-12 w-full")}
        <p class="mt-4 text-sm text-stone-600">{say("reservation.review.whatsapp.note")}</p>
        <p class="mt-2 min-h-11"></p>
      </div>
    {/if}
  </div>
</div>
