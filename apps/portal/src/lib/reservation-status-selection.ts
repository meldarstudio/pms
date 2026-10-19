export const reservationStatusValues = [
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
] as const;
export type ReservationStatus = (typeof reservationStatusValues)[number];

declare const serializedStatuses: unique symbol;
export type SerializedReservationStatuses = string & { readonly [serializedStatuses]: true };

// Controls always have a nonempty selection; all statuses means unrestricted.
// Legacy empty/all URL values still mean unrestricted at the URL/API seam.
export class ReservationStatusSelection {
  readonly values: readonly ReservationStatus[];

  constructor(values: readonly ReservationStatus[] = reservationStatusValues) {
    this.values = reservationStatusValues.filter(
      (status) => !values.length || values.includes(status),
    );
  }

  static parse(value: unknown, fallback = new ReservationStatusSelection()) {
    if (value === "all" || value === "") return new ReservationStatusSelection();
    if (typeof value !== "string") return fallback;
    const selected = value
      .split(",")
      .filter((status): status is ReservationStatus =>
        reservationStatusValues.includes(status as ReservationStatus),
      );
    return selected.length ? new ReservationStatusSelection(selected) : fallback;
  }

  get unrestricted() {
    return this.values.length === reservationStatusValues.length;
  }

  withStatus(status: ReservationStatus, checked: boolean) {
    const next = checked
      ? [...this.values, status]
      : this.values.filter((value) => value !== status);
    return next.length ? new ReservationStatusSelection(next) : this;
  }

  toSearch() {
    return (this.unrestricted ? "all" : this.values.join(",")) as SerializedReservationStatuses;
  }

  toQuery() {
    return this.unrestricted ? undefined : this.toSearch();
  }
}
