<script lang="ts">
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion";
  import type { Snippet } from "svelte";
  import { occupancySummary } from "@/components/stay-search/stay-search";
  import { fill, formatDate, formatList, formatMoney } from "@/lib/reservation/format";
  import type { PlanOffer } from "@/lib/reservation/offers";
  import {
    searchParams,
    type RatePlanCode,
    type RoomRequest,
    type StaySearch,
  } from "@/lib/reservation/search";
  import RoomIcon from "./RoomIcon.svelte";
  import { nightsOf, policyHeading, rateLayout, summaryLayout } from "./room-rate";
  import { primary, type Phase, type RoomView, type RoomsBookingProps } from "./room-view";
  import type { RoomsBookingKey } from "./text";

  let {
    lang,
    text,
    searchCopy,
    reviewHref,
    chosen,
    draft,
    phase,
    rates,
    selected,
    onPlan,
  }: Pick<RoomsBookingProps, "lang" | "text" | "searchCopy" | "reviewHref"> & {
    chosen: { room: RoomView; request: RoomRequest }[];
    draft: StaySearch;
    phase: Extract<Phase, { kind: "found" }>;
    rates: PlanOffer[];
    selected: PlanOffer;
    onPlan: (plan: RatePlanCode) => void;
  } = $props();

  const say = (key: RoomsBookingKey, values: Record<string, string | number> = {}) =>
    fill(text[key], values);
  const money = (cents: number) => formatMoney(cents, phase.result.currency);
  const nights = $derived(nightsOf(phase, text));
  const several = $derived(chosen.length > 1);
  const room = $derived(chosen[0]!.room);
  const guests = $derived(occupancySummary(searchCopy, chosen[0]!.request));
  const dates = $derived(
    `${formatDate(phase.search.checkIn, lang, { includeWeekday: false })} – ${formatDate(phase.search.checkOut, lang, { includeWeekday: false })}`,
  );
  const continueHref = $derived(
    `${reviewHref}?${searchParams({ ...draft, plan: selected.ratePlan }).toString()}`,
  );
  const continueLabel = $derived(
    say("reservation.rate.continueLabel", {
      room: formatList(
        chosen.map((item) => item.room.name),
        lang,
      ),
      plan: say(`reservation.plan.${selected.ratePlan}`),
    }),
  );
  const photo = $derived(room.photos[0]);
  let summaryContinueInView = $state(false);

  function watchSummaryContinue(node: HTMLElement) {
    const header = document.querySelector("navigation-menu")?.getBoundingClientRect().height ?? 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const underHeader = entry && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
        summaryContinueInView = Boolean(entry?.isIntersecting && !underHeader);
      },
      { rootMargin: `-${Math.ceil(header)}px 0px 0px 0px`, threshold: [0, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }
</script>

{#snippet payments(offer: PlanOffer)}
  <span class="flex flex-col gap-1 text-sm text-stone-600">
    <span class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span>{text["reservation.rate.due"]}</span>
      <span class="ml-auto whitespace-nowrap">{money(offer.requiredInitialPaymentCents)}</span>
    </span>
    {#if offer.remainingScheduledCents > 0}
      <span class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>{text["reservation.offer.remaining"]}</span>
        <span class="ml-auto whitespace-nowrap">{money(offer.remainingScheduledCents)}</span>
      </span>
    {/if}
  </span>
{/snippet}

{#snippet terms({ cancellation, savingCents }: PlanOffer)}
  {#if cancellation.freeCancellation === "available" && cancellation.freeUntil}
    {@const [before, after] = text["reservation.rate.freeUntil"].split("{date}")}
    <span class="font-semibold text-green-800">
      {before}<time datetime={cancellation.freeUntil}>
        {formatDate(cancellation.freeUntil, lang)}
      </time>{after}
    </span>
  {:else}
    {text[
      cancellation.freeCancellation === "ended"
        ? "reservation.rate.freeEnded"
        : "reservation.rate.noFree"
    ]}
  {/if}
  {#if savingCents > 0}
    · <span class="font-semibold text-green-800">
      {say("reservation.rate.saving", { amount: money(savingCents) })}
    </span>
  {/if}
{/snippet}

{#snippet summaryRow(term: string, detail: string)}
  <div class="flex items-baseline justify-between gap-4">
    <dt class="text-stone-600">{term}</dt>
    <dd class="text-right font-semibold text-stone-900">{detail}</dd>
  </div>
{/snippet}

{#snippet policy(key: RoomsBookingKey, body: Snippet)}
  <AccordionItem value={key} class="border-b border-stone-200">
    <AccordionHeader>
      <AccordionTrigger
        class={`group w-full cursor-pointer text-left hover:text-accent-800 ${policyHeading}`}
      >
        {text[key]}
        <RoomIcon
          name="down"
          class="size-4 shrink-0 text-stone-500 transition-transform duration-170 ease-(--booking-ease-out) group-aria-expanded:rotate-180 motion-reduce:transition-none"
        />
      </AccordionTrigger>
    </AccordionHeader>
    <AccordionPanel class="room-policy-panel text-sm leading-relaxed text-stone-700">
      <div class="pb-4">{@render body()}</div>
    </AccordionPanel>
  </AccordionItem>
{/snippet}

{#snippet cancel()}
  <p>
    {text[
      selected.ratePlan === "flexible"
        ? several
          ? "rooms.policies.cancelFlexibleBodyRooms"
          : "rooms.policies.cancelFlexibleBody"
        : "rooms.policies.cancelNonRefundableBody"
    ]}
  </p>
{/snippet}
{#snippet checkIn()}
  <p>{text["rooms.policies.checkIn"]}: {text["rooms.policies.checkInValue"]}</p>
  <p>{text["rooms.policies.checkOut"]}: {text["rooms.policies.checkOutValue"]}</p>
{/snippet}
{#snippet breakfast()}<p>{text["rooms.policies.breakfastValue"]}</p>{/snippet}
{#snippet pets()}<p>{text["rooms.policies.petsBody"]}</p>{/snippet}
{#snippet payment()}<p>{text["rooms.policies.paymentBody"]}</p>{/snippet}

<div id="room-rates" class={`scroll-offset ${rateLayout}`}>
  <div class="lg:col-start-1">
    <h2
      id="room-rates-title"
      tabindex="-1"
      class="text-2xl font-semibold text-pretty text-stone-900 md:text-3xl"
    >
      {say("reservation.rate.choose")}
    </h2>
    <fieldset class="mt-6 flex flex-col gap-3">
      <legend class="sr-only">{say("reservation.rate.choose")}</legend>
      {#each rates as offer (offer.ratePlan)}
        {@const checked = selected.ratePlan === offer.ratePlan}
        <label
          class={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border p-4 md:p-5 ${checked ? "border-accent-700 bg-accent-50" : "border-stone-300 bg-white"}`}
        >
          <input
            type="radio"
            name="room-rate"
            class="mt-1 size-5 accent-accent-700"
            {checked}
            onchange={() => onPlan(offer.ratePlan)}
          />
          <span class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span class="text-lg font-semibold text-stone-900">
              {say(`reservation.plan.${offer.ratePlan}`)}
            </span>
            <span class="ml-auto text-xl font-semibold whitespace-nowrap text-stone-900">
              {money(offer.totalCents)}
            </span>
          </span>
          <span class="col-start-2 text-sm leading-relaxed text-stone-700">
            {@render terms(offer)}
          </span>
          <span class="col-start-2">{@render payments(offer)}</span>
        </label>
      {/each}
    </fieldset>
  </div>
  <aside class={summaryLayout} aria-labelledby="stay-summary">
    <div class="p-5 md:p-6">
      {#if several}
        <h2
          id="stay-summary"
          class="font-source-sans-3 text-xs font-medium tracking-widest text-stone-600 uppercase"
        >
          {say("reservation.review.stay")}
        </h2>
        <ol class="mt-3 flex flex-col divide-y divide-stone-200">
          {#each chosen as item, index (index)}
            {@const thumb = item.room.photos[0]}
            <li class="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              {#if thumb}
                <img
                  class="size-16 shrink-0 object-cover object-center"
                  src={thumb.src}
                  srcset={thumb.srcSet}
                  sizes="4rem"
                  width={thumb.width}
                  height={thumb.height}
                  alt=""
                />
              {/if}
              <div class="min-w-0">
                <p class="text-lg leading-snug font-semibold text-pretty text-stone-900">
                  {item.room.name}
                </p>
                <p class="mt-0.5 text-sm text-stone-600">
                  {fill(searchCopy.roomNumber, { n: index + 1 })} · {occupancySummary(
                    searchCopy,
                    item.request,
                  )}
                </p>
              </div>
            </li>
          {/each}
        </ol>
      {:else}
      <div class="flex items-start gap-4">
        {#if photo}
          <img
            class="size-20 shrink-0 object-cover object-center"
            src={photo.src}
            srcset={photo.srcSet}
            sizes="5rem"
            width={photo.width}
            height={photo.height}
            alt={photo.alt}
          />
        {/if}
        <div class="min-w-0">
          <h2
            id="stay-summary"
            class="font-source-sans-3 text-xs font-medium tracking-widest text-stone-600 uppercase"
          >
            {say("reservation.review.stay")}
          </h2>
          <p class="mt-2 text-xl font-semibold text-pretty text-stone-900">{room.name}</p>
          <p class="mt-1 text-sm text-stone-600">{room.beds} · {room.area}</p>
        </div>
      </div>
      {/if}
      <dl
        class={`mt-4 flex flex-col gap-2 text-sm ${several ? "border-t border-stone-200 pt-4" : ""}`}
      >
        {@render summaryRow(say("reservation.review.dates"), `${dates} · ${nights}`)}
        {#if !several}
          {@render summaryRow(say("reservation.review.guests"), guests)}
        {/if}
        {@render summaryRow(
          say("reservation.review.plan"),
          say(`reservation.plan.${selected.ratePlan}`),
        )}
      </dl>
      <div class="mt-4 border-t border-stone-200 pt-4">
        <p class="text-sm text-stone-600">{say("reservation.offer.total")}</p>
        <p class="text-3xl font-semibold text-stone-900">{money(selected.totalCents)}</p>
        <div class="mt-3">{@render payments(selected)}</div>
        <p class="mt-3 text-xs text-stone-600">
          {say("reservation.offer.taxes", { currency: phase.result.currency })}
        </p>
        <a
          {@attach watchSummaryContinue}
          class={`mt-4 w-full ${primary}`}
          href={continueHref}
          aria-label={continueLabel}
        >
          {say("reservation.rate.continue")}
        </a>
      </div>
    </div>
  </aside>
  <Accordion multiple class="border-t border-stone-200 lg:col-start-1">
    {@render policy("rooms.policies.cancelTitle", cancel)}
    {@render policy("rooms.policies.checkInTitle", checkIn)}
    {@render policy("rooms.policies.breakfast", breakfast)}
    {@render policy("rooms.policies.petsTitle", pets)}
    {@render policy("rooms.policies.paymentTitle", payment)}
  </Accordion>
  <div
    data-continue-bar
    hidden={summaryContinueInView}
    class="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t border-stone-200 bg-white pt-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] shadow-[0_-1px_6px_rgb(0_0_0/0.06)] md:hidden"
  >
    <div class="min-w-0">
      <p class="text-xs text-stone-600">{say("reservation.offer.total")}</p>
      <p class="text-xl font-semibold whitespace-nowrap text-stone-900">
        {money(selected.totalCents)}
      </p>
    </div>
    <a class={`shrink-0 ${primary}`} href={continueHref} aria-label={continueLabel}>
      {say("reservation.rate.continue")}
    </a>
  </div>
</div>

<style>
  :global(.room-policy-panel) {
    height: var(--accordion-panel-height);
    overflow: clip;
    transition:
      height 170ms var(--booking-ease-out),
      opacity 170ms var(--booking-ease-out);
  }

  :global(.room-policy-panel:is([data-starting-style], [data-ending-style])) {
    height: 0;
    opacity: 0.75;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.room-policy-panel) {
      transition: none;
    }

    :global(.room-policy-panel[data-open]) {
      transition: opacity 80ms var(--booking-ease-out);
    }

    :global(.room-policy-panel[data-starting-style]) {
      height: var(--accordion-panel-height);
    }
  }
</style>
