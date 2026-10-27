import { knownErrorMessage, translateError } from "./errors.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  constructor(status: number, code: string, field?: string) {
    super(translateError(code));
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/** A request that never reached the API, such as a dropped connection. */
export class NetworkError extends Error {
  constructor(options?: ErrorOptions) {
    super("No se pudo conectar con el servidor. Inténtalo de nuevo.", options);
    this.name = "NetworkError";
  }
}

/** How a page explains a failed read. 401 never gets here: it returns to the login form. */
export type ReadErrorKind = "not-found" | "offline" | "unexpected";

export function readErrorKind(error: unknown): ReadErrorKind {
  if (error instanceof NetworkError) return "offline";
  if (error instanceof ApiError && error.status === 404) return "not-found";
  return "unexpected";
}

/** The Spanish explanation for a failed read, or null when only generic copy fits. */
export function readErrorMessage(error: unknown): string | null {
  if (error instanceof ApiError) return knownErrorMessage(error.code);
  return null;
}

export function serverFieldErrors(
  cause: unknown,
  scope: "details" | "guest",
): Record<string, string> | null {
  if (!(cause instanceof ApiError)) return null;
  const fields: Record<string, string> = {};
  if (scope === "guest") {
    if (cause.code === "invalid email") fields.email = cause.message;
    if (cause.field === "phone") fields.phone = cause.message;
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
