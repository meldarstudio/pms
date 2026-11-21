<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import StaySearchForm from "@/components/stay-search/StaySearchForm.svelte";
  import { fill, formatList } from "@/lib/reservation/format";
  import { fetchOffers, lowestOffer, type OfferSearchResult } from "@/lib/reservation/offers";
  import {
    readSearch,
    searchParams,
    type RatePlanCode,
    type StaySearch,
  } from "@/lib/reservation/search";
  import { resumeSearch, storeSearch } from "@/lib/reservation/stay-search-storage";
  import type { RoomId } from "@/lib/rooms";
  import RoomOffers from "./RoomOffers.svelte";
  import {
    belowHeader,
    primary,
    type Phase,
    type RoomView,
    type RoomsBookingProps,
  } from "./room-view";
  import type { RoomsBookingKey } from "./text";

  let {
    lang,
    apiBase,
    reviewHref,
    conditionsHref,
    rooms,
    details,
    text,
    searchCopy,
  }: RoomsBookingProps = $props();

  const backendProblems: Record<string, RoomsBookingKey> = {
    "online check-in must not be before today": "reservation.problem.checkInPast",
    "online same-day arrival has closed": "reservation.problem.sameDayClosed",
    "stay must be at least one night": "reservation.problem.checkOutBeforeCheckIn",
    "stay cannot be longer than 60 nights": "reservation.problem.tooManyNights",
    "invalid date": "reservation.problem.invalidDate",
  };
  const unavailableStates = ["sold_out", "too_many_guests", "offline"] as const;
  type HistoryWrite = "push" | "replace" | "none";
  type PendingFocus = { kind: "rates" } | { kind: "room"; id: RoomId } | null;

  let address = $state.raw<StaySearch | null>(null);
  let phase = $state.raw<Phase>({ kind: "idle" });
  let stayForm: { replaceStay: (stay: StaySearch) => void } | undefined;
  let root: HTMLDivElement;
  let loaded: { search: StaySearch; result: OfferSearchResult | null } | null = null;
  let request: AbortController | null = null;
  let pendingFocus: PendingFocus = null;
  let pendingPosition = false;
  let problemPanel = $state<HTMLDivElement>();
  let problemTitle = $state<HTMLHeadingElement>();
  let noticePanel = $state<HTMLElement>();

  const result = $derived(
    phase.kind === "found" ? phase.result : phase.kind === "loading" ? phase.previous : undefined,
  );
  const offersByType = $derived(new Map(result?.roomTypes.map((type) => [type.id, type])));
  const offersFor = (room: RoomView) =>
    room.pmsRoomTypeId ? offersByType.get(room.pmsRoomTypeId) : undefined;
  const stateOf = (room: RoomView) => offersFor(room)?.availability ?? "offline";
  const preferred = $derived(address?.room ?? null);
  const ordered = $derived(
    preferred
      ? [...rooms].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred))
      : rooms,
  );
  const visibleRooms = $derived(
    phase.kind === "found"
      ? ordered.filter((room) => stateOf(room) !== "too_many_guests")
      : ordered,
  );
  const say = (key: RoomsBookingKey, values: Record<string, string | number> = {}) =>
    fill(text[key], values);
  const notice = $derived.by(() => {
    if (phase.kind !== "found") return null;
    if (!rooms.some((room) => stateOf(room) === "available")) {
      return {
        title: say("reservation.choose.noOffers.title"),
        reasons: unavailableStates.flatMap((state) => {
          const names = rooms.filter((room) => stateOf(room) === state).map((room) => room.name);
          return names.length
            ? [say(`reservation.choose.reason.${state}`, { rooms: formatList(names, lang) })]
            : [];
        }),
      };
    }
    const room = rooms.find((candidate) => candidate.id === preferred);
    if (!room || stateOf(room) === "available") return null;
    return {
      title: say("reservation.room.preferredUnavailable", { room: room.name }),
      reasons:
        stateOf(room) === "too_many_guests"
          ? [say("reservation.choose.reason.too_many_guests", { rooms: room.name })]
          : [],
    };
  });
  const status = $derived(
    phase.kind === "idle"
      ? say("reservation.choose.missing")
      : phase.kind === "loading"
        ? say("reservation.choose.loading")
        : phase.kind === "found"
          ? say("reservation.choose.loaded")
          : "",
  );

  const openedRoom = (search: StaySearch | null) => (search?.plan ? search.room : null);
  const sameStay = (a: StaySearch, b: StaySearch) =>
    a.checkIn === b.checkIn &&
    a.checkOut === b.checkOut &&
    a.adults === b.adults &&
    a.children === b.children;
  const sameAddress = (a: StaySearch, b: StaySearch) =>
    sameStay(a, b) && a.room === b.room && a.plan === b.plan;

  function focusAfter(previous: StaySearch | null, next: StaySearch): PendingFocus {
    const before = openedRoom(previous);
    const after = openedRoom(next);
    if (after && after !== before) return { kind: "rates" };
    if (!after && before) return { kind: "room", id: before };
    return null;
  }

  function settle(next: StaySearch, found: OfferSearchResult): StaySearch {
    if (!next.room || !next.plan) return next;
    const room = rooms.find((candidate) => candidate.id === next.room);
    const offers = found.roomTypes.find((type) => type.id === room?.pmsRoomTypeId);
    const lowest = offers?.availability === "available" ? lowestOffer(offers) : undefined;
    if (!lowest) return { ...next, plan: null };
    return offers?.offers.some((offer) => offer.ratePlan === next.plan)
      ? next
      : { ...next, plan: lowest.ratePlan };
  }

  function commit(next: StaySearch, write: HistoryWrite) {
    address = next;
    const url = `?${searchParams(next).toString()}`;
    if (write === "push") history.pushState(null, "", url);
    else if (write === "replace") history.replaceState(history.state, "", url);
  }

  async function load(next: StaySearch) {
    request?.abort();
    const controller = (request = new AbortController());
    loaded = { search: next, result: null };
    phase = { kind: "loading", search: next, previous: result };
    const outcome = await fetchOffers(apiBase, next, controller.signal).catch(() => null);
    if (!outcome || controller.signal.aborted) return;
    if (outcome.kind === "found") {
      loaded = { search: next, result: outcome.result };
      const shown = address ?? next;
      const settled = settle(shown, outcome.result);
      if (!sameAddress(settled, shown)) commit(settled, "replace");
      phase = { kind: "found", search: next, result: outcome.result };
      return;
    }
    loaded = null;
    if (outcome.kind === "invalid") {
      phase = {
        kind: "problem",
        title: "reservation.choose.invalid.title",
        body: backendProblems[outcome.error] ?? "reservation.problem.invalidSearch",
        retry: false,
      };
    } else {
      phase = {
        kind: "problem",
        title: `reservation.choose.${outcome.kind}.title`,
        body: `reservation.choose.${outcome.kind}.body`,
        retry: true,
      };
    }
  }

  function show(next: StaySearch, write: HistoryWrite, fresh: boolean) {
    if (!next.checkIn || !next.checkOut) {
      request?.abort();
      loaded = null;
      pendingFocus = null;
      pendingPosition = false;
      commit({ ...next, plan: null }, "none");
      phase = { kind: "idle" };
      return;
    }
    storeSearch(next);
    pendingFocus = focusAfter(address, next);
    if (!fresh && loaded && sameStay(loaded.search, next)) {
      const settled = loaded.result ? settle(next, loaded.result) : next;
      commit(settled, write === "none" && !sameAddress(settled, next) ? "replace" : write);
      return;
    }
    commit(next, write);
    void load(next);
  }

  function search(next: StaySearch) {
    pendingPosition = true;
    show(next, "replace", true);
  }

  onMount(() => {
    const roomIds = rooms.map((room) => room.id);
    search(resumeSearch(new URLSearchParams(location.search), roomIds));
    void tick().then(() => {
      const booking = root.closest("[data-rooms-booking]");
      booking?.removeAttribute("data-resume-rates");
      booking?.removeAttribute("data-searched");
    });
    const onPopState = () => {
      const next = readSearch(new URLSearchParams(location.search), roomIds);
      if (address && sameAddress(address, next)) return;
      if (address && !sameStay(address, next)) stayForm?.replaceStay(next);
      show(next, "none", false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      request?.abort();
    };
  });

  function scrollToShow(start: Element | null | undefined, end?: Element | null) {
    if (!start) return;
    const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    if (!end) {
      start.scrollIntoView({ block: "start", behavior });
      return;
    }
    const top =
      start.getBoundingClientRect().top - parseFloat(getComputedStyle(start).scrollMarginTop);
    const bottom = end.getBoundingClientRect().bottom - innerHeight + 24;
    scrollTo({ top: scrollY + Math.max(top, bottom), behavior });
  }

  function positionResults() {
    const focus = pendingFocus;
    const position = pendingPosition;
    pendingFocus = null;
    pendingPosition = false;
    if (phase.kind === "problem") {
      if (position) scrollToShow(problemPanel);
      problemTitle?.focus({ preventScroll: position });
      return;
    }
    const heading = document.getElementById("room-rates-title");
    if (focus?.kind === "rates" && heading) {
      document.getElementById("offer-steps")?.scrollIntoView({ block: "start" });
      heading.focus({ preventScroll: true });
      return;
    }
    const button = focus?.kind === "room" && document.getElementById(`room-rates-${focus.id}`);
    if (button) button.focus();
    else if (position) {
      if (noticePanel) scrollToShow(noticePanel);
      else {
        const first = ordered.find((room) => stateOf(room) === "available");
        scrollToShow(
          document.getElementById("offer-steps"),
          first ? document.getElementById(`room-rates-${first.id}`) : null,
        );
      }
    }
  }

  $effect(() => {
    if (address && (phase.kind === "found" || phase.kind === "problem")) untrack(positionResults);
  });

  function chooseDates() {
    const arrival = document.getElementById("stay-check-in");
    arrival?.scrollIntoView({ block: "center" });
    arrival?.click();
  }

  function openRoom(id: RoomId) {
    const room = rooms.find((item) => item.id === id);
    const offer = room && stateOf(room) === "available" ? lowestOffer(offersFor(room)) : undefined;
    if (phase.kind !== "found" || !address || !offer) return;
    show({ ...address, room: id, plan: offer.ratePlan }, "push", false);
  }

  function changeRoom() {
    if (address) show({ ...address, plan: null }, "push", false);
  }

  function choosePlan(plan: RatePlanCode) {
    if (address?.plan) commit({ ...address, plan }, "replace");
  }
</script>

<div bind:this={root} class="bg-stone-100">
  <div class="mx-auto max-w-7xl px-4 pb-2 md:px-8">
    <div id="availability" class="scroll-offset">
      <StaySearchForm
        bind:this={stayForm}
        {lang}
        copy={searchCopy}
        onSearch={(next) => search({ ...next, room: preferred, plan: address?.plan ?? null })}
      />
    </div>
    <p
      data-search-status
      class={phase.kind === "idle" ? "mt-4 text-stone-700" : "sr-only"}
      role="status"
    >
      {status}
    </p>
    {#if phase.kind === "problem"}
      <div
        bind:this={problemPanel}
        class={`mt-6 ${belowHeader} border border-stone-300 bg-white p-5 md:p-8`}
      >
        <h2 bind:this={problemTitle} tabindex="-1" class="text-xl font-semibold text-stone-900">
          {say(phase.title)}
        </h2>
        <p class="mt-3 leading-relaxed text-stone-700">{say(phase.body)}</p>
        {#if phase.retry && address}
          <button
            type="button"
            class={`mt-6 ${primary}`}
            onclick={() => address && search(address)}
          >
            {say("reservation.choose.retry")}
          </button>
        {/if}
      </div>
    {/if}
    {#if notice}
      <section
        bind:this={noticePanel}
        class={`mt-6 ${belowHeader} border-l-4 border-amber-600 bg-white p-4 text-stone-800`}
        aria-labelledby="rooms-notice"
      >
        <p id="rooms-notice" class="font-semibold">{notice.title}</p>
        {#if notice.reasons.length}
          <ul class="mt-2 list-disc pl-5">
            {#each notice.reasons as reason (reason)}<li>{reason}</li>{/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
</div>
<RoomOffers
  {lang}
  {text}
  {searchCopy}
  {reviewHref}
  {conditionsHref}
  rooms={visibleRooms}
  {details}
  {phase}
  choice={address}
  {offersByType}
  onChooseDates={chooseDates}
  onOpenRoom={openRoom}
  onChangeRoom={changeRoom}
  onPlan={choosePlan}
/>
