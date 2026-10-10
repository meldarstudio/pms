import { inclusiveDates, isValidDate, nightsBetween } from './lib/dates'
import { HttpError } from './http'

export function requireStay(checkIn: string, checkOut: string): string[] {
  if (!isValidDate(checkIn) || !isValidDate(checkOut)) throw new HttpError(400, 'invalid date')
  const length = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000
  if (length > 60) throw new HttpError(400, 'stay cannot be longer than 60 nights')
  const nights = nightsBetween(checkIn, checkOut)
  if (nights.length < 1) throw new HttpError(400, 'stay must be at least one night')
  if (nights.length > 60) throw new HttpError(400, 'stay cannot be longer than 60 nights')
  return nights
}

export function requireInclusiveRange(from: string, to: string, maxDays: number): string[] {
  if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, 'invalid date')
  const dates = inclusiveDates(from, to)
  if (dates.length < 1) throw new HttpError(400, 'invalid date range')
  if (dates.length > maxDays) throw new HttpError(400, `range cannot be longer than ${maxDays} days`)
  return dates
}

export function assertOccupancy(adults: number, children: number, maxOccupancy: number) {
  if (adults + children > maxOccupancy) throw new HttpError(400, 'too many guests for this room type')
}

export function assertDiscount(discountCents: number, subtotalCents: number) {
  if (discountCents > subtotalCents) throw new HttpError(400, 'discount cannot exceed room charges')
}
