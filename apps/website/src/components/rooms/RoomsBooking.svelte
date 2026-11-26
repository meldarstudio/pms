<script lang="ts">
  import { Effect } from "effect";
  import { onMount, untrack } from "svelte";
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
    hasStayDates,
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
  import { belowHeader, primary, type Phase, type RoomsBookingProps, type RoomView } from "./room-view";
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
    initial,
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

  function offersIn(rooms: RoomView[], found?: OfferSearchResult): OffersFor {
    const byType = new Map(found?.roomTypes.map((type) => [type.id, type]));
    return (id) => {
      const room = rooms.find((candidate) => candidate.id === id);
      return room?.pmsRoomTypeId ? byType.get(room.pmsRoomTypeId) : undefined;
    };
  }

  function settle(search: StaySearch, outcome: SearchOutcome | null, rooms: RoomView[]): {
    search: StaySearch;
    phase: Phase;
  } {
    if (!outcome) return { search, phase: { kind: "idle" } };
    if (outcome.kind === "found")
      return {
        search: settleRooms(search, offersIn(rooms, outcome.result)),
        phase: { kind: "found", search, result: outcome.result },
      };
    if (outcome.kind === "invalid") {
      return {
        search,
        phase: {
          kind: "problem",
          title: "reservation.choose.invalid.title",
          body: backendProblems[outcome.error] ?? "reservation.problem.invalidSearch",
          retry: false,
        },
      };
    }
    return {
      search,
      phase: {
        kind: "problem",
        title: `reservation.choose.${outcome.kind}.title`,
        body: `reservation.choose.${outcome.kind}.body`,
        retry: true,
      },
    };
  }

  const boot = untrack(() => settle(initial.search, initial.outcome, rooms));
  let address = $state.raw(boot.search);
  let phase = $state.raw(boot.phase);
  let stayForm:
    | { replaceStay: (stay: StaySearch) => void; keepDraft: (stay: StaySearch) => void }
    | undefined;
  let loaded: { search: StaySearch; result: OfferSearchResult | null } | null =
    boot.phase.kind === "found" ? boot.phase : null;
  let offerSearch: Latest<PmsClient> | null = null;
  let pendingFocus: PendingFocus = null;
  let pendingPosition = false;
  let problemPanel = $state<HTMLDivElement>();
  let problemTitle = $state<HTMLHeadingElement>();
  let noticePanel = $state<HTMLElement>();
  const roomIds = $derived(rooms.map((room) => room.id));

  const offersFor = $derived(offersIn(rooms, phase.kind === "found" ? phase.result : undefined));
  const choiceOf = (id: RoomId): RoomChoice =>
    roomChoice(address, address.at, id, offersFor);
  const preferred = $derived(address.featured);
  const ordered = $derived(
    preferred
      ? [...rooms].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred))
      : rooms,
  );
  const say = (key: RoomsBookingKey, values: Record<string, string | number> = {}) =>
    fill(text[key], values);
  const nameOf = (id: RoomId | null) => rooms.find((room) => room.id === id)?.name ?? "";
  const notice = $derived.by(() => {
    if (phase.kind !== "found" || ratesOpen(address)) return null;
    const current = address.requests[address.at];
    if (current?.failed && current.room)
      return {
        title: say("reservation.room.failed", {
          room: nameOf(current.room),
          n: address.at + 1,
        }),
        reasons: [],
      };
    const unmatched = address.requests.findIndex(
      (_, index) => !rooms.some((room) => roomChoice(address, index, room.id, offersFor) === "choosable"),
    );
    if (unmatched !== -1) {
      return {
        title: say("reservation.choose.noOffers.title"),
        reasons: unavailableStates.flatMap((state) => {
          const names = rooms
            .filter((room) => roomChoice(address, unmatched, room.id, offersFor) === state)
            .map((room) => room.name);
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

  function focusAfter(previous: StaySearch, next: StaySearch): PendingFocus {
    if (next.requests.length === 1) return null;
    const before = previous.requests.length > 1 && ratesOpen(previous);
    const after = ratesOpen(next);
    if (after && !before) return { kind: "rates" };
    if (!after && (before || previous.at !== next.at)) return { kind: "step" };
    return null;
  }

  function commit(next: StaySearch, write: HistoryWrite) {
    address = next;
    stayForm?.keepDraft(next);
    const url = `?${searchParams(next).toString()}`;
    if (write === "push") history.pushState(null, "", url);
    else if (write === "replace") history.replaceState(history.state, "", url);
  }

  function load(next: StaySearch) {
    loaded = { search: next, result: null };
    phase = { kind: "loading", search: next };
    offerSearch?.replace(
      Effect.flatMap(fetchOffers(next), (outcome) => Effect.sync(() => receive(next, outcome))),
    );
  }

  function receive(next: StaySearch, outcome: SearchOutcome) {
    if (!sameStay(address, next)) return;
    const settled = settle(address, outcome, rooms);
    loaded = settled.phase.kind === "found" ? settled.phase : null;
    if (!sameAddress(settled.search, address)) commit(settled.search, "replace");
    phase = settled.phase;
  }

  function show(next: StaySearch, write: HistoryWrite, fresh: boolean, explicit = false) {
    if (!next.checkIn || !next.checkOut) {
      offerSearch?.cancel();
      loaded = null;
      pendingFocus = null;
      pendingPosition = false;
      commit(next, "none");
      phase = settle(next, explicit ? { kind: "invalid", error: "" } : null, rooms).phase;
      return;
    }
    storeSearch(next);
    pendingFocus = focusAfter(address, next);
    if (!fresh && loaded && sameStay(loaded.search, next)) {
      const settled = loaded.result ? settleRooms(next, offersIn(rooms, loaded.result)) : next;
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
    if (initial.outcome) {
      if (phase.kind === "found") {
        storeSearch(address);
        if (!sameAddress(address, initial.search)) commit(address, "replace");
      }
    } else {
      const next = resumeSearch(new URLSearchParams(location.search), roomIds);
      if (next.checkIn && next.checkOut) search(next);
      else commit(next, "none");
    }
    const onPopState = () => {
      const params = new URLSearchParams(location.search);
      const next = readSearch(params, roomIds);
      const explicit = hasStayDates(params);
      if (explicit && next.checkIn && next.checkOut && sameAddress(address, next)) return;
      stayForm?.replaceStay(next);
      show(next, "none", false, explicit);
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

  function positionResults(current: StaySearch) {
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
    const chosen = current.requests[current.at]?.room;
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
    const current = address;
    if (phase.kind === "found" || phase.kind === "problem") untrack(() => positionResults(current));
  });

  function chooseDates() {
    const arrival = document.getElementById("stay-check-in");
    arrival?.scrollIntoView({ block: "center" });
    arrival?.click();
  }

  function openRoom(id: RoomId) {
    if (phase.kind !== "found") return;
    const next = chooseRoom(address, id, offersFor);
    if (next !== address) show(next, "push", false);
  }

  function continueRoom() {
    if (phase.kind !== "found") return;
    const next = continueFromRoom(address, offersFor);
    if (next !== address) show(next, "push", false);
  }

  function previousRoom() {
    if (address.at > 0) show({ ...address, at: address.at - 1 }, "push", false);
  }

  function changeRoom() {
    show({ ...address, at: 0 }, "push", false);
  }

  function choosePlan(plan: RatePlanCode) {
    if (ratesOpen(address)) commit({ ...address, plan }, "replace");
  }
</script>

<div class="bg-stone-100">
  <div class="mx-auto max-w-7xl px-4 pb-2 md:px-8">
    <div id="availability" class="scroll-offset">
      <StaySearchForm
        bind:this={stayForm}
        {lang}
        {roomIds}
        {action}
        nativeFallback
        initial={boot.search}
        copy={searchCopy}
        onSearch={(next) => search(editParty(address, next))}
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
        {#if phase.retry}
          <button
            type="button"
            class={`mt-6 ${primary}`}
            onclick={() => search(address)}
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
  onChooseDates={chooseDates}
  onOpenRoom={openRoom}
  onContinue={continueRoom}
  onPrevious={previousRoom}
  onChangeRoom={changeRoom}
  onPlan={choosePlan}
/>
