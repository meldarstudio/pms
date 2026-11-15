import { address, email, legalName, phoneNumber, taxId } from "@/lib/constants";
import { formatPhoneNumber } from "@/lib/utils";
import type { LocalizedLegalDocument } from "./document";

const phone = formatPhoneNumber(phoneNumber);

export const privacyInformation: LocalizedLegalDocument = {
  es: {
    title: "Información de privacidad",
    description: `Cómo ${legalName} trata los datos personales de reservas, pagos y reclamos.`,
    effective: "Vigente desde el 15 de noviembre de 2026.",
    intro:
      "Esta información explica qué datos personales tratamos al reservar, pagar, alojarse o presentar un reclamo, para qué los usamos, con quién los compartimos y cómo puede ejercer sus derechos. No necesita aceptarla: se la ofrecemos para que decida informado.",
    sections: [
      {
        heading: "Responsable",
        paragraphs: [
          `${legalName}, RUC ${taxId}, con domicilio en ${address}. Contacto: ${email} o WhatsApp ${phone}.`,
        ],
      },
      {
        heading: "Qué datos tratamos y para qué",
        items: [
          "Reserva en línea: nombre completo, correo electrónico, teléfono y, si lo desea, una nota para el hotel. Los usamos para preparar su precio, registrar su aceptación de las condiciones, crear la reserva, enviarle la confirmación y comunicarnos con usted sobre su estadía.",
          "Pago con tarjeta: los datos de la tarjeta los recibe directamente Culqi; el hotel no los ve ni los guarda. Para procesar el cargo y prevenir fraude, enviamos a Culqi su correo, nombre, teléfono y un identificador del dispositivo.",
          "Reservas por WhatsApp, teléfono o en recepción: los datos que usted nos comparte para reservar y coordinar el pago.",
          "Alojamiento: el nombre y el documento de identidad de los huéspedes, que registramos al llegar para cumplir las obligaciones de los establecimientos de hospedaje.",
          "Pagos, devoluciones y comprobantes: montos, fechas y medios de pago, para llevar la cuenta de su reserva y cumplir obligaciones tributarias.",
          "Libro de Reclamaciones: los datos del formulario, para registrar, atender y responder su reclamo o queja.",
          "Seguridad: Cloudflare Turnstile verifica el navegador antes de pagar o de enviar un reclamo, y nuestros servidores registran datos técnicos como la dirección IP para proteger el servicio.",
        ],
      },
      {
        heading: "Base del tratamiento",
        paragraphs: [
          "Tratamos estos datos porque son necesarios para preparar y cumplir su reserva o atender su reclamo, y para cumplir obligaciones legales. Por eso no le pedimos un consentimiento aparte.",
          "No usamos sus datos de reserva ni de reclamo para publicidad. Si algún día ofrecemos comunicaciones comerciales, le pediremos un consentimiento separado y opcional, que podrá retirar en cualquier momento.",
        ],
      },
      {
        heading: "Datos obligatorios y opcionales",
        paragraphs: [
          "Para reservar en línea son obligatorios el nombre completo, el correo y el teléfono; sin ellos no podemos crear ni confirmar la reserva. La nota es opcional. Los datos obligatorios del Libro de Reclamaciones se indican en su formulario.",
        ],
      },
      {
        heading: "Con quién compartimos datos",
        paragraphs: [
          "Accede a sus datos el personal del hotel que gestiona reservas y reclamos. Las autoridades competentes pueden recibirlos cuando la ley lo exija. Además, usamos estos proveedores, que tratan datos por encargo nuestro:",
        ],
        items: [
          "Cloudflare: alojamiento del sitio web y de nuestros sistemas, base de datos, archivos del Libro de Reclamaciones y verificación Turnstile.",
          "Culqi: procesamiento de pagos con tarjeta y prevención de fraude.",
          "Resend: envío de correos de confirmación y de constancias de reclamo.",
          "Google (Gmail): recepción de las respuestas que usted envía a nuestro correo.",
          "WhatsApp (Meta): solo si usted decide escribirnos por ese medio.",
        ],
      },
      {
        heading: "Transferencias fuera del Perú",
        paragraphs: [
          "Cloudflare, Resend, Google y Meta pueden tratar datos en servidores fuera del Perú, por ejemplo en Estados Unidos. No afirmamos que sus datos permanezcan siempre en el Perú.",
        ],
      },
      {
        heading: "Cuánto tiempo los conservamos",
        items: [
          "Una revisión de reserva en línea que no termina en reserva se elimina, con sus datos de contacto, después de 30 días sin actividad.",
          "El enlace privado de su reserva deja de funcionar 30 días después de la fecha de salida.",
          "Las reservas, los pagos y las devoluciones se conservan mientras sean necesarios para su estadía y, después, durante el plazo de las obligaciones tributarias y contables, normalmente cinco años.",
          "Las hojas de reclamación y sus respuestas se conservan al menos dos años desde su presentación.",
        ],
      },
      {
        heading: "Almacenamiento en su navegador",
        paragraphs: [
          "Este sitio no usa cookies propias ni herramientas de analítica o publicidad. Durante una reserva o un reclamo guardamos temporalmente su búsqueda, sus datos de contacto, el avance del pago o el borrador del reclamo en el almacenamiento de la sesión del navegador, para que no los pierda al recargar la página. Se borra al cerrar la pestaña o el navegador; en un dispositivo compartido, ciérrelo al terminar.",
          "Los servicios de Culqi y Cloudflare Turnstile se cargan solo en los pasos de pago y del Libro de Reclamaciones, y pueden usar su propio almacenamiento para funcionar y prevenir fraude.",
        ],
      },
      {
        heading: "Sus derechos",
        paragraphs: [
          `Puede solicitar información, acceso, rectificación, cancelación u oposición sobre sus datos escribiendo a ${email} o en nuestro domicilio. Indique su nombre y, si se refiere a una reserva, su referencia. La cancelación puede quedar limitada por los plazos de conservación que exige la ley.`,
          "Si considera que no atendimos su solicitud, puede acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.",
        ],
      },
      {
        heading: "Cambios",
        paragraphs: [
          "Si cambiamos esta información, publicaremos la nueva versión en esta página con su fecha de vigencia.",
        ],
      },
    ],
  },
  en: {
    title: "Privacy information",
    description: `How ${legalName} handles personal data from reservations, payments and complaints.`,
    effective: "Effective November 15, 2026.",
    intro:
      "This information explains what personal data we handle when you book, pay, stay or file a complaint, what we use it for, who we share it with and how you can exercise your rights. You do not need to accept it: we provide it so you can decide with full information.",
    sections: [
      {
        heading: "Controller",
        paragraphs: [
          `${legalName}, RUC ${taxId}, ${address}. Contact: ${email} or WhatsApp ${phone}.`,
        ],
      },
      {
        heading: "What data we handle and why",
        items: [
          "Online booking: full name, email, phone and, if you wish, a note for the hotel. We use them to prepare your price, record your acceptance of the conditions, create the reservation, send your confirmation and contact you about your stay.",
          "Card payment: Culqi receives your card details directly; the hotel neither sees nor stores them. To process the charge and prevent fraud, we send Culqi your email, name, phone and a device identifier.",
          "Bookings by WhatsApp, phone or at the front desk: the details you share with us to book and arrange payment.",
          "Your stay: guests' names and identity documents, which we record on arrival to meet the obligations of lodging establishments.",
          "Payments, refunds and receipts: amounts, dates and payment methods, to keep your reservation's account and meet tax obligations.",
          "Complaints book: the details in the form, to record, handle and respond to your complaint.",
          "Security: Cloudflare Turnstile checks the browser before you pay or submit a complaint, and our servers log technical data such as your IP address to protect the service.",
        ],
      },
      {
        heading: "Basis for processing",
        paragraphs: [
          "We handle this data because it is necessary to prepare and fulfil your reservation or handle your complaint, and to meet legal obligations. That is why we do not ask for separate consent.",
          "We do not use your reservation or complaint details for marketing. If we ever offer marketing messages, we will ask for separate, optional consent that you can withdraw at any time.",
        ],
      },
      {
        heading: "Required and optional information",
        paragraphs: [
          "To book online, your full name, email and phone are required; without them we cannot create or confirm the reservation. The note is optional. The complaints book form marks its own required fields.",
        ],
      },
      {
        heading: "Who we share data with",
        paragraphs: [
          "Hotel staff who manage reservations and complaints can access your data. Competent authorities may receive it when required by law. We also use these providers, which process data on our behalf:",
        ],
        items: [
          "Cloudflare: hosting for the website and our systems, database, complaints book files and Turnstile verification.",
          "Culqi: card payment processing and fraud prevention.",
          "Resend: delivery of confirmation emails and complaint receipts.",
          "Google (Gmail): receiving the replies you send to our email address.",
          "WhatsApp (Meta): only if you choose to message us there.",
        ],
      },
      {
        heading: "Transfers outside Peru",
        paragraphs: [
          "Cloudflare, Resend, Google and Meta may process data on servers outside Peru, for example in the United States. We do not claim that your data always stays in Peru.",
        ],
      },
      {
        heading: "How long we keep it",
        items: [
          "An online booking review that does not become a reservation is deleted, with its contact details, after 30 days without activity.",
          "Your reservation's private link stops working 30 days after the checkout date.",
          "Reservations, payments and refunds are kept as long as needed for your stay and then for the period required by tax and accounting obligations, normally five years.",
          "Complaint sheets and their responses are kept for at least two years from submission.",
        ],
      },
      {
        heading: "Storage in your browser",
        paragraphs: [
          "This site does not use its own cookies or any analytics or advertising tools. During a booking or complaint, we temporarily keep your search, contact details, payment progress or complaint draft in your browser's session storage so you do not lose them on reload. It is cleared when you close the tab or browser; on a shared device, close it when you finish.",
          "Culqi and Cloudflare Turnstile load only on the payment and complaints book steps, and may use their own storage to work and prevent fraud.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          `You may request information, access, correction, cancellation or objection regarding your data by writing to ${email} or to our address. Include your name and, for a reservation, its reference. Cancellation may be limited by legally required retention periods.`,
          "If you believe we did not address your request, you may contact Peru's National Personal Data Protection Authority at the Ministry of Justice and Human Rights.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: [
          "If we change this information, we will publish the new version on this page with its effective date.",
        ],
      },
    ],
  },
};
