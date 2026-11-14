import { useEffect, useRef } from "react";
import { complaintLabels, type ComplaintReceipt as Receipt } from "@/lib/complaints";

export function ComplaintReceipt({ sheet, language }: { sheet: Receipt; language: "es" | "en" }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const en = language === "en";
  const labels = complaintLabels[language];
  const date = (value: string) =>
    new Intl.DateTimeFormat(en ? "en-GB" : "es-PE", {
      timeZone: sheet.timeZone,
      dateStyle: "long",
      timeStyle: "long",
    }).format(new Date(value));
  return (
    <article className="complaint-sheet flex flex-col gap-4">
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
        {en ? "Registered" : "Registrado"}: {sheet.reference}
      </h2>
      <p>Libro de Reclamaciones · {sheet.establishmentId}</p>
      <p>
        {sheet.provider.legalName}
        <br />
        RUC {sheet.provider.ruc}
        <br />
        {sheet.provider.address}
      </p>
      <p>
        {en ? "Filed" : "Presentado"}: {date(sheet.filedAt)}
        <br />
        {en ? "Registered" : "Registrado"}: {date(sheet.registeredAt)}
        <br />
        {en ? "Response deadline" : "Fecha límite de respuesta"}: {sheet.dueDate} ({sheet.timeZone})
      </p>
      <dl className="grid gap-3">
        {Object.entries(labels)
          .filter(([key]) => key !== "amount")
          .map(([key, label]) => (
            <div key={key}>
              <dt className="font-semibold">{label}</dt>
              <dd className="whitespace-pre-wrap break-words">
                {String(sheet.input[key as keyof typeof sheet.input] ?? "")}
              </dd>
            </div>
          ))}
        <div>
          <dt>{labels.amount}</dt>
          <dd>
            {sheet.input.amountCents === null
              ? en
                ? "Unknown / not applicable"
                : "No conocido / no aplica"
              : `${(sheet.input.amountCents / 100).toFixed(2)} ${sheet.currency}`}
          </dd>
        </div>
        <div>
          <dt>{en ? "Privacy policy version" : "Versión de privacidad"}</dt>
          <dd>{sheet.input.policyVersion}</dd>
        </div>
      </dl>
      <p>
        {sheet.email.status === "sent"
          ? en
            ? "Email submitted; delivery is not confirmed."
            : "Correo enviado al proveedor; entrega no confirmada."
          : sheet.email.status === "pending"
            ? en
              ? "Email queued; delivery is not confirmed."
              : "Correo en cola; entrega no confirmada."
            : sheet.email.status === "failed"
              ? en
                ? "Email failed. Your sheet remains registered. Do not file again."
                : "Falló el correo. Su hoja sigue registrada. No la vuelva a presentar."
              : en
                ? "No automatic email requested."
                : "Sin correo automático."}
      </p>
      <p>
        {en
          ? "The hotel must respond within 15 business days, without extension. Filing with the hotel does not prevent using Indecopi or other remedies directly."
          : "El hotel debe responder en 15 días hábiles, sin prórroga. Presentar esta hoja al hotel no impide acudir directamente a Indecopi u otras vías."}
      </p>
      <button
        className="min-h-11 rounded border px-4 print:hidden"
        type="button"
        onClick={() => window.print()}
      >
        {en ? "Print sheet" : "Imprimir hoja"}
      </button>
    </article>
  );
}
