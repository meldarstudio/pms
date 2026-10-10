type NightPrice = { date: string; priceCents: number }

export function bookingRoomCharges(
  savedNights: NightPrice[] | undefined,
  quotedNights: NightPrice[] | undefined,
  datesChanged: boolean,
  discountCents: number
) {
  const nights = savedNights && !datesChanged ? savedNights : quotedNights
  if (!nights) return null
  const kept = new Map(
    savedNights?.map((night) => [night.date, night.priceCents])
  )
  const subtotalCents = nights.reduce(
    (sum, night) => sum + (kept.get(night.date) ?? night.priceCents),
    0
  )
  const discount = Math.min(discountCents, subtotalCents)
  return {
    subtotalCents,
    discountCents: discount,
    totalCents: subtotalCents - discount,
  }
}

export function bookingSummary(
  lines: {
    status: string | null
    charges: ReturnType<typeof bookingRoomCharges>
    invalid: boolean
  }[],
  paidCents: number
) {
  let subtotalCents = 0
  let discountCents = 0
  for (const line of lines) {
    if (line.status === "cancelled") continue
    if (!line.charges || line.invalid) return null
    subtotalCents += line.charges.subtotalCents
    discountCents += line.charges.discountCents
  }
  const totalCents = subtotalCents - discountCents
  return {
    subtotalCents,
    discountCents,
    totalCents,
    balanceCents: totalCents - paidCents,
  }
}
