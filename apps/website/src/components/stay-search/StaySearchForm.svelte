<script lang="ts">
  import "./stay-search.css";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
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
    type CalendarValue,
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
    calendarFocus,
    dateFields,
    dateId,
    canAddRoom,
    dayDisplay,
    departureBounds,
    guestFields,
    initialSearch,
    openDatePicker,
    partySummary,
    placeholder,
    rangePoint,
    restoreSearch,
    selectDate,
    shownSearch,
    selectedStayDates,
    stayProblems,
    submitSearch,
    type DateField,
    type DatePicker,
    type StaySearchProps,
  } from "./stay-search";
  import { wideScreen } from "@/lib/screen";
  import { fill } from "@/lib/reservation/format";
  import { newRoomRequest, type StaySearch } from "@/lib/reservation/search";

  let {
    action,
    onSearch,
    lang,
    copy,
    roomIds = [],
    initial,
  }: StaySearchProps = $props();
  const datePopup = createPopoverController<DateField>();
  const guestPopup = createPopoverController();
  const wide = new MediaQuery(wideScreen, true);
  let search = $state(untrack(() => shownSearch(initial ?? initialSearch)));
  let ready = $state(false);
  let picker = $state<DatePicker>();
  let month = $state<string>();
  let showProblems = $state(false);
  let announcement = $state("");
  const mobile = $derived(!wide.current);
  const selectedDates = $derived(selectedStayDates(search));

  export function replaceStay(stay: StaySearch) {
    datePopup.close();
    guestPopup.close();
    picker = undefined;
    showProblems = false;
    announcement = "";
    search = shownSearch(stay);
  }

  export function keepDraft(stay: StaySearch) {
    search = shownSearch(stay);
  }

  onMount(() => {
    if (!initial) search = restoreSearch(roomIds);
    ready = true;
  });

  const addRoom = () => (search.requests = [...search.requests, newRoomRequest()]);
  const removeRoom = (index: number) =>
    (search.requests = search.requests.filter((_, position) => position !== index));

  let mediaReady = false;
  $effect(() => {
    mobile;
    if (!mediaReady) {
      mediaReady = true;
      return;
    }
    untrack(() => {
      datePopup.close();
      guestPopup.close();
    });
  });

  function prepareDatePicker(field: DateField) {
    const { month: initialMonth, ...nextPicker } = openDatePicker(field, search);
    month = initialMonth;
    picker = nextPicker;
    announcement = "";
  }

  function chooseToggledDate(value: CalendarValue) {
    if (!picker || !Array.isArray(value)) return;
    const date =
      value.length > selectedDates.length
        ? value.find((day) => !selectedDates.includes(day))
        : selectedDates.find((day) => !value.includes(day));
    if (!date) return;
    const next = selectDate(date, picker, search);
    if (!next) return;
    search = next;
    if (picker.selecting === "checkOut") {
      if (showProblems && !stayProblems(next).length) showProblems = false;
      announcement = fill(copy.selectedStay, {
        checkIn: dayDisplay(next.checkIn, lang),
        checkOut: dayDisplay(next.checkOut, lang),
      });
      datePopup.close();
    } else picker = { ...picker, selecting: "checkOut" };
  }

  function errorFor(field: DateField) {
    const problem = showProblems && stayProblems(search).find((item) => item.field === field);
    return problem ? copy.problems[problem.problem] : undefined;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    guestPopup.close();
    const first = stayProblems(search)[0];
    showProblems = Boolean(first);
    if (first) document.getElementById(dateId(first.field))?.focus();
    else if (onSearch) onSearch(search);
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
    <Popover controller={datePopup} presentation={mobile ? "sheet" : "popover"}>
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
            onclick={() => prepareDatePicker(field)}
          >
            <span id={`${id}-value`} class:lp-placeholder={!search[field]}>
              {#if search[field]}
                <time datetime={search[field]}>{dayDisplay(search[field], lang)}</time>
              {:else}
                {placeholder(copy, field)}
              {/if}
            </span>
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <rect x="2" y="3.5" width="12" height="10.5" /><path d="M2 6.5h12M5 2v3M11 2v3" />
            </svg>
          </PopoverTrigger>

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
          <Calendar
            mode="multiple"
            bind:month
            today={picker.today}
            min={picker.firstNewArrival}
            max={picker.lastDate}
            unavailable={departureBounds(picker, search)}
            locale={lang === "es" ? "es-PE" : "en-US"}
            weekStartsOn={lang === "es" ? 1 : 0}
            months={mobile ? 1 : 2}
            showOutsideDays={mobile}
            value={selectedDates}
            weekdayFormat="short"
            monthFormat="short"
            onValueChange={(value, details) => {
              details.cancel();
              chooseToggledDate(value);
            }}
          >
            <div class="lp-calendar-nav">
              <CalendarPrevious class="lp-square" aria-label={copy.calendar.previousMonth}>
                ‹
              </CalendarPrevious>
              <CalendarHeading class="sr-only" />
              <CalendarMonthSelect aria-label={copy.calendar.chooseMonth} />
              <CalendarYearSelect aria-label={copy.calendar.chooseYear} />
              <CalendarNext class="lp-square" aria-label={copy.calendar.nextMonth}>›</CalendarNext>
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
                        />
                      {/snippet}
                    </CalendarWeeks>
                  {/snippet}
                </CalendarGrid>
              {/each}
            </div>
          </Calendar>
        {/if}
      </PopoverContent>
    </Popover>

    <div class="lp-field lp-guests">
      <label id="stay-guests-label" for="stay-guests">{copy.guests}</label>
      <Popover controller={guestPopup} presentation={mobile ? "sheet" : "popover"}>
        <PopoverTrigger
          id="stay-guests"
          class="lp-trigger"
          aria-labelledby="stay-guests-label stay-guests-value"
        >
          <span id="stay-guests-value">{partySummary(copy, search.requests)}</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </PopoverTrigger>
        <PopoverContent class="lp-surface lp-guest-popup" side="top" align="end">
          <div class="lp-guest-header">
            <PopoverTitle class="lp-label">{copy.guests}</PopoverTitle>
            {#if mobile}
              <PopoverClose class="lp-square" aria-label={copy.closeGuests}>×</PopoverClose>
            {/if}
          </div>
          <div class="lp-stepper">
            <span class="lp-label">{copy.rooms}</span>
            <button
              type="button"
              class="lp-square"
              disabled={search.requests.length <= 1}
              aria-label={copy.decreaseRooms}
              onclick={() => removeRoom(search.requests.length - 1)}
            >
              −
            </button>
            <span>{search.requests.length}</span>
            <button
              type="button"
              class="lp-square"
              disabled={!canAddRoom(search.requests)}
              aria-label={copy.increaseRooms}
              onclick={addRoom}
            >
              +
            </button>
          </div>
          {#if !canAddRoom(search.requests)}
            <p class="lp-note">{copy.roomsLimit}</p>
          {/if}
          {#each search.requests as request, index (index)}
            {@const several = search.requests.length > 1}
            {@const room = fill(copy.roomNumber, { n: index + 1 })}
            <div class="lp-room" role={several ? "group" : undefined} aria-label={several ? room : undefined}>
              {#if several}
                <div class="lp-room-header">
                  <span class="lp-label">{room}</span>
                  <button
                    type="button"
                    class="lp-remove"
                    aria-label={fill(copy.removeRoomLabel, { n: index + 1 })}
                    onclick={() => removeRoom(index)}
                  >
                    {copy.removeRoom}
                  </button>
                </div>
              {/if}
              {#each guestFields as guest (guest.name)}
                <div class="lp-stepper">
                  <span class="lp-label">{copy[guest.name]}</span>
                  <button
                    type="button"
                    class="lp-square"
                    disabled={request[guest.name] <= guest.min}
                    aria-label={several ? `${copy[guest.decrease]} · ${room}` : copy[guest.decrease]}
                    onclick={() => request[guest.name]--}
                  >
                    −
                  </button>
                  <span>{request[guest.name]}</span>
                  <button
                    type="button"
                    class="lp-square"
                    disabled={request[guest.name] >= guest.max}
                    aria-label={several ? `${copy[guest.increase]} · ${room}` : copy[guest.increase]}
                    onclick={() => request[guest.name]++}
                  >
                    +
                  </button>
                </div>
              {/each}
            </div>
          {/each}
        </PopoverContent>
      </Popover>
    </div>
    <button type="submit" class="lp-submit">{copy.submit}</button>
  </fieldset>
  <p class="sr-only" role="status" aria-atomic="true">{announcement}</p>
</form>
