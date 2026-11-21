<script lang="ts">
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion";
  import { CaretDown } from "phosphor-svelte";
  import type { ContactDraft } from "@/lib/reservation/checkout";
  import type { FieldErrors } from "@/lib/reservation/checkout-form";
  import type { PhoneDraft } from "@pms/shared/phone";
  import { getReview } from "./review-context";
  import PhoneField from "./PhoneField.svelte";
  import { card, cardTitle, error, field, label } from "./styles";

  let {
    contact,
    errors,
    onEdit,
    onEditPhone,
  }: {
    contact: ContactDraft;
    errors: FieldErrors;
    onEdit: (field: "fullName" | "email" | "notes", value: string) => void;
    onEditPhone: (phone: PhoneDraft) => void;
  } = $props();
  const { say, privacyHref } = getReview();
  const [leadBefore, leadAfter] = say("reservation.review.contactLead").split("{privacy}");
  const textFields = ["fullName", "email"] as const;
  const attributes = {
    fullName: { type: "text", autocomplete: "name", inputmode: "text", autocapitalize: "words" },
    email: { type: "email", autocomplete: "email", inputmode: "email", autocapitalize: "off" },
  } as const;
  let notesExpanded = $state<boolean | null>(null);
  const openNotes = $derived(Boolean(errors.notes) || (notesExpanded ?? Boolean(contact.notes)));
</script>

<section class={card} aria-labelledby="review-contact">
  <h2 id="review-contact" class={cardTitle}>{say("reservation.review.contact")}</h2>
  <p class="mt-2 leading-relaxed text-stone-600">
    {leadBefore}<a href={privacyHref} class="text-accent-800 underline underline-offset-4">
      {say("reservation.review.privacyLink")}
    </a>{leadAfter}
  </p>
  <div class="mt-4 flex flex-col gap-4 md:mt-6 md:gap-5">
    {#each textFields as id (id)}
      {@const message = errors[id]}
      <div>
        <label for={id} class={label}>{say(`reservation.review.${id}`)}</label>
        <input
          {id}
          name={id}
          {...attributes[id]}
          spellcheck="false"
          required
          maxlength={200}
          class={field}
          aria-describedby={`${id}-error`}
          aria-invalid={message ? true : undefined}
          data-checkout-focus={id}
          value={contact[id]}
          oninput={(event) => onEdit(id, event.currentTarget.value)}
        />
        <p id={`${id}-error`} class={error} hidden={!message}>{message ? say(message) : ""}</p>
      </div>
    {/each}
    <PhoneField value={contact.phone} message={errors.phone} onEdit={onEditPhone} />
    <Accordion
      value={openNotes ? ["notes"] : []}
      onValueChange={(value) => {
        notesExpanded = value.includes("notes");
      }}
      keepMounted
      data-reservation-notes
    >
      <AccordionItem value="notes">
        <AccordionHeader>
          <AccordionTrigger
            class={`group -my-3 flex min-h-11 w-full cursor-pointer items-center gap-1.5 text-left hover:text-accent-800 ${label}`}
          >
            {say("reservation.review.notes")}
            <CaretDown
              aria-hidden="true"
              class="size-3.5 shrink-0 text-stone-500 transition-transform duration-170 ease-(--booking-ease-out) group-aria-expanded:rotate-180 motion-reduce:transition-none"
            />
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <label for="notes" class="sr-only">{say("reservation.review.notes")}</label>
          <textarea
            id="notes"
            name="notes"
            rows="4"
            autocomplete="off"
            autocapitalize="sentences"
            maxlength={2000}
            class={`${field} resize-y py-3`}
            aria-describedby="notes-error"
            aria-invalid={errors.notes ? true : undefined}
            data-checkout-focus="notes"
            value={contact.notes}
            oninput={(event) => onEdit("notes", event.currentTarget.value)}></textarea>
          <p id="notes-error" class={error} hidden={!errors.notes}>
            {errors.notes ? say(errors.notes) : ""}
          </p>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  </div>
</section>
