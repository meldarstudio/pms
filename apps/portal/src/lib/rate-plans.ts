import type { RatePlanCode, RatePlanTerms } from "@/lib/api";

export const ratePlanLabels: Record<RatePlanCode, string> = {
  flexible: "Flexible",
  non_refundable: "No reembolsable",
};

export function derivedRatePlans(plans: RatePlanTerms[]) {
  return plans.filter((terms) => terms.plan !== "flexible");
}

export function priceAdjustmentSentence(percent: number) {
  return percent < 0 ? `${-percent}% menos` : `${percent}% más`;
}

export function priceAdjustmentBadge(percent: number) {
  return percent < 0 ? `−${-percent}%` : `+${percent}%`;
}

export function ratePlanSummary(terms: RatePlanTerms) {
  const days = terms.cancellationPolicy.freeUntilDaysBeforeCheckIn;
  const percent = terms.priceAdjustmentPercent;
  return [
    percent === 0 ? null : priceAdjustmentSentence(percent),
    terms.paymentSchedule === "full_upfront" ? "Pago total al reservar" : "Depósito: primera noche",
    days === null
      ? "Sin reembolso"
      : days === 0
        ? "Cancelación gratuita hasta el check-in"
        : `Cancelación gratuita hasta ${days} ${days === 1 ? "día" : "días"} antes`,
  ]
    .filter(Boolean)
    .join(" · ");
}
