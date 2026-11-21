<script lang="ts">
  import { onMount } from "svelte";
  import { Check, CircleNotch, Phone, Printer, WhatsappLogo } from "phosphor-svelte";
  import { BUSINESS_NAME } from "@/constants";
  import { address, phoneNumber, whatsappUrl } from "@/lib/constants";
  import type { AccessState } from "@/lib/reservation/checkout-flow";
  import { formatMoney } from "@/lib/reservation/format";
  import { summaryLink } from "@/lib/reservation/summary";
  import PrintConfirmation from "./PrintConfirmation.svelte";
  import { getReview, replaceFocusedAction } from "./review-context";
  import type { SavedConfirmation } from "./review-view";
  import { stayLabels } from "./stay";
  import { primary, secondary } from "./styles";
  import "./confirmation.css";

  let {
    view,
    room,
    reservation,
    currency,
    access,
    summaryHref,
    onAccessRetry,
    animateCheckmark,
  }: SavedConfirmation & {
    access: AccessState;
    summaryHref: string;
    onAccessRetry: () => void;
    animateCheckmark: boolean;
  } = $props();
  const { say, lang } = getReview();
  const stay = $derived(stayLabels(view, say, lang));
  const money = (cents: number) => formatMoney(cents, currency);
  let statusRegionMounted = $state(false);
  let checkmarkEntered = $state(false);
  onMount(() => {
    statusRegionMounted = true;
  });
  const replacedAction = replaceFocusedAction();

  function retryAccess(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
    if (access.kind !== "unavailable") return;
    if (document.activeElement === event.currentTarget) replacedAction.expectReplacement();
    onAccessRetry();
  }

  function printConfirmation() {
    const title = document.title;
    document.title = `${say("reservation.confirmation.printTitle")} ${reservation.code} · ${BUSINESS_NAME}`;
    try {
      window.print();
    } finally {
      document.title = title;
    }
  }
</script>

<section
  class="checkout-confirmation"
  data-confirmed="true"
  data-outcome
  data-confirmation
  aria-labelledby="review-outcome-title"
>
  <div class="confirmation-welcome">
    <header>
      <p
        class="confirmation-kicker"
        onanimationend={() => {
          checkmarkEntered = true;
        }}
      >
        <Check
          class={animateCheckmark && !checkmarkEntered ? "confirmation-check-enter" : undefined}
          aria-hidden="true"
        />
        {say("reservation.outcome.confirmed.title")}
      </p>
      <h1
        id="review-outcome-title"
        tabindex="-1"
        data-outcome-title
        data-checkout-focus="outcomeTitle"
      >
        {say("reservation.confirmation.welcome")}
      </h1>
      <p class="confirmation-intro">{say("reservation.outcome.confirmed.body")}</p>
      <div class="confirmation-reference">
        <p class="confirmation-label">{say("reservation.outcome.reference")}</p>
        <p class="confirmation-code" data-confirmation-reference>{reservation.code}</p>
      </div>
    </header>
    <div class="confirmation-welcome-body">
      <div>
        <section class="confirmation-stay" aria-label={say("reservation.review.stay")}>
          <img src={room.photo.src} alt={room.photo.alt} width="160" height="120" />
          <div>
            <p class="confirmation-label">{say("reservation.review.stay")}</p>
            <h2 data-stay="room">{room.name}</h2>
            <p>{room.beds}</p>
            <p class="confirmation-stay-line">{stay.compact}</p>
            <p>{stay.guests} · {stay.plan}</p>
          </div>
          <dl class="confirmation-dates">
            <div>
              <dt>{say("reservation.review.checkIn")}</dt>
              <dd>{stay.checkIn}</dd>
            </div>
            <div>
              <dt>{say("reservation.review.checkOut")}</dt>
              <dd>{stay.checkOut}</dd>
            </div>
          </dl>
        </section>
        <hr class="border-stone-200" />
        <section
          class="confirmation-amounts"
          aria-label={say("reservation.confirmation.paymentLabel")}
        >
          <dl>
            <div>
              <dt>{say("reservation.offer.total")}</dt>
              <dd>{money(view.quote.totalCents)}</dd>
            </div>
            <div>
              <dt>{say("reservation.outcome.paid")}</dt>
              <dd>{money(reservation.paidCents)}</dd>
            </div>
            <div class="confirmation-balance">
              <dt>{say("reservation.outcome.outstanding")}</dt>
              <dd>{money(reservation.outstandingCents)}</dd>
            </div>
          </dl>
          <p class="confirmation-tax">{say("reservation.offer.taxes", { currency })}</p>
        </section>
      </div>
      <aside>
        <section class="confirmation-welcome-access" aria-labelledby="confirmation-access-title">
          <h2 id="confirmation-access-title">{say("reservation.confirmation.accessTitle")}</h2>
          <p>{say("reservation.confirmation.accessBody")}</p>
          <div class="confirmation-link-actions">
            {#if access.kind === "available"}
              <a
                {@attach replacedAction.restore}
                class={primary}
                href={summaryLink(summaryHref, access.token)}
                referrerpolicy="no-referrer"
                data-access-view
              >
                {say("reservation.access.view")}
              </a>
            {:else if access.kind === "unavailable" || access.kind === "loading"}
              {@const loading = access.kind === "loading"}
              <button
                type="button"
                class={primary}
                aria-disabled={loading || undefined}
                aria-busy={loading || undefined}
                data-access-loading={loading ? "" : undefined}
                data-access-retry={loading ? undefined : ""}
                onclick={retryAccess}
              >
                {#if loading}<CircleNotch class="confirmation-spinner" aria-hidden="true" />{/if}
                {say(loading ? "reservation.confirmation.preparing" : "reservation.access.retry")}
              </button>
            {/if}
            <button
              type="button"
              class={secondary}
              onclick={printConfirmation}
              data-confirmation-print
            >
              <Printer aria-hidden="true" />
              {say("reservation.confirmation.print")}
            </button>
          </div>
          <p
            class={access.kind === "unavailable" ? "confirmation-link-status" : "sr-only"}
            role="status"
            data-access-status
          >
            {statusRegionMounted
              ? access.kind === "unavailable"
                ? say("reservation.access.unavailable.confirmed")
                : access.kind === "loading"
                  ? say("reservation.access.loading")
                  : ""
              : ""}
          </p>
        </section>
        <section
          class="confirmation-help confirmation-welcome-help"
          aria-labelledby="confirmation-help-title"
        >
          <h2 id="confirmation-help-title">{say("reservation.confirmation.helpTitle")}</h2>
          <p>{say("reservation.confirmation.helpBody")}</p>
          <div class="confirmation-contact-actions">
            <a href={`tel:${phoneNumber}`} data-reservation-call>
              <Phone aria-hidden="true" />
              {say("reservation.confirmation.call")}
            </a>
            <a href={whatsappUrl} data-reservation-help target="_blank" rel="noreferrer">
              <WhatsappLogo aria-hidden="true" />
              {say("reservation.confirmation.whatsapp")}
            </a>
          </div>
          <p class="confirmation-hotel-address">{address}</p>
        </section>
      </aside>
    </div>
    <PrintConfirmation {view} {room} {reservation} {currency} />
  </div>
</section>
