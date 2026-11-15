import logo from "./confirmation-email-logo.json";
import { chargeableCents, freeCancellationUntil } from "./lib/cancellation";
import { acceptedTerms, type RatePlanCode } from "./lib/rate-plans";
import { reservationBill } from "./lib/reservation-bill";
import type { State } from "./reservation-read";

export const confirmationEmailAttachments = [logo];

export type ConfirmationEmailSection =
  | { action: true }
  | { title: string; lines: string[] }
  | { stay: { checkIn: string; checkOut: string; room: string; plan: string } }
  | { payment: { label: string; value: string; emphasis?: boolean }[]; note: string | null };

export function confirmationEmailText(section: ConfirmationEmailSection, language: "es" | "en") {
  if ("action" in section) return [];
  if ("stay" in section) {
    const english = language === "en";
    return [
      `${english ? "Check-in" : "Llegada"}: ${section.stay.checkIn}`,
      `${english ? "Check-out" : "Salida"}: ${section.stay.checkOut}`,
      `${english ? "Room" : "Habitación"}: ${section.stay.room}`,
      `Plan: ${section.stay.plan}`,
    ];
  }
  if ("payment" in section) {
    return [
      ...section.payment.map((row) => `${row.label}: ${row.value}`),
      ...(section.note ? [section.note] : []),
    ];
  }
  return section.lines;
}

export function renderConfirmationEmail(input: {
  language: "es" | "en";
  code: string;
  kind: "confirmation" | "summary";
  sections: ConfirmationEmailSection[];
  link: string | null;
  assistance: string;
}) {
  const english = input.language === "en";
  const title =
    input.kind === "summary"
      ? english
        ? "Your reservation summary"
        : "Resumen de tu reserva"
      : english
        ? "Your reservation is confirmed"
        : "Tu reserva está confirmada";
  const reference = `${english ? "Reference" : "Reserva"}: ${input.code}`;
  const introduction =
    input.kind === "summary"
      ? english
        ? "Here is a dated summary of your reservation. Contact us for current information."
        : "Aquí encontrarás un resumen fechado de tu reserva. Contáctanos para información actual."
      : english
        ? "We look forward to welcoming you to Churín. Here are the details of your stay."
        : "Te esperamos en Churín. Aquí encontrarás los detalles de tu estadía.";
  const action = input.link
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#f27b00" style="border-radius:3px;">
<a href="${escapeHtml(input.link)}" style="display:block;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;font-weight:500;letter-spacing:1.8px;text-transform:uppercase;color:#1c1917;text-decoration:none;">${english ? "VIEW MY RESERVATION" : "VER MI RESERVA"}</a>
</td></tr></table>`
    : `<p style="margin:0;font-size:14px;line-height:23px;">${escapeHtml(input.assistance)}</p>`;
  const sections = input.sections
    .map((section) => {
      if ("action" in section) {
        return `<tr><td style="padding:0 26px;">${action}</td></tr>`;
      }
      if ("stay" in section) {
        const { stay } = section;
        return `<tr><td style="padding:0 26px 25px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4;"><tr>
${[
  [english ? "CHECK-IN" : "LLEGADA", stay.checkIn],
  [english ? "CHECK-OUT" : "SALIDA", stay.checkOut],
]
  .map(
    (
      [label, date],
      index,
    ) => `<td width="50%" valign="top" style="padding:21px ${index === 0 ? "8px 21px 0;border-right:1px solid #e7e5e4" : "0 21px 18px"};">
<p style="margin:0 0 8px;font-size:11px;line-height:17px;letter-spacing:1px;color:#78716c;">${label}</p>
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:30px;color:#1c1917;">${escapeHtml(date!)}</p>
</td>`,
  )
  .join("\n")}
</tr></table>
<p style="margin:23px 0 5px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:28px;color:#1c1917;">${escapeHtml(stay.room)}</p>
<p style="margin:0;font-size:13px;line-height:21px;color:#78716c;">Plan: ${escapeHtml(stay.plan)}</p>
</td></tr>`;
      }
      if ("payment" in section) {
        const rows = section.payment
          .map(
            (row) =>
              `<tr><td style="padding:3px 8px 3px 0;${row.emphasis ? "padding-top:10px;border-top:1px solid #e7e5e4;font-weight:700;color:#1c1917;" : ""}">${escapeHtml(row.label)}</td><td align="right" style="padding:3px 0;white-space:nowrap;${row.emphasis ? "padding-top:10px;border-top:1px solid #e7e5e4;font-weight:700;color:#1c1917;" : ""}">${escapeHtml(row.value)}</td></tr>`,
          )
          .join("\n");
        return `<tr><td style="padding:0 26px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:23px;">${rows}</table>
${section.note ? `<p style="margin:10px 0 0;font-size:12px;line-height:20px;">${escapeHtml(section.note)}</p>` : ""}
</td></tr>`;
      }
      return `<tr><td style="padding:24px 26px 0;">
<h2 style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:23px;font-weight:400;color:#1c1917;">${escapeHtml(section.title)}</h2>
${section.lines.map((line) => `<p style="margin:0 0 6px;font-size:12px;line-height:21px;color:#78716c;">${escapeHtml(line)}</p>`).join("\n")}
</td></tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="${input.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#fafaf9;color:#57534e;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(`${title}. ${reference}.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fafaf9">
<tr><td align="center" style="padding:32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:580px;table-layout:fixed;overflow-wrap:break-word;word-break:break-word;">
<tr><td align="center" style="padding:0 26px 32px;">
<img src="cid:${logo.content_id}" alt="Hotel Manantial" width="280" height="70" style="display:block;width:280px;max-width:100%;height:auto;margin:0 auto 16px;">
<p style="margin:0 0 25px;font-size:11px;line-height:17px;letter-spacing:3px;color:#78716c;">CHURÍN · PERÚ</p>
<table role="presentation" width="38" cellpadding="0" cellspacing="0" border="0"><tr><td height="2" bgcolor="#f27b00" style="font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>
<tr><td style="padding:0 26px 28px;">
<h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:42px;font-weight:400;color:#1c1917;">${escapeHtml(title)}.</h1>
<p style="margin:0 0 18px;font-size:12px;line-height:19px;letter-spacing:1.5px;color:#78716c;text-transform:uppercase;">${escapeHtml(reference)}</p>
<p style="margin:0;font-size:15px;line-height:25px;">${escapeHtml(introduction)}</p>
</td></tr>
${sections}
<tr><td style="padding:26px 26px 0;">
<p style="margin:0;padding-top:18px;border-top:1px solid #e7e5e4;font-size:12px;line-height:21px;color:#78716c;">${english ? "You can also reply to this email for help." : "También puedes responder a este correo."}</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const FROM = "Hotel Manantial <reservas@notificaciones.hotelmanantialchurin.com>";
export const REPLY_TO = "hotelmanantialchurinperu@gmail.com";
const PHONE = "+51 992 755 015";
const SITE = "https://www.hotelmanantialchurin.com";

const PLAN_NAME: Record<"es" | "en", Record<RatePlanCode, string>> = {
  es: { flexible: "Flexible", non_refundable: "No reembolsable" },
  en: { flexible: "Flexible", non_refundable: "Non-refundable" },
};

export type ConfirmationMessageInput = {
  state: State;
  kind: "automatic" | "resend";
  recipient: string;
  language: "es" | "en";
  room: string;
  currency: string;
  token: string | null;
  expiresOn: string;
  today: string;
};

export function confirmationMessage(input: ConfirmationMessageInput) {
  return input.kind === "resend" ? summaryRequest(input) : confirmationRequest(input);
}

function confirmationRequest({
  state,
  language,
  currency,
  room,
  recipient,
  token,
  expiresOn,
}: ConfirmationMessageInput) {
  const bill = reservationBill(state);
  const terms = acceptedTerms(state.reservation);
  const facts = messageFacts({
    currency,
    language,
    checkIn: state.reservation.checkIn,
    checkOut: state.reservation.checkOut,
    room,
    plan: PLAN_NAME[language][terms.plan],
    freeUntil: freeCancellationUntil(terms.cancellationPolicy, state.reservation.checkIn),
    chargeCents: chargeableCents(
      terms.cancellationPolicy,
      state.lines,
      state.reservation.discountCents,
    ),
    totalCents: bill.totalCents,
    paidCents: bill.paidCents,
    outstandingCents: Math.max(0, bill.balanceCents),
  });
  return emailRequest({
    recipient,
    token,
    expiresOn,
    language,
    code: state.reservation.code,
    sections: facts,
  });
}

function emailRequest(input: {
  recipient: string;
  language: "es" | "en";
  code: string;
  sections: ConfirmationEmailSection[];
  token: string | null;
  expiresOn: string;
  kind?: "confirmation" | "summary";
}) {
  const { language, code, sections } = input;
  const kind = input.kind ?? "confirmation";
  const link = input.token ? summaryLink(language, input.token) : null;
  const assistance =
    language === "en"
      ? `Online access expired on ${input.expiresOn}. Contact the hotel for assistance.`
      : `El acceso en línea venció el ${input.expiresOn}. Contacta al hotel para obtener asistencia.`;
  return {
    from: FROM,
    to: [input.recipient],
    reply_to: REPLY_TO,
    subject:
      language === "en" ? `Reservation confirmation ${code}` : `Confirmación de reserva ${code}`,
    html: renderConfirmationEmail({ language, code, kind, sections, link, assistance }),
    text: [
      language === "en" ? `Reference: ${code}` : `Reserva: ${code}`,
      ...sections.flatMap((section) => confirmationEmailText(section, language)),
      link ?? assistance,
    ].join("\n"),
    attachments: confirmationEmailAttachments,
    tags: [{ name: "category", value: "confirmation" }],
  };
}

function summaryRequest({
  state,
  language,
  currency,
  room,
  today,
  recipient,
  token,
  expiresOn,
}: ConfirmationMessageInput) {
  const bill = reservationBill(state);
  const amount = (cents: number) => money(cents, currency);
  const statuses: Record<string, { en: string; es: string }> = {
    confirmed: { en: "Confirmed", es: "Confirmada" },
    checked_in: { en: "Checked in", es: "Hospedada" },
    checked_out: { en: "Checked out", es: "Finalizada" },
    cancelled: { en: "Cancelled", es: "Cancelada" },
    no_show: { en: "No-show", es: "No se presentó" },
    unfulfilled: { en: "Unfulfilled — not confirmed", es: "Sin disponibilidad — no confirmada" },
  };
  const status = statuses[state.reservation.status]?.[language];
  if (!status) throw new Error("unknown reservation status");
  const terms = acceptedTerms(state.reservation);
  const freeUntil = freeCancellationUntil(terms.cancellationPolicy, state.reservation.checkIn);
  const charge = amount(
    chargeableCents(terms.cancellationPolicy, state.lines, state.reservation.discountCents),
  );
  const facts: ConfirmationEmailSection[] = [
    {
      title: language === "en" ? "Reservation status" : "Estado de la reserva",
      lines: [
        language === "en"
          ? `Summary as of ${today}. This is not a new confirmation.`
          : `Resumen al ${today}. No es una nueva confirmación.`,
        language === "en" ? `Status: ${status}` : `Estado: ${status}`,
      ],
    },
    {
      stay: {
        checkIn: state.reservation.checkIn,
        checkOut: state.reservation.checkOut,
        room,
        plan: PLAN_NAME[language][terms.plan],
      },
    },
    {
      title:
        language === "en" ? "Accepted cancellation terms" : "Condiciones de cancelación aceptadas",
      lines: [
        language === "en"
          ? `Accepted free-cancellation deadline: ${freeUntil ?? "none"}`
          : `Fecha límite de cancelación gratuita aceptada: ${freeUntil ?? "ninguna"}`,
        language === "en"
          ? `Accepted policy charge: ${charge}`
          : `Cargo según la política aceptada: ${charge}`,
      ],
    },
    {
      title: language === "en" ? "Payment and refunds" : "Pago y devoluciones",
      lines: [
        `Total: ${amount(bill.totalCents)}`,
        language === "en" ? `Paid: ${amount(bill.paidCents)}` : `Pagado: ${amount(bill.paidCents)}`,
        language === "en"
          ? `Outstanding balance: ${amount(Math.max(0, bill.balanceCents))}`
          : `Saldo pendiente: ${amount(Math.max(0, bill.balanceCents))}`,
        language === "en"
          ? `Refund due: ${amount(bill.refundDueCents)}`
          : `Por devolver: ${amount(bill.refundDueCents)}`,
        language === "en"
          ? `Completed refunds: ${amount(bill.refundedCents)}`
          : `Devoluciones completadas: ${amount(bill.refundedCents)}`,
        language === "en"
          ? `Pending refunds (not returned): ${amount(bill.pendingRefundCents)}`
          : `Devoluciones pendientes (no devueltas): ${amount(bill.pendingRefundCents)}`,
        language === "en"
          ? `Coupon settlement (not cash): ${amount(bill.couponAppliedCents)}`
          : `Pagado con cupón (no efectivo): ${amount(bill.couponAppliedCents)}`,
        language === "en"
          ? `Converted into coupons (not refunded): ${amount(bill.couponIssuedCents)}`
          : `Pasado a cupón (no devuelto): ${amount(bill.couponIssuedCents)}`,
      ],
    },
    { action: true },
    {
      title: language === "en" ? "Need help?" : "¿Necesitas ayuda?",
      lines: [
        language === "en"
          ? `For current information and assistance, contact the hotel. Phone: ${PHONE}. Email: ${REPLY_TO}`
          : `Para información actual y asistencia, contacta al hotel. Teléfono: ${PHONE}. Correo: ${REPLY_TO}`,
      ],
    },
  ];
  return {
    ...emailRequest({
      recipient,
      token,
      expiresOn,
      language,
      code: state.reservation.code,
      sections: facts,
      kind: "summary",
    }),
    subject:
      language === "en"
        ? `Reservation summary ${state.reservation.code}`
        : `Resumen de reserva ${state.reservation.code}`,
  };
}

function messageFacts(input: {
  currency: string;
  language: "es" | "en";
  checkIn: string;
  checkOut: string;
  room: string;
  plan: string;
  freeUntil: string | null;
  chargeCents: number;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
}): ConfirmationEmailSection[] {
  const amount = (cents: number) => money(cents, input.currency);
  const charge = amount(input.chargeCents);
  const cancellation =
    input.freeUntil === null
      ? input.language === "en"
        ? `No free cancellation. The charge is ${charge}.`
        : `Sin cancelación gratuita. El cargo es ${charge}.`
      : input.language === "en"
        ? `Free cancellation until ${input.freeUntil}. After that, the charge is ${charge}.`
        : `Cancelación sin cargo hasta el ${input.freeUntil}. Después, el cargo es ${charge}.`;
  const paidInFull =
    input.outstandingCents === 0
      ? input.language === "en"
        ? "Paid in full."
        : "Pagado en su totalidad."
      : null;
  return [
    {
      stay: {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        room: input.room,
        plan: input.plan,
      },
    },
    {
      payment: [
        { label: "Total", value: amount(input.totalCents) },
        {
          label: input.language === "en" ? "Paid" : "Pagado",
          value: amount(input.paidCents),
        },
        {
          label: input.language === "en" ? "Outstanding balance" : "Saldo pendiente",
          value: amount(input.outstandingCents),
          emphasis: true,
        },
      ],
      note: paidInFull,
    },
    { action: true },
    {
      title: input.language === "en" ? "Cancellation" : "Cancelación",
      lines: [cancellation],
    },
    {
      title: input.language === "en" ? "Need help?" : "¿Necesitas ayuda?",
      lines: [
        input.language === "en" ? `Phone: ${PHONE}` : `Teléfono: ${PHONE}`,
        input.language === "en" ? `Email: ${REPLY_TO}` : `Correo: ${REPLY_TO}`,
      ],
    },
  ];
}

function summaryLink(language: "es" | "en", token: string) {
  return `${SITE}${language === "en" ? "/en" : ""}/reservar/resumen/#${token}`;
}

function money(cents: number, currency: string) {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  return `${negative ? "-" : ""}${currency} ${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}
