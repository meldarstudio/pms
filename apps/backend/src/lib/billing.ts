export function roomCharges(subtotalCents: number, discountCents: number) {
  const discount = Math.min(discountCents, subtotalCents)
  return { subtotalCents, discountCents: discount, totalCents: subtotalCents - discount }
}
