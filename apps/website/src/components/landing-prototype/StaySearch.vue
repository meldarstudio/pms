<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
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
} from "@ui-sdk/vue/calendar";
import {
  createPopoverController,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover";
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

const { action, lang, copy } = defineProps<StaySearchProps>();
const datePopup = createPopoverController<DateField>();
const guestPopup = createPopoverController();
const search = ref({ ...initialSearch });
const ready = ref(false);
const mobile = ref(false);
const picker = ref<DatePicker>();
const showProblems = ref(false);
const labels = calendarCopy[lang];
let stopWatchingViewport: (() => void) | undefined;

onMounted(() => {
  search.value = restoreSearch();
  ready.value = true;
  const media = matchMedia(desktopCalendar);
  const resize = () => {
    datePopup.close();
    mobile.value = !media.matches;
  };
  mobile.value = !media.matches;
  media.addEventListener("change", resize);
  stopWatchingViewport = () => media.removeEventListener("change", resize);
});
onUnmounted(() => stopWatchingViewport?.());

function startPicker(payload: unknown) {
  if (payload === "checkIn" || payload === "checkOut")
    picker.value = openDatePicker(payload, search.value);
}

function chooseDate(value: unknown) {
  if (!picker.value) return;
  const next = selectDate(value, picker.value, search.value);
  if (!next) return;
  search.value = next;
  if (picker.value.selecting === "checkOut") datePopup.close();
  else picker.value = { ...picker.value, selecting: "checkOut" };
}

function errorFor(field: DateField) {
  const problem =
    showProblems.value && stayProblems(search.value).find((item) => item.field === field);
  return problem ? copy.problems[problem.problem] : undefined;
}

function submit() {
  guestPopup.close();
  showProblems.value = true;
  const first = stayProblems(search.value)[0];
  if (first) document.getElementById(dateId(first.field))?.focus();
  else submitSearch(action, search.value);
}
</script>

<template>
  <form
    class="stay-search lp-form"
    :action="action"
    method="get"
    novalidate
    :aria-busy="!ready"
    @submit.prevent="submit"
  >
    <fieldset class="lp-fields" :disabled="!ready">
      <Popover
        :controller="datePopup"
        :presentation="mobile ? 'sheet' : 'popover'"
        @payload-change="startPicker"
      >
        <div
          v-for="field in dateFields"
          :key="field"
          class="lp-field"
          :data-invalid="errorFor(field) ? 'true' : undefined"
        >
          <label :id="`${dateId(field)}-label`" :for="dateId(field)">{{ copy[field] }}</label>
          <PopoverTrigger
            :id="dateId(field)"
            class="lp-trigger"
            :payload="field"
            :aria-labelledby="`${dateId(field)}-label ${dateId(field)}-value`"
            :aria-invalid="errorFor(field) ? true : undefined"
            :aria-describedby="errorFor(field) ? `${dateId(field)}-error` : undefined"
          >
            <span :id="`${dateId(field)}-value`" :class="{ 'lp-placeholder': !search[field] }">
              {{ search[field] ? dayDisplay(search[field], lang) : placeholder(copy, field) }}
            </span>
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <rect x="2" y="3.5" width="12" height="10.5" />
              <path d="M2 6.5h12M5 2v3M11 2v3" />
            </svg>
          </PopoverTrigger>
          <input type="hidden" :name="field" :value="search[field]" />
          <p v-if="errorFor(field)" :id="`${dateId(field)}-error`" class="lp-error">
            {{ errorFor(field) }}
          </p>
        </div>
        <PopoverContent
          class="lp-surface lp-dates"
          side="top"
          align="start"
          :initial-focus="calendarFocus"
        >
          <template v-if="picker">
            <div class="lp-calendar-header">
              <PopoverTitle aria-live="polite">{{
                picker.selecting === "checkIn" ? copy.chooseArrival : copy.chooseDeparture
              }}</PopoverTitle>
              <PopoverClose v-if="mobile" class="lp-square" :aria-label="copy.closeCalendar"
                >×</PopoverClose
              >
              <PopoverDescription v-if="mobile">
                {{
                  search.checkIn
                    ? `${copy.checkIn}: ${dayDisplay(search.checkIn, lang)} · ${copy.checkOut}: ${search.checkOut ? dayDisplay(search.checkOut, lang) : copy.departurePlaceholder}`
                    : copy.stayHint
                }}
              </PopoverDescription>
            </div>
            <Calendar
              :key="picker.month"
              :default-month="picker.month"
              :today="picker.today"
              :min="picker.firstNewArrival"
              :max="picker.lastDate"
              :unavailable="departureBounds(picker, search)"
              :locale="labels.locale"
              :week-starts-on="lang === 'es' ? 1 : 0"
              :months="mobile ? 1 : 2"
              :show-outside-days="mobile"
              :value="search[picker.selecting] || null"
              weekday-format="short"
              month-format="short"
              @value-change="chooseDate"
            >
              <div class="lp-calendar-nav">
                <CalendarPrevious class="lp-square" :aria-label="labels.previous"
                  >‹</CalendarPrevious
                >
                <CalendarHeading class="sr-only" />
                <CalendarMonthSelect :aria-label="labels.month" />
                <CalendarYearSelect :aria-label="labels.year" />
                <CalendarNext class="lp-square" :aria-label="labels.next">›</CalendarNext>
              </div>
              <div class="lp-months">
                <CalendarGrid
                  v-for="offset in mobile ? 1 : 2"
                  :key="offset"
                  v-slot="{ state }"
                  :offset="offset - 1"
                >
                  <caption v-if="!mobile">
                    {{
                      state.label
                    }}
                  </caption>
                  <CalendarWeekdays v-slot="{ index }"
                    ><CalendarWeekday :index="index"
                  /></CalendarWeekdays>
                  <CalendarWeeks v-slot="{ cell }">
                    <CalendarDay
                      :value="cell.date"
                      :data-date="cell.date"
                      :data-stay-range="rangePoint(cell.date, search)"
                      :aria-selected="Boolean(rangePoint(cell.date, search))"
                    />
                  </CalendarWeeks>
                </CalendarGrid>
              </div>
            </Calendar>
          </template>
        </PopoverContent>
      </Popover>

      <div class="lp-field lp-guests">
        <label id="stay-guests-label" for="stay-guests">{{ copy.guests }}</label>
        <Popover :controller="guestPopup">
          <PopoverTrigger
            id="stay-guests"
            class="lp-trigger"
            aria-labelledby="stay-guests-label stay-guests-value"
          >
            <span id="stay-guests-value">{{ guestSummary(copy, search) }}</span>
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </PopoverTrigger>
          <PopoverContent class="lp-surface lp-guest-popup" side="top" align="end">
            <PopoverTitle class="lp-label">{{ copy.guests }}</PopoverTitle>
            <div v-for="guest in guestFields" :key="guest.name" class="lp-stepper">
              <span class="lp-label">{{ copy[guest.name] }}</span>
              <button
                type="button"
                class="lp-square"
                :disabled="search[guest.name] <= guest.min"
                :aria-label="copy[guest.decrease]"
                @click="search[guest.name]--"
              >
                −
              </button>
              <span>{{ search[guest.name] }}</span>
              <button
                type="button"
                class="lp-square"
                :disabled="search[guest.name] >= guest.max"
                :aria-label="copy[guest.increase]"
                @click="search[guest.name]++"
              >
                +
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <button type="submit" class="lp-submit">{{ copy.submit }}</button>
      <input
        v-for="guest in guestFields"
        :key="guest.name"
        type="hidden"
        :name="guest.name"
        :value="search[guest.name]"
      />
    </fieldset>
  </form>
</template>
