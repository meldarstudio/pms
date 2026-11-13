import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarBlankIcon, CaretDownIcon } from "@phosphor-icons/react";
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
import { getWhatsAppLink } from "@/lib/constants";
import { fill, formatDate, formatMoney } from "@/lib/reservation/format";
import type { PlanOffer, RoomTypeOffers } from "@/lib/reservation/offers";
import { nightsBetween, searchParams, type RatePlanCode } from "@/lib/reservation/search";
import type { RoomId } from "@/lib/rooms";
import { RoomCard, roomGridColumns, type StayDetails } from "./RoomCard";
import type { Phase, RoomState, RoomView } from "./RoomsBooking";
import type { RoomsBookingKey, RoomsBookingText } from "./text";

const primary =
  "font-source-sans-3 bg-accent-500 text-accent-950 hover:bg-accent-400 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 px-6 text-sm font-semibold tracking-widest uppercase";
const secondary =
  "font-source-sans-3 border border-stone-900 text-stone-900 hover:border-accent-500 hover:bg-accent-500 hover:text-accent-950 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 px-6 text-sm font-semibold tracking-widest uppercase";

type Props = {
  lang: Lang;
  text: RoomsBookingText;
  searchCopy: StaySearchCopy;
  reviewHref: string;
  rooms: RoomView[];
  details: StayDetails;
  phase: Phase;
  searchReady: boolean;
  offersFor: (room: RoomView) => RoomTypeOffers | undefined;
  stateOf: (room: RoomView) => RoomState;
  onChooseDates: () => void;
};

export function RoomOffers({
  lang,
  text,
  searchCopy,
  reviewHref,
  rooms,
  details,
  phase,
  searchReady,
  offersFor,
  stateOf,
  onChooseDates,
}: Props) {
  const [selection, setSelection] = useState<
    { kind: "rooms" } | { kind: "rates"; roomId: RoomId; planCode: RatePlanCode }
  >({ kind: "rooms" });
  const roomId = selection.kind === "rates" ? selection.roomId : null;
  const planCode = selection.kind === "rates" ? selection.planCode : null;
  const previousRoom = useRef<RoomId | null>(null);
  const [restored, setRestored] = useState(false);
  const section = useRef<HTMLElement>(null);
  const restoringRates =
    !restored &&
    (phase.kind === "loading" || phase.kind === "found") &&
    Boolean(phase.search.room && phase.search.plan);
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
    if (searchReady)
      section.current?.closest("[data-rooms-booking]")?.removeAttribute("data-resume-rates");
  }, [searchReady]);

  useEffect(() => {
    if (phase.kind === "loading") setSelection({ kind: "rooms" });
  }, [phase]);

  useEffect(() => {
    if (!roomId || phase.kind === "loading") return;
    const chosen = rooms.find((item) => item.id === roomId);
    const chosenOffers =
      phase.kind === "found" && chosen?.pmsRoomTypeId
        ? phase.result.roomTypes.find((type) => type.id === chosen.pmsRoomTypeId)
        : undefined;
    if (!chosen || chosenOffers?.availability !== "available") setSelection({ kind: "rooms" });
  }, [phase, roomId, rooms]);

  useEffect(() => {
    if (restored || phase.kind !== "found") return;
    setRestored(true);
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
    setSelection({ kind: "rates", roomId: chosen.id, planCode: plan });
  }, [phase, rooms, restored]);

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
    const offer = lowestOffer(chosen ? offersFor(chosen) : undefined);
    if (phase.kind !== "found" || !chosen || stateOf(chosen) !== "available" || !offer) return;
    setSelection({ kind: "rates", roomId: id, planCode: offer.ratePlan });
  }

  return (
    <section ref={section} className="bg-stone-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-8 md:px-8 md:py-12">
        {(phase.kind === "idle" || restoringRates) && (
          <div data-rate-loading className={restoringRates ? undefined : "hidden"}>
            <BookingSteps text={text} current="rate" />
            <div className="mt-10" aria-busy="true">
              <RateStepLoading text={text} />
            </div>
          </div>
        )}
        <div data-room-step hidden={restoringRates} className="flex flex-col gap-10">
          <BookingSteps
            id="offer-steps"
            className="scroll-mt-[calc(8rem+env(safe-area-inset-top))] md:scroll-mt-[calc(9.5rem+env(safe-area-inset-top))]"
            text={text}
            current={onRates ? "rate" : "room"}
            onChangeRoom={() => setSelection({ kind: "rooms" })}
          />
          {onRates && room && phase.kind === "found" && selected ? (
            <RateStep
              lang={lang}
              text={text}
              searchCopy={searchCopy}
              reviewHref={reviewHref}
              room={room}
              phase={phase}
              rates={rates}
              selected={selected}
              onPlan={(planCode) =>
                setSelection((current) =>
                  current.kind === "rates" ? { ...current, planCode } : current,
                )
              }
            />
          ) : (
            <ul
              className={`grid gap-6 ${roomGridColumns(rooms.length)}`}
              aria-busy={phase.kind === "loading"}
            >
              {rooms.map((item) => (
                <RoomRow
                  key={item.id}
                  room={item}
                  lang={lang}
                  text={text}
                  details={details}
                  phase={phase}
                  offers={offersFor(item)}
                  state={stateOf(item)}
                  onOpen={phase.kind === "idle" ? onChooseDates : () => openRoom(item.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function RateStepLoading({ text }: { text: RoomsBookingText }) {
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-10">
      <div className="lg:col-start-1">
        <h2 className="text-2xl font-semibold text-pretty text-stone-900 md:text-3xl">
          {text["reservation.rate.choose"]}
        </h2>
        <Skeleton
          aria-hidden="true"
          className="mt-2 h-6 w-80 max-w-full bg-stone-200 motion-reduce:animate-none"
        />
        <div aria-hidden="true" className="mt-6 flex flex-col gap-3">
          {(["non_refundable", "flexible"] as const).map((plan) => (
            <div
              key={plan}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border border-stone-300 bg-white p-4 md:p-5"
            >
              <Skeleton className="mt-1 size-5 motion-reduce:animate-none" />
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-lg font-semibold text-stone-900">
                  {text[`reservation.plan.${plan}`]}
                </span>
                <span className="ml-auto text-xl font-semibold">
                  <Skeleton className="inline-block h-lh w-24 align-top motion-reduce:animate-none" />
                </span>
              </div>
              <div className="col-start-2 text-sm leading-relaxed">
                <Skeleton
                  className={`h-lh w-full motion-reduce:animate-none ${plan === "flexible" ? "max-md:h-[2lh]" : ""}`}
                />
              </div>
              <div className="col-start-2 flex flex-col gap-1 text-sm text-stone-600">
                <div className="flex justify-between gap-4">
                  <span>{text["reservation.rate.due"]}</span>
                  <Skeleton className="h-lh w-20 motion-reduce:animate-none" />
                </div>
                {plan === "flexible" && (
                  <div className="flex justify-between gap-4">
                    <span>{text["reservation.offer.remaining"]}</span>
                    <Skeleton className="h-lh w-20 motion-reduce:animate-none" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex flex-col border border-stone-200 bg-white lg:sticky lg:top-36 lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        <div className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            <Skeleton className="size-20 shrink-0 motion-reduce:animate-none" />
            <div className="min-w-0 flex-1">
              <p className="font-source-sans-3 text-xs font-medium tracking-widest text-stone-600 uppercase">
                {text["reservation.review.stay"]}
              </p>
              <Skeleton className="mt-2 h-7 w-48 max-w-full motion-reduce:animate-none" />
              <Skeleton className="mt-1 h-5 w-36 max-w-full motion-reduce:animate-none" />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            {(["dates", "guests", "plan"] as const).map((key) => (
              <div key={key} className="flex justify-between gap-4">
                <span className="text-stone-600">{text[`reservation.review.${key}`]}</span>
                <Skeleton className="h-lh w-40 max-w-full motion-reduce:animate-none" />
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-stone-200 pt-4">
            <p className="text-sm text-stone-600">{text["reservation.offer.total"]}</p>
            <Skeleton className="h-9 w-40 motion-reduce:animate-none" />
            <div className="mt-3 flex flex-col gap-1 text-sm text-stone-600">
              {["reservation.rate.due", "reservation.offer.remaining"].map((key) => (
                <div key={key} className="flex justify-between gap-4">
                  <span>{text[key as RoomsBookingKey]}</span>
                  <Skeleton className="h-lh w-20 motion-reduce:animate-none" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-3 h-4 w-60 max-w-full motion-reduce:animate-none" />
            <Skeleton className="mt-4 h-12 w-full motion-reduce:animate-none" />
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="border-t border-stone-200 lg:col-start-1">
        {["cancelTitle", "checkInTitle", "breakfast", "petsTitle", "paymentTitle"].map((key) => (
          <div
            key={key}
            className="flex min-h-12 items-center justify-between gap-4 border-b border-stone-200 py-3 font-medium text-stone-900"
          >
            {text[`rooms.policies.${key}` as RoomsBookingKey]}
            <CaretDownIcon aria-hidden="true" className="size-4 shrink-0 text-stone-500" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomRow({
  room,
  lang,
  text,
  details,
  phase,
  offers,
  state,
  onOpen,
}: {
  room: RoomView;
  lang: Lang;
  text: RoomsBookingText;
  details: StayDetails;
  phase: Phase;
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
        loading={phase.kind === "loading"}
      >
        <div className="text-right">
          {phase.kind === "idle" ? (
            <button type="button" className={`w-full ${secondary}`} onClick={onOpen}>
              <CalendarBlankIcon className="size-5 shrink-0" aria-hidden="true" />
              {say("reservation.room.chooseDates")}
            </button>
          ) : phase.kind === "loading" ? (
            phase.previous && state !== "available" ? (
              <Skeleton
                aria-hidden="true"
                className="w-fit max-w-full bg-stone-200 text-left font-semibold text-transparent select-none motion-reduce:animate-none"
              >
                {unavailableLine(state, offers, text)}
              </Skeleton>
            ) : (
              <>
                <p className="text-sm text-stone-600">{say("reservation.rate.from")}</p>
                <div className="text-3xl font-semibold">
                  <Skeleton
                    aria-hidden="true"
                    className="ml-auto h-lh w-40 bg-stone-200 motion-reduce:animate-none"
                  />
                </div>
                <p className="mt-1 text-sm text-stone-600">{totalLine(phase, text)}</p>
                <button
                  type="button"
                  disabled
                  className={`mt-4 w-full ${primary} disabled:opacity-50`}
                >
                  {say("reservation.rate.see")}
                </button>
              </>
            )
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
                {state === "offline"
                  ? fillParts(text["reservation.room.offline"], {
                      whatsapp: (
                        <a
                          href={getWhatsAppLink(text["whatsapp.prefill"])}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-accent-500 decoration-2 underline-offset-4 hover:text-accent-800"
                        >
                          WhatsApp
                        </a>
                      ),
                    })
                  : unavailableLine(state, offers, text)}
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
        <p className="mt-2 text-stone-600">
          {room.name} · {nightsLabel} · {guests}
        </p>
        <fieldset className="mt-6 flex flex-col gap-3">
          <legend className="sr-only">{say("reservation.rate.choose")}</legend>
          {rates.map((offer) => {
            const plan = say(`reservation.plan.${offer.ratePlan}`);
            const checked = selected.ratePlan === offer.ratePlan;
            return (
              <label
                key={offer.ratePlan}
                className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border p-4 md:p-5 ${checked ? "border-accent-700 bg-accent-50" : "border-stone-300 bg-white"}`}
              >
                <input
                  type="radio"
                  name="room-rate"
                  className="mt-1 size-5 accent-accent-700"
                  checked={checked}
                  onChange={() => onPlan(offer.ratePlan)}
                />
                <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-lg font-semibold text-stone-900">{plan}</span>
                  <span className="ml-auto text-xl font-semibold whitespace-nowrap text-stone-900">
                    {money(offer.totalCents)}
                  </span>
                </span>
                <span className="col-start-2 text-sm leading-relaxed text-stone-700">
                  <RateTerms offer={offer} lang={lang} text={text} money={money} />
                </span>
                <span className="col-start-2">
                  <RatePayments offer={offer} text={text} money={money} />
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
        <div className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            {room.photos[0] && (
              <img
                className="size-20 shrink-0 object-cover object-center"
                src={room.photos[0].src}
                srcSet={room.photos[0].srcSet}
                sizes="5rem"
                width={room.photos[0].width}
                height={room.photos[0].height}
                alt={room.photos[0].alt}
              />
            )}
            <div className="min-w-0">
              <h2
                id="stay-summary"
                className="font-source-sans-3 text-xs font-medium tracking-widest text-stone-600 uppercase"
              >
                {say("reservation.review.stay")}
              </h2>
              <p className="mt-2 text-xl font-semibold text-pretty text-stone-900">{room.name}</p>
              <p className="mt-1 text-sm text-stone-600">
                {room.beds} · {room.area}
              </p>
            </div>
          </div>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
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
          <div className="mt-4 border-t border-stone-200 pt-4">
            <p className="text-sm text-stone-600">{say("reservation.offer.total")}</p>
            <p className="text-3xl font-semibold text-stone-900">{money(selected.totalCents)}</p>
            <div className="mt-3">
              <RatePayments offer={selected} text={text} money={money} />
            </div>
            <p className="mt-3 text-xs text-stone-600">
              {say("reservation.offer.taxes", { currency: phase.result.currency })}
            </p>
            <a
              className={`mt-4 w-full ${primary}`}
              href={`${reviewHref}?${searchParams({ ...phase.search, room: room.id, plan: selected.ratePlan }).toString()}`}
              aria-label={say("reservation.rate.continueLabel", {
                room: room.name,
                plan: say(`reservation.plan.${selected.ratePlan}`),
              })}
            >
              {say("reservation.rate.continue")}
            </a>
          </div>
        </div>
      </aside>
      <Accordion multiple className="border-t border-stone-200 lg:col-start-1">
        <AccordionItem value="cancel">
          <AccordionTrigger>{text["rooms.policies.cancelTitle"]}</AccordionTrigger>
          <AccordionContent>
            <p>
              {selected.ratePlan === "flexible"
                ? text["rooms.policies.cancelFlexibleBody"]
                : text["rooms.policies.cancelNonRefundableBody"]}
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="check-in">
          <AccordionTrigger>{text["rooms.policies.checkInTitle"]}</AccordionTrigger>
          <AccordionContent>
            <p>
              {text["rooms.policies.checkIn"]}: {text["rooms.policies.checkInValue"]}
            </p>
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

function RatePayments({
  offer,
  text,
  money,
}: {
  offer: PlanOffer;
  text: RoomsBookingText;
  money: (cents: number) => string;
}) {
  return (
    <span className="flex flex-col gap-1 text-sm text-stone-600">
      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>{text["reservation.rate.due"]}</span>
        <span className="ml-auto whitespace-nowrap">
          {money(offer.requiredInitialPaymentCents)}
        </span>
      </span>
      {offer.remainingScheduledCents > 0 && (
        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span>{text["reservation.offer.remaining"]}</span>
          <span className="ml-auto whitespace-nowrap">{money(offer.remainingScheduledCents)}</span>
        </span>
      )}
    </span>
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

function nightsOf(phase: Extract<Phase, { kind: "found" | "loading" }>, text: RoomsBookingText) {
  const nights = nightsBetween(phase.search.checkIn, phase.search.checkOut) ?? 0;
  return fill(text[`reservation.nights.${nights === 1 ? "one" : "other"}`], { count: nights });
}

function totalLine(phase: Extract<Phase, { kind: "found" | "loading" }>, text: RoomsBookingText) {
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
  return fill(text["reservation.room.offline"], { whatsapp: "WhatsApp" });
}

function guestLine(copy: StaySearchCopy, adults: number, children: number) {
  const adultsLabel = adults === 1 ? copy.adultsOne : fill(copy.adultsOther, { count: adults });
  if (children < 1) return adultsLabel;
  const childrenLabel =
    children === 1 ? copy.childrenOne : fill(copy.childrenOther, { count: children });
  return `${adultsLabel}, ${childrenLabel}`;
}
