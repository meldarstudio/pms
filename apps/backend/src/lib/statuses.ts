import type { ReservationStatus } from "../db/schema";

export const inventoryStatuses: ReservationStatus[] = ["confirmed", "checked_in", "checked_out"];

export const holdsInventory = (status: ReservationStatus) => inventoryStatuses.includes(status);
