import type { useTranslations } from "@/i18n/utils";
import type { ArrivalProblem, SearchProblem } from "./search";

export type StaySearchCopy = {
  arrivalPlaceholder: string;
  departurePlaceholder: string;
  chooseArrival: string;
  chooseDeparture: string;
  stayHint: string;
  closeCalendar: string;
  closeGuests: string;
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
  problems: Record<SearchProblem | ArrivalProblem, string>;
};

export function staySearchCopy(
  t: ReturnType<typeof useTranslations>,
  submit: string,
): StaySearchCopy {
  return {
    arrivalPlaceholder: t("landing.arrivalPlaceholder"),
    departurePlaceholder: t("landing.departurePlaceholder"),
    chooseArrival: t("landing.chooseArrival"),
    chooseDeparture: t("landing.chooseDeparture"),
    stayHint: t("landing.stayHint"),
    closeCalendar: t("landing.closeCalendar"),
    closeGuests: t("landing.closeGuests"),
    checkIn: t("reservation.search.checkIn"),
    checkOut: t("reservation.search.checkOut"),
    guests: t("landing.guests"),
    adults: t("reservation.search.adults"),
    children: t("reservation.search.children"),
    submit,
    decreaseAdults: t("landing.decreaseAdults"),
    increaseAdults: t("landing.increaseAdults"),
    decreaseChildren: t("landing.decreaseChildren"),
    increaseChildren: t("landing.increaseChildren"),
    adultsOne: t("reservation.adults.one"),
    adultsOther: t("reservation.adults.other"),
    childrenOne: t("reservation.children.one"),
    childrenOther: t("reservation.children.other"),
    problems: {
      checkInRequired: t("reservation.problem.checkInRequired"),
      checkInPast: t("reservation.problem.checkInPast"),
      sameDayClosed: t("reservation.problem.sameDayClosed"),
      checkOutRequired: t("reservation.problem.checkOutRequired"),
      checkOutBeforeCheckIn: t("reservation.problem.checkOutBeforeCheckIn"),
      tooManyNights: t("reservation.problem.tooManyNights"),
    },
  };
}
