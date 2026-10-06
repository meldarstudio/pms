import { describe, expect, it } from 'vitest'
import { quoteNights, totalCents } from './quote'

describe('quote', () => {
  const dates = ['2026-12-24', '2026-12-25', '2026-12-26']

  it('uses the room type base price when a date has no override', () => {
    const nights = quoteNights(dates, 10000, new Map([['2026-12-25', 14000]]))
    expect(nights).toEqual([
      { date: '2026-12-24', priceCents: 10000 },
      { date: '2026-12-25', priceCents: 14000 },
      { date: '2026-12-26', priceCents: 10000 },
    ])
    expect(totalCents(nights)).toBe(34000)
  })

  it('replaces every night when a line has a flat rate', () => {
    const nights = quoteNights(dates, 10000, new Map([['2026-12-25', 14000]]), 8000)
    expect(nights.every((night) => night.priceCents === 8000)).toBe(true)
  })
})
