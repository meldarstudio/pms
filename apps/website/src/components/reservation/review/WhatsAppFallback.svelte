<script lang="ts">
  import { ArrowSquareOut } from "phosphor-svelte";
  import { getReview } from "./review-context";
  import { card, cardTitle, primary, quietLink } from "./styles";
  let { href, hidden }: { href: string; hidden: boolean } = $props();
  const { say, conditionsHref } = getReview();
</script>

<section class={card} aria-labelledby="review-whatsapp" data-whatsapp {hidden}>
  <h2 id="review-whatsapp" class={cardTitle}>{say("reservation.review.whatsapp.title")}</h2>
  <p class="mt-4 leading-relaxed text-stone-700">{say("reservation.review.whatsapp.body")}</p>
  <a
    {href}
    target="_blank"
    rel="noopener noreferrer"
    class={`mt-6 w-full ${primary}`}
    data-whatsapp-link
  >
    {say("reservation.review.whatsapp.button")}
    <span class="sr-only">({say("reservation.review.whatsapp.newTab")})</span>
    <ArrowSquareOut aria-hidden="true" class="size-4.5 shrink-0" />
  </a>
  <p class="mt-4 text-sm text-stone-600">{say("reservation.review.whatsapp.note")}</p>
  <a href={conditionsHref} class={`mt-2 ${quietLink}`}>
    {say("reservation.review.conditionsLink")}
  </a>
</section>
