import type { ReservationDetailStatus } from "./api";

export const inventoryStatuses = [
  "confirmed",
  "checked_in",
  "checked_out",
] as const satisfies readonly ReservationDetailStatus[];

export type InventoryStatus = (typeof inventoryStatuses)[number];

export function holdsInventory(status: string): status is InventoryStatus {
  return (inventoryStatuses as readonly string[]).includes(status);
}
