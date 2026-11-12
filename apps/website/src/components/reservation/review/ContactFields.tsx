import type { BookingContact } from "@/lib/reservation/checkout";
import {
  contactFields,
  type ContactField,
  type FieldErrors,
} from "@/lib/reservation/checkout-form";
import type { FocusRegistry } from "./focus";
import { useReview } from "./context";
import { card, cardTitle, error, field, label } from "./styles";

const attributes = {
  fullName: { type: "text", autoComplete: "name", inputMode: "text", autoCapitalize: "words" },
  email: { type: "email", autoComplete: "email", inputMode: "email", autoCapitalize: "off" },
  phone: { type: "tel", autoComplete: "tel", inputMode: "tel", autoCapitalize: "off" },
} as const satisfies Record<ContactField, object>;

export function ContactFields({
  contact,
  errors,
  focus,
  onEdit,
}: {
  contact: BookingContact;
  errors: FieldErrors;
  focus: FocusRegistry;
  onEdit: (field: ContactField, value: string) => void;
}) {
  const { say } = useReview();
  return (
    <section className={card} aria-labelledby="review-contact">
      <h2 id="review-contact" className={cardTitle}>
        {say("reservation.review.contact")}
      </h2>
      <p className="mt-2 leading-relaxed text-stone-600">{say("reservation.review.contactLead")}</p>
      <div className="mt-6 flex flex-col gap-5">
        {contactFields.map((id) => {
          const message = errors[id];
          return (
            <div key={id}>
              <label htmlFor={id} className={label}>
                {say(`reservation.review.${id}`)}
              </label>
              {id === "phone" && (
                <p id="phone-hint" className="mt-1 text-sm text-stone-600">
                  {say("reservation.review.phoneHint")}
                </p>
              )}
              <input
                ref={focus.ref(id)}
                id={id}
                name={id}
                {...attributes[id]}
                spellCheck="false"
                required
                maxLength={id === "phone" ? 40 : 200}
                className={field}
                aria-describedby={id === "phone" ? "phone-hint phone-error" : `${id}-error`}
                aria-invalid={message ? true : undefined}
                value={contact[id]}
                onChange={(event) => onEdit(id, event.target.value)}
              />
              <p id={`${id}-error`} className={error} hidden={!message}>
                {message ? say(message) : ""}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
