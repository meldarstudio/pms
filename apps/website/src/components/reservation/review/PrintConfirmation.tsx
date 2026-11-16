import logoUrl from "@/assets/manantial-logo.svg?url";
import { BUSINESS_NAME } from "@/constants";
import { address, email, phoneNumber } from "@/lib/constants";
import type { CheckoutView } from "@/lib/reservation/checkout";
import { formatMoney } from "@/lib/reservation/format";
import type { GuestPayment } from "@/lib/reservation/payment";
import { internationalPhone } from "@pms/shared/phone";
import { useReview } from "./context";
import type { ReviewRoom } from "./ReviewSummary";
import { stayLabels } from "./stay";

export type SavedConfirmation = {
  view: CheckoutView;
  room: ReviewRoom;
  reservation: NonNullable<GuestPayment["reservation"]>;
  currency: string;
};

export function PrintConfirmation({ view, room, reservation, currency }: SavedConfirmation) {
  const { say, lang } = useReview();
  const stay = stayLabels(view, say, lang);
  const money = (cents: number) => formatMoney(cents, currency);
  const hotelPhone = internationalPhone(phoneNumber)?.formatInternational() ?? phoneNumber;
  return (
    <article
      className="confirmation-print-sheet"
      data-print-confirmation
      aria-label={say("reservation.confirmation.printLabel")}
    >
      <header className="confirmation-print-hotel">
        <img src={logoUrl} alt={BUSINESS_NAME} width={192} height={48} />
        <div>
          <p>{address}</p>
          <p>{hotelPhone}</p>
        </div>
      </header>
      <div className="confirmation-print-heading">
        <div>
          <p className="confirmation-print-eyebrow">
            {say("reservation.confirmation.printStatus")}
          </p>
          <h1>{say("reservation.confirmation.printTitle")}</h1>
          <p className="confirmation-print-welcome">
            {say("reservation.confirmation.printWelcome")}
          </p>
        </div>
        <div className="confirmation-print-reference">
          <p className="confirmation-print-eyebrow">{say("reservation.outcome.reference")}</p>
          <p>{reservation.code}</p>
        </div>
      </div>
      <section className="confirmation-print-stay" aria-labelledby="print-stay-title">
        <h2 id="print-stay-title">{say("reservation.review.stay")}</h2>
        <div className="confirmation-print-room">
          <div>
            <h3>{room.name}</h3>
            <p>{room.beds}</p>
          </div>
          <p>{stay.guests}</p>
        </div>
        <dl className="confirmation-print-stay-facts">
          <div>
            <dt>{say("reservation.review.checkIn")}</dt>
            <dd>{stay.checkIn}</dd>
          </div>
          <div>
            <dt>{say("reservation.review.checkOut")}</dt>
            <dd>{stay.checkOut}</dd>
          </div>
          <div>
            <dt>{say("reservation.confirmation.duration")}</dt>
            <dd>{stay.nights}</dd>
          </div>
          <div>
            <dt>{say("reservation.review.plan")}</dt>
            <dd>{stay.plan}</dd>
          </div>
        </dl>
      </section>
      <section className="confirmation-print-payment" aria-labelledby="print-payment-title">
        <h2 id="print-payment-title">{say("reservation.confirmation.payment")}</h2>
        <dl>
          <div>
            <dt>{say("reservation.offer.total")}</dt>
            <dd>{money(view.quote.totalCents)}</dd>
          </div>
          <div>
            <dt>{say("reservation.outcome.paid")}</dt>
            <dd>{money(reservation.paidCents)}</dd>
          </div>
          <div className="confirmation-print-balance">
            <dt>{say("reservation.outcome.outstanding")}</dt>
            <dd>{money(reservation.outstandingCents)}</dd>
          </div>
        </dl>
        {reservation.outstandingCents > 0 && (
          <p className="confirmation-print-at-hotel">{say("reservation.access.atHotel")}</p>
        )}
        <p className="confirmation-print-taxes">{say("reservation.offer.taxes", { currency })}</p>
      </section>
      <footer className="confirmation-print-footer">
        <h2>{say("reservation.confirmation.thanks")}</h2>
        <p>{say("reservation.confirmation.printHelp")}</p>
        <a href={`tel:${phoneNumber}`}>{hotelPhone}</a>
        <a href={`mailto:${email}`}>{email}</a>
      </footer>
    </article>
  );
}
