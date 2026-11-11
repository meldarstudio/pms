import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { StaySearchCopy } from "@/components/StaySearchForm";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookingSteps } from "@/components/reservation/BookingSteps";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lang } from "@/i18n/utils";
import { fill, formatDate, formatMoney } from "@/lib/reservation/format";
import type { PlanOffer, RoomTypeOffers } from "@/lib/reservation/offers";
import { nightsBetween, searchParams, type RatePlanCode } from "@/lib/reservation/search";
import type { RoomId } from "@/lib/rooms";
import { RoomCard, roomGridColumns, type StayDetails } from "./RoomCard";
import type { Phase, RoomState, RoomView } from "./RoomsBooking";
import type { RoomsBookingKey, RoomsBookingText } from "./text";

const primary =
  "font-source-sans-3 bg-accent-500 text-accent-950 hover:bg-accent-400 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 px-6 text-sm font-semibold tracking-widest uppercase";

type Props = {
  lang: Lang;
  text: RoomsBookingText;
  searchCopy: StaySearchCopy;
  reviewHref: string;
  rooms: RoomView[];
  details: StayDetails;
  phase: Exclude<Phase, { kind: "idle" }>;
  preferred: RoomId | null;
  offersFor: (room: RoomView) => RoomTypeOffers | undefined;
  stateOf: (room: RoomView) => RoomState;
  status: string;
};

export function RoomOffers({
  lang,
  text,
  searchCopy,
  reviewHref,
  rooms,
  details,
  phase,
  preferred,
  offersFor,
  stateOf,
  status,
}: Props) {
  const [roomId, setRoomId] = useState<RoomId | null>(null);
  const [planCode, setPlanCode] = useState<RatePlanCode | null>(null);
  const previousRoom = useRef<RoomId | null>(null);
  const restore = useRef<"pending" | "done">("pending");
  const room = rooms.find((item) => item.id === roomId);
  const offers = room ? offersFor(room) : undefined;
  const rates = [...(offers?.offers ?? [])].sort((a, b) => a.totalCents - b.totalCents);
  const selected = rates.find((offer) => offer.ratePlan === planCode) ?? rates[0];
  const onRates =
    phase.kind === "found" &&
    room !== undefined &&
    stateOf(room) === "available" &&
    selected !== undefined;

  useEffect(() => {
    if (phase.kind === "loading") setRoomId(null);
  }, [phase]);

  useEffect(() => {
    if (!roomId || phase.kind === "loading") return;
    const chosen = rooms.find((item) => item.id === roomId);
    const chosenOffers =
      phase.kind === "found" && chosen?.pmsRoomTypeId
        ? phase.result.roomTypes.find((type) => type.id === chosen.pmsRoomTypeId)
        : undefined;
    if (!chosen || chosenOffers?.availability !== "available") setRoomId(null);
  }, [phase, roomId, rooms]);

  useEffect(() => {
    if (restore.current === "done" || phase.kind !== "found") return;
    restore.current = "done";
    const { room: roomToOpen, plan } = phase.search;
    if (!roomToOpen || !plan) return;
    const chosen = rooms.find((item) => item.id === roomToOpen);
    const chosenOffers = chosen?.pmsRoomTypeId
      ? phase.result.roomTypes.find((type) => type.id === chosen.pmsRoomTypeId)
      : undefined;
    if (
      !chosen ||
      chosenOffers?.availability !== "available" ||
      !chosenOffers.offers.some((offer) => offer.ratePlan === plan)
    )
      return;
    setPlanCode(plan);
    setRoomId(chosen.id);
  }, [phase, rooms]);

  useEffect(() => {
    const last = previousRoom.current;
    previousRoom.current = roomId;
    if (roomId) {
      document.getElementById("offer-steps")?.scrollIntoView({ block: "start" });
      document.getElementById("room-rates-title")?.focus({ preventScroll: true });
      return;
    }
    if (last) document.getElementById(`room-rates-${last}`)?.focus();
  }, [roomId]);

  function openRoom(id: RoomId) {
    const chosen = rooms.find((item) => item.id === id);
    setPlanCode(lowestOffer(chosen ? offersFor(chosen) : undefined)?.ratePlan ?? null);
    setRoomId(id);
  }

  return (
    <section className="bg-stone-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-8 md:px-8 md:py-12">
        <BookingSteps
          id="offer-steps"
          className="scroll-mt-[calc(8rem+env(safe-area-inset-top))] md:scroll-mt-[calc(9.5rem+env(safe-area-inset-top))]"
          text={text}
          current={onRates ? "rate" : "room"}
          onChangeRoom={() => setRoomId(null)}
        />
        {onRates && room && phase.kind === "found" && selected ? (
          <RateStep
            lang={lang}
            text={text}
            searchCopy={searchCopy}
            reviewHref={reviewHref}
            room={room}
            phase={phase}
            preferred={room.id === preferred}
            rates={rates}
            selected={selected}
            onPlan={setPlanCode}
          />
        ) : (
          <ul className={`grid gap-6 ${roomGridColumns(rooms.length)}`}>
            {rooms.map((item) => (
              <RoomRow
                key={item.id}
                room={item}
                lang={lang}
                text={text}
                details={details}
                phase={phase}
                preferred={item.id === preferred}
                offers={offersFor(item)}
                state={stateOf(item)}
                onOpen={() => openRoom(item.id)}
              />
            ))}
          </ul>
        )}
        {phase.kind === "loading" && <p className="sr-only">{status}</p>}
      </div>
    </section>
  );
}

function RoomRow({
  room,
  lang,
  text,
  details,
  phase,
  preferred,
  offers,
  state,
  onOpen,
}: {
  room: RoomView;
  lang: Lang;
  text: RoomsBookingText;
  details: StayDetails;
  phase: Exclude<Phase, { kind: "idle" }>;
  preferred: boolean;
  offers: RoomTypeOffers | undefined;
  state: RoomState;
  onOpen: () => void;
}) {
  const say = (key: RoomsBookingKey, values: Record<string, string | number> = {}) =>
    fill(text[key], values);
  const floor = phase.kind === "found" ? lowestOffer(offers) : undefined;
  const available = state === "available" && floor !== undefined && phase.kind === "found";

  return (
    <li>
      <RoomCard
        room={room}
        lang={lang}
        text={text}
        details={details}
        offers={offers}
        preferred={preferred}
      >
        <div className="text-right">
          {phase.kind === "loading" ? (
            <Skeleton className="ml-auto h-16 w-40 bg-stone-200" />
          ) : available ? (
            <>
              <p className="text-sm text-stone-600">{say("reservation.rate.from")}</p>
              <p className="text-3xl font-semibold text-stone-900">
                {formatMoney(floor.totalCents, phase.result.currency)}
              </p>
              <p className="mt-1 text-sm text-stone-600">{totalLine(phase, text)}</p>
              <button
                id={`room-rates-${room.id}`}
                type="button"
                className={`mt-4 w-full ${primary}`}
                onClick={onOpen}
              >
                {say("reservation.rate.see")}
              </button>
            </>
          ) : (
            phase.kind === "found" && (
              <p className="text-left font-semibold text-stone-900">
                {unavailableLine(state, offers, text)}
              </p>
            )
          )}
        </div>
      </RoomCard>
    </li>
  );
}

function RateStep({
  lang,
  text,
  searchCopy,
  reviewHref,
  room,
  phase,
  preferred,
  rates,
  selected,
  onPlan,
}: {
  lang: Lang;
  text: RoomsBookingText;
  searchCopy: StaySearchCopy;
  reviewHref: string;
  room: RoomView;
  phase: Extract<Phase, { kind: "found" }>;
  preferred: boolean;
  rates: PlanOffer[];
  selected: PlanOffer;
  onPlan: (plan: RatePlanCode) => void;
}) {
  const say = (key: RoomsBookingKey, values: Record<string, string | number> = {}) =>
    fill(text[key], values);
  const nightsLabel = nightsOf(phase, text);
  const money = (cents: number) => formatMoney(cents, phase.result.currency);
  const guests = guestLine(searchCopy, phase.search.adults, phase.search.children);
  const dates = `${formatDate(phase.search.checkIn, lang, { includeWeekday: false })} – ${formatDate(phase.search.checkOut, lang, { includeWeekday: false })}`;

  return (
    <div
      id="room-rates"
      className="scroll-offset grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-10"
    >
      <div className="lg:col-start-1">
        <h2
          id="room-rates-title"
          tabIndex={-1}
          className="text-2xl font-semibold text-pretty text-stone-900 md:text-3xl"
        >
          {say("reservation.rate.choose")}
        </h2>
        <p className="mt-2 text-stone-600">{totalLine(phase, text)}</p>
        <fieldset className="mt-6 flex flex-col gap-3">
          <legend className="sr-only">{say("reservation.rate.choose")}</legend>
          {rates.map((offer) => {
            const plan = say(`reservation.plan.${offer.ratePlan}`);
            const checked = selected.ratePlan === offer.ratePlan;
            return (
              <label
                key={offer.ratePlan}
                className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-1 border p-4 md:p-5 ${checked ? "border-accent-700 bg-accent-50" : "border-stone-300 bg-white"}`}
              >
                <input
                  type="radio"
                  name="room-rate"
                  className="mt-1 size-5 accent-accent-700"
                  checked={checked}
                  onChange={() => onPlan(offer.ratePlan)}
                />
                <span className="text-lg font-semibold text-stone-900">{plan}</span>
                <span className="text-xl font-semibold text-stone-900">
                  {money(offer.totalCents)}
                </span>
                <span className="col-start-2 text-sm leading-relaxed text-stone-700">
                  <RateTerms offer={offer} lang={lang} text={text} money={money} />
                </span>
                <span className="col-start-2 text-sm text-stone-600">
                  {say("reservation.offer.now")} {money(offer.requiredInitialPaymentCents)}
                  {offer.remainingScheduledCents > 0 &&
                    ` · ${say("reservation.offer.remaining")} ${money(offer.remainingScheduledCents)}`}
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>
      <aside
        className="flex flex-col border border-stone-200 bg-white lg:sticky lg:top-36 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        aria-labelledby="stay-summary"
      >
        {room.photos[0] && (
          <img
            className="order-1 aspect-video w-full object-cover object-center lg:aspect-4/3"
            src={room.photos[0].src}
            srcSet={room.photos[0].srcSet}
            sizes="(min-width: 64rem) 26rem, 100vw"
            width={room.photos[0].width}
            height={room.photos[0].height}
            alt={room.photos[0].alt}
          />
        )}
        <div className="order-2 p-5 md:p-6">
          <h2
            id="stay-summary"
            className="font-source-sans-3 text-xs font-medium tracking-widest text-stone-600 uppercase"
          >
            {say("reservation.review.stay")}
          </h2>
          {preferred && (
            <p className="mt-4 inline-block bg-accent-100 px-2 py-1 font-source-sans-3 text-xs font-semibold tracking-widest text-accent-900 uppercase">
              {say("reservation.room.preferred")}
            </p>
          )}
          <p
            className={`${preferred ? "mt-3" : "mt-4"} text-2xl font-semibold text-pretty text-stone-900`}
          >
            {room.name}
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {room.beds} · {room.area}
          </p>
          <dl className="mt-5 flex flex-col gap-2 text-sm">
            <SummaryRow
              term={say("reservation.review.dates")}
              detail={`${dates} · ${nightsLabel}`}
            />
            <SummaryRow term={say("reservation.review.guests")} detail={guests} />
            <SummaryRow
              term={say("reservation.review.plan")}
              detail={say(`reservation.plan.${selected.ratePlan}`)}
            />
          </dl>
          <div className="mt-5 border-t border-stone-200 pt-5">
            <p className="text-sm text-stone-600">{say("reservation.offer.total")}</p>
            <p className="text-3xl font-semibold text-stone-900">{money(selected.totalCents)}</p>
            <p className="mt-2 text-sm text-stone-700">
              {say("reservation.offer.now")} {money(selected.requiredInitialPaymentCents)}
              {selected.remainingScheduledCents > 0 &&
                ` · ${say("reservation.offer.remaining")} ${money(selected.remainingScheduledCents)}`}
            </p>
            <a
              className={`mt-5 w-full ${primary}`}
              href={`${reviewHref}?${searchParams({ ...phase.search, room: room.id, plan: selected.ratePlan }).toString()}`}
              aria-label={say("reservation.rate.bookLabel", {
                room: room.name,
                plan: say(`reservation.plan.${selected.ratePlan}`),
              })}
            >
              {say("reservation.rate.book")}
            </a>
          </div>
        </div>
      </aside>
      <Accordion multiple className="border-t border-stone-200 lg:col-start-1">
        <AccordionItem value="cancel">
          <AccordionTrigger>{text["rooms.policies.cancelTitle"]}</AccordionTrigger>
          <AccordionContent>
            <p>{text["rooms.policies.cancelBody"]}</p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="check-in">
          <AccordionTrigger>{text["rooms.policies.checkIn"]}</AccordionTrigger>
          <AccordionContent>
            <p>{text["rooms.policies.checkInValue"]}</p>
            <p>
              {text["rooms.policies.checkOut"]}: {text["rooms.policies.checkOutValue"]}
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="breakfast">
          <AccordionTrigger>{text["rooms.policies.breakfast"]}</AccordionTrigger>
          <AccordionContent>
            <p>{text["rooms.policies.breakfastValue"]}</p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="pets">
          <AccordionTrigger>{text["rooms.policies.petsTitle"]}</AccordionTrigger>
          <AccordionContent>
            <p>{text["rooms.policies.petsBody"]}</p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="payment">
          <AccordionTrigger>{text["rooms.policies.paymentTitle"]}</AccordionTrigger>
          <AccordionContent>
            <p>{text["rooms.policies.paymentBody"]}</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function SummaryRow({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-stone-600">{term}</dt>
      <dd className="text-right font-semibold text-stone-900">{detail}</dd>
    </div>
  );
}

function RateTerms({
  offer: { cancellation, savingCents },
  lang,
  text,
  money,
}: {
  offer: PlanOffer;
  lang: Lang;
  text: RoomsBookingText;
  money: (cents: number) => string;
}) {
  const terms =
    cancellation.freeCancellation === "available" && cancellation.freeUntil
      ? fillParts(text["reservation.rate.freeUntil"], {
          date: (
            <time dateTime={cancellation.freeUntil}>
              {formatDate(cancellation.freeUntil, lang)}
            </time>
          ),
        })
      : text[
          cancellation.freeCancellation === "ended"
            ? "reservation.rate.freeEnded"
            : "reservation.rate.noFree"
        ];
  return (
    <>
      {terms}
      {savingCents > 0 && (
        <>
          {" · "}
          <span className="font-semibold text-green-800">
            {fill(text["reservation.rate.saving"], { amount: money(savingCents) })}
          </span>
        </>
      )}
    </>
  );
}

function fillParts(template: string, values: Record<string, ReactNode>) {
  return template
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part, index) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1];
      return (
        <Fragment key={index}>{key !== undefined && key in values ? values[key] : part}</Fragment>
      );
    });
}

function nightsOf(phase: Extract<Phase, { kind: "found" }>, text: RoomsBookingText) {
  const nights = nightsBetween(phase.search.checkIn, phase.search.checkOut) ?? 0;
  return fill(text[`reservation.nights.${nights === 1 ? "one" : "other"}`], { count: nights });
}

function totalLine(phase: Extract<Phase, { kind: "found" }>, text: RoomsBookingText) {
  return fill(text["reservation.rate.total"], { nights: nightsOf(phase, text) });
}

function lowestOffer(offers: RoomTypeOffers | undefined) {
  return offers?.offers.reduce<PlanOffer | undefined>(
    (lowest, offer) => (!lowest || offer.totalCents < lowest.totalCents ? offer : lowest),
    undefined,
  );
}

function unavailableLine(
  state: RoomState,
  offers: RoomTypeOffers | undefined,
  text: RoomsBookingText,
) {
  if (state === "sold_out") return text["reservation.room.soldOut"];
  if (state === "too_many_guests" && offers) {
    return fill(text["reservation.room.tooManyGuests"], {
      adults: offers.maxAdults,
      children: offers.maxChildren,
    });
  }
  return text["reservation.room.offline"];
}

function guestLine(copy: StaySearchCopy, adults: number, children: number) {
  const adultsLabel = adults === 1 ? copy.adultsOne : fill(copy.adultsOther, { count: adults });
  if (children < 1) return adultsLabel;
  const childrenLabel =
    children === 1 ? copy.childrenOne : fill(copy.childrenOther, { count: children });
  return `${adultsLabel}, ${childrenLabel}`;
}
