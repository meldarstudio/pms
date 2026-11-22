<script lang="ts">
  import { flushSync, onMount, untrack } from "svelte";
  import BookingSteps from "@/components/reservation/BookingSteps.svelte";
  import { getWhatsAppLink, phoneNumber } from "@/lib/constants";
  import { selectionKey } from "@/lib/reservation/checkout";
  import {
    checkoutSelection,
    initialState,
    next,
    type Event,
  } from "@/lib/reservation/checkout-flow";
  import {
    createCheckoutRunner,
    readDraft,
    type CheckoutRunner,
  } from "@/lib/reservation/checkout-runner";
  import {
    formVisible,
    reviewLoading,
    whatsappVisible,
  } from "@/lib/reservation/checkout-selectors";
  import {
    occupancyOnly,
    readSearch,
    searchParams,
    type StaySearch,
  } from "@/lib/reservation/search";
  import Confirmation from "./Confirmation.svelte";
  import ContactFields from "./ContactFields.svelte";
  import Outcome from "./Outcome.svelte";
  import PaymentSection from "./PaymentSection.svelte";
  import ProblemPanel from "./ProblemPanel.svelte";
  import ReviewLoading from "./ReviewLoading.svelte";
  import ReviewSummary from "./ReviewSummary.svelte";
  import WhatsAppFallback from "./WhatsAppFallback.svelte";
  import { setReview } from "./review-context";
  import type { ReviewProps } from "./review-view";
  import { stayLabels } from "./stay";
  import { quietLink } from "./styles";
  import { sayFrom } from "./text";

  let {
    lang,
    apiBase,
    payments: builtPayments,
    devPayments,
    chooseHref,
    summaryHref,
    whatsappHref,
    privacyHref,
    conditionsHref,
    text,
    rooms,
  }: ReviewProps = $props();
  const say = untrack(() => sayFrom(text));
  untrack(() => setReview({ lang, say, privacyHref, conditionsHref }));

  let root: HTMLDivElement;
  let search = $state.raw<StaySearch | null>(null);
  let checkout = $state.raw(initialState);
  let runner: CheckoutRunner | null = null;
  let paymentSubmittedHere = $state(false);
  let previewMode = $state<string | null>(null);
  let previewHref = $state("");
  const payments = $derived(
    previewMode === "on" ? devPayments : previewMode === "off" ? null : builtPayments,
  );

  function dispatch(event: Event) {
    const transition = next(checkout, event);
    checkout = transition.state;
    if (!transition.effects.length) return;
    const pending = transition.effects;
    if (pending.some((effect) => effect.type === "startPayment" || effect.type === "continuePayment"))
      paymentSubmittedHere = true;
    if (pending.some((effect) => effect.type === "focus" || effect.type === "startSecurityCheck"))
      flushSync();
    runner?.run(pending);
  }

  onMount(() => {
    const url = new URL(window.location.href);
    if (import.meta.env.DEV) {
      previewMode = url.searchParams.get("payments");
      url.searchParams.set("payments", payments ? "off" : "on");
      previewHref = url.href;
    }
    const found = readSearch(url.searchParams, Object.keys(rooms));
    const selection = checkoutSelection(found, (room) => rooms[room]?.pmsRoomTypeId);
    const draftKey = selection ? selectionKey(selection) : "";
    search = found;

    const created = createCheckoutRunner({
      apiBase,
      summaryHref,
      payments,
      dispatch,
      securityContainer: () => root.querySelector<HTMLElement>("[data-security-check]"),
      focus: (target) =>
        root.querySelector<HTMLElement>(`[data-checkout-focus="${target}"]`)?.focus(),
      returnToRoom: (index) => {
        const requests = found.requests.map((request, position) => ({
          ...request,
          failed: position === index,
        }));
        location.replace(`${chooseHref}?${searchParams({ ...found, requests, at: index })}`);
      },
    });
    runner = created;
    dispatch({
      type: "started",
      lang,
      paymentsEnabled: Boolean(payments),
      selection,
      draft: readDraft(draftKey),
    });

    const showPage = (event: PageTransitionEvent) => {
      if (event.persisted) paymentSubmittedHere = false;
      dispatch({ type: "pageShown", persisted: event.persisted, draft: readDraft(draftKey) });
    };
    const restoreNetwork = () => dispatch({ type: "networkRestored" });
    window.addEventListener("pageshow", showPage);
    window.addEventListener("online", restoreNetwork);
    return () => {
      window.removeEventListener("pageshow", showPage);
      window.removeEventListener("online", restoreNetwork);
      created.dispose();
      runner = null;
    };
  });

  const stayRooms = $derived(
    (search?.requests ?? []).flatMap((request) =>
      request.room && rooms[request.room] ? [rooms[request.room]!] : [],
    ),
  );
  const room = $derived(stayRooms[0] ?? null);
  const ratesHref = $derived(search ? `${chooseHref}?${searchParams(search)}` : chooseHref);
  const choiceHref = $derived.by(() => {
    if (!search) return chooseHref;
    const [only, ...others] = search.requests;
    const back = others.length
      ? { ...search, at: 0 }
      : { ...occupancyOnly(search), featured: only?.room ?? null };
    return `${chooseHref}?${searchParams(back)}`;
  });
  const { view, payment } = $derived(checkout);
  const confirmedReservation = $derived(
    payment?.state === "confirmed" ? payment.reservation : null,
  );
  const whatsappLink = $derived.by(() => {
    if (!view || !room) return whatsappHref;
    const stay = stayLabels(view, say, lang);
    const facts = {
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      plan: stay.plan,
      total: stay.money(view.quote.totalCents),
    };
    return getWhatsAppLink(
      stay.several
        ? say("reservation.review.whatsapp.messageRooms", {
            ...facts,
            rooms: stayRooms
              .map(
                (item, index) =>
                  `${say("landing.roomNumber", { n: index + 1 })}: ${item.name} · ${stay.rooms[index] ?? ""}`,
              )
              .join("\n"),
          })
        : say("reservation.review.whatsapp.message", {
            ...facts,
            room: room.name,
            guests: stay.guests,
          }),
    );
  });
  const retryAccess = () => dispatch({ type: "accessRetryRequested" });
  const loading = $derived(reviewLoading(checkout));
</script>

<div bind:this={root}>
  {#if payment && confirmedReservation && view && room}
    <Confirmation
      {view}
      rooms={stayRooms}
      reservation={confirmedReservation}
      currency={payment.currency}
      access={checkout.access}
      {summaryHref}
      onAccessRetry={retryAccess}
      animateCheckmark={paymentSubmittedHere}
    />
  {:else}
    <BookingSteps {text} current="review" hrefs={{ room: choiceHref, rate: ratesHref }} />
    <h1 class="mt-6 text-2xl font-semibold text-pretty text-stone-900 md:text-3xl">
      {say("reservation.review.title")}
    </h1>
    <p class="mt-2 max-w-xl leading-relaxed text-stone-600">
      {say(payments ? "reservation.review.lead" : "reservation.review.unavailableLead")}
    </p>
    <p
      class={[
        "mt-6 text-stone-700 empty:hidden",
        (!checkout.status.visible || loading) && "sr-only",
      ]}
      role="status"
      data-status
    >
      {checkout.status.key ? say(checkout.status.key) : ""}
    </p>
    {#if loading}
      <ReviewLoading payments={Boolean(payments)} />
    {/if}
    <ProblemPanel
      problem={checkout.problem}
      roomName={room?.name ?? ""}
      onRetry={() => dispatch({ type: "loadRequested" })}
    />
    <div
      class="mt-4 grid items-start gap-4 md:mt-6 md:gap-6 [overflow-wrap:anywhere] lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12"
      data-review
      hidden={!checkout.reviewShown}
    >
      <ReviewSummary {view} rooms={stayRooms} />
      <div
        class="min-w-0 border border-stone-200 bg-white lg:col-start-1 lg:row-start-1"
        data-workflow
      >
        {#if !payments}
          <WhatsAppFallback href={whatsappLink} hidden={!whatsappVisible(checkout)} />
        {/if}
        <form
          class="divide-y divide-stone-200"
          novalidate
          aria-labelledby="review-contact review-payment"
          data-contact-form
          hidden={!formVisible(checkout)}
          onsubmit={(event) => {
            event.preventDefault();
            dispatch({ type: "payRequested" });
          }}
        >
          <ContactFields
            contact={checkout.contact}
            errors={checkout.fieldErrors}
            onEdit={(field, value) => dispatch({ type: "contactEdited", field, value })}
            onEditPhone={(phone) => dispatch({ type: "phoneEdited", phone })}
          />
          <PaymentSection
            state={checkout}
            onAgree={(agreed) => dispatch({ type: "agreeToggled", agreed })}
          />
        </form>
        <Outcome
          state={checkout}
          onRetry={() => dispatch({ type: "payAgainRequested" })}
          onBank={() => dispatch({ type: "bankRequested" })}
          onCheck={() => dispatch({ type: "statusCheckRequested" })}
          onCopy={() => dispatch({ type: "accessCopyRequested" })}
          onAccessRetry={retryAccess}
        />
      </div>
    </div>
    <div
      id="reservation-help"
      class="mt-6 scroll-mt-24 border-t border-stone-300 pt-4 text-sm text-stone-700"
    >
      <p>{say("reservation.review.alternativeBooking")}</p>
      <div class="flex flex-wrap gap-x-6">
        <a href={`tel:${phoneNumber}`} class={quietLink} data-reservation-call>
          {say("reservation.review.call")}
        </a>
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          class={quietLink}
          data-reservation-help
        >
          {say("reservation.review.bookViaWhatsapp")}
        </a>
      </div>
    </div>
    {#if import.meta.env.DEV && previewHref}
      <a
        href={previewHref}
        class="font-source-sans-3 fixed bottom-4 left-4 z-90 inline-flex min-h-11 items-center bg-stone-900 px-4 text-sm font-medium text-white shadow-lg hover:bg-stone-700"
      >
        {`Dev · ${lang === "en" ? "Online payments" : "Pagos en línea"}: ${payments ? "ON" : "OFF"} ⇄`}
      </a>
    {/if}
  {/if}
</div>
