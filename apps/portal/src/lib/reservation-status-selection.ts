export const reservationStatusValues = [
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
] as const;
export type ReservationStatus = (typeof reservationStatusValues)[number];

declare const serializedStatuses: unique symbol;
export type SerializedReservationStatuses = string & { readonly [serializedStatuses]: true };

// An empty selection is unrestricted, not an empty result set. CSV belongs only
// at the URL/API seam; controls operate on typed statuses and share transitions.
export class ReservationStatusSelection {
  readonly values: readonly ReservationStatus[];

  constructor(values: readonly ReservationStatus[] = []) {
    this.values = reservationStatusValues.filter((status) => values.includes(status));
  }

  static parse(value: unknown, fallback = new ReservationStatusSelection()) {
    if (value === "all" || value === "") return new ReservationStatusSelection();
    if (typeof value !== "string") return fallback;
    const selected = new ReservationStatusSelection(
      value
        .split(",")
        .filter((status): status is ReservationStatus =>
          reservationStatusValues.includes(status as ReservationStatus),
        ),
    );
    return selected.unrestricted ? fallback : selected;
  }

  get unrestricted() {
    return this.values.length === 0;
  }

  withStatus(status: ReservationStatus, checked: boolean) {
    return new ReservationStatusSelection(
      checked ? [...this.values, status] : this.values.filter((value) => value !== status),
    );
  }

  toSearch() {
    return (this.unrestricted ? "all" : this.values.join(",")) as SerializedReservationStatuses;
  }

  toQuery() {
    return this.unrestricted ? undefined : this.toSearch();
  }
}
