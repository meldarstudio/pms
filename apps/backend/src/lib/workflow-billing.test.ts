import { describe, expect, it } from 'vitest'
import { bill } from './workflow-billing'

describe('reservation bill', () => {
  it('keeps payments as cancellation credit without applying the saved discount', () => {
    expect(bill(0, [{ amountCents: 30000 }], 20000, { cancelled: true })).toEqual({
      subtotalCents: 0,
      totalCents: 0,
      discountCents: 0,
      paidCents: 30000,
      balanceCents: -30000,
      creditCents: 30000,
    })
  })
  it('recalculates credit when room charges shrink and debt when rooms are added', () => {
    const payments = [{ amountCents: 10000 }, { amountCents: 10000 }]
    expect(bill(15000, payments, 0).creditCents).toBe(5000)
    expect(bill(30000, payments, 0).balanceCents).toBe(10000)
  })
  it('applies the full saved discount even when it exceeds room charges', () => {
    expect(bill(8000, [{ amountCents: 30000 }], 10000)).toMatchObject({
      totalCents: -2000,
      discountCents: 10000,
      creditCents: 32000,
    })
  })
})
