<script lang="ts">
  import type { CheckoutView } from "@/lib/reservation/checkout";
  import { getReview } from "./review-context";
  import type { ReviewRoom } from "./review-view";
  import { eyebrow, headline } from "./styles";
  import { stayLabels } from "./stay";

  let { view, rooms }: { view: CheckoutView | null; rooms: ReviewRoom[] } = $props();
  const { say, lang } = getReview();
  const stay = $derived(view ? stayLabels(view, say, lang) : null);
  const room = $derived(rooms[0] ?? null);
  const several = $derived(rooms.length > 1);
</script>

{#snippet summaryRow(term: string, detail: string | undefined, name: string)}
  <div class="flex items-baseline justify-between gap-4">
    <dt class="text-stone-600">{term}</dt>
    <dd class="text-right font-semibold text-stone-900" data-stay={name}>{detail ?? ""}</dd>
  </div>
{/snippet}

<aside
  class="min-w-0 border border-stone-200 bg-white p-4 md:p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1"
  aria-labelledby="review-stay"
>
  {#if several}
    <h2 id="review-stay" class={eyebrow}>{say("reservation.review.stay")}</h2>
    <ol class="mt-3 flex flex-col divide-y divide-stone-200" data-stay="rooms">
      {#each rooms as item, index (index)}
        <li class="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
          <img
            class="size-14 shrink-0 object-cover object-center md:size-16"
            width="64"
            height="64"
            data-room-photo
            src={item.photo.src}
            alt=""
          />
          <div class="min-w-0">
            <p
              class="text-lg leading-snug font-semibold text-pretty text-stone-900"
              data-stay="room"
            >
              {item.name}
            </p>
            <p class="mt-0.5 text-sm text-stone-600">
              {say("landing.roomNumber", { n: index + 1 })}{stay?.rooms[index]
                ? ` · ${stay.rooms[index]}`
                : ""}
            </p>
          </div>
        </li>
      {/each}
    </ol>
  {:else}
  <div class="flex items-start gap-4">
    <img
      class="size-14 shrink-0 object-cover object-center md:size-20"
      width="80"
      height="80"
      data-room-photo
      src={room?.photo.src}
      alt={room?.photo.alt ?? ""}
    />
    <div class="min-w-0">
      <h2 id="review-stay" class={eyebrow}>{say("reservation.review.stay")}</h2>
      <p
        class="mt-1 text-lg font-semibold text-pretty text-stone-900 md:mt-2 md:text-xl"
        data-stay="room"
      >
        {room?.name}
      </p>
      <p class="mt-1 hidden text-sm text-stone-600 lg:block" data-stay="room-details">
        {room?.beds}
      </p>
    </div>
  </div>
  {/if}
  <dl
    class={`mt-4 flex flex-col gap-2 text-sm ${several ? "border-t border-stone-200 pt-4" : ""}`}
  >
    {@render summaryRow(say("reservation.review.dates"), stay?.compact, "dates")}
    {#if !several}
      {@render summaryRow(say("reservation.review.guests"), stay?.guests, "guests")}
    {/if}
    {@render summaryRow(say("reservation.review.plan"), stay?.plan, "plan")}
  </dl>
  <dl class="mt-4 border-t border-stone-200 pt-4">
    <div class={headline}>
      <dt class="text-sm font-medium text-stone-900">{say("reservation.offer.total")}</dt>
      <dd class="text-2xl font-semibold whitespace-nowrap text-stone-900" data-amount="total">
        {stay && view ? stay.money(view.quote.totalCents) : ""}
      </dd>
    </div>
  </dl>
  <p class="mt-1 text-sm text-stone-600" data-taxes>
    {view ? say("reservation.offer.taxes", { currency: view.currency }) : ""}
  </p>
</aside>
