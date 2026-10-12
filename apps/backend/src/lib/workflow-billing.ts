export type LedgerEntry = {
  id: string
  kind: string
  amountCents: number
  appliedCents: number
  createdAt: string
  voidedAt: string | null
}

// Discounts apply in full. Legacy waivers retain their previously applied debt.
export function bill(
  charges: number,
  entries: LedgerEntry[],
  discountCents: number,
  options: { cancelled?: boolean } = {},
) {
  let remaining = charges
  let waiverCents = 0
  let paidCents = 0
  let refundCents = 0
  const applied = new Map<string, number>()
  const active = entries
    .filter(
      (e) => !e.voidedAt && !(options.cancelled && e.kind === 'waiver'),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  for (const e of active) {
    if (e.kind === 'payment' || e.kind === 'legacy_signed') paidCents += e.amountCents
    if (e.kind === 'refund') refundCents += e.amountCents
  }
  const appliedDiscount = options.cancelled ? 0 : discountCents
  remaining -= appliedDiscount
  for (const e of active) {
    if (e.kind !== 'waiver') continue
    const value = Math.min(Math.max(0, remaining), e.appliedCents)
    applied.set(e.id, value)
    waiverCents += value
    remaining -= value
  }
  const balanceCents = remaining - paidCents + refundCents
  return {
    subtotalCents: charges,
    discountCents: appliedDiscount,
    waiverCents,
    totalCents: remaining,
    paidCents,
    refundCents,
    balanceCents,
    creditCents: Math.max(0, -balanceCents),
    applied,
  }
}

export function reduceWaivers(charges: number, entries: LedgerEntry[], discountCents: number) {
  const totals = bill(charges, entries, discountCents)
  let budget = Math.max(0, charges - totals.discountCents - totals.paidCents + totals.refundCents)
  for (const e of [...entries].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )) {
    if (e.voidedAt || e.kind !== 'waiver') continue
    e.appliedCents = Math.min(e.appliedCents, budget)
    budget -= e.appliedCents
  }
}
