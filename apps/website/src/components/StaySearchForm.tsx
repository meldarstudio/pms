import { useEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import {
  CalendarBlankIcon,
  CaretDownIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import { es, enUS } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Lang } from "@/i18n/utils";
import { resumeSearch, storeSearch } from "@/lib/reservation/draft";
import { formatDate, fill } from "@/lib/reservation/format";
import {
  addDays,
  DEFAULT_ADULTS,
  DEFAULT_CHILDREN,
  firstOnlineArrival,
  MAX_ADULTS_CHOICE,
  MAX_CHILDREN_CHOICE,
  MAX_NIGHTS,
  searchParams,
  searchProblems,
  type SearchProblem,
  type StaySearch,
} from "@/lib/reservation/search";

export type StaySearchCopy = {
  arrivalPlaceholder: string;
  departurePlaceholder: string;
  chooseArrival: string;
  chooseDeparture: string;
  stayHint: string;
  closeCalendar: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  adults: string;
  children: string;
  submit: string;
  decreaseAdults: string;
  increaseAdults: string;
  decreaseChildren: string;
  increaseChildren: string;
  adultsOne: string;
  adultsOther: string;
  childrenOne: string;
  childrenOther: string;
  problems: Record<SearchProblem | "checkInTooSoon", string>;
};

const limits = {
  adults: { min: 1, max: MAX_ADULTS_CHOICE },
  children: { min: 0, max: MAX_CHILDREN_CHOICE },
} as const;

const calendarLocales = { es, en: enUS } as const;

const englishDayName = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const calendarLabels = {
  es: undefined,
  en: {
    labelDayButton: (date: Date, modifiers: { today?: boolean; selected?: boolean }) => {
      const label = englishDayName.format(date);
      return `${modifiers.today ? "Today, " : ""}${label}${modifiers.selected ? ", selected" : ""}`;
    },
  },
} as const;

const labelClass =
  "font-source-sans-3 text-xs font-medium tracking-widest text-stone-600 uppercase";
const fieldButton =
  "h-11 min-h-11 w-full justify-between border-stone-400 bg-white px-3 font-source-sans-3 text-sm font-normal text-stone-900 shadow-none hover:bg-white aria-expanded:bg-white aria-expanded:text-stone-900";
const popoverSurface =
  "stay-search border border-stone-200 bg-white font-source-sans-3 text-sm text-stone-900 shadow-none ring-0";

function dateLabel(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function labelDate(label: string) {
  const [year, month, day] = label.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function guestSummary(copy: StaySearchCopy, adults: number, children: number) {
  const adultsLabel = adults === 1 ? copy.adultsOne : fill(copy.adultsOther, { count: adults });
  if (children < 1) return adultsLabel;
  const childrenLabel =
    children === 1 ? copy.childrenOne : fill(copy.childrenOther, { count: children });
  return `${adultsLabel}, ${childrenLabel}`;
}

type StayProblem = {
  field: "checkIn" | "checkOut";
  problem: keyof StaySearchCopy["problems"];
};

function stayProblems(checkIn: string, checkOut: string): StayProblem[] {
  if (checkIn && checkIn < firstOnlineArrival())
    return [{ field: "checkIn", problem: "checkInTooSoon" }];
  return searchProblems({
    checkIn,
    checkOut,
    adults: DEFAULT_ADULTS,
    children: DEFAULT_CHILDREN,
    room: null,
    plan: null,
  });
}

function StayDayButton({ day, ...props }: ComponentProps<typeof CalendarDayButton>) {
  return <CalendarDayButton day={day} {...props} data-date={dateLabel(day.date)} />;
}

function Stepper({
  label,
  value,
  min,
  max,
  decreaseLabel,
  increaseLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  decreaseLabel: string;
  increaseLabel: string;
  onChange: (next: number) => void;
}) {
  return (
    <Field orientation="horizontal">
      <FieldLabel className={labelClass}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 border-stone-400 bg-white"
          aria-label={decreaseLabel}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <MinusIcon />
        </Button>
        <span className="w-6 text-center text-base">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 border-stone-400 bg-white"
          aria-label={increaseLabel}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <PlusIcon />
        </Button>
      </div>
    </Field>
  );
}

function DateField({
  id,
  name,
  label,
  placeholder,
  lang,
  value,
  error,
  errorId,
  buttonRef,
  mobile,
}: {
  id: string;
  name: "checkIn" | "checkOut";
  label: string;
  placeholder: string;
  lang: Lang;
  value: string;
  error?: string;
  errorId: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  mobile: boolean;
}) {
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const Trigger = mobile ? DrawerTrigger : PopoverTrigger;

  return (
    <Field data-invalid={error ? true : undefined} className="data-[invalid=true]:text-stone-900">
      <FieldLabel id={labelId} htmlFor={id} className={labelClass}>
        {label}
      </FieldLabel>
      <Trigger
        id={id}
        render={
          <Button
            ref={buttonRef}
            type="button"
            variant="outline"
            className={fieldButton}
            aria-labelledby={`${labelId} ${valueId}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        }
      >
        <span
          id={valueId}
          className={
            value
              ? "min-w-0 truncate"
              : "min-w-0 text-left leading-tight whitespace-normal text-stone-500"
          }
        >
          {value ? formatDate(value, lang, { includeWeekday: false }) : placeholder}
        </span>
        <CalendarBlankIcon data-icon="inline-end" aria-hidden="true" />
      </Trigger>
      <input type="hidden" name={name} value={value} />
      <FieldError id={errorId} className="text-sm font-medium text-red-800">
        {error}
      </FieldError>
    </Field>
  );
}

function StayDateFields({
  lang,
  copy,
  side,
  checkIn,
  checkOut,
  checkInRef,
  checkOutRef,
  checkInError,
  checkOutError,
  onChange,
}: {
  lang: Lang;
  copy: StaySearchCopy;
  side: "top" | "bottom";
  checkIn: string;
  checkOut: string;
  checkInRef: RefObject<HTMLButtonElement | null>;
  checkOutRef: RefObject<HTMLButtonElement | null>;
  checkInError?: string;
  checkOutError?: string;
  onChange: (checkIn: string, checkOut: string) => void;
}) {
  const [picker, setPicker] = useState<
    | { kind: "closed" }
    | { kind: "open"; triggerId: string | null; selecting: "checkIn" | "checkOut" }
  >({ kind: "closed" });
  const open = picker.kind === "open";
  const triggerId = picker.kind === "open" ? picker.triggerId : null;
  const selecting = picker.kind === "open" ? picker.selecting : "checkIn";
  const [month, setMonth] = useState(() => new Date());
  const [mobile, setMobile] = useState(false);
  const [firstArrival, setFirstArrival] = useState(firstOnlineArrival);
  const firstArrivalDate = labelDate(firstArrival);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 48rem)");
    setMobile(!media.matches);
    const update = () => {
      setPicker({ kind: "closed" });
      setMobile(!media.matches);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const Root = mobile ? Drawer : Popover;
  const title = selecting === "checkIn" ? copy.chooseArrival : copy.chooseDeparture;
  const calendar = (
    <Calendar
      autoFocus
      mode="range"
      locale={calendarLocales[lang]}
      labels={calendarLabels[lang]}
      selected={{
        from: checkIn ? labelDate(checkIn) : undefined,
        to: checkOut ? labelDate(checkOut) : undefined,
      }}
      month={month}
      onMonthChange={setMonth}
      numberOfMonths={mobile ? 1 : 2}
      showOutsideDays={mobile}
      startMonth={new Date(firstArrivalDate.getFullYear(), firstArrivalDate.getMonth(), 1)}
      endMonth={new Date(firstArrivalDate.getFullYear() + 2, 11, 1)}
      today={labelDate(addDays(firstArrival, -1))}
      captionLayout="dropdown"
      min={1}
      max={MAX_NIGHTS}
      disabled={[
        { before: firstArrivalDate },
        ...(selecting === "checkOut" && checkIn
          ? [{ before: labelDate(checkIn) }, { after: labelDate(addDays(checkIn, MAX_NIGHTS)) }]
          : []),
      ]}
      className="mx-auto p-3 [--cell-size:clamp(2rem,calc((100vw-2.5rem)/7),2.25rem)]"
      components={{ DayButton: StayDayButton }}
      onSelect={(_, date) => {
        if (dateLabel(date) < firstOnlineArrival()) return;
        if (selecting === "checkOut" && dateLabel(date) === checkIn) return;
        if (selecting === "checkIn" || !checkIn) {
          onChange(dateLabel(date), "");
          setPicker((current) =>
            current.kind === "open" ? { ...current, selecting: "checkOut" } : current,
          );
        } else {
          onChange(checkIn, dateLabel(date));
          setPicker({ kind: "closed" });
        }
      }}
    />
  );

  return (
    <Root
      open={open}
      triggerId={triggerId}
      onOpenChange={(next: boolean, details: { trigger?: Element | null }) => {
        if (next) {
          const earliest = firstOnlineArrival();
          setFirstArrival(earliest);
          const departure = details.trigger?.id === "stay-check-out" && Boolean(checkIn);
          const date = departure ? checkOut || checkIn : checkIn;
          setMonth(labelDate(date && date >= earliest ? date : earliest));
          setPicker({
            kind: "open",
            selecting: departure ? "checkOut" : "checkIn",
            triggerId: details.trigger?.id ?? null,
          });
        } else setPicker({ kind: "closed" });
      }}
      {...(mobile ? { showSwipeHandle: true } : {})}
    >
      <DateField
        id="stay-check-in"
        name="checkIn"
        label={copy.checkIn}
        placeholder={copy.arrivalPlaceholder}
        lang={lang}
        value={checkIn}
        error={checkInError}
        errorId="stay-check-in-error"
        buttonRef={checkInRef}
        mobile={mobile}
      />
      <DateField
        id="stay-check-out"
        name="checkOut"
        label={copy.checkOut}
        placeholder={copy.departurePlaceholder}
        lang={lang}
        value={checkOut}
        error={checkOutError}
        errorId="stay-check-out-error"
        buttonRef={checkOutRef}
        mobile={mobile}
      />
      {mobile ? (
        <DrawerContent
          initialFocus={false}
          className="stay-search max-h-[calc(100dvh-1rem)] font-source-sans-3 motion-reduce:transition-none"
        >
          <DrawerHeader>
            <div className="flex items-center justify-between gap-3">
              <DrawerTitle aria-live="polite">{title}</DrawerTitle>
              <DrawerClose
                aria-label={copy.closeCalendar}
                render={<Button variant="ghost" size="icon" className="size-11 shrink-0" />}
              >
                <XIcon />
              </DrawerClose>
            </div>
            <DrawerDescription>
              {checkIn
                ? `${copy.checkIn}: ${formatDate(checkIn, lang, { includeWeekday: false })} · ${copy.checkOut}: ${checkOut ? formatDate(checkOut, lang, { includeWeekday: false }) : copy.departurePlaceholder}`
                : copy.stayHint}
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
            {calendar}
          </div>
        </DrawerContent>
      ) : (
        <PopoverContent
          side={side}
          align="start"
          initialFocus={false}
          className={`${popoverSurface} max-h-[calc(100dvh-1rem)] w-auto max-w-[calc(100vw-1rem)] gap-0 overflow-y-auto p-0`}
        >
          <PopoverHeader className="border-b border-stone-200 p-3">
            <PopoverTitle aria-live="polite">{title}</PopoverTitle>
          </PopoverHeader>
          {calendar}
        </PopoverContent>
      )}
    </Root>
  );
}

const styles = {
  card: "lg:py-6",
  grid: "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,14rem)_auto] lg:gap-4",
  guests: "lg:col-span-1",
  submit: "lg:col-span-1 lg:w-auto lg:whitespace-nowrap",
  side: "top",
} as const;

/** Navigates to `action` with the search, or hands it to `onSearch` to show in place. */
export default function StaySearchForm({
  lang,
  copy,
  ...target
}: {
  lang: Lang;
  copy: StaySearchCopy;
} & ({ action: string } | { onSearch: (search: StaySearch) => void })) {
  const action = "action" in target ? target.action : undefined;
  const checkInRef = useRef<HTMLButtonElement>(null);
  const checkOutRef = useRef<HTMLButtonElement>(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(DEFAULT_ADULTS);
  const [children, setChildren] = useState(DEFAULT_CHILDREN);
  const [open, setOpen] = useState(false);
  const [problems, setProblems] = useState<StayProblem[]>([]);
  const [ready, setReady] = useState(false);
  const summary = guestSummary(copy, adults, children);
  const problemFor = (field: "checkIn" | "checkOut") => {
    const problem = problems.find((item) => item.field === field);
    return problem ? copy.problems[problem.problem] : undefined;
  };

  useEffect(() => {
    const resumed = resumeSearch(new URLSearchParams(window.location.search), []);
    setCheckIn(resumed.checkIn);
    setCheckOut(resumed.checkOut);
    setAdults(Math.min(resumed.adults, limits.adults.max));
    setChildren(Math.min(resumed.children, limits.children.max));
    setReady(true);
  }, []);

  const onSubmit: ComponentProps<"form">["onSubmit"] = (event) => {
    event.preventDefault();
    setOpen(false);
    const search: StaySearch = { checkIn, checkOut, adults, children, room: null, plan: null };
    const next = stayProblems(checkIn, checkOut);
    setProblems(next);
    if (next[0]?.field === "checkIn") checkInRef.current?.focus();
    else if (next[0]?.field === "checkOut") checkOutRef.current?.focus();
    if (next.length) return;
    storeSearch(search);
    if ("action" in target)
      window.location.assign(`${target.action}?${searchParams(search).toString()}`);
    else target.onSearch(search);
  };

  return (
    <Card
      className={`stay-search overflow-visible border border-stone-200 bg-white font-source-sans-3 text-stone-900 shadow-none ring-0 ${styles.card}`}
    >
      <CardContent>
        <form action={action} method="get" noValidate onSubmit={onSubmit} aria-busy={!ready}>
          <FieldSet disabled={!ready}>
            <FieldGroup className={`grid grid-cols-2 items-end gap-3 ${styles.grid}`}>
              <StayDateFields
                lang={lang}
                copy={copy}
                side={styles.side}
                checkIn={checkIn}
                checkOut={checkOut}
                checkInError={problemFor("checkIn")}
                checkOutError={problemFor("checkOut")}
                checkInRef={checkInRef}
                checkOutRef={checkOutRef}
                onChange={(arrival, departure) => {
                  setCheckIn(arrival);
                  setCheckOut(departure);
                  setProblems((shown) => (shown.length ? stayProblems(arrival, departure) : shown));
                }}
              />
              <Field className={`col-span-2 ${styles.guests}`}>
                <FieldLabel id="stay-guests-label" className={labelClass}>
                  {copy.guests}
                </FieldLabel>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        className={fieldButton}
                        aria-labelledby="stay-guests-label stay-guests-value"
                      />
                    }
                  >
                    <span id="stay-guests-value" className="min-w-0 truncate">
                      {summary}
                    </span>
                    <CaretDownIcon data-icon="inline-end" />
                  </PopoverTrigger>
                  <PopoverContent
                    side={styles.side}
                    align="end"
                    className={`${popoverSurface} w-80`}
                  >
                    <PopoverHeader>
                      <PopoverTitle className={labelClass}>{copy.guests}</PopoverTitle>
                    </PopoverHeader>
                    <FieldGroup className="gap-3">
                      <Stepper
                        label={copy.adults}
                        value={adults}
                        min={limits.adults.min}
                        max={limits.adults.max}
                        decreaseLabel={copy.decreaseAdults}
                        increaseLabel={copy.increaseAdults}
                        onChange={setAdults}
                      />
                      <Stepper
                        label={copy.children}
                        value={children}
                        min={limits.children.min}
                        max={limits.children.max}
                        decreaseLabel={copy.decreaseChildren}
                        increaseLabel={copy.increaseChildren}
                        onChange={setChildren}
                      />
                    </FieldGroup>
                  </PopoverContent>
                </Popover>
              </Field>
              <Button
                type="submit"
                className={`col-span-2 h-11 min-h-11 w-full bg-accent-500 px-5 font-source-sans-3 text-sm font-medium tracking-widest whitespace-normal text-accent-950 uppercase hover:bg-accent-400 ${styles.submit}`}
              >
                {copy.submit}
              </Button>
              <input type="hidden" name="adults" value={adults} />
              <input type="hidden" name="children" value={children} />
            </FieldGroup>
          </FieldSet>
        </form>
      </CardContent>
    </Card>
  );
}
