import { translateError } from "./errors.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(translateError(code));
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function serverFieldErrors(
  cause: unknown,
  scope: "details" | "guest" | "payment",
): Record<string, string> | null {
  if (!(cause instanceof ApiError)) return null;
  const fields: Record<string, string> = {};
  if (scope === "payment") {
    if (
      cause.code === "payment date cannot be in the future" ||
      cause.code === "payment date is required"
    )
      fields.date = cause.message;
    if (cause.code === "amount cannot be zero") fields.amount = cause.message;
    if (cause.code === "method is required") fields.method = cause.message;
  }
  if (scope === "guest") {
    if (cause.code === "invalid email") fields.email = cause.message;
    if (cause.code === "guest room must belong to this reservation")
      fields.reservationRoomId = cause.message;
  }
  if (scope === "details") {
    if (
      cause.code === "stay cannot be longer than 60 nights" ||
      cause.code === "stay must be at least one night"
    )
      fields.checkOut = cause.message;
  }
  return Object.keys(fields).length ? fields : null;
}
