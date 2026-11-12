import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  const [notesExpanded, setNotesExpanded] = useState<boolean | null>(null);
  return (
    <section className={card} aria-labelledby="review-contact">
      <h2 id="review-contact" className={cardTitle}>
        {say("reservation.review.contact")}
      </h2>
      <p className="mt-2 leading-relaxed text-stone-600">{say("reservation.review.contactLead")}</p>
      <div className="mt-4 flex flex-col gap-4 md:mt-6 md:gap-5">
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
        <Accordion
          className="border-t border-stone-200"
          value={
            Boolean(errors.notes) || (notesExpanded ?? Boolean(contact.notes)) ? ["notes"] : []
          }
          onValueChange={(value) => setNotesExpanded(value.includes("notes"))}
          data-reservation-notes
        >
          <AccordionItem value="notes" className="border-b-0">
            <AccordionTrigger variant="compact">{say("reservation.review.notes")}</AccordionTrigger>
            <AccordionContent keepMounted className="px-1 pb-1">
              <label htmlFor="notes" className="sr-only">
                {say("reservation.review.notes")}
              </label>
              <textarea
                ref={focus.ref("notes")}
                id="notes"
                name="notes"
                rows={4}
                autoComplete="off"
                autoCapitalize="sentences"
                maxLength={MAX_NOTES}
                className={`${field} resize-y py-3`}
                aria-describedby="notes-error"
                aria-invalid={errors.notes ? true : undefined}
                value={contact.notes}
                onChange={(event) => onEdit("notes", event.target.value)}
              />
              <p id="notes-error" className={error} hidden={!errors.notes}>
                {errors.notes ? say(errors.notes) : ""}
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}
