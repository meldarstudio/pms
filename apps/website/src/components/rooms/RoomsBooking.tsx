import { useEffect, useRef, useState } from "react";
import StaySearchForm, { type StaySearchCopy } from "@/components/StaySearchForm";
import type { Lang } from "@/i18n/utils";
import { resumeSearch, storeSearch } from "@/lib/reservation/draft";
import { fill, formatList } from "@/lib/reservation/format";
import {
  fetchOffers,
  lowestOffer,
  type OfferSearchResult,
  type RoomTypeOffers,
} from "@/lib/reservation/offers";
import {
  readSearch,
  searchParams,
  type RatePlanCode,
  type StaySearch,
} from "@/lib/reservation/search";
import type { RoomId } from "@/lib/rooms";
import type { StayDetails } from "./RoomCard";
import type { RoomPhotoView } from "./RoomGallery";
import { belowHeader, RoomOffers } from "./RoomOffers";
import type { RoomsBookingKey, RoomsBookingText } from "./text";

export type RoomView = {
  id: RoomId;
  name: string;
  beds: string;
  area: string;
  sleeps: number;
  pmsRoomTypeId: string | null;
  photos: RoomPhotoView[];
};

type Props = {
  lang: Lang;
  apiBase: string;
  reviewHref: string;
  conditionsHref: string;
  rooms: RoomView[];
  details: StayDetails;
  text: RoomsBookingText;
  searchCopy: StaySearchCopy;
};

export type Phase =
  | { kind: "idle" }
  | { kind: "loading"; search: StaySearch; previous?: OfferSearchResult }
  | { kind: "problem"; title: RoomsBookingKey; body: RoomsBookingKey; retry: boolean }
  | { kind: "found"; search: StaySearch; result: OfferSearchResult };

export type RoomState = "available" | "sold_out" | "too_many_guests" | "offline";

/** Backend validation messages (English, asserted by public-offers.test.ts) to guest copy. */
const backendProblems: Record<string, RoomsBookingKey> = {
  "online check-in must not be before today": "reservation.problem.checkInPast",
  "online same-day arrival has closed": "reservation.problem.sameDayClosed",
  "stay must be at least one night": "reservation.problem.checkOutBeforeCheckIn",
  "stay cannot be longer than 60 nights": "reservation.problem.tooManyNights",
  "invalid date": "reservation.problem.invalidDate",
};

type HistoryWrite = "push" | "replace" | "none";

type PendingFocus = { kind: "rates" } | { kind: "room"; id: RoomId } | null;

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

const resultsBottomGapPx = 24;

function scrollToShow(start: Element | null, end?: Element | null) {
  if (!start) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior = reduce ? "instant" : "smooth";
  if (!end) {
    start.scrollIntoView({ block: "start", behavior });
    return;
  }
  const top =
    start.getBoundingClientRect().top - parseFloat(getComputedStyle(start).scrollMarginTop);
  const bottom = end.getBoundingClientRect().bottom - window.innerHeight + resultsBottomGapPx;
  window.scrollTo({ top: window.scrollY + Math.max(top, bottom), behavior });
}

const unavailableStates = ["sold_out", "too_many_guests", "offline"] as const;

const primary =
  "font-source-sans-3 bg-accent-500 text-accent-950 hover:bg-accent-400 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 px-6 text-sm font-semibold tracking-widest uppercase";
const panel = "border border-stone-300 bg-white p-5 md:p-8";

/** Rooms page: the stay search, every room with its photos, and live rates for the search. */
export default function RoomsBooking({
  lang,
  apiBase,
  reviewHref,
  conditionsHref,
  rooms,
  details,
  text,
  searchCopy,
}: Props) {
  const [address, setAddress] = useState<StaySearch | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [searchReady, setSearchReady] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const current = useRef<StaySearch | null>(null);
  const loaded = useRef<{ search: StaySearch; result: OfferSearchResult | null } | null>(null);
  const request = useRef<AbortController | null>(null);
  const pendingFocus = useRef<PendingFocus>(null);
  const pendingPosition = useRef(false);
  const problemPanel = useRef<HTMLDivElement>(null);
  const problemTitle = useRef<HTMLHeadingElement>(null);
  const noticePanel = useRef<HTMLElement>(null);
  const say = (key: RoomsBookingKey, values: Record<string, string | number> = {}) =>
    fill(text[key], values);

  function settle(next: StaySearch, found: OfferSearchResult): StaySearch {
    if (!next.room || !next.plan) return next;
    const room = rooms.find((candidate) => candidate.id === next.room);
    const offers = found.roomTypes.find((type) => type.id === room?.pmsRoomTypeId);
    const lowest = offers?.availability === "available" ? lowestOffer(offers) : undefined;
    if (!lowest) return { ...next, plan: null };
    return offers!.offers.some((offer) => offer.ratePlan === next.plan)
      ? next
      : { ...next, plan: lowest.ratePlan };
  }

  function commit(next: StaySearch, write: HistoryWrite) {
    current.current = next;
    setAddress(next);
    const url = `?${searchParams(next).toString()}`;
    if (write === "push") history.pushState(null, "", url);
    else if (write === "replace") history.replaceState(history.state, "", url);
  }

  async function load(next: StaySearch) {
    request.current?.abort();
    const controller = (request.current = new AbortController());
    loaded.current = { search: next, result: null };
    setPhase((shown) => ({
      kind: "loading",
      search: next,
      previous:
        shown.kind === "found"
          ? shown.result
          : shown.kind === "loading"
            ? shown.previous
            : undefined,
    }));
    const outcome = await fetchOffers(apiBase, next, controller.signal).catch(() => null);
    if (!outcome || controller.signal.aborted) return;
    if (outcome.kind === "found") {
      loaded.current = { search: next, result: outcome.result };
      const shown = current.current ?? next;
      const settled = settle(shown, outcome.result);
      if (!sameAddress(settled, shown)) commit(settled, "replace");
      setPhase({ kind: "found", search: next, result: outcome.result });
      return;
    }
    loaded.current = null;
    if (outcome.kind === "invalid")
      setPhase({
        kind: "problem",
        title: "reservation.choose.invalid.title",
        body: backendProblems[outcome.error] ?? "reservation.problem.invalidSearch",
        retry: false,
      });
    else
      setPhase({
        kind: "problem",
        title: `reservation.choose.${outcome.kind}.title`,
        body: `reservation.choose.${outcome.kind}.body`,
        retry: true,
      });
  }

  function show(next: StaySearch, write: HistoryWrite, { fresh }: { fresh: boolean }) {
    if (!next.checkIn || !next.checkOut) {
      request.current?.abort();
      loaded.current = null;
      pendingFocus.current = null;
      pendingPosition.current = false;
      commit({ ...next, plan: null }, "none");
      setPhase({ kind: "idle" });
      return;
    }
    storeSearch(next);
    pendingFocus.current = focusAfter(current.current, next);
    const known = !fresh && loaded.current && sameStay(loaded.current.search, next);
    if (known && loaded.current!.result) {
      const settled = settle(next, loaded.current!.result);
      commit(settled, write === "none" && !sameAddress(settled, next) ? "replace" : write);
      return;
    }
    commit(next, write);
    if (!known) void load(next);
  }

  function search(next: StaySearch) {
    pendingPosition.current = true;
    show(next, "replace", { fresh: true });
  }

  useEffect(() => {
    const roomIds = rooms.map((room) => room.id);
    search(resumeSearch(new URLSearchParams(window.location.search), roomIds));
    setSearchReady(true);
    const onPopState = () => {
      const next = readSearch(new URLSearchParams(window.location.search), roomIds);
      if (current.current && sameAddress(current.current, next)) return;
      if (current.current && !sameStay(current.current, next)) setFormKey((key) => key + 1);
      show(next, "none", { fresh: false });
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (phase.kind === "idle" || phase.kind === "loading") return;
    const focus = pendingFocus.current;
    const position = pendingPosition.current;
    pendingFocus.current = null;
    pendingPosition.current = false;
    if (phase.kind === "problem") {
      if (position) scrollToShow(problemPanel.current);
      problemTitle.current?.focus({ preventScroll: position });
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
      if (noticePanel.current) scrollToShow(noticePanel.current);
      else {
        const firstAvailableRoom = ordered.find((room) => stateOf(room) === "available");
        const firstPriceButton = firstAvailableRoom
          ? document.getElementById(`room-rates-${firstAvailableRoom.id}`)
          : null;
        scrollToShow(document.getElementById("offer-steps"), firstPriceButton);
      }
    }
  }, [phase, address]);

  const result =
    phase.kind === "found" ? phase.result : phase.kind === "loading" ? phase.previous : undefined;
  const offersFor = (room: RoomView): RoomTypeOffers | undefined =>
    result?.roomTypes.find((type) => type.id === room.pmsRoomTypeId);
  const stateOf = (room: RoomView): RoomState => offersFor(room)?.availability ?? "offline";
  const preferred = address?.room ?? null;
  const ordered = preferred
    ? [...rooms].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred))
    : rooms;

  let notice: { title: string; reasons: string[] } | null = null;
  if (phase.kind === "found") {
    if (!rooms.some((room) => stateOf(room) === "available"))
      notice = {
        title: say("reservation.choose.noOffers.title"),
        reasons: unavailableStates.flatMap((state) => {
          const names = rooms.filter((room) => stateOf(room) === state).map((room) => room.name);
          return names.length
            ? [say(`reservation.choose.reason.${state}`, { rooms: formatList(names, lang) })]
            : [];
        }),
      };
    else {
      const room = rooms.find((candidate) => candidate.id === preferred);
      if (room && stateOf(room) !== "available")
        notice = {
          title: say("reservation.room.preferredUnavailable", { room: room.name }),
          reasons:
            stateOf(room) === "too_many_guests"
              ? [say("reservation.choose.reason.too_many_guests", { rooms: room.name })]
              : [],
        };
    }
  }

  const status =
    phase.kind === "idle"
      ? say("reservation.choose.missing")
      : phase.kind === "loading"
        ? say("reservation.choose.loading")
        : phase.kind === "found"
          ? say("reservation.choose.loaded")
          : "";

  const onSearch = (next: StaySearch) =>
    search({ ...next, room: preferred, plan: address?.plan ?? null });

  function openRoom(id: RoomId) {
    const room = rooms.find((item) => item.id === id);
    const offer = room && stateOf(room) === "available" ? lowestOffer(offersFor(room)) : undefined;
    if (phase.kind !== "found" || !address || !offer) return;
    show({ ...address, room: id, plan: offer.ratePlan }, "push", { fresh: false });
  }

  function changeRoom() {
    if (address) show({ ...address, plan: null }, "push", { fresh: false });
  }

  function choosePlan(plan: RatePlanCode) {
    if (address?.plan) commit({ ...address, plan }, "replace");
  }

  return (
    <>
      <div className="bg-stone-100">
        <div className="mx-auto max-w-7xl px-4 pb-2 md:px-8">
          <div id="availability" className="scroll-offset">
            <StaySearchForm key={formKey} lang={lang} copy={searchCopy} onSearch={onSearch} />
          </div>
          <p
            data-search-status
            className={phase.kind === "idle" ? "mt-4 text-stone-700" : "sr-only"}
            role="status"
          >
            {status}
          </p>
          {phase.kind === "problem" && (
            <div ref={problemPanel} className={`mt-6 ${belowHeader} ${panel}`}>
              <h2 ref={problemTitle} tabIndex={-1} className="text-xl font-semibold text-stone-900">
                {say(phase.title)}
              </h2>
              <p className="mt-3 leading-relaxed text-stone-700">{say(phase.body)}</p>
              {phase.retry && address && (
                <button
                  type="button"
                  className={`mt-6 ${primary}`}
                  onClick={() => current.current && search(current.current)}
                >
                  {say("reservation.choose.retry")}
                </button>
              )}
            </div>
          )}
          {notice && (
            <section
              ref={noticePanel}
              className={`mt-6 ${belowHeader} border-l-4 border-amber-600 bg-white p-4 text-stone-800`}
              aria-labelledby="rooms-notice"
            >
              <p id="rooms-notice" className="font-semibold">
                {notice.title}
              </p>
              {notice.reasons.length > 0 && (
                <ul className="mt-2 list-disc pl-5">
                  {notice.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
      <RoomOffers
        lang={lang}
        text={text}
        searchCopy={searchCopy}
        reviewHref={reviewHref}
        conditionsHref={conditionsHref}
        rooms={
          phase.kind === "found"
            ? ordered.filter((room) => stateOf(room) !== "too_many_guests")
            : ordered
        }
        details={details}
        phase={phase}
        choice={address}
        searchReady={searchReady}
        offersFor={offersFor}
        stateOf={stateOf}
        onChooseDates={chooseDates}
        onOpenRoom={openRoom}
        onChangeRoom={changeRoom}
        onPlan={choosePlan}
      />
    </>
  );
}

function chooseDates() {
  const arrival = document.getElementById("stay-check-in");
  arrival?.scrollIntoView({ block: "center" });
  arrival?.click();
}
