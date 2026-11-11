import type { StaySearchCopy } from "@/components/StaySearchForm";
import type { useTranslations } from "@/i18n/utils";

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
      checkInTooSoon: t("reservation.problem.checkInTooSoon"),
      checkOutRequired: t("reservation.problem.checkOutRequired"),
      checkOutBeforeCheckIn: t("reservation.problem.checkOutBeforeCheckIn"),
      tooManyNights: t("reservation.problem.tooManyNights"),
    },
  };
}
