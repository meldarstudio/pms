<script lang="ts">
  import type { CheckoutView } from "@/lib/reservation/checkout";
  import { getReview } from "./review-context";
  import type { ReviewRoom } from "./review-view";
  import { eyebrow, headline } from "./styles";
  import { stayLabels } from "./stay";

  let { view, room }: { view: CheckoutView | null; room: ReviewRoom | null } = $props();
  const { say, lang } = getReview();
  const stay = $derived(view ? stayLabels(view, say, lang) : null);
</script>

<aside
  class="min-w-0 border border-stone-200 bg-white p-4 md:p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1"
  aria-labelledby="review-stay"
>
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
  <p class="mt-3 text-sm leading-relaxed text-stone-700 lg:hidden" data-stay="compact">
    {stay?.compact}
  </p>
  <p class="mt-1 text-sm text-stone-900 lg:hidden" data-stay="compact-guests-rate">
    {stay?.guests} · {stay?.plan}
  </p>
  <dl class="mt-3 border-t border-stone-200 pt-3 lg:mt-5 lg:pt-5">
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
  <div class="mt-5 hidden border-t border-stone-200 pt-5 text-sm lg:block">
    <dl class="grid grid-cols-2 gap-4">
      <div>
        <dt class="text-stone-600">{say("reservation.review.checkIn")}</dt>
        <dd class="mt-1 font-medium text-stone-900">
          <time data-stay="checkIn" datetime={view?.checkIn}>{stay?.checkIn}</time>
        </dd>
      </div>
      <div>
        <dt class="text-stone-600">{say("reservation.review.checkOut")}</dt>
        <dd class="mt-1 font-medium text-stone-900">
          <time data-stay="checkOut" datetime={view?.checkOut}>{stay?.checkOut}</time>
        </dd>
      </div>
    </dl>
    <p class="mt-2 text-stone-600" data-stay="nights">{stay?.nights}</p>
    <dl class="mt-4 grid grid-cols-2 gap-4">
      <div>
        <dt class="text-stone-600">{say("reservation.review.guests")}</dt>
        <dd class="mt-1 font-medium text-stone-900" data-stay="guests">{stay?.guests}</dd>
      </div>
      <div>
        <dt class="text-stone-600">{say("reservation.review.plan")}</dt>
        <dd class="mt-1 font-medium text-stone-900" data-stay="plan">{stay?.plan}</dd>
      </div>
    </dl>
  </div>
</aside>
