import { describe, expect, it } from "vite-plus/test";
import { bill } from "./workflow-billing";

describe("reservation bill", () => {
  it("recalculates credit when room charges shrink and debt when rooms are added", () => {
    const payments = [{ amountCents: 10000 }, { amountCents: 10000 }];
    expect(bill(15000, payments, 0).creditCents).toBe(5000);
    expect(bill(30000, payments, 0).balanceCents).toBe(10000);
  });
  it("caps the applied discount without erasing payment-derived credit", () => {
    expect(bill(8000, [{ amountCents: 30000 }], 10000)).toMatchObject({
      totalCents: 0,
      discountCents: 8000,
      creditCents: 30000,
    });
  });
});
