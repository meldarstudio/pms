<script lang="ts">
  import { Effect } from "effect";
  import { onMount, tick, untrack } from "svelte";
  import StaySearchForm from "@/components/stay-search/StaySearchForm.svelte";
  import { fill, formatList } from "@/lib/reservation/format";
  import { startIsland, type Latest } from "@/lib/island";
  import { PmsClient } from "@/lib/pms-client";
  import {
    fetchOffers,
    type OfferSearchResult,
    type SearchOutcome,
  } from "@/lib/reservation/offers";
  import {
    ratesOpen,
    readSearch,
    searchParams,
    type RatePlanCode,
    type StaySearch,
  } from "@/lib/reservation/search";
  import {
    chooseRoom,
    continueFromRoom,
    editParty,
    roomChoice,
    settleRooms,
    type OffersFor,
    type RoomChoice,
  } from "@/lib/reservation/stay-draft";
  import { resumeSearch, storeSearch } from "@/lib/reservation/stay-search-storage";
  import type { RoomId } from "@/lib/rooms";
  import RoomOffers from "./RoomOffers.svelte";
  import { belowHeader, primary, type Phase, type RoomsBookingProps } from "./room-view";
  import type { RoomsBookingKey } from "./text";

  let {
    lang,
    apiBase,
    reviewHref,
    rooms,
    details,
    text,
    searchCopy,
    action,
    initialStay = null,
    settled = null,
    referenceRates,
    referenceAmounts,
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
  type PendingFocus = { kind: "rates" } | { kind: "step" } | null;

  function phaseFrom(search: StaySearch, outcome: SearchOutcome): Phase {
    if (outcome.kind === "found") return { kind: "found", search, result: outcome.result };
    if (outcome.kind === "invalid") {
      return {
        kind: "problem",
        title: "reservation.choose.invalid.title",
        body: backendProblems[outcome.error] ?? "reservation.problem.invalidSearch",
        retry: false,
      };
    }
    return {
      kind: "problem",
      title: "reservation.choose.unavailable.title",
      body: "reservation.choose.unavailable.body",
      retry: true,
    };
  }

  let address = $state.raw<StaySearch | null>(null);
  let phase = $state.raw<Phase>({ kind: "idle" });
  let stayForm:
    | { replaceStay: (stay: StaySearch) => void; keepDraft: (stay: StaySearch) => void }
    | undefined;
  let root: HTMLDivElement;
  let loaded: { search: StaySearch; result: OfferSearchResult | null } | null = null;
  let offerSearch: Latest<PmsClient> | null = null;
  let pendingFocus: PendingFocus = null;
  let pendingPosition = false;
  let problemPanel = $state<HTMLDivElement>();
  let problemTitle = $state<HTMLHeadingElement>();
  let noticePanel = $state<HTMLElement>();
  const roomIds = $derived(rooms.map((room) => room.id));

  const result = $derived(
    phase.kind === "found" ? phase.result : phase.kind === "loading" ? phase.previous : undefined,
  );
  const offersIn = (found: OfferSearchResult | undefined): OffersFor => {
    const byType = new Map(found?.roomTypes.map((type) => [type.id, type]));
    return (id) => {
      const room = rooms.find((candidate) => candidate.id === id);
      return room?.pmsRoomTypeId ? byType.get(room.pmsRoomTypeId) : undefined;
    };
  };
  const offersFor = $derived(offersIn(result));
  const choiceOf = (id: RoomId): RoomChoice =>
    address ? roomChoice(address, address.at, id, offersFor) : "offline";
  const preferred = $derived(address?.featured ?? null);
  const ordered = $derived(
    preferred
      ? [...rooms].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred))
      : rooms,
  );
  const say = (key: RoomsBookingKey, values: Record<string, string | number> = {}) =>
    fill(text[key], values);
  const nameOf = (id: RoomId | null) => rooms.find((room) => room.id === id)?.name ?? "";
  const notice = $derived.by(() => {
    if (phase.kind !== "found" || !address || ratesOpen(address)) return null;
    const current = address.requests[address.at];
    if (current?.failed && current.room)
      return {
        title: say("reservation.room.failed", {
          room: nameOf(current.room),
          n: address.at + 1,
        }),
        reasons: [],
      };
    if (!rooms.some((room) => choiceOf(room.id) === "choosable")) {
      return {
        title: say("reservation.choose.noOffers.title"),
        reasons: unavailableStates.flatMap((state) => {
          const names = rooms.filter((room) => choiceOf(room.id) === state).map((room) => room.name);
          return names.length
            ? [say(`reservation.choose.reason.${state}`, { rooms: formatList(names, lang) })]
            : [];
        }),
      };
    }
    const room = rooms.find((candidate) => candidate.id === preferred);
    if (!room || choiceOf(room.id) === "choosable") return null;
    return {
      title: say("reservation.room.preferredUnavailable", { room: room.name }),
      reasons:
        choiceOf(room.id) === "too_many_guests"
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

  const sameStay = (a: StaySearch, b: StaySearch) =>
    a.checkIn === b.checkIn && a.checkOut === b.checkOut;
  const sameAddress = (a: StaySearch, b: StaySearch) =>
    searchParams(a).toString() === searchParams(b).toString();

  function focusAfter(previous: StaySearch | null, next: StaySearch): PendingFocus {
    const before = previous !== null && ratesOpen(previous);
    const after = ratesOpen(next);
    if (after && !before) return { kind: "rates" };
    if (!after && (before || (previous && previous.at !== next.at))) return { kind: "step" };
    return null;
  }

  const settle = (next: StaySearch, found: OfferSearchResult) =>
    settleRooms(next, offersIn(found));

  function commit(next: StaySearch, write: HistoryWrite) {
    address = next;
    stayForm?.keepDraft(next);
    const url = `?${searchParams(next).toString()}`;
    if (write === "push") history.pushState(null, "", url);
    else if (write === "replace") history.replaceState(history.state, "", url);
  }

  function load(next: StaySearch) {
    loaded = { search: next, result: null };
    phase = { kind: "loading", search: next, previous: result };
    offerSearch?.replace(
      Effect.flatMap(fetchOffers(next), (outcome) => Effect.sync(() => receive(next, outcome))),
    );
  }

  function receive(next: StaySearch, outcome: SearchOutcome) {
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
      offerSearch?.cancel();
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
    load(next);
  }

  function search(next: StaySearch) {
    pendingPosition = true;
    show(next, "replace", true);
  }

  onMount(() => {
    const island = startIsland(PmsClient.layer(apiBase));
    offerSearch = island.latest();
    const next = resumeSearch(new URLSearchParams(location.search), roomIds);
    if (settled && initialStay && sameStay(initialStay, next)) {
      address = next;
      phase = phaseFrom(next, settled);
      stayForm?.keepDraft(next);
    } else search(next);
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
      offerSearch = null;
      island.dispose();
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
    const step = document.getElementById("room-step-title");
    const chosen = address?.requests[address.at]?.room;
    const chosenButton = chosen ? document.getElementById(`room-rates-${chosen}`) : null;
    if (focus?.kind === "step" && step) {
      document.getElementById("offer-steps")?.scrollIntoView({ block: "start" });
      step.focus({ preventScroll: true });
    } else if (focus?.kind === "step" && chosenButton) chosenButton.focus();
    else if (position) {
      if (noticePanel) scrollToShow(noticePanel);
      else {
        const first = ordered.find((room) => choiceOf(room.id) === "choosable");
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
    if (phase.kind !== "found" || !address) return;
    const next = chooseRoom(address, id, offersFor);
    if (next !== address) show(next, "push", false);
  }

  function continueRoom() {
    if (phase.kind !== "found" || !address) return;
    const next = continueFromRoom(address, offersFor);
    if (next !== address) show(next, "push", false);
  }

  function previousRoom() {
    if (address && address.at > 0) show({ ...address, at: address.at - 1 }, "push", false);
  }

  function changeRoom() {
    if (address) show({ ...address, at: 0 }, "push", false);
  }

  function choosePlan(plan: RatePlanCode) {
    if (address && ratesOpen(address)) commit({ ...address, plan }, "replace");
  }
</script>

<div bind:this={root} class="bg-stone-100">
  <div class="mx-auto max-w-7xl px-4 pb-2 md:px-8">
    <div id="availability" class="scroll-offset">
      <StaySearchForm
        bind:this={stayForm}
        {lang}
        {roomIds}
        {action}
        guide={text["rooms.searchGuide"]}
        initial={initialStay ?? undefined}
        copy={searchCopy}
        onSearch={(next) => search(address ? editParty(address, next) : next)}
      />
    </div>
    <p
      data-search-status
      class={phase.kind === "idle" ? "mt-4 text-stone-700" : "sr-only"}
      role="status"
    >
      {status}
    </p>
    {#if referenceRates.unavailable}
      <p class="mt-4 text-stone-700">{text["rooms.referenceRateUnavailable"]}</p>
    {/if}
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
        aria-labelledby="rooms-choice-notice"
      >
        <p id="rooms-choice-notice" class="font-semibold">{notice.title}</p>
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
  rooms={ordered}
  {details}
  {phase}
  draft={address}
  {offersFor}
  {referenceAmounts}
  onChooseDates={chooseDates}
  onOpenRoom={openRoom}
  onContinue={continueRoom}
  onPrevious={previousRoom}
  onChangeRoom={changeRoom}
  onPlan={choosePlan}
/>
