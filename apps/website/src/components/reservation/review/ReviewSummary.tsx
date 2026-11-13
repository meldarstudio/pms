import type { CheckoutView } from "@/lib/reservation/checkout";
import { useReview } from "./context";
import { eyebrow, headline, quietLink } from "./styles";
import { stayLabels } from "./stay";

export type ReviewRoom = {
  name: string;
  beds: string;
  pmsRoomTypeId: string | null;
  photo: { src: string; alt: string };
};

export function ReviewSummary({
  view,
  room,
  ratesHref,
  choiceHref,
  completed,
}: {
  view: CheckoutView | null;
  room: ReviewRoom | null;
  ratesHref: string;
  choiceHref: string;
  completed: boolean;
}) {
  const { say, lang } = useReview();
  const stay = view ? stayLabels(view, say, lang) : null;
  return (
    <aside
      className="min-w-0 border border-stone-200 bg-white p-4 md:p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1"
      aria-labelledby="review-stay"
    >
      <div className="flex items-start gap-4">
        <img
          className="size-14 shrink-0 md:size-20 object-cover object-center"
          width={80}
          height={80}
          data-room-photo
          src={room?.photo.src}
          alt={room?.photo.alt ?? ""}
        />
        <div className="min-w-0">
          <h2 id="review-stay" className={eyebrow}>
            {say("reservation.review.stay")}
          </h2>
          <p
            className="mt-1 text-lg md:mt-2 md:text-xl font-semibold text-pretty text-stone-900"
            data-stay="room"
          >
            {room?.name}
          </p>
          <p className="mt-1 hidden text-sm text-stone-600 lg:block" data-stay="room-details">
            {room?.beds}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-stone-700 lg:hidden" data-stay="compact">
        {stay?.compact}
      </p>
      <p className="mt-1 text-sm text-stone-900 lg:hidden" data-stay="compact-guests-rate">
        {stay?.guests} · {stay?.plan}
      </p>
      <dl className="mt-3 border-t border-stone-200 pt-3 lg:mt-5 lg:pt-5">
        <div className={headline}>
          <dt className="text-sm font-medium text-stone-900">{say("reservation.offer.total")}</dt>
          <dd
            className="text-2xl font-semibold whitespace-nowrap text-stone-900"
            data-amount="total"
          >
            {stay && view ? stay.money(view.quote.totalCents) : ""}
          </dd>
        </div>
      </dl>
      <p className="mt-1 text-sm text-stone-600" data-taxes>
        {view ? say("reservation.offer.taxes", { currency: view.currency }) : ""}
      </p>
      <div className="mt-5 hidden border-t border-stone-200 pt-5 text-sm lg:block">
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-stone-600">{say("reservation.review.checkIn")}</dt>
            <dd className="mt-1 font-medium text-stone-900">
              <time data-stay="checkIn" dateTime={view?.checkIn}>
                {stay?.checkIn}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-stone-600">{say("reservation.review.checkOut")}</dt>
            <dd className="mt-1 font-medium text-stone-900">
              <time data-stay="checkOut" dateTime={view?.checkOut}>
                {stay?.checkOut}
              </time>
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-stone-600" data-stay="nights">
          {stay?.nights}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-stone-600">{say("reservation.review.guests")}</dt>
            <dd className="mt-1 font-medium text-stone-900" data-stay="guests">
              {stay?.guests}
            </dd>
          </div>
          <div>
            <dt className="text-stone-600">{say("reservation.review.plan")}</dt>
            <dd className="mt-1 font-medium text-stone-900" data-stay="plan">
              {stay?.plan}
            </dd>
          </div>
        </dl>
      </div>
      <div
        hidden={completed}
        className="mt-3 flex flex-wrap gap-x-4 border-t border-stone-200 pt-2 lg:mt-5"
      >
        <a href={ratesHref} className={quietLink} data-back-to-rates>
          {say("reservation.review.changeRate")}
        </a>
        <a href={choiceHref} className={quietLink} data-change-choice>
          {say("reservation.review.changeChoice")}
        </a>
      </div>
    </aside>
  );
}
