<script lang="ts">
  import BookingSteps from "@/components/reservation/BookingSteps.svelte";
  import { occupancySummary } from "@/components/stay-search/stay-search";
  import { getWhatsAppLink } from "@/lib/constants";
  import { fill, formatMoney } from "@/lib/reservation/format";
  import { lowestOffer } from "@/lib/reservation/offers";
  import { ratesOpen, type RatePlanCode, type StaySearch } from "@/lib/reservation/search";
  import { roomChoice, stayRates, type OffersFor } from "@/lib/reservation/stay-draft";
  import type { RoomId } from "@/lib/rooms";
  import RoomCard from "./RoomCard.svelte";
  import RoomIcon from "./RoomIcon.svelte";
  import RoomRateStep from "./RoomRateStep.svelte";
  import RoomRateLoading from "./RoomRateLoading.svelte";
  import {
    belowHeader,
    primary,
    secondary,
    unavailable,
    type Phase,
    type RoomsBookingProps,
  } from "./room-view";
  import { totalLine } from "./room-rate";

  let {
    lang,
    text,
    searchCopy,
    reviewHref,
    rooms,
    details,
    phase,
    draft,
    offersFor,
    onChooseDates,
    onOpenRoom,
    onContinue,
    onPrevious,
    onChangeRoom,
    onPlan,
  }: Omit<RoomsBookingProps, "apiBase"> & {
    phase: Phase;
    draft: StaySearch | null;
    offersFor: OffersFor;
    onChooseDates: () => void;
    onOpenRoom: (room: RoomId) => void;
    onContinue: () => void;
    onPrevious: () => void;
    onChangeRoom: () => void;
    onPlan: (plan: RatePlanCode) => void;
  } = $props();

  const open = $derived(draft !== null && ratesOpen(draft));
  const ratesLoading = $derived(phase.kind === "loading" && open);
  const rates = $derived(
    draft && open ? stayRates(draft, offersFor).sort((a, b) => a.totalCents - b.totalCents) : [],
  );
  const selected = $derived(rates.find((offer) => offer.ratePlan === draft?.plan) ?? rates[0]);
  const onRates = $derived(phase.kind === "found" && open && selected !== undefined);
  const chosen = $derived(
    (draft?.requests ?? []).flatMap((request) => {
      const room = rooms.find((item) => item.id === request.room);
      return room ? [{ room, request }] : [];
    }),
  );
  const total = $derived(draft?.requests.length ?? 1);
  const several = $derived(total > 1);
  const at = $derived(draft?.at ?? 0);
  const current = $derived(draft?.requests[at]);
  const last = $derived(at === total - 1);
  const chooseLabel = $derived(
    !several || last ? text["reservation.rate.see"] : text["reservation.room.choose"],
  );
  const canContinue = $derived(phase.kind === "found" && Boolean(current?.room && !current.failed));
</script>

<section class="bg-stone-100">
  <div class="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-8 md:px-8 md:py-12">
    {#if phase.kind === "idle" || ratesLoading}
      <div data-rate-loading class={ratesLoading ? undefined : "hidden"}>
        <BookingSteps {text} current="rate" />
        <div class="mt-10" aria-busy="true"><RoomRateLoading {text} /></div>
      </div>
    {/if}
    <div data-room-step hidden={ratesLoading} class="flex flex-col gap-10">
      <BookingSteps
        id="offer-steps"
        class={belowHeader}
        {text}
        current={onRates ? "rate" : "room"}
        {onChangeRoom}
      />
      {#if onRates && draft && phase.kind === "found" && selected}
        <RoomRateStep
          {lang}
          {text}
          {searchCopy}
          {reviewHref}
          {chosen}
          {draft}
          {phase}
          {rates}
          {selected}
          {onPlan}
        />
      {:else}
        {#if several && current}
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="room-step-title"
                tabindex="-1"
                class="text-2xl font-semibold text-pretty text-stone-900 md:text-3xl"
              >
                {fill(text["reservation.room.sequence"], { n: at + 1, total })}
              </h2>
              <p class="mt-1 text-stone-700">{occupancySummary(searchCopy, current)}</p>
            </div>
            <div class="flex flex-wrap gap-3">
              {#if at > 0}
                <button type="button" class={secondary} onclick={onPrevious}>
                  {fill(text["reservation.room.previous"], { n: at })}
                </button>
              {/if}
              {#if canContinue}
                <button type="button" class={primary} onclick={onContinue}>
                  {last ? text["reservation.rate.see"] : text["reservation.room.next"]}
                </button>
              {/if}
            </div>
          </div>
        {/if}
        <ul class="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy={phase.kind === "loading"}>
          {#each rooms as item (item.id)}
            {@const offers = offersFor(item.id)}
            {@const choice = draft ? roomChoice(draft, at, item.id, offersFor) : "offline"}
            {@const floor = phase.kind === "found" ? lowestOffer(offers) : undefined}
            {@const marked = several && current?.room === item.id}
            <li>
              <RoomCard room={item} {text} {details} {offers} {marked}>
                <div class="text-right">
                  {#if phase.kind === "idle"}
                    <button type="button" class={`w-full ${secondary}`} onclick={onChooseDates}>
                      <RoomIcon name="calendar" class="size-5 shrink-0" />
                      {text["reservation.room.chooseDates"]}
                    </button>
                  {:else if phase.kind === "loading"}
                    <p class="text-sm text-stone-600">{text["reservation.rate.from"]}</p>
                    <div class="text-3xl font-semibold">
                      <div
                        aria-hidden="true"
                        class="ml-auto h-lh w-40 animate-pulse bg-stone-200 motion-reduce:animate-none"
                      ></div>
                    </div>
                    <p class="mt-1 text-sm text-stone-600">{totalLine(phase, text)}</p>
                    <button
                      type="button"
                      disabled
                      class={`mt-4 w-full ${primary} disabled:opacity-50`}
                    >
                      {chooseLabel}
                    </button>
                  {:else if phase.kind === "found"}
                    {#if choice === "sold_out"}
                      <button type="button" disabled class={unavailable}>
                        {text["reservation.room.soldOut"]}
                      </button>
                    {:else if choice === "too_many_guests"}
                      <button type="button" disabled class={unavailable}>
                        {text["reservation.room.tooManyGuests"]}
                      </button>
                    {:else if choice === "choosable" && floor}
                      <p class="text-sm text-stone-600">{text["reservation.rate.from"]}</p>
                      <p class="text-3xl font-semibold text-stone-900">
                        {formatMoney(floor.totalCents, phase.result.currency)}
                      </p>
                      <p class="mt-1 text-sm text-stone-600">{totalLine(phase, text)}</p>
                      <button
                        id={`room-rates-${item.id}`}
                        type="button"
                        class={`mt-4 w-full ${primary}`}
                        aria-pressed={several ? marked : undefined}
                        onclick={() => onOpenRoom(item.id)}
                      >
                        {marked ? text["reservation.room.chosen"] : chooseLabel}
                      </button>
                    {:else}
                      {@const [before, after] =
                        text["reservation.room.offline"].split("{whatsapp}")}
                      <p class="text-left font-semibold text-stone-900">
                        {before}<a
                          href={getWhatsAppLink(text["whatsapp.prefill"])}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="underline decoration-accent-500 decoration-2 underline-offset-4 hover:text-accent-800"
                        >
                          WhatsApp
                        </a>{after}
                      </p>
                    {/if}
                  {/if}
                </div>
              </RoomCard>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</section>
