<script lang="ts">
  import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxTrigger,
    createComboboxController,
  } from "@ui-sdk/svelte/combobox";
  import { tick } from "svelte";
  import {
    choosePhoneCountry,
    isPhoneCountry,
    phoneCountries,
    phoneCountry,
    type PhoneDraft,
  } from "@pms/shared/phone";
  import { flagUrl } from "@/lib/reservation/flags";
  import { getReview } from "./review-context";
  import { control, error, label } from "./styles";
  import PhoneInput from "./PhoneInput.svelte";

  let {
    value,
    message,
    onEdit,
  }: {
    value: PhoneDraft;
    message: string | null;
    onEdit: (value: PhoneDraft) => void;
  } = $props();
  const { say, lang } = getReview();
  const countries = phoneCountries(lang).map(({ code, name, callingCode }) => ({
    value: code,
    label: `${name} ${callingCode}`,
  }));
  const labels = new Map(countries.map((item) => [item.value, item.label]));
  const country = $derived(phoneCountry(lang, value.country));
  const combo = createComboboxController();
  let anchor = $state<HTMLDivElement>();
  let query = $state("");
</script>

{#snippet flag(code: string)}
  {@const src = flagUrl(code)}
  {#if src}
    <img
      {src}
      alt=""
      loading="lazy"
      decoding="async"
      class="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
    />
  {/if}
{/snippet}

<div>
  <label for="phone" class={label}>{say("reservation.review.phone")}</label>
  <div class="mt-2 flex" role="group">
    <div bind:this={anchor} class="flex">
      <Combobox
        controller={combo}
        items={countries}
        value={country.code}
        itemToLabel={(code) => labels.get(code) ?? code}
        bind:query
        autoHighlight
        onValueChange={(code) => {
          if (isPhoneCountry(code)) onEdit(choosePhoneCountry(value, code));
        }}
        onOpenChange={(open, { reason }) => {
          if (open) {
            query = "";
            void tick().then(() => combo.focus());
          } else if (reason === "item-press" || reason === "escape-key") {
            void tick().then(() => anchor?.querySelector("button")?.focus({ preventScroll: true }));
          }
        }}
      >
        <ComboboxTrigger
          aria-label={say("reservation.review.phoneCountry", {
            name: country.name,
            code: country.callingCode,
          })}
          data-invalid={message ? "" : undefined}
          class="relative inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-2 border border-stone-400 bg-white px-3 text-base text-stone-900 hover:bg-stone-50 focus-visible:z-10 data-invalid:border-red-700"
        >
          {@render flag(country.code)}
          {country.callingCode}
        </ComboboxTrigger>
        <ComboboxContent
          {anchor}
          sideOffset={4}
          align="start"
          class="w-[min(20rem,calc(100vw-2rem))] border border-stone-300 bg-white p-2 text-sm text-stone-900 shadow-lg"
        >
          <ComboboxInput
            class="w-full border border-stone-300 px-3 py-2 text-base"
            placeholder={say("reservation.review.phoneCountrySearch")}
            aria-label={say("reservation.review.phoneCountrySearch")}
          />
          <ComboboxEmpty class="px-3 py-2 text-stone-600">
            {say("reservation.review.phoneCountryEmpty")}
          </ComboboxEmpty>
          <ComboboxList class="mt-1 max-h-60 overflow-y-auto overscroll-contain">
            {#snippet children(state)}
              {#each state.items as item (typeof item === "object" && "value" in item ? item.value : item)}
                {#if typeof item === "object" && "value" in item && isPhoneCountry(item.value)}
                  <ComboboxItem
                    value={item.value}
                    label={item.label}
                    class="flex cursor-pointer items-center gap-2 px-3 py-2 data-highlighted:bg-accent-50 data-selected:font-semibold"
                  >
                    {@render flag(item.value)}
                    {item.label}
                  </ComboboxItem>
                {/if}
              {/each}
            {/snippet}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
    <PhoneInput
      id="phone"
      name="phone"
      data-checkout-focus="phone"
      {value}
      {onEdit}
      spellcheck="false"
      required
      maxlength={40}
      class={`${control} -ml-px min-w-0 flex-1 aria-invalid:relative aria-invalid:z-10`}
      aria-describedby="phone-error"
      aria-invalid={message ? true : undefined}
    />
  </div>
  <p id="phone-error" class={error} hidden={!message}>{message ? say(message) : ""}</p>
</div>
