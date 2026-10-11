import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  bookingRoomCharges,
  bookingSummary,
} from "../src/lib/booking-prices.ts"

const saved = [
  { date: "2026-10-10", priceCents: 10000 },
  { date: "2026-10-11", priceCents: 10000 },
  { date: "2026-10-12", priceCents: 10000 },
]

describe("booking price preview", () => {
  it("applies the stay discount once and uses saved prices when rates change", () => {
    assert.deepEqual(
      bookingRoomCharges(
        saved,
        [{ date: "2026-10-10", priceCents: 20000 }],
        false,
        6000
      ),
      {
        subtotalCents: 30000,
        discountCents: 6000,
        totalCents: 24000,
      }
    )
  })

  it("keeps existing prices and quotes added nights when dates change", () => {
    const quoted = [
      ...saved.map((night) => ({ ...night, priceCents: 20000 })),
      { date: "2026-10-13", priceCents: 15000 },
    ]
    assert.deepEqual(bookingRoomCharges(saved, quoted, true, 6000), {
      subtotalCents: 45000,
      discountCents: 6000,
      totalCents: 39000,
    })
  })

  it("keeps the full discount on a shortened stay", () => {
    assert.deepEqual(bookingRoomCharges(saved, saved.slice(0, 1), true, 6000), {
      subtotalCents: 10000,
      discountCents: 6000,
      totalCents: 4000,
    })
    assert.deepEqual(
      bookingRoomCharges(saved, saved.slice(0, 1), true, 25000),
      {
        subtotalCents: 10000,
        discountCents: 25000,
        totalCents: -15000,
      }
    )
  })

  it("allows a full discount of retained charges even without an availability quote", () => {
    assert.deepEqual(
      bookingRoomCharges(saved.slice(0, 1), undefined, false, 10000),
      {
        subtotalCents: 10000,
        discountCents: 10000,
        totalCents: 0,
      }
    )
    assert.equal(bookingRoomCharges(undefined, undefined, true, 0), null)
  })
})

describe("booking summary", () => {
  it("combines room charges and discounts while excluding cancelled rooms", () => {
    const first = bookingRoomCharges(saved, undefined, false, 6000)
    const second = bookingRoomCharges(saved.slice(0, 1), undefined, false, 1500)
    assert.deepEqual(
      bookingSummary(
        [
          { status: "confirmed", charges: first, invalid: false },
          { status: "checked_out", charges: second, invalid: false },
          { status: "cancelled", charges: null, invalid: true },
        ],
        10000
      ),
      {
        subtotalCents: 40000,
        discountCents: 7500,
        totalCents: 32500,
        balanceCents: 22500,
      }
    )
  })

  it("recalculates the balance using edited discounts and existing payments", () => {
    const preview = (discountCents: number) =>
      bookingSummary(
        [
          {
            status: "checked_in",
            charges: bookingRoomCharges(saved, undefined, false, discountCents),
            invalid: false,
          },
        ],
        10000
      )
    assert.equal(preview(6000)?.balanceCents, 14000)
    assert.equal(preview(12000)?.balanceCents, 8000)
  })

  it("keeps an uncapped discount after early departure and preserves credit", () => {
    assert.deepEqual(
      bookingSummary(
        [
          {
            status: "checked_in",
            charges: bookingRoomCharges(saved, saved.slice(0, 1), true, 25000),
            invalid: false,
          },
        ],
        15000
      ),
      {
        subtotalCents: 10000,
        discountCents: 25000,
        totalCents: -15000,
        balanceCents: -30000,
      }
    )
  })

  it("retains no-show charges, discounts, and payments", () => {
    assert.deepEqual(
      bookingSummary(
        [
          {
            status: "no_show",
            charges: bookingRoomCharges(saved, undefined, false, 6000),
            invalid: false,
          },
        ],
        24000
      ),
      {
        subtotalCents: 30000,
        discountCents: 6000,
        totalCents: 24000,
        balanceCents: 0,
      }
    )
  })

  it("does not show a partial total when a room price is missing or an amount is invalid", () => {
    const priced = {
      status: "confirmed",
      charges: bookingRoomCharges(saved, undefined, false, 0),
      invalid: false,
    }
    assert.equal(
      bookingSummary(
        [priced, { status: null, charges: null, invalid: false }],
        0
      ),
      null
    )
    assert.equal(bookingSummary([{ ...priced, invalid: true }], 0), null)
  })

  it("shows payments as credit when every room is cancelled", () => {
    assert.deepEqual(
      bookingSummary(
        [{ status: "cancelled", charges: null, invalid: false }],
        5000
      ),
      {
        subtotalCents: 0,
        discountCents: 0,
        totalCents: 0,
        balanceCents: -5000,
      }
    )
  })
})
