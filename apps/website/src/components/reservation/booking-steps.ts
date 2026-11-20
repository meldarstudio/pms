import type { ui } from "@/i18n/ui";

export const bookingStepsKeys = [
  "reservation.steps",
  "reservation.step.room",
  "reservation.step.rate",
  "reservation.step.review",
] as const satisfies readonly (keyof (typeof ui)["es"])[];

export type BookingStepsText = Record<(typeof bookingStepsKeys)[number], string>;
