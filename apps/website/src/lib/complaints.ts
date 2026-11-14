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
export const complaintLabels = {
  es: {
    fullName: "Nombre completo",
    address: "Domicilio",
    documentType: "Tipo de documento",
    documentNumber: "Número de documento",
    phone: "Teléfono (opcional)",
    email: "Correo electrónico",
    representative: "Padre o representante: nombre, documento, domicilio y contacto",
    product: "Producto o servicio",
    amount: "Monto (opcional; dejar vacío si no se conoce o no aplica)",
    category: "Tipo",
    description: "Detalle",
    requestedRemedy: "Pedido",
    reservationReference: "Referencia de reserva (opcional)",
    responseChannel: "Canal de respuesta escrita",
    minor: "Consumidor menor de edad",
  },
  en: {
    fullName: "Full name",
    address: "Address",
    documentType: "Document type",
    documentNumber: "Document number",
    phone: "Phone (optional)",
    email: "Email",
    representative: "Parent or representative: name, document, address and contact",
    product: "Product or service",
    amount: "Amount (optional; leave blank if unknown or not applicable)",
    category: "Category",
    description: "Description",
    requestedRemedy: "Requested remedy",
    reservationReference: "Reservation reference (optional)",
    responseChannel: "Written response channel",
    minor: "Consumer is a minor",
  },
};
export const complaintProblems: Record<string, { es: string; en: string }> = {
  "complaint book unavailable": {
    es: "Libro de desarrollo no configurado. No ingrese datos reales.",
    en: "Development book is not configured. Do not enter real personal data.",
  },
  "complaint calendar unavailable": {
    es: "El calendario de respuesta no está configurado. Sus datos se conservan; reintente más tarde.",
    en: "The response calendar is not configured. Your draft is retained; retry later.",
  },
  "complaint privacy information changed": {
    es: "La información de privacidad cambió. Recargue para revisarla; se conserva el borrador.",
    en: "Privacy information changed. Reload to review it; your draft is retained.",
  },
  "complaint retry differs from saved sheet": {
    es: "Este envío ya tiene una hoja registrada. Recupere la constancia antes de enviar otra.",
    en: "This submission already has a saved sheet. Recover its receipt before filing another.",
  },
  "invalid complaint receipt credential": {
    es: "No se encontró una constancia para este envío.",
    en: "No receipt was found for this submission.",
  },
  "invalid complaint fields": {
    es: "Revise los campos indicados.",
    en: "Review the indicated fields.",
  },
  "minor representative is required": {
    es: "Ingrese los datos del padre o representante.",
    en: "Enter the parent or representative details.",
  },
  "response email is required": {
    es: "Ingrese un correo para la respuesta escrita.",
    en: "Enter an email address for the written response.",
  },
  "too many complaints; retry in one minute": {
    es: "Espere un minuto y reintente el mismo envío. Se conserva el borrador.",
    en: "Wait one minute and retry the same submission. Your draft is retained.",
  },
};
