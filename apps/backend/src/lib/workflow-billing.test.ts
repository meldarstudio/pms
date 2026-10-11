import { describe, expect, it } from 'vitest'
import { bill, reduceWaivers, type LedgerEntry } from './workflow-billing'
const entry = (kind: string, amount: number): LedgerEntry => ({
  id: kind,
  kind,
  amountCents: amount,
  appliedCents: kind === 'waiver' ? amount : 0,
  createdAt: '2026-10-10',
  voidedAt: null,
})
describe('shared bill', () => {
  it('keeps actual money movements as cancellation credit without applying discounts', () => {
    const entries = [entry('payment', 30000), entry('refund', 5000),
      entry('discount', 20000), entry('waiver', 10000)]
    expect(bill(0, entries, { cancelled: true })).toMatchObject({
      totalCents: 0, discountCents: 0, waiverCents: 0,
      paidCents: 30000, refundCents: 5000, balanceCents: -25000, creditCents: 25000,
    })
    expect(entries[2].amountCents).toBe(20000)
    expect(bill(50000, entries).discountCents).toBe(20000)
  })
  it('retires forgiven debt on reduction without manufacturing credit or forgiving later additions', () => {
    const entries = [entry('payment', 20000), entry('waiver', 10000)]
    expect(bill(30000, entries).balanceCents).toBe(0)
    reduceWaivers(20000, entries)
    expect(bill(20000, entries).balanceCents).toBe(0)
    expect(bill(30000, entries).balanceCents).toBe(10000)
    expect(entries[1].amountCents).toBe(10000)
    reduceWaivers(15000, entries)
    expect(bill(15000, entries).creditCents).toBe(5000)
  })
  it('applies uncapped discounts, preserves legacy refunds and excludes voids', () => {
    const entries = [entry('discount', 10000), entry('payment', 30000), entry('refund', 10000)]
    expect(bill(8000, entries)).toMatchObject({
      totalCents: -2000,
      discountCents: 10000,
      creditCents: 22000,
    })
    entries[2].voidedAt = '2026-10-11'
    expect(bill(0, entries).creditCents).toBe(40000)
  })
})
