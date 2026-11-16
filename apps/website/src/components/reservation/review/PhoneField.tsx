import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { flagUrl } from "@/lib/reservation/flags";
import {
  choosePhoneCountry,
  phoneCountries,
  phoneCountry,
  type PhoneCountry,
  type PhoneDraft,
} from "@pms/shared/phone";
import type { FocusRegistry } from "./focus";
import { useReview } from "./context";
import { PhoneInput } from "./PhoneInput";
import { control, error, label } from "./styles";

function CountryFlag({ code }: { code: string }) {
  const src = flagUrl(code);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
    />
  );
}

export function PhoneField({
  value,
  message,
  focus,
  onEdit,
}: {
  value: PhoneDraft;
  message: string | null;
  focus: FocusRegistry;
  onEdit: (value: PhoneDraft) => void;
}) {
  const { say, lang } = useReview();
  const countries = useMemo(() => phoneCountries(lang), [lang]);
  const country = phoneCountry(lang, value.country);
  return (
    <div>
      <label htmlFor="phone" className={label}>
        {say("reservation.review.phone")}
      </label>
      <div className="mt-2 flex" role="group">
        <Combobox<PhoneCountry>
          items={countries}
          value={country}
          onValueChange={(next) => {
            if (next) onEdit(choosePhoneCountry(value, next.code));
          }}
          itemToStringLabel={(item) => `${item.name} ${item.callingCode}`}
          isItemEqualToValue={(item, selected) => item.code === selected.code}
        >
          <ComboboxTrigger
            type="button"
            aria-label={say("reservation.review.phoneCountry", {
              name: country.name,
              code: country.callingCode,
            })}
            data-invalid={message ? "" : undefined}
            className="relative inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-2 border border-stone-400 bg-white px-3 text-base text-stone-900 hover:bg-stone-50 focus-visible:z-10 data-invalid:border-red-700"
          >
            <CountryFlag code={country.code} />
            {country.callingCode}
          </ComboboxTrigger>
          <ComboboxContent className="w-[min(20rem,calc(100vw-2rem))]">
            <ComboboxInput
              placeholder={say("reservation.review.phoneCountrySearch")}
              aria-label={say("reservation.review.phoneCountrySearch")}
            />
            <ComboboxEmpty>{say("reservation.review.phoneCountryEmpty")}</ComboboxEmpty>
            <ComboboxList>
              {(item: PhoneCountry) => (
                <ComboboxItem key={item.code} value={item}>
                  <CountryFlag code={item.code} />
                  {item.name} {item.callingCode}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <PhoneInput
          id="phone"
          name="phone"
          inputRef={focus.ref("phone")}
          value={value}
          spellCheck="false"
          required
          maxLength={40}
          className={`${control} -ml-px min-w-0 flex-1 aria-invalid:relative aria-invalid:z-10`}
          aria-describedby="phone-error"
          aria-invalid={message ? true : undefined}
          onChange={onEdit}
        />
      </div>
      <p id="phone-error" className={error} hidden={!message}>
        {message ? say(message) : ""}
      </p>
    </div>
  );
}
