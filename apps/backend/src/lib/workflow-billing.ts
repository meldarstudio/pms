export function bill(
  charges: number,
  payments: { amountCents: number }[],
  discountCents: number,
  options: { cancelled?: boolean } = {},
) {
  const appliedDiscount = options.cancelled ? 0 : discountCents
  const totalCents = charges - appliedDiscount
  const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0)
  const balanceCents = totalCents - paidCents
  return {
    subtotalCents: charges,
    discountCents: appliedDiscount,
    totalCents,
    paidCents,
    balanceCents,
    creditCents: Math.max(0, -balanceCents),
  }
}
