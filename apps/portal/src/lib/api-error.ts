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

export class NetworkError extends Error {
  constructor(options?: ErrorOptions) {
    super("No se pudo conectar con el servidor. Inténtalo de nuevo.", options);
    this.name = "NetworkError";
  }
}

export type ReadErrorKind = "not-found" | "offline" | "unexpected";

export function readErrorKind(error: unknown): ReadErrorKind {
  if (error instanceof NetworkError) return "offline";
  if (error instanceof ApiError && error.status === 404) return "not-found";
  return "unexpected";
}

export function readErrorMessage(error: unknown): string | null {
  if (error instanceof ApiError) return knownErrorMessage(error.code);
  return null;
}

type FieldRule = (error: ApiError) => string | null;

const contactRules: FieldRule[] = [
  ({ code }) => (code === "invalid email" ? "email" : null),
  ({ field }) => (field === "phone" ? "phone" : null),
];

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
