import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useReview } from "./context";
import { card, cardTitle, primary, quietLink } from "./styles";

export function WhatsAppFallback({ href, hidden }: { href: string; hidden: boolean }) {
  const { say, conditionsHref } = useReview();
  return (
    <section className={card} aria-labelledby="review-whatsapp" data-whatsapp hidden={hidden}>
      <h2 id="review-whatsapp" className={cardTitle}>
        {say("reservation.review.whatsapp.title")}
      </h2>
      <p className="mt-4 leading-relaxed text-stone-700">
        {say("reservation.review.whatsapp.body")}
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-6 w-full ${primary}`}
        data-whatsapp-link
      >
        {say("reservation.review.whatsapp.button")}
        <span className="sr-only">({say("reservation.review.whatsapp.newTab")})</span>
        <ArrowSquareOutIcon aria-hidden="true" className="size-4.5 shrink-0" />
      </a>
      <p className="mt-4 text-sm text-stone-600">{say("reservation.review.whatsapp.note")}</p>
      <a href={conditionsHref} className={`mt-2 ${quietLink}`}>
        {say("reservation.review.conditionsLink")}
      </a>
    </section>
  );
}
