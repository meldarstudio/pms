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
  coupon: [
    ({ code }) =>
      [
        "coupon redemption exceeds its balance",
        "coupon redemption exceeds the balance owed",
      ].includes(code)
        ? "amount"
        : null,
    ({ code }) =>
      [
        "coupon not found",
        "coupon has expired",
        "stay starts after the coupon expires",
        "reservation already uses another coupon",
        "coupon cannot be redeemed on the reservation that issued it",
        "coupon requires an active reservation",
      ].includes(code)
        ? "code"
        : null,
  ],
  payment: [
    ({ code }) =>
      code === "payment date cannot be in the future" || code === "payment date is required"
        ? "date"
        : null,
    ({ code }) => (code === "amount cannot be zero" ? "amount" : null),
    ({ code }) => (code === "method is required" ? "method" : null),
  ],
  refund: [
    ({ code }) =>
      code === "refund exceeds the refund due" ||
      code === "refund exceeds the payment's remaining amount" ||
      code === "coupon exceeds the refund due" ||
      code === "Culqi refund must be at least 100 cents"
        ? "amount"
        : null,
    ({ code }) =>
      code === "a Culqi refund for this payment is pending" ||
      code === "payment is not a Culqi payment"
        ? "source"
        : null,
    ({ code }) => (code === "refund date cannot be in the future" ? "date" : null),
  ],
  contact: contactRules,
  guest: contactRules,
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
