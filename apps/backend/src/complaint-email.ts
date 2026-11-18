import type { ComplaintSheet as Sheet } from "./complaint-book";
import { REPLY_TO } from "./confirmation-email";

const COPY = {
  es: {
    subject: "Hoja de Reclamación Nº",
    heading: "HOJA DE RECLAMACIÓN Nº",
    date: "Fecha",
    deadline: "Fecha límite de respuesta",
    identificationCode: "Código de identificación",
    consumer: "1. Identificación del consumidor reclamante",
    goods: "2. Identificación del bien contratado",
    detail: "3. Detalle de la reclamación y pedido del consumidor",
    provider: "4. Observaciones y acciones adoptadas por el proveedor",
    responseDate: "Fecha de comunicación de la respuesta",
    fullName: "Nombre completo",
    address: "Domicilio",
    documentType: "Tipo de documento",
    documentNumber: "Número de documento",
    phone: "Teléfono",
    email: "Correo electrónico",
    minor: "Consumidor menor de edad",
    representative: "Padre o representante",
    product: "Producto o servicio",
    amount: "Monto",
    reservationReference: "Referencia de reserva",
    category: "Tipo",
    description: "Detalle",
    requestedRemedy: "Pedido",
    responseChannel: "Canal de respuesta escrita",
    policyVersion: "Versión de privacidad",
    yes: "Sí",
    no: "No",
    unknownAmount: "No conocido / no aplica",
    channel: { email: "Correo electrónico", letter: "Carta al domicilio indicado" },
    copy: "Su hoja está registrada. Este correo es una copia; su envío no acredita la entrega. Puede responder a este correo para comunicarse con el hotel.",
    legal: [
      "Reclamo: disconformidad relacionada a los productos o servicios.",
      "Queja: disconformidad no relacionada a los productos o servicios; o, malestar o descontento respecto a la atención al público.",
      "La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.",
      "El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles, el cual es improrrogable.",
      "Destinatario: consumidor",
    ],
  },
  en: {
    subject: "Complaint sheet No.",
    heading: "HOJA DE RECLAMACIÓN (complaint sheet) No.",
    date: "Date",
    deadline: "Response deadline",
    identificationCode: "Identification code",
    consumer: "1. Consumer identification",
    goods: "2. Product or service contracted",
    detail: "3. Complaint details and consumer's request",
    provider: "4. Provider's observations and actions taken",
    responseDate: "Date the response was communicated",
    fullName: "Full name",
    address: "Address",
    documentType: "Document type",
    documentNumber: "Document number",
    phone: "Phone",
    email: "Email",
    minor: "Consumer is a minor",
    representative: "Parent or representative",
    product: "Product or service",
    amount: "Amount",
    reservationReference: "Reservation reference",
    category: "Category",
    description: "Description",
    requestedRemedy: "Requested remedy",
    responseChannel: "Written response channel",
    policyVersion: "Privacy policy version",
    yes: "Yes",
    no: "No",
    unknownAmount: "Unknown / not applicable",
    channel: { email: "Email", letter: "Letter to the address provided" },
    copy: "Your sheet is registered. This email is a copy; email submission is not proof of delivery. You can reply to this email to contact the hotel.",
    legal: [
      "Reclamo: dissatisfaction related to the products or services.",
      "Queja: dissatisfaction not related to the products or services, or discontent with customer service.",
      "Filing a reclamo does not prevent using other dispute resolution channels, and it is not a prerequisite for filing a complaint with INDECOPI.",
      "The provider must respond to the reclamo or queja within fifteen (15) business days, which cannot be extended.",
      "Recipient: consumer",
    ],
  },
};

export function complaintReceiptMessage(sheet: Sheet, senderAddress: string) {
  const { input } = sheet;
  const copy = COPY[input.language];
  const filed = new Intl.DateTimeFormat(input.language === "en" ? "en-GB" : "es-PE", {
    timeZone: sheet.timeZone,
    dateStyle: "long",
    timeStyle: "long",
  }).format(new Date(sheet.filedAt));
  const section = (title: string, rows: [string, string][]) =>
    [title, ...rows.map(([label, value]) => `${label}: ${value}`)].join("\n");
  return {
    from: `Hotel Manantial <${senderAddress}>`,
    to: [input.email],
    reply_to: REPLY_TO,
    subject: `Libro de Reclamaciones — ${copy.subject} ${sheet.reference}`,
    text: [
      `LIBRO DE RECLAMACIONES\n${copy.heading} ${sheet.reference}`,
      [
        `${copy.date}: ${filed}`,
        `${copy.deadline}: ${sheet.dueDate}`,
        `${sheet.provider.legalName} / RUC ${sheet.provider.ruc}`,
        `${sheet.provider.address} / ${copy.identificationCode}: ${sheet.bookId}`,
        sheet.establishmentId,
      ].join("\n"),
      section(copy.consumer, [
        [copy.fullName, input.fullName],
        [copy.address, input.address],
        [copy.documentType, input.documentType],
        [copy.documentNumber, input.documentNumber],
        [copy.phone, input.phone],
        [copy.email, input.email],
        [copy.minor, input.minor ? copy.yes : copy.no],
        ...(input.minor
          ? [[copy.representative, input.representative] satisfies [string, string]]
          : []),
      ]),
      section(copy.goods, [
        [copy.product, input.product],
        [
          copy.amount,
          input.amountCents === null
            ? copy.unknownAmount
            : `${(input.amountCents / 100).toFixed(2)} ${sheet.currency}`,
        ],
        [copy.reservationReference, input.reservationReference],
      ]),
      section(copy.detail, [
        [copy.category, input.category === "reclamo" ? "Reclamo" : "Queja"],
        [copy.description, input.description],
        [copy.requestedRemedy, input.requestedRemedy],
        [copy.responseChannel, copy.channel[input.responseChannel]],
        [copy.policyVersion, input.policyVersion],
      ]),
      section(copy.provider, [[copy.responseDate, ""]]),
      copy.copy,
      copy.legal.join("\n"),
    ].join("\n\n"),
  };
}
