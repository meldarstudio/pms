<script lang="ts">
  import logoUrl from "@/assets/manantial-logo.svg?url";
  import { BUSINESS_NAME } from "@/constants";
  import { address, email, phoneNumber } from "@/lib/constants";
  import { formatMoney } from "@/lib/reservation/format";
  import { internationalPhone } from "@pms/shared/phone";
  import { getReview } from "./review-context";
  import type { SavedConfirmation } from "./review-view";
  import { stayLabels } from "./stay";

  let { view, room, reservation, currency }: SavedConfirmation = $props();
  const { say, lang } = getReview();
  const stay = $derived(stayLabels(view, say, lang));
  const money = (cents: number) => formatMoney(cents, currency);
  const hotelPhone = internationalPhone(phoneNumber)?.formatInternational() ?? phoneNumber;
</script>

<article
  class="confirmation-print-sheet"
  data-print-confirmation
  aria-label={say("reservation.confirmation.printLabel")}
>
  <header class="confirmation-print-hotel">
    <img src={logoUrl} alt={BUSINESS_NAME} width="192" height="48" />
    <div>
      <p>{address}</p>
      <p>{hotelPhone}</p>
    </div>
  </header>
  <div class="confirmation-print-heading">
    <div>
      <p class="confirmation-print-eyebrow">{say("reservation.confirmation.printStatus")}</p>
      <h1>{say("reservation.confirmation.printTitle")}</h1>
      <p class="confirmation-print-welcome">{say("reservation.confirmation.printWelcome")}</p>
    </div>
    <div class="confirmation-print-reference">
      <p class="confirmation-print-eyebrow">{say("reservation.outcome.reference")}</p>
      <p>{reservation.code}</p>
    </div>
  </div>
  <section class="confirmation-print-stay" aria-labelledby="print-stay-title">
    <h2 id="print-stay-title">{say("reservation.review.stay")}</h2>
    <div class="confirmation-print-room">
      <div>
        <h3>{room.name}</h3>
        <p>{room.beds}</p>
      </div>
      <p>{stay.guests}</p>
    </div>
    <dl class="confirmation-print-stay-facts">
      <div>
        <dt>{say("reservation.review.checkIn")}</dt>
        <dd>{stay.checkIn}</dd>
      </div>
      <div>
        <dt>{say("reservation.review.checkOut")}</dt>
        <dd>{stay.checkOut}</dd>
      </div>
      <div>
        <dt>{say("reservation.confirmation.duration")}</dt>
        <dd>{stay.nights}</dd>
      </div>
      <div>
        <dt>{say("reservation.review.plan")}</dt>
        <dd>{stay.plan}</dd>
      </div>
    </dl>
  </section>
  <section class="confirmation-print-payment" aria-labelledby="print-payment-title">
    <h2 id="print-payment-title">{say("reservation.confirmation.payment")}</h2>
    <dl>
      <div>
        <dt>{say("reservation.offer.total")}</dt>
        <dd>{money(view.quote.totalCents)}</dd>
      </div>
      <div>
        <dt>{say("reservation.outcome.paid")}</dt>
        <dd>{money(reservation.paidCents)}</dd>
      </div>
      <div class="confirmation-print-balance">
        <dt>{say("reservation.outcome.outstanding")}</dt>
        <dd>{money(reservation.outstandingCents)}</dd>
      </div>
    </dl>
    {#if reservation.outstandingCents > 0}
      <p class="confirmation-print-at-hotel">{say("reservation.access.atHotel")}</p>
    {/if}
    <p class="confirmation-print-taxes">{say("reservation.offer.taxes", { currency })}</p>
  </section>
  <footer class="confirmation-print-footer">
    <h2>{say("reservation.confirmation.thanks")}</h2>
    <p>{say("reservation.confirmation.printHelp")}</p>
    <a href={`tel:${phoneNumber}`}>{hotelPhone}</a>
    <a href={`mailto:${email}`}>{email}</a>
  </footer>
</article>
