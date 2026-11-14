import { useTranslations } from "@/i18n/utils";
import { reservationApiUrl } from "./reservation/api";
export const developmentComplaintPreview = ["localhost", "127.0.0.1", "[::1]"].includes(
  new URL(reservationApiUrl).hostname,
);

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
export type ComplaintConfig = {
  development: true;
  provider: { legalName: string; ruc: string; address: string };
  establishmentId: string;
  collectionNotice: Record<"es" | "en", string>;
  privacyInformation: Record<"es" | "en", string>;
  policyVersion: string;
};
export type ComplaintReceipt = {
  id: string;
  reference: string;
  establishmentId: string;
  provider: ComplaintConfig["provider"];
  filedAt: string;
  registeredAt: string;
  dueDate: string;
  timeZone: string;
  currency: string;
  source: string;
  originalReference: string | null;
  input: ComplaintInput;
  email: { status: "pending" | "sent" | "failed" | "not_requested" };
  responses: unknown[];
};
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
  "complaint book unavailable": "complaints.error.complaint_book_unavailable",
  "complaint calendar unavailable": "complaints.error.complaint_calendar_unavailable",
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
