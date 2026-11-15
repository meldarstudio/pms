import { complaintBook } from "../complaint-config";
import { COMPLAINT_TURNSTILE_PASS } from "./turnstile";

export const complaintInput = {
  language: "en",
  fullName: "Ana Torres",
  address: "Lima, Peru",
  documentType: "Passport",
  documentNumber: "AB123456",
  phone: "+51999999999",
  email: "ana@example.com",
  minor: false,
  representative: "",
  product: "Accommodation service",
  amountCents: null,
  category: "reclamo",
  description: "Room service was unavailable",
  requestedRemedy: "Please respond in writing",
  reservationReference: "No aplica",
  responseChannel: "email",
  policyVersion: complaintBook.policyVersion,
};

export const complaintSubmission = { ...complaintInput, turnstileToken: COMPLAINT_TURNSTILE_PASS };
