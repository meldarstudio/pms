<script lang="ts">
  import RoomIcon from "./RoomIcon.svelte";
  import { policyHeading, policyTitles, rateLayout, summaryLayout } from "./room-rate";
  import type { RoomsBookingText } from "./text";

  let { text }: { text: RoomsBookingText } = $props();
  const plans = ["non_refundable", "flexible"] as const;
  const summaryKeys = ["dates", "plan"] as const;
  const payLabels = ["reservation.rate.due", "reservation.offer.remaining"] as const;
</script>

{#snippet skeleton(size: string)}
  <span class={`block animate-pulse bg-stone-200 motion-reduce:animate-none ${size}`}></span>
{/snippet}

{#snippet line(label: string, width: string)}
  <div class="flex justify-between gap-4">
    <span>{label}</span>
    {@render skeleton(`h-lh ${width}`)}
  </div>
{/snippet}

<div class={rateLayout}>
  <div class="lg:col-start-1">
    <h2 class="text-2xl font-semibold text-pretty text-stone-900 md:text-3xl">
      {text["reservation.rate.choose"]}
    </h2>
    <div aria-hidden="true" class="mt-6 flex flex-col gap-3">
      {#each plans as plan (plan)}
        <div
          class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border border-stone-300 bg-white p-4 md:p-5"
        >
          {@render skeleton("mt-1 size-5")}
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span class="text-lg font-semibold text-stone-900">
              {text[`reservation.plan.${plan}`]}
            </span>
            {@render skeleton("ml-auto h-7 w-24")}
          </div>
          <div class="col-start-2 text-sm leading-relaxed">
            {@render skeleton(`h-lh w-full ${plan === "flexible" ? "max-md:h-[2lh]" : ""}`)}
          </div>
          <div class="col-start-2 flex flex-col gap-1 text-sm text-stone-600">
            {@render line(text[payLabels[0]], "w-20")}
            {#if plan === "flexible"}{@render line(text[payLabels[1]], "w-20")}{/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
  <div aria-hidden="true" class={summaryLayout}>
    <div class="p-5 md:p-6">
      <div class="flex items-start gap-4">
        {@render skeleton("size-20 shrink-0")}
        <div class="min-w-0 flex-1">
          <p
            class="font-source-sans-3 text-xs font-medium tracking-widest text-stone-600 uppercase"
          >
            {text["reservation.review.stay"]}
          </p>
          {@render skeleton("mt-2 h-7 w-48 max-w-full")}
          {@render skeleton("mt-1 h-5 w-36 max-w-full")}
        </div>
      </div>
      <div class="mt-4 flex flex-col gap-2 text-sm text-stone-600">
        {#each summaryKeys as key (key)}
          {@render line(text[`reservation.review.${key}`], "w-40 max-w-full")}
        {/each}
      </div>
      <div class="mt-4 border-t border-stone-200 pt-4">
        <p class="text-sm text-stone-600">{text["reservation.offer.total"]}</p>
        {@render skeleton("h-9 w-40")}
        <div class="mt-3 flex flex-col gap-1 text-sm text-stone-600">
          {#each payLabels as key (key)}{@render line(text[key], "w-20")}{/each}
        </div>
        {@render skeleton("mt-3 h-4 w-60 max-w-full")}
        {@render skeleton("mt-4 h-12 w-full")}
      </div>
    </div>
  </div>
  <div aria-hidden="true" class="border-t border-stone-200 lg:col-start-1">
    {#each policyTitles as key (key)}
      <div class={`${policyHeading} border-b border-stone-200`}>
        {text[`rooms.policies.${key}`]}
        <RoomIcon name="down" class="size-4 shrink-0 text-stone-500" />
      </div>
    {/each}
  </div>
</div>
