import { useRef, useState, type ComponentProps, type RefObject } from "react";
import { CaretDownIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
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
  searchParams,
  searchProblems,
  type SearchProblem,
} from "@/lib/reservation/search";

export type LandingSearchCopy = {
  chooseDate: string;
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
  problems: Record<SearchProblem, string>;
};

const limits = {
  adults: { min: 1, max: MAX_ADULTS_CHOICE },
  children: { min: 0, max: MAX_CHILDREN_CHOICE },
} as const;

const calendarLocales = { es, en: enUS } as const;
const calendarYear = new Date().getFullYear();
const calendarStart = new Date(calendarYear - 1, 0, 1);
const calendarEnd = new Date(calendarYear + 2, 11, 1);

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
  min,
  error,
  errorId,
  buttonRef,
  onChange,
}: {
  id: string;
  name: "checkIn" | "checkOut";
  label: string;
  placeholder: string;
  lang: Lang;
  value: string;
  min?: string;
  error?: string;
  errorId: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? labelDate(value) : undefined;
  const [month, setMonth] = useState<Date>(selected ?? (min ? labelDate(min) : new Date()));
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;

  return (
    <Field data-invalid={error ? true : undefined} className="data-[invalid=true]:text-stone-900">
      <FieldLabel id={labelId} htmlFor={id} className={labelClass}>
        {label}
      </FieldLabel>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setMonth(selected ?? (min ? labelDate(min) : new Date()));
          setOpen(next);
        }}
      >
        <PopoverTrigger
          render={
            <Button
              ref={buttonRef}
              id={id}
              type="button"
              variant="outline"
              className={fieldButton}
              aria-labelledby={value ? `${labelId} ${valueId}` : labelId}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          }
        >
          <span
            id={valueId}
            className={value ? "min-w-0 truncate" : "min-w-0 truncate text-stone-500"}
          >
            {value ? formatDate(value, lang) : placeholder}
          </span>
          <CaretDownIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="start" className={`${popoverSurface} w-auto gap-0 p-0`}>
          <PopoverHeader className="sr-only">
            <PopoverTitle>{label}</PopoverTitle>
          </PopoverHeader>
          <Calendar
            mode="single"
            locale={calendarLocales[lang]}
            selected={selected}
            month={month}
            onMonthChange={setMonth}
            startMonth={calendarStart}
            endMonth={calendarEnd}
            captionLayout="dropdown"
            disabled={min ? { before: labelDate(min) } : undefined}
            className="p-3 [--cell-size:2.75rem]"
            components={{ DayButton: StayDayButton }}
            onSelect={(date) => {
              if (!date) return;
              onChange(dateLabel(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <input type="hidden" name={name} value={value} />
      <FieldError id={errorId} className="text-sm font-medium text-red-800">
        {error}
      </FieldError>
    </Field>
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
  const [problems, setProblems] = useState<ReturnType<typeof searchProblems>>([]);
  const summary = guestSummary(copy, adults, children);
  const problemFor = (field: "checkIn" | "checkOut") => {
    const problem = problems.find((item) => item.field === field);
    return problem ? copy.problems[problem.problem] : undefined;
  };

  const onSubmit: ComponentProps<"form">["onSubmit"] = (event) => {
    event.preventDefault();
    setOpen(false);
    const search = { checkIn, checkOut, adults, children, room: null, plan: null };
    const next = searchProblems(search);
    setProblems(next);
    if (next[0]?.field === "checkIn") checkInRef.current?.focus();
    else if (next[0]?.field === "checkOut") checkOutRef.current?.focus();
    if (next.length) return;
    window.location.assign(`${action}?${searchParams(search).toString()}`);
  };

  return (
    <Card className="landing-search overflow-visible border-stone-200 bg-white font-source-sans-3 text-stone-900 shadow-sm ring-0">
      <CardContent>
        <form action={action} method="get" noValidate onSubmit={onSubmit}>
          <FieldGroup className="grid grid-cols-2 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,14rem)_auto] md:gap-4">
            <DateField
              id="landing-check-in"
              name="checkIn"
              label={copy.checkIn}
              placeholder={copy.chooseDate}
              lang={lang}
              value={checkIn}
              error={problemFor("checkIn")}
              errorId="landing-check-in-error"
              buttonRef={checkInRef}
              onChange={setCheckIn}
            />
            <DateField
              id="landing-check-out"
              name="checkOut"
              label={copy.checkOut}
              placeholder={copy.chooseDate}
              lang={lang}
              value={checkOut}
              min={checkIn ? addDays(checkIn, 1) : undefined}
              error={problemFor("checkOut")}
              errorId="landing-check-out-error"
              buttonRef={checkOutRef}
              onChange={setCheckOut}
            />
            <Field className="col-span-2 md:col-span-1">
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
              className="col-span-2 h-11 min-h-11 w-full bg-accent-500 px-5 font-source-sans-3 text-sm font-medium tracking-widest whitespace-normal text-accent-950 uppercase hover:bg-accent-400 md:col-span-1 md:w-auto md:whitespace-nowrap"
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
