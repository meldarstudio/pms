import type { GuestReservationSummary } from "../../src/lib/reservation/summary";
import { daysFromToday, openStay } from "./local-api";

export const summaryToken = "a".repeat(43);

export function reservationSummary(): GuestReservationSummary {
  const stay = openStay();
  return {
    status: "confirmed",
    code: "AB12CD",
    ...stay,
    nights: 2,
    currency: "PEN",
    fullName: "Ana Torres",
    rooms: [
      {
        roomTypeId: "935c7f23-8acc-4c78-b456-9bc588cccc2d",
        name: "Suite Matrimonial",
        adults: 2,
        children: 0,
        nights: [
          { date: stay.checkIn, priceCents: 10000 },
          { date: daysFromToday(121), priceCents: 10000 },
        ],
      },
    ],
    ratePlan: "flexible",
    totalCents: 20000,
    paidCents: 10000,
    outstandingCents: 10000,
    refundDueCents: 0,
    refundedCents: 0,
  };
}
