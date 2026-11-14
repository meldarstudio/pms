import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "./db";
import { complaintEmails } from "./db/schema";
import { complaintView } from "./complaints";
import { developmentComplaintConfig } from "./complaint-config";
import type { Env } from "./env";
import { resendForEnv } from "./resend";
import { loopbackUrl } from "./loopback";

export async function sendComplaintEmails(db: Db, env: Env["Bindings"]) {
  if (!env.COMPLAINT_BOOK_DEVELOPMENT || !loopbackUrl(env.RESEND_API_URL)) return;
  const config = developmentComplaintConfig(env.COMPLAINT_BOOK_DEVELOPMENT, env.RESEND_API_URL!);
  const resend = resendForEnv(env);
  if (!resend.configured) return;
  const due = await db
    .select()
    .from(complaintEmails)
    .where(
      and(
        eq(complaintEmails.status, "pending"),
        lte(complaintEmails.nextAttemptAt, new Date().toISOString()),
      ),
    )
    .orderBy(asc(complaintEmails.nextAttemptAt))
    .limit(10);
  for (const row of due) {
    if (
      row.deliveryUncertain &&
      row.firstAttemptAt &&
      Date.now() - Date.parse(row.firstAttemptAt) >= 23 * 60 * 60 * 1000
    ) {
      await db
        .update(complaintEmails)
        .set({ status: "failed", lastError: "retry_window_expired", nextAttemptAt: null })
        .where(
          and(
            eq(complaintEmails.id, row.id),
            eq(complaintEmails.attempts, row.attempts),
            eq(complaintEmails.status, "pending"),
          ),
        );
      continue;
    }
    const sheet = await complaintView(db, row.complaintId);
    const text = complaintEmailText(sheet);
    const request =
      row.pendingRequest ??
      JSON.stringify({
        from: config.emailFrom,
        to: [sheet.input.email],
        subject: `Libro de Reclamaciones — Hoja de Reclamación Nº ${sheet.reference}`,
        text,
      });
    const nextAttemptAt = new Date(
      Date.now() + 60000 * 2 ** Math.min(row.attempts, 5),
    ).toISOString();
    const [claimed] = await db
      .update(complaintEmails)
      .set({
        pendingRequest: request,
        attempts: row.attempts + 1,
        nextAttemptAt,
        deliveryUncertain: true,
        firstAttemptAt:
          row.firstAttemptAt &&
          (row.deliveryUncertain || Date.now() - Date.parse(row.firstAttemptAt) < 23 * 3600000)
            ? row.firstAttemptAt
            : new Date().toISOString(),
      })
      .where(
        and(
          eq(complaintEmails.id, row.id),
          eq(complaintEmails.status, "pending"),
          eq(complaintEmails.attempts, row.attempts),
        ),
      )
      .returning();
    if (!claimed) continue;
    const result = await resend.send({ idempotencyKey: row.id, body: request });
    await db
      .update(complaintEmails)
      .set(
        result.kind === "sent"
          ? {
              status: "sent",
              deliveryUncertain: false,
              sentAt: new Date().toISOString(),
              providerMessageId: result.id,
              nextAttemptAt: null,
              lastError: null,
            }
          : {
              status: result.kind === "failed" || claimed.attempts >= 5 ? "failed" : "pending",
              lastError: result.error,
              deliveryUncertain: result.kind === "retry" || row.deliveryUncertain,
              nextAttemptAt:
                result.kind === "retry" && claimed.attempts < 5
                  ? new Date(
                      Date.now() +
                        Math.max(
                          60000 * 2 ** Math.min(row.attempts, 5),
                          Math.min(result.retryAfterMs, 3600000),
                        ),
                    ).toISOString()
                  : null,
            },
      )
      .where(
        and(
          eq(complaintEmails.id, row.id),
          eq(complaintEmails.attempts, claimed.attempts),
          eq(complaintEmails.status, "pending"),
        ),
      );
  }
}

function complaintEmailText(sheet: Awaited<ReturnType<typeof complaintView>>) {
  const en = sheet.input.language === "en";
  const labels = en
    ? [
        "Language",
        "Full name",
        "Address",
        "Document type",
        "Document number",
        "Phone",
        "Email",
        "Minor",
        "Parent / representative",
        "Product / service",
        "Amount (cents; null = unknown / not applicable)",
        "Category",
        "Description",
        "Requested remedy",
        "Reservation reference",
        "Written response channel",
        "Privacy policy version",
      ]
    : [
        "Idioma",
        "Nombre completo",
        "Domicilio",
        "Tipo de documento",
        "Número de documento",
        "Teléfono",
        "Correo",
        "Menor de edad",
        "Padre / representante",
        "Producto / servicio",
        "Monto (céntimos; null = desconocido / no aplica)",
        "Categoría",
        "Detalle",
        "Pedido",
        "Referencia de reserva",
        "Canal de respuesta escrita",
        "Versión de privacidad",
      ];
  const keys = [
    "language",
    "fullName",
    "address",
    "documentType",
    "documentNumber",
    "phone",
    "email",
    "minor",
    "representative",
    "product",
    "amountCents",
    "category",
    "description",
    "requestedRemedy",
    "reservationReference",
    "responseChannel",
    "policyVersion",
  ] as const;
  return [
    "LIBRO DE RECLAMACIONES",
    `${en ? "HOJA DE RECLAMACIÓN (complaint sheet) No." : "HOJA DE RECLAMACIÓN Nº"} ${sheet.reference}`,
    `${sheet.provider.legalName} / RUC ${sheet.provider.ruc}`,
    `${sheet.provider.address} / ${en ? "Identification code" : "Código de identificación"}: ${sheet.bookId}`,
    sheet.establishmentId,
    `${en ? "Date" : "Fecha"}: ${new Intl.DateTimeFormat(en ? "en-GB" : "es-PE", { timeZone: sheet.timeZone, dateStyle: "full", timeStyle: "long" }).format(new Date(sheet.filedAt))}`,
    `${en ? "Response deadline" : "Fecha límite de respuesta"}: ${sheet.dueDate}`,
    `Moneda / Currency: ${sheet.currency}`,
    ...keys.map((key, index) => `${labels[index]}: ${String(sheet.input[key])}`),
    en
      ? "Your sheet is registered. This email is a copy; email submission is not proof of delivery."
      : "Su hoja está registrada. Este correo es una copia; su envío no acredita la entrega.",
    ...(en
      ? [
          "Reclamo: dissatisfaction related to the products or services.",
          "Queja: dissatisfaction not related to the products or services, or discontent with customer service.",
          "Filing a reclamo does not prevent using other dispute resolution channels, and it is not a prerequisite for filing a complaint with INDECOPI.",
          "The provider must respond to the reclamo or queja within fifteen (15) business days, which cannot be extended.",
          "Recipient: consumer",
        ]
      : [
          "Reclamo: disconformidad relacionada a los productos o servicios.",
          "Queja: disconformidad no relacionada a los productos o servicios; o, malestar o descontento respecto a la atención al público.",
          "La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.",
          "El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles, el cual es improrrogable.",
          "Destinatario: consumidor",
        ]),
  ].join("\n\n");
}
