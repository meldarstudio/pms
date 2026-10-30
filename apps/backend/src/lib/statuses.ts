export const inventoryStatuses = ["confirmed", "checked_in", "checked_out"];

export const holdsInventory = (status: string) => inventoryStatuses.includes(status);
