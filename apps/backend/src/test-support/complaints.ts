import type { ComplaintBookConfig } from "../complaint-config";

import fixture from "./complaint-book.development.json";
export const developmentBook = fixture as ComplaintBookConfig;

export const complaintInput = {
  language: "en",
  fullName: "Ana Torres",
  address: "Lima, Peru",
  documentType: "Passport",
  documentNumber: "AB123456",
  phone: "",
  email: "ana@example.com",
  minor: false,
  representative: "",
  product: "Accommodation service",
  amountCents: null,
  category: "reclamo",
  description: "Room service was unavailable",
  requestedRemedy: "Please respond in writing",
  reservationReference: "",
  responseChannel: "email",
  policyVersion: "development-1",
};
