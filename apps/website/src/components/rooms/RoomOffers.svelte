<script lang="ts">
  import BookingSteps from "@/components/reservation/BookingSteps.svelte";
  import { getWhatsAppLink } from "@/lib/constants";
  import { formatMoney } from "@/lib/reservation/format";
  import { lowestOffer, type RoomTypeOffers } from "@/lib/reservation/offers";
  import type { RatePlanCode, StaySearch } from "@/lib/reservation/search";
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
    type RoomView,
    type RoomsBookingProps,
  } from "./room-view";
  import { totalLine } from "./room-rate";

  let {
    lang,
    text,
    searchCopy,
    reviewHref,
    conditionsHref,
    rooms,
    details,
    phase,
    choice,
    offersByType,
    onChooseDates,
    onOpenRoom,
    onChangeRoom,
    onPlan,
  }: Omit<RoomsBookingProps, "apiBase"> & {
    phase: Phase;
    choice: StaySearch | null;
    offersByType: Map<string, RoomTypeOffers>;
    onChooseDates: () => void;
    onOpenRoom: (room: RoomId) => void;
    onChangeRoom: () => void;
    onPlan: (plan: RatePlanCode) => void;
  } = $props();

  const roomId = $derived(choice?.plan ? choice.room : null);
  const ratesLoading = $derived(phase.kind === "loading" && roomId !== null);
  const room = $derived(rooms.find((item) => item.id === roomId));
  const offersFor = (room: RoomView) =>
    room.pmsRoomTypeId ? offersByType.get(room.pmsRoomTypeId) : undefined;
  const offers = $derived(room ? offersFor(room) : undefined);
  const rates = $derived([...(offers?.offers ?? [])].sort((a, b) => a.totalCents - b.totalCents));
  const selected = $derived(rates.find((offer) => offer.ratePlan === choice?.plan) ?? rates[0]);
  const onRates = $derived(
    phase.kind === "found" && offers?.availability === "available" && selected !== undefined,
  );

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
      {#if onRates && room && phase.kind === "found" && selected}
        <RoomRateStep
          {lang}
          {text}
          {searchCopy}
          {reviewHref}
          {conditionsHref}
          {room}
          {phase}
          {rates}
          {selected}
          {onPlan}
        />
      {:else}
        <ul class="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy={phase.kind === "loading"}>
          {#each rooms as item (item.id)}
            {@const offers = offersFor(item)}
            {@const floor = phase.kind === "found" ? lowestOffer(offers) : undefined}
            <li>
              <RoomCard room={item} {text} {details} {offers}>
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
                      {text["reservation.rate.see"]}
                    </button>
                  {:else if phase.kind === "found"}
                    {#if offers?.availability === "sold_out"}
                      <button type="button" disabled class={unavailable}>
                        {text["reservation.room.soldOut"]}
                      </button>
                    {:else if offers?.availability === "available" && floor}
                      <p class="text-sm text-stone-600">{text["reservation.rate.from"]}</p>
                      <p class="text-3xl font-semibold text-stone-900">
                        {formatMoney(floor.totalCents, phase.result.currency)}
                      </p>
                      <p class="mt-1 text-sm text-stone-600">{totalLine(phase, text)}</p>
                      <button
                        id={`room-rates-${item.id}`}
                        type="button"
                        class={`mt-4 w-full ${primary}`}
                        onclick={() => onOpenRoom(item.id)}
                      >
                        {text["reservation.rate.see"]}
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
