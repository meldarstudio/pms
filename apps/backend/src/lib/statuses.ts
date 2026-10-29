export const holdsInventory = (status: string) =>
  status === "confirmed" || status === "checked_in" || status === "checked_out";
