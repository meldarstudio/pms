import { useTranslations } from "@/i18n/utils";
import { useEffect, useRef } from "react";
import { complaintLabels, type ComplaintReceipt as Receipt } from "@/lib/complaints";

export function ComplaintReceipt({ sheet, language }: { sheet: Receipt; language: "es" | "en" }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const t = useTranslations(language);
  const en = language === "en";
  const labels = complaintLabels(language);
  const date = (value: string) =>
    new Intl.DateTimeFormat(en ? "en-GB" : "es-PE", {
      timeZone: sheet.timeZone,
      dateStyle: "long",
      timeStyle: "long",
    }).format(new Date(value));
  return (
    <article className="complaint-sheet flex flex-col gap-4">
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
        {t("complaints.registered")}: {sheet.reference}
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
        {t("complaints.filed")}: {date(sheet.filedAt)}
        <br />
        {t("complaints.registered")}: {date(sheet.registeredAt)}
        <br />
        {t("complaints.responseDeadline")}: {sheet.dueDate} ({sheet.timeZone})
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
              ? t("complaints.unknownNotApplicable")
              : `${(sheet.input.amountCents / 100).toFixed(2)} ${sheet.currency}`}
          </dd>
        </div>
        <div>
          <dt>{t("complaints.privacyPolicyVersion")}</dt>
          <dd>{sheet.input.policyVersion}</dd>
        </div>
      </dl>
      <p>
        {sheet.email.status === "sent"
          ? t("complaints.emailSubmittedDeliveryIsNotConfirmed")
          : sheet.email.status === "pending"
            ? t("complaints.emailQueuedDeliveryIsNotConfirmed")
            : sheet.email.status === "failed"
              ? t("complaints.emailFailedYourSheetRemainsRegisteredDo")
              : t("complaints.noAutomaticEmailRequested")}
      </p>
      <p>{t("complaints.theHotelMustRespondWithin15Business")}</p>
      <button
        className="min-h-11 rounded border px-4 print:hidden"
        type="button"
        onClick={() => window.print()}
      >
        {t("complaints.printSheet")}
      </button>
    </article>
  );
}
