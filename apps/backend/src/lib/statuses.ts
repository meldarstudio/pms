/**
 * Confirmed, checked-in and checked-out reservations hold their room inventory.
 * Cancelled and No-show release it; their outcome charge replaces the stay bill.
 */
export const holdsInventory = (status: string) =>
  status === "confirmed" || status === "checked_in" || status === "checked_out";
