import type { RefCallback } from "react";
import {
  CheckIcon,
  CircleNotchIcon,
  PhoneIcon,
  PrinterIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { Separator } from "@/components/ui/separator";
import { address, phoneNumber, whatsappUrl } from "@/lib/constants";
import type { AccessState } from "@/lib/reservation/checkout-flow";
import { formatMoney } from "@/lib/reservation/format";
import { summaryLink } from "@/lib/reservation/summary";
import { useReview } from "./context";
import { PrintConfirmation, type SavedConfirmation } from "./PrintConfirmation";
import { stayLabels } from "./stay";
import { primary, secondary } from "./styles";
import "./confirmation.css";

export function Confirmation({
  view,
  room,
  reservation,
  currency,
  access,
  titleRef,
  summaryHref,
  onAccessRetry,
}: SavedConfirmation & {
  access: AccessState;
  titleRef: RefCallback<HTMLElement>;
  summaryHref: string;
  onAccessRetry: () => void;
}) {
  const { say, lang } = useReview();
  const stay = stayLabels(view, say, lang);
  const money = (cents: number) => formatMoney(cents, currency);
  const printConfirmation = () => {
    const title = document.title;
    document.title = `${say("reservation.confirmation.printTitle")} ${reservation.code} · Hotel Manantial`;
    try {
      window.print();
    } finally {
      document.title = title;
    }
  };
  const title = (
    <>
      <p className="confirmation-kicker">
        <CheckIcon aria-hidden="true" />
        {say("reservation.outcome.confirmed.title")}
      </p>
      <h1 id="review-outcome-title" ref={titleRef} tabIndex={-1} data-outcome-title>
        {say("reservation.confirmation.welcome")}
      </h1>
      <p className="confirmation-intro">{say("reservation.outcome.confirmed.body")}</p>
    </>
  );
  const reference = (
    <div className="confirmation-reference">
      <p className="confirmation-label">{say("reservation.outcome.reference")}</p>
      <p className="confirmation-code" data-confirmation-reference>
        {reservation.code}
      </p>
    </div>
  );
  const stayDetails = (
    <section className="confirmation-stay" aria-label={say("reservation.review.stay")}>
      <img src={room.photo.src} alt={room.photo.alt} width={160} height={120} />
      <div>
        <p className="confirmation-label">{say("reservation.review.stay")}</p>
        <h2 data-stay="room">{room.name}</h2>
        <p>{room.beds}</p>
        <p className="confirmation-stay-line">{stay.compact}</p>
        <p>
          {stay.guests} · {stay.plan}
        </p>
      </div>
      <dl className="confirmation-dates">
        <div>
          <dt>{say("reservation.review.checkIn")}</dt>
          <dd>{stay.checkIn}</dd>
        </div>
        <div>
          <dt>{say("reservation.review.checkOut")}</dt>
          <dd>{stay.checkOut}</dd>
        </div>
      </dl>
    </section>
  );
  const amounts = (
    <section
      className="confirmation-amounts"
      aria-label={say("reservation.confirmation.paymentLabel")}
    >
      <dl>
        <div>
          <dt>{say("reservation.offer.total")}</dt>
          <dd>{money(view.quote.totalCents)}</dd>
        </div>
        <div>
          <dt>{say("reservation.outcome.paid")}</dt>
          <dd>{money(reservation.paidCents)}</dd>
        </div>
        <div className="confirmation-balance">
          <dt>{say("reservation.outcome.outstanding")}</dt>
          <dd>{money(reservation.outstandingCents)}</dd>
        </div>
      </dl>
      {reservation.outstandingCents > 0 && <p>{say("reservation.access.atHotel")}</p>}
      <p className="confirmation-tax">{say("reservation.offer.taxes", { currency })}</p>
    </section>
  );
  const welcomeAccess = (
    <section className="confirmation-welcome-access" aria-labelledby="confirmation-access-title">
      <h2 id="confirmation-access-title">{say("reservation.confirmation.accessTitle")}</h2>
      <p>{say("reservation.confirmation.accessBody")}</p>
      <div className="confirmation-link-actions">
        {access.kind === "unavailable" ? (
          <button type="button" className={primary} onClick={onAccessRetry} data-access-retry>
            {say("reservation.access.retry")}
          </button>
        ) : access.kind === "available" ? (
          <a
            className={primary}
            href={summaryLink(summaryHref, access.token)}
            referrerPolicy="no-referrer"
            data-access-view
          >
            {say("reservation.access.view")}
          </a>
        ) : (
          <button type="button" className={primary} disabled aria-busy="true" data-access-loading>
            <CircleNotchIcon className="confirmation-spinner" aria-hidden="true" />
            {say("reservation.confirmation.preparing")}
          </button>
        )}
        <button
          type="button"
          className={secondary}
          onClick={printConfirmation}
          data-confirmation-print
        >
          <PrinterIcon aria-hidden="true" />
          {say("reservation.confirmation.print")}
        </button>
      </div>
      <p
        className={access.kind === "unavailable" ? "confirmation-link-status" : "sr-only"}
        role="status"
        data-access-status
      >
        {access.kind === "unavailable"
          ? say("reservation.access.unavailable.confirmed")
          : access.kind === "loading" || access.kind === "idle"
            ? say("reservation.access.loading")
            : ""}
      </p>
    </section>
  );
  const welcomeHelp = (
    <section
      className="confirmation-help confirmation-welcome-help"
      aria-labelledby="confirmation-help-title"
    >
      <h2 id="confirmation-help-title">{say("reservation.confirmation.helpTitle")}</h2>
      <p>{say("reservation.confirmation.helpBody")}</p>
      <div className="confirmation-contact-actions">
        <a href={`tel:${phoneNumber}`} data-reservation-call>
          <PhoneIcon aria-hidden="true" />
          {say("reservation.confirmation.call")}
        </a>
        <a href={whatsappUrl} data-reservation-help target="_blank" rel="noreferrer">
          <WhatsappLogoIcon aria-hidden="true" />
          {say("reservation.confirmation.whatsapp")}
        </a>
      </div>
      <p className="confirmation-hotel-address">{address}</p>
    </section>
  );

  return (
    <section
      className="checkout-confirmation"
      data-confirmed="true"
      data-outcome
      data-confirmation
      aria-labelledby="review-outcome-title"
    >
      <div className="confirmation-welcome">
        <header>
          {title}
          {reference}
        </header>
        <div className="confirmation-welcome-body">
          <div>
            {stayDetails}
            <Separator />
            {amounts}
          </div>
          <aside>
            {welcomeAccess}
            {welcomeHelp}
          </aside>
        </div>
        <PrintConfirmation view={view} room={room} reservation={reservation} currency={currency} />
      </div>
    </section>
  );
}
