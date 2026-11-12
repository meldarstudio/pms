import type { ContactDraft } from "@/lib/reservation/checkout";
import type { FieldErrors } from "@/lib/reservation/checkout-form";
import type { PhoneValue } from "@/lib/reservation/phone";
import type { FocusRegistry } from "./focus";
import { useReview } from "./context";
import { PhoneField } from "./PhoneField";
import { card, cardTitle, error, field, label } from "./styles";

const MAX_NOTES = 2000;

const textFields = ["fullName", "email"] as const;

const attributes = {
  fullName: { type: "text", autoComplete: "name", inputMode: "text", autoCapitalize: "words" },
  email: { type: "email", autoComplete: "email", inputMode: "email", autoCapitalize: "off" },
} as const satisfies Record<(typeof textFields)[number], object>;

export function ContactFields({
  contact,
  errors,
  focus,
  onEdit,
  onEditPhone,
}: {
  contact: ContactDraft;
  errors: FieldErrors;
  focus: FocusRegistry;
  onEdit: (field: "fullName" | "email" | "notes", value: string) => void;
  onEditPhone: (phone: PhoneValue) => void;
}) {
  const { say } = useReview();
  return (
    <section className={card} aria-labelledby="review-contact">
      <h2 id="review-contact" className={cardTitle}>
        {say("reservation.review.contact")}
      </h2>
      <p className="mt-2 leading-relaxed text-stone-600">{say("reservation.review.contactLead")}</p>
      <div className="mt-6 flex flex-col gap-5">
        {textFields.map((id) => {
          const message = errors[id];
          return (
            <div key={id}>
              <label htmlFor={id} className={label}>
                {say(`reservation.review.${id}`)}
              </label>
              <input
                ref={focus.ref(id)}
                id={id}
                name={id}
                {...attributes[id]}
                spellCheck="false"
                required
                maxLength={200}
                className={field}
                aria-describedby={`${id}-error`}
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
        <PhoneField
          value={contact.phone}
          message={errors.phone}
          focus={focus}
          onEdit={onEditPhone}
        />
        <div>
          <label htmlFor="notes" className={label}>
            {say("reservation.review.notes")}
          </label>
          <p id="notes-hint" className="mt-1 text-sm text-stone-600">
            {say("reservation.review.notesHint")}
          </p>
          <textarea
            ref={focus.ref("notes")}
            id="notes"
            name="notes"
            rows={4}
            autoComplete="off"
            autoCapitalize="sentences"
            maxLength={MAX_NOTES}
            className={`${field} resize-y py-3`}
            aria-describedby="notes-hint notes-error"
            aria-invalid={errors.notes ? true : undefined}
            value={contact.notes}
            onChange={(event) => onEdit("notes", event.target.value)}
          />
          <p id="notes-error" className={error} hidden={!errors.notes}>
            {errors.notes ? say(errors.notes) : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
