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

/** The form field a rejection belongs to, or null when it is not this rule's. */
type FieldRule = (error: ApiError) => string | null;

const contactRules: FieldRule[] = [
  ({ code }) => (code === "invalid email" ? "email" : null),
  ({ field }) => (field === "phone" ? "phone" : null),
];

/** The one table of which form field shows a server rejection, by what the form edits. */
const fieldRules = {
  payment: [
    ({ code }) =>
      code === "payment date cannot be in the future" || code === "payment date is required"
        ? "date"
        : null,
    ({ code }) => (code === "amount cannot be zero" ? "amount" : null),
    ({ code }) => (code === "method is required" ? "method" : null),
  ],
  contact: contactRules,
  // Staying guests share the Booking contact's email and phone field names in their form.
  guest: [
    ...contactRules,
    ({ code }) =>
      code === "guest room must belong to this reservation" ? "reservationRoomId" : null,
  ],
  details: [
    ({ code }) =>
      code === "stay cannot be longer than 60 nights" || code === "stay must be at least one night"
        ? "checkOut"
        : null,
  ],
} satisfies Record<string, FieldRule[]>;

export type FieldScope = keyof typeof fieldRules;

/** Rejection messages keyed by the form fields they belong to, or null when none does. */
export function serverFieldErrors(
  cause: unknown,
  ...scopes: FieldScope[]
): Record<string, string> | null {
  if (!(cause instanceof ApiError)) return null;
  const fields: Record<string, string> = {};
  for (const scope of scopes)
    for (const rule of fieldRules[scope]) {
      const name = rule(cause);
      if (name) fields[name] = cause.message;
    }
  return Object.keys(fields).length ? fields : null;
}
