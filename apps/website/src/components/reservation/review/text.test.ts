import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { outcomePresentation } from "@/lib/reservation/checkout-copy";
import type { GuestPayment } from "@/lib/reservation/payment";
import { reviewKeys } from "./text";

const keys = new Set<string>(reviewKeys);
const missing = (wanted: string[]) => wanted.filter((key) => !keys.has(key));

describe("Review copy", () => {
  it("has every translation key the checkout flow can show", () => {
    const literals = [
      "checkout-flow.ts",
      "checkout-copy.ts",
      "checkout-form.ts",
      "checkout-selectors.ts",
    ].flatMap((file) =>
      [
        ...readFileSync(
          new URL(`../../../lib/reservation/${file}`, import.meta.url),
          "utf8",
        ).matchAll(/"(reservation\.[\w.]+)"/g),
      ].map((match) => match[1]!),
    );
    expect(missing(literals)).toEqual([]);
  });

  it("has the copy of every payment outcome", () => {
    const states: Record<GuestPayment["state"], true> = {
      declined: true,
      submitted: true,
      authentication_required: true,
      processing: true,
      paid_awaiting_reservation: true,
      unfulfilled: true,
      confirmed: true,
      reservation_changed: true,
    };
    const reservation = { code: "AB12CD", paidCents: 1, outstandingCents: 1, refundDueCents: 1 };
    const wanted = Object.keys(states).flatMap((state) =>
      [false, true].flatMap((delayed) =>
        [undefined, "authentication_expired" as const].flatMap((declineReason) =>
          (["card", "yape"] as const).flatMap((method) => {
            const outcome = outcomePresentation({
              attemptId: "attempt",
              state: state as GuestPayment["state"],
              method,
              amountCents: 1,
              currency: "PEN",
              delayed,
              declineReason,
              reservation,
            });
            const shown = ["eyebrow", "reassurance", "amount"].map(
              (part) => `${outcome.copyKey}.${part}`,
            );
            return [
              outcome.titleKey,
              outcome.bodyKey,
              outcome.retryKey,
              ...(state === "declined" ? shown : []),
              ...outcome.rows.map((row) => row.labelKey),
            ];
          }),
        ),
      ),
    );
    expect(missing(wanted)).toEqual([]);
  });
});
