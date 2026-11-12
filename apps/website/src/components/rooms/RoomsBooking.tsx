import { useEffect, useRef, useState } from "react";
import StaySearchForm, { type StaySearchCopy } from "@/components/StaySearchForm";
import type { Lang } from "@/i18n/utils";
import { resumeSearch, storeSearch } from "@/lib/reservation/draft";
import { fill, formatList } from "@/lib/reservation/format";
import { fetchOffers, type OfferSearchResult, type RoomTypeOffers } from "@/lib/reservation/offers";
import { searchParams, type StaySearch } from "@/lib/reservation/search";
import type { RoomId } from "@/lib/rooms";
import type { StayDetails } from "./RoomCard";
import type { RoomPhotoView } from "./RoomGallery";
import { RoomOffers } from "./RoomOffers";
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
  "online check-in must be after today": "reservation.problem.checkInTooSoon",
  "stay must be at least one night": "reservation.problem.checkOutBeforeCheckIn",
  "stay cannot be longer than 60 nights": "reservation.problem.tooManyNights",
  "invalid date": "reservation.problem.invalidDate",
};

const unavailableStates = ["sold_out", "too_many_guests", "offline"] as const;

const primary =
  "font-source-sans-3 bg-accent-500 text-accent-950 hover:bg-accent-400 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 px-6 text-sm font-semibold tracking-widest uppercase";
const panel = "border border-stone-300 bg-white p-5 md:p-8";

/** Rooms page: the stay search, every room with its photos, and live rates for the search. */
export default function RoomsBooking({
  lang,
  apiBase,
  reviewHref,
  rooms,
  details,
  text,
  searchCopy,
}: Props) {
  const [preferred, setPreferred] = useState<RoomId | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [searchReady, setSearchReady] = useState(false);
  const search = useRef<StaySearch | null>(null);
  const request = useRef<AbortController | null>(null);
  const problemTitle = useRef<HTMLHeadingElement>(null);
  const say = (key: RoomsBookingKey, values: Record<string, string | number> = {}) =>
    fill(text[key], values);

  async function load(next: StaySearch) {
    request.current?.abort();
    const controller = (request.current = new AbortController());
    setPhase((current) => ({
      kind: "loading",
      search: next,
      previous:
        current.kind === "found"
          ? current.result
          : current.kind === "loading"
            ? current.previous
            : undefined,
    }));
    const outcome = await fetchOffers(apiBase, next, controller.signal).catch(() => null);
    if (!outcome || controller.signal.aborted) return;
    if (outcome.kind === "found") setPhase({ kind: "found", search: next, result: outcome.result });
    else if (outcome.kind === "invalid")
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

  function show(next: StaySearch) {
    search.current = next;
    setPreferred(next.room);
    if (!next.checkIn || !next.checkOut) {
      request.current?.abort();
      setPhase({ kind: "idle" });
      return;
    }
    storeSearch(next);
    const params = searchParams(next, { withChoice: false });
    history.replaceState(history.state, "", `?${params.toString()}`);
    void load(next);
  }

  useEffect(() => {
    show(
      resumeSearch(
        new URLSearchParams(window.location.search),
        rooms.map((room) => room.id),
      ),
    );
    setSearchReady(true);
    return () => request.current?.abort();
  }, []);

  useEffect(() => {
    if (phase.kind === "problem") problemTitle.current?.focus();
  }, [phase]);

  const result =
    phase.kind === "found" ? phase.result : phase.kind === "loading" ? phase.previous : undefined;
  const offersFor = (room: RoomView): RoomTypeOffers | undefined =>
    result?.roomTypes.find((type) => type.id === room.pmsRoomTypeId);
  const stateOf = (room: RoomView): RoomState => offersFor(room)?.availability ?? "offline";
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
          reasons: [],
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

  const onSearch = (next: StaySearch) => show({ ...next, room: preferred, plan: null });

  return (
    <>
      <div className="bg-stone-100">
        <div className="mx-auto max-w-7xl px-4 pb-2 md:px-8">
          <div id="availability" className="scroll-offset">
            <StaySearchForm lang={lang} copy={searchCopy} onSearch={onSearch} />
          </div>
          <p className="mt-4 text-stone-700" role="status">
            <span className={phase.kind === "idle" ? undefined : "sr-only"}>{status}</span>
            {phase.kind !== "idle" && (
              <span aria-hidden="true" className="invisible">
                {say("reservation.choose.missing")}
              </span>
            )}
          </p>
          {phase.kind === "problem" && (
            <div className={`mt-6 ${panel}`}>
              <h2 ref={problemTitle} tabIndex={-1} className="text-xl font-semibold text-stone-900">
                {say(phase.title)}
              </h2>
              <p className="mt-3 leading-relaxed text-stone-700">{say(phase.body)}</p>
              {phase.retry && search.current && (
                <button
                  type="button"
                  className={`mt-6 ${primary}`}
                  onClick={() => void load(search.current!)}
                >
                  {say("reservation.choose.retry")}
                </button>
              )}
            </div>
          )}
          {notice && (
            <section
              className="mt-6 border-l-4 border-amber-600 bg-white p-4 text-stone-800"
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
        rooms={ordered}
        details={details}
        phase={phase}
        searchReady={searchReady}
        offersFor={offersFor}
        stateOf={stateOf}
        onChooseDates={chooseDates}
      />
    </>
  );
}

function chooseDates() {
  const arrival = document.getElementById("stay-check-in");
  arrival?.scrollIntoView({ block: "center" });
  arrival?.click();
}
