import logo from "./confirmation-email-logo.json";

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
<a href="${escapeHtml(input.link)}" style="display:block;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;font-weight:500;letter-spacing:1.8px;text-transform:uppercase;color:#1c1917;text-decoration:none;">${english ? "VIEW MY RESERVATION" : "VER MI RESERVA"} &nbsp; →</a>
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
