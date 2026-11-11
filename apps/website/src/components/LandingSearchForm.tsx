import { useEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import { CalendarBlankIcon, CaretDownIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { es, enUS } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Lang } from "@/i18n/utils";
import { formatDate, fill } from "@/lib/reservation/format";
import {
  addDays,
  DEFAULT_ADULTS,
  MAX_ADULTS_CHOICE,
  MAX_CHILDREN_CHOICE,
  MAX_NIGHTS,
  searchParams,
  searchProblems,
  type SearchProblem,
} from "@/lib/reservation/search";

export type LandingSearchCopy = {
  arrivalPlaceholder: string;
  departurePlaceholder: string;
  chooseArrival: string;
  chooseDeparture: string;
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

const labelClass =
  "font-source-sans-3 text-xs font-medium tracking-widest text-stone-600 uppercase";
const fieldButton =
  "h-11 min-h-11 w-full justify-between border-stone-400 bg-white px-3 font-source-sans-3 text-sm font-normal text-stone-900 shadow-none hover:bg-white aria-expanded:bg-white aria-expanded:text-stone-900";
const popoverSurface =
  "landing-search border-stone-300 bg-white font-source-sans-3 text-sm text-stone-900 shadow-sm ring-0";

function dateLabel(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function labelDate(label: string) {
  const [year, month, day] = label.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function earliestArrival() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return addDays(today, 1);
}

function guestSummary(copy: LandingSearchCopy, adults: number, children: number) {
  const adultsLabel = adults === 1 ? copy.adultsOne : fill(copy.adultsOther, { count: adults });
  if (children < 1) return adultsLabel;
  const childrenLabel =
    children === 1 ? copy.childrenOne : fill(copy.childrenOther, { count: children });
  return `${adultsLabel}, ${childrenLabel}`;
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
}) {
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;

  return (
    <Field data-invalid={error ? true : undefined} className="data-[invalid=true]:text-stone-900">
      <FieldLabel id={labelId} htmlFor={id} className={labelClass}>
        {label}
      </FieldLabel>
      <PopoverTrigger
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
      </PopoverTrigger>
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
  checkIn,
  checkOut,
  checkInRef,
  checkOutRef,
  checkInError,
  checkOutError,
  onChange,
}: {
  lang: Lang;
  copy: LandingSearchCopy;
  checkIn: string;
  checkOut: string;
  checkInRef: RefObject<HTMLButtonElement | null>;
  checkOutRef: RefObject<HTMLButtonElement | null>;
  checkInError?: string;
  checkOutError?: string;
  onChange: (checkIn: string, checkOut: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [triggerId, setTriggerId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<"checkIn" | "checkOut">("checkIn");
  const [month, setMonth] = useState(() => new Date());
  const [numberOfMonths, setNumberOfMonths] = useState(1);
  const [firstArrival, setFirstArrival] = useState(earliestArrival);
  const firstArrivalDate = labelDate(firstArrival);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 48rem)");
    const update = () => setNumberOfMonths(media.matches ? 2 : 1);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <Popover
      open={open}
      triggerId={triggerId}
      onOpenChange={(next, details) => {
        if (next) {
          const earliest = earliestArrival();
          setFirstArrival(earliest);
          const departure = details.trigger?.id === "landing-check-out" && Boolean(checkIn);
          const date = departure ? checkOut || checkIn : checkIn;
          setMonth(labelDate(date && date >= earliest ? date : earliest));
          setSelecting(departure ? "checkOut" : "checkIn");
          setTriggerId(details.trigger?.id ?? null);
        }
        setOpen(next);
      }}
    >
      <DateField
        id="landing-check-in"
        name="checkIn"
        label={copy.checkIn}
        placeholder={copy.arrivalPlaceholder}
        lang={lang}
        value={checkIn}
        error={checkInError}
        errorId="landing-check-in-error"
        buttonRef={checkInRef}
      />
      <DateField
        id="landing-check-out"
        name="checkOut"
        label={copy.checkOut}
        placeholder={copy.departurePlaceholder}
        lang={lang}
        value={checkOut}
        error={checkOutError}
        errorId="landing-check-out-error"
        buttonRef={checkOutRef}
      />
      <PopoverContent
        side="top"
        align="start"
        initialFocus={false}
        className={`${popoverSurface} max-h-[calc(100dvh-1rem)] w-auto max-w-[calc(100vw-1rem)] gap-0 overflow-y-auto p-0`}
      >
        <PopoverHeader className="border-b border-stone-200 p-3">
          <PopoverTitle aria-live="polite">
            {selecting === "checkIn" ? copy.chooseArrival : copy.chooseDeparture}
          </PopoverTitle>
        </PopoverHeader>
        <Calendar
          autoFocus
          mode="range"
          locale={calendarLocales[lang]}
          selected={{
            from: checkIn ? labelDate(checkIn) : undefined,
            to: checkOut ? labelDate(checkOut) : undefined,
          }}
          month={month}
          onMonthChange={setMonth}
          numberOfMonths={numberOfMonths}
          showOutsideDays={numberOfMonths === 1}
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
          className="p-3 [--cell-size:clamp(2.25rem,calc((100vw-2.5rem)/7),2.75rem)]"
          components={{ DayButton: StayDayButton }}
          onSelect={(_, date) => {
            if (dateLabel(date) < earliestArrival()) return;
            if (selecting === "checkOut" && dateLabel(date) === checkIn) return;
            if (selecting === "checkIn" || !checkIn) {
              onChange(dateLabel(date), "");
              setSelecting("checkOut");
            } else {
              onChange(checkIn, dateLabel(date));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export default function LandingSearchForm({
  action,
  lang,
  copy,
}: {
  action: string;
  lang: Lang;
  copy: LandingSearchCopy;
}) {
  const checkInRef = useRef<HTMLButtonElement>(null);
  const checkOutRef = useRef<HTMLButtonElement>(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(DEFAULT_ADULTS);
  const [children, setChildren] = useState(0);
  const [open, setOpen] = useState(false);
  const [problems, setProblems] = useState<
    { field: "checkIn" | "checkOut"; problem: keyof LandingSearchCopy["problems"] }[]
  >([]);
  const summary = guestSummary(copy, adults, children);
  const problemFor = (field: "checkIn" | "checkOut") => {
    const problem = problems.find((item) => item.field === field);
    return problem ? copy.problems[problem.problem] : undefined;
  };

  const onSubmit: ComponentProps<"form">["onSubmit"] = (event) => {
    event.preventDefault();
    setOpen(false);
    const search = { checkIn, checkOut, adults, children, room: null, plan: null };
    const next: typeof problems =
      checkIn && checkIn < earliestArrival()
        ? [{ field: "checkIn", problem: "checkInTooSoon" }]
        : searchProblems(search);
    setProblems(next);
    if (next[0]?.field === "checkIn") checkInRef.current?.focus();
    else if (next[0]?.field === "checkOut") checkOutRef.current?.focus();
    if (next.length) return;
    window.location.assign(`${action}?${searchParams(search).toString()}`);
  };

  return (
    <Card className="landing-search overflow-visible border-stone-200 bg-white font-source-sans-3 text-stone-900 shadow-sm ring-0 lg:py-6">
      <CardContent>
        <form action={action} method="get" noValidate onSubmit={onSubmit}>
          <FieldGroup className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,14rem)_auto] lg:gap-4">
            <StayDateFields
              lang={lang}
              copy={copy}
              checkIn={checkIn}
              checkOut={checkOut}
              checkInError={problemFor("checkIn")}
              checkOutError={problemFor("checkOut")}
              checkInRef={checkInRef}
              checkOutRef={checkOutRef}
              onChange={(arrival, departure) => {
                setCheckIn(arrival);
                setCheckOut(departure);
              }}
            />
            <Field className="col-span-2 lg:col-span-1">
              <FieldLabel id="landing-guests-label" className={labelClass}>
                {copy.guests}
              </FieldLabel>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className={fieldButton}
                      aria-labelledby="landing-guests-label landing-guests-value"
                    />
                  }
                >
                  <span id="landing-guests-value" className="min-w-0 truncate">
                    {summary}
                  </span>
                  <CaretDownIcon data-icon="inline-end" />
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className={`${popoverSurface} w-80`}>
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
              className="col-span-2 h-11 min-h-11 w-full bg-accent-500 px-5 font-source-sans-3 text-sm font-medium tracking-widest whitespace-normal text-accent-950 uppercase hover:bg-accent-400 lg:col-span-1 lg:w-auto lg:whitespace-nowrap"
            >
              {copy.submit}
            </Button>
            <input type="hidden" name="adults" value={adults} />
            <input type="hidden" name="children" value={children} />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
