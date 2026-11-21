import { Data, Effect, Schema } from "effect";
import { type HttpClientResponse, HttpIncomingMessage } from "effect/http";
import { useTranslations } from "@/i18n/utils";
import {
  errorMessage,
  isSuccess,
  type PmsClient,
  type PmsFailure,
  pmsGet,
  pmsPost,
} from "@/lib/pms-client";

export type ComplaintInput = {
  language: "es" | "en";
  fullName: string;
  address: string;
  documentType: string;
  documentNumber: string;
  phone: string;
  email: string;
  minor: boolean;
  representative: string;
  product: string;
  amountCents: number | null;
  category: "reclamo" | "queja";
  description: string;
  requestedRemedy: string;
  reservationReference: string;
  responseChannel: "email" | "letter";
  policyVersion: string;
};
export type ComplaintSubmission = ComplaintInput & { turnstileToken: string };
export type ComplaintConfig = {
  provider: { legalName: string; ruc: string; address: string };
  establishmentId: string;
  collectionNotice: Record<"es" | "en", string>;
  privacyInformation: Record<"es" | "en", string>;
  policyVersion: string;
};

const ComplaintProvider = Schema.Struct({
  legalName: Schema.String,
  ruc: Schema.String,
  address: Schema.String,
});

const RecordedComplaintInput = Schema.Struct({
  language: Schema.Literals(["es", "en"]),
  fullName: Schema.String,
  address: Schema.String,
  documentType: Schema.String,
  documentNumber: Schema.String,
  phone: Schema.String,
  email: Schema.String,
  minor: Schema.Boolean,
  representative: Schema.String,
  product: Schema.String,
  amountCents: Schema.NullOr(Schema.Number),
  category: Schema.Literals(["reclamo", "queja"]),
  description: Schema.String,
  requestedRemedy: Schema.String,
  reservationReference: Schema.String,
  responseChannel: Schema.Literals(["email", "letter"]),
  policyVersion: Schema.String,
});

const ComplaintReceipt = Schema.Struct({
  id: Schema.String,
  bookId: Schema.String,
  reference: Schema.String,
  establishmentId: Schema.String,
  provider: ComplaintProvider,
  filedAt: Schema.String,
  registeredAt: Schema.String,
  dueDate: Schema.String,
  timeZone: Schema.String,
  currency: Schema.String,
  source: Schema.String,
  originalReference: Schema.NullOr(Schema.String),
  input: RecordedComplaintInput,
  email: Schema.Struct({ status: Schema.Literals(["pending", "sent", "failed", "not_requested"]) }),
  responses: Schema.Array(Schema.Unknown),
});
export type ComplaintReceipt = typeof ComplaintReceipt.Type;

const decodeReceipt = HttpIncomingMessage.schemaBodyJson(ComplaintReceipt);

export class ComplaintRejected extends Data.TaggedError("ComplaintRejected")<{
  status: number;
  code: string | null;
  field: string | null;
}> {}

export class ComplaintUnreachable extends Data.TaggedError("ComplaintUnreachable") {}

const complaintReceipt = (
  exchange: Effect.Effect<HttpClientResponse.HttpClientResponse, PmsFailure, PmsClient>,
): Effect.Effect<ComplaintReceipt, ComplaintRejected | ComplaintUnreachable, PmsClient> =>
  Effect.gen(function* () {
    const response = yield* exchange;
    if (isSuccess(response)) return yield* decodeReceipt(response);
    if ((yield* response.json) === null) return yield* Effect.fail(new ComplaintUnreachable());
    return yield* Effect.fail(
      new ComplaintRejected({
        status: response.status,
        code: yield* errorMessage(response),
        field: response.headers["x-error-field"] ?? null,
      }),
    );
  }).pipe(
    Effect.catchTags({
      HttpClientError: () => Effect.fail(new ComplaintUnreachable()),
      SchemaError: () => Effect.fail(new ComplaintUnreachable()),
    }),
  );

export const readComplaintReceipt = (token: string) =>
  complaintReceipt(pmsGet("/public/complaints/receipt", { token }));

export const fileComplaint = (token: string, submission: ComplaintSubmission) =>
  complaintReceipt(pmsPost("/public/complaints", { token, body: submission }));

export function complaintLabels(language: "es" | "en") {
  const t = useTranslations(language);
  return {
    fullName: t("complaints.field.fullName"),
    address: t("complaints.field.address"),
    documentType: t("complaints.field.documentType"),
    documentNumber: t("complaints.field.documentNumber"),
    phone: t("complaints.field.phone"),
    email: t("complaints.field.email"),
    representative: t("complaints.field.representative"),
    product: t("complaints.field.product"),
    amount: t("complaints.field.amount"),
    category: t("complaints.field.category"),
    description: t("complaints.field.description"),
    requestedRemedy: t("complaints.field.requestedRemedy"),
    reservationReference: t("complaints.field.reservationReference"),
    responseChannel: t("complaints.field.responseChannel"),
    minor: t("complaints.field.minor"),
  };
}
const complaintProblemKeys = {
  "complaint security check failed": "complaints.securityFailed",
  "complaint security check is unavailable": "complaints.securityUnavailable",
  "complaint privacy information changed": "complaints.error.complaint_privacy_information_changed",
  "complaint retry differs from saved sheet":
    "complaints.error.complaint_retry_differs_from_saved_sheet",
  "invalid complaint receipt credential": "complaints.error.invalid_complaint_receipt_credential",
  "invalid complaint fields": "complaints.error.invalid_complaint_fields",
  "minor representative is required": "complaints.error.minor_representative_is_required",
  "response email is required": "complaints.error.response_email_is_required",
  "too many complaints; retry in one minute":
    "complaints.error.too_many_complaints_retry_in_one_minute",
} as const;
export function complaintProblem(message: string, language: "es" | "en") {
  const key = complaintProblemKeys[message as keyof typeof complaintProblemKeys];
  return key ? useTranslations(language)(key) : undefined;
}
