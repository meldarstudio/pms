<script lang="ts">
  import "./stay-search.css";
  import { onMount } from "svelte";
  import {
    Calendar,
    CalendarDay,
    CalendarGrid,
    CalendarHeading,
    CalendarMonthSelect,
    CalendarNext,
    CalendarPrevious,
    CalendarWeekday,
    CalendarWeekdays,
    CalendarWeeks,
    CalendarYearSelect,
  } from "@ui-sdk/svelte/calendar";
  import {
    createPopoverController,
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover";
  import {
    calendarCopy,
    calendarFocus,
    dateFields,
    dateId,
    dayDisplay,
    departureBounds,
    desktopCalendar,
    guestFields,
    guestSummary,
    initialSearch,
    openDatePicker,
    placeholder,
    rangePoint,
    restoreSearch,
    selectDate,
    stayProblems,
    submitSearch,
    type DateField,
    type DatePicker,
    type StaySearchProps,
  } from "./stay-search";

  let { action, onSearch, lang, copy }: StaySearchProps = $props();
  const datePopup = createPopoverController<DateField>();
  const guestPopup = createPopoverController();
  let search = $state({ ...initialSearch });
  let ready = $state(false);
  let mobile = $state(false);
  let picker = $state<DatePicker>();
  let showProblems = $state(false);
  const labels = $derived(calendarCopy[lang]);

  onMount(() => {
    search = restoreSearch();
    ready = true;
    const media = matchMedia(desktopCalendar);
    const resize = () => {
      datePopup.close();
      mobile = !media.matches;
    };
    mobile = !media.matches;
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  });

  function startPicker(payload: unknown) {
    if (payload === "checkIn" || payload === "checkOut") picker = openDatePicker(payload, search);
  }

  function chooseDate(value: unknown) {
    if (!picker) return;
    const next = selectDate(value, picker, search);
    if (!next) return;
    search = next;
    if (picker.selecting === "checkOut") datePopup.close();
    else picker = { ...picker, selecting: "checkOut" };
  }

  function errorFor(field: DateField) {
    const problem = showProblems && stayProblems(search).find((item) => item.field === field);
    return problem ? copy.problems[problem.problem] : undefined;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    guestPopup.close();
    showProblems = true;
    const first = stayProblems(search)[0];
    if (first) document.getElementById(dateId(first.field))?.focus();
    else if (onSearch) onSearch({ ...search, room: null, plan: null });
    else if (action) submitSearch(action, search);
  }
</script>

<form
  class="stay-search lp-form"
  {action}
  method="get"
  novalidate
  aria-busy={!ready}
  onsubmit={submit}
>
  <fieldset class="lp-fields" disabled={!ready}>
    <Popover
      controller={datePopup}
      presentation={mobile ? "sheet" : "popover"}
      onPayloadChange={startPicker}
    >
      {#each dateFields as field (field)}
        {@const id = dateId(field)}
        {@const error = errorFor(field)}
        <div class="lp-field" data-invalid={error ? "true" : undefined}>
          <label id={`${id}-label`} for={id}>{copy[field]}</label>
          <PopoverTrigger
            {id}
            class="lp-trigger"
            payload={field}
            aria-labelledby={`${id}-label ${id}-value`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          >
            <span id={`${id}-value`} class:lp-placeholder={!search[field]}>
              {search[field] ? dayDisplay(search[field], lang) : placeholder(copy, field)}
            </span>
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <rect x="2" y="3.5" width="12" height="10.5" /><path d="M2 6.5h12M5 2v3M11 2v3" />
            </svg>
          </PopoverTrigger>
          <input type="hidden" name={field} value={search[field]} />
          {#if error}<p id={`${id}-error`} class="lp-error">{error}</p>{/if}
        </div>
      {/each}
      <PopoverContent
        class="lp-surface lp-dates"
        side="top"
        align="start"
        initialFocus={calendarFocus}
      >
        {#if picker}
          <div class="lp-calendar-header">
            <PopoverTitle aria-live="polite">
              {picker.selecting === "checkIn" ? copy.chooseArrival : copy.chooseDeparture}
            </PopoverTitle>
            {#if mobile}
              <PopoverClose class="lp-square" aria-label={copy.closeCalendar}>×</PopoverClose>
              <PopoverDescription>
                {search.checkIn
                  ? `${copy.checkIn}: ${dayDisplay(search.checkIn, lang)} · ${copy.checkOut}: ${search.checkOut ? dayDisplay(search.checkOut, lang) : copy.departurePlaceholder}`
                  : copy.stayHint}
              </PopoverDescription>
            {/if}
          </div>
          {#key picker.month}
            <Calendar
              defaultMonth={picker.month}
              today={picker.today}
              min={picker.firstNewArrival}
              max={picker.lastDate}
              unavailable={departureBounds(picker, search)}
              locale={labels.locale}
              weekStartsOn={lang === "es" ? 1 : 0}
              months={mobile ? 1 : 2}
              showOutsideDays={mobile}
              value={search[picker.selecting] || null}
              weekdayFormat="short"
              monthFormat="short"
              onValueChange={chooseDate}
            >
              <div class="lp-calendar-nav">
                <CalendarPrevious class="lp-square" aria-label={labels.previous}>
                  ‹
                </CalendarPrevious>
                <CalendarHeading class="sr-only" />
                <CalendarMonthSelect aria-label={labels.month} />
                <CalendarYearSelect aria-label={labels.year} />
                <CalendarNext class="lp-square" aria-label={labels.next}>›</CalendarNext>
              </div>
              <div class="lp-months">
                {#each mobile ? [0] : [0, 1] as offset (offset)}
                  <CalendarGrid {offset}>
                    {#snippet children(state)}
                      {#if !mobile}<caption>{state.label}</caption>{/if}
                      <CalendarWeekdays>
                        {#snippet children(index)}<CalendarWeekday {index} />{/snippet}
                      </CalendarWeekdays>
                      <CalendarWeeks>
                        {#snippet children(cell)}
                          <CalendarDay
                            value={cell.date}
                            data-date={cell.date}
                            data-stay-range={rangePoint(cell.date, search)}
                            aria-selected={Boolean(rangePoint(cell.date, search))}
                          />
                        {/snippet}
                      </CalendarWeeks>
                    {/snippet}
                  </CalendarGrid>
                {/each}
              </div>
            </Calendar>
          {/key}
        {/if}
      </PopoverContent>
    </Popover>

    <div class="lp-field lp-guests">
      <label id="stay-guests-label" for="stay-guests">{copy.guests}</label>
      <Popover controller={guestPopup}>
        <PopoverTrigger
          id="stay-guests"
          class="lp-trigger"
          aria-labelledby="stay-guests-label stay-guests-value"
        >
          <span id="stay-guests-value">{guestSummary(copy, search)}</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </PopoverTrigger>
        <PopoverContent class="lp-surface lp-guest-popup" side="top" align="end">
          <PopoverTitle class="lp-label">{copy.guests}</PopoverTitle>
          {#each guestFields as guest (guest.name)}
            <div class="lp-stepper">
              <span class="lp-label">{copy[guest.name]}</span>
              <button
                type="button"
                class="lp-square"
                disabled={search[guest.name] <= guest.min}
                aria-label={copy[guest.decrease]}
                onclick={() => search[guest.name]--}
              >
                −
              </button>
              <span>{search[guest.name]}</span>
              <button
                type="button"
                class="lp-square"
                disabled={search[guest.name] >= guest.max}
                aria-label={copy[guest.increase]}
                onclick={() => search[guest.name]++}
              >
                +
              </button>
            </div>
          {/each}
        </PopoverContent>
      </Popover>
    </div>
    <button type="submit" class="lp-submit">{copy.submit}</button>
    {#each guestFields as guest (guest.name)}
      <input type="hidden" name={guest.name} value={search[guest.name]} />
    {/each}
  </fieldset>
</form>
