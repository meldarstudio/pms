import { useMemo, useRef } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import type { Lang } from "@/i18n/utils";
import { getWhatsAppLink, phoneNumber } from "@/lib/constants";
import type { CardPayments } from "@/lib/reservation/checkout-runner";
import { formVisible, whatsappVisible } from "@/lib/reservation/checkout-selectors";
import { searchParams } from "@/lib/reservation/search";
import { ContactFields } from "./ContactFields";
import { ReviewContext } from "./context";
import { useFocusRegistry } from "./focus";
import { Outcome } from "./Outcome";
import { PaymentSection } from "./PaymentSection";
import { PaymentsToggle, usePaymentsPreview } from "./paymentsPreview";
import { ProblemPanel } from "./ProblemPanel";
import { ReviewSummary, type ReviewRoom } from "./ReviewSummary";
import { stayLabels } from "./stay";
import { sayFrom, type ReviewText } from "./text";
import { quietLink } from "./styles";
import { useCheckoutFlow } from "./useCheckoutFlow";
import { WhatsAppFallback } from "./WhatsAppFallback";

type Props = {
  lang: Lang;
  apiBase: string;
  payments: CardPayments | null;
  devPayments: CardPayments | null;
  chooseHref: string;
  summaryHref: string;
  whatsappHref: string;
  text: ReviewText;
  rooms: Record<string, ReviewRoom>;
};

export default function Review({
  lang,
  apiBase,
  payments: builtPayments,
  devPayments,
  chooseHref,
  summaryHref,
  whatsappHref,
  text,
  rooms,
}: Props) {
  const say = useMemo(() => sayFrom(text), [text]);
  const context = useMemo(() => ({ lang, say }), [lang, say]);
  const roomTypeIds = useMemo(
    () => Object.fromEntries(Object.entries(rooms).map(([id, room]) => [id, room.pmsRoomTypeId])),
    [rooms],
  );
  const { payments, known } = usePaymentsPreview(builtPayments, devPayments);
  const focus = useFocusRegistry();
  const securityContainer = useRef<HTMLDivElement>(null);
  const { state, search, dispatch } = useCheckoutFlow({
    lang,
    apiBase,
    summaryHref,
    payments,
    paymentsKnown: known,
    roomTypeIds,
    securityContainer,
    focus,
  });
  const room = search?.room ? (rooms[search.room] ?? null) : null;
  const ratesHref = search ? `${chooseHref}?${searchParams(search)}` : chooseHref;
  const choiceHref = search
    ? `${chooseHref}?${searchParams(search, { withChoice: false })}`
    : chooseHref;
  const { view } = state;
  const whatsappLink =
    view && room
      ? (() => {
          const stay = stayLabels(view, say, lang);
          return getWhatsAppLink(
            say("reservation.review.whatsapp.message", {
              room: room.name,
              checkIn: stay.checkIn,
              checkOut: stay.checkOut,
              guests: stay.guests,
              plan: stay.plan,
              total: stay.money(view.quote.totalCents),
            }),
          );
        })()
      : whatsappHref;

  return (
    <ReviewContext value={context}>
      <div className="md:mt-2">
        <a
          href={ratesHref}
          className="font-source-sans-3 hover:text-accent-800 inline-flex min-h-11 items-center gap-2 text-xs font-medium tracking-widest text-stone-900 uppercase"
          data-back-to-rates
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4 shrink-0" />
          {say("reservation.review.backToRates")}
        </a>
        <h1 className="mt-1 text-2xl font-semibold text-pretty text-stone-900 md:text-3xl">
          {say("reservation.review.title")}
        </h1>
        <p className="mt-2 max-w-xl leading-relaxed text-stone-600">
          {say(payments ? "reservation.review.lead" : "reservation.review.unavailableLead")}
        </p>
        <p
          className={`mt-6 text-stone-700 empty:hidden ${state.status.visible ? "" : "sr-only"}`}
          role="status"
          data-status
        >
          {state.status.key ? say(state.status.key) : ""}
        </p>
        <ProblemPanel
          problem={state.problem}
          roomName={room?.name ?? ""}
          backHref={choiceHref}
          titleRef={focus.ref("problemTitle")}
          onRetry={() => dispatch({ type: "loadRequested" })}
        />
        <div
          className="mt-4 grid items-start gap-4 md:mt-6 md:gap-6 [overflow-wrap:anywhere] lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12"
          data-review
          hidden={!state.reviewShown}
        >
          <ReviewSummary view={view} room={room} ratesHref={ratesHref} choiceHref={choiceHref} />
          <div
            className="min-w-0 border border-stone-200 bg-white lg:col-start-1 lg:row-start-1"
            data-workflow
          >
            {!payments && <WhatsAppFallback href={whatsappLink} hidden={!whatsappVisible(state)} />}
            <form
              className="divide-y divide-stone-200"
              noValidate
              aria-labelledby="review-contact review-payment"
              data-contact-form
              hidden={!formVisible(state)}
              onSubmit={(event) => {
                event.preventDefault();
                dispatch({ type: "payRequested" });
              }}
            >
              <ContactFields
                contact={state.contact}
                errors={state.fieldErrors}
                focus={focus}
                onEdit={(field, value) => dispatch({ type: "contactEdited", field, value })}
                onEditPhone={(phone) => dispatch({ type: "phoneEdited", phone })}
              />
              <PaymentSection
                state={state}
                focus={focus}
                securityContainer={securityContainer}
                onAgree={(agreed) => dispatch({ type: "agreeToggled", agreed })}
              />
            </form>
            <Outcome
              state={state}
              focus={focus}
              onRetry={() => dispatch({ type: "payAgainRequested" })}
              onBank={() => dispatch({ type: "bankRequested" })}
              onCheck={() => dispatch({ type: "statusCheckRequested" })}
              onCopy={() => dispatch({ type: "accessCopyRequested" })}
            />
          </div>
        </div>
        <div
          id="reservation-help"
          className="mt-6 scroll-mt-24 border-t border-stone-300 pt-4 text-sm text-stone-700"
        >
          <p>{say("reservation.review.alternativeBooking")}</p>
          <div className="flex flex-wrap gap-x-6">
            <a href={`tel:${phoneNumber}`} className={quietLink} data-reservation-call>
              {say("reservation.review.call")}
            </a>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className={quietLink}
              data-reservation-help
            >
              {say("reservation.review.bookViaWhatsapp")}
            </a>
          </div>
        </div>
        {import.meta.env.DEV && known && <PaymentsToggle lang={lang} on={Boolean(payments)} />}
      </div>
    </ReviewContext>
  );
}
