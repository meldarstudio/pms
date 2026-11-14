import { useTranslations } from "@/i18n/utils";
import { useEffect, useRef, type ReactNode } from "react";
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
  const shown = {
    ...sheet.input,
    minor: t(sheet.input.minor ? "complaints.sheet.yes" : "complaints.sheet.no"),
    category: sheet.input.category === "reclamo" ? "Reclamo" : "Queja",
    responseChannel: t(
      sheet.input.responseChannel === "email"
        ? "complaints.email"
        : "complaints.letterToTheAddressProvided",
    ),
  };
  const field = (key: Exclude<keyof typeof labels, "amount">) => (
    <div key={key}>
      <dt className="font-semibold">{labels[key]}</dt>
      <dd className="whitespace-pre-wrap break-words">{String(shown[key] ?? "")}</dd>
    </div>
  );
  const section = (title: string, children: ReactNode) => (
    <section className="flex flex-col gap-3 border-t border-stone-300 pt-4">
      <h3 className="font-semibold uppercase">{title}</h3>
      {children}
    </section>
  );
  return (
    <article className="complaint-sheet flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="font-semibold uppercase">Libro de Reclamaciones</p>
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
          {t("complaints.sheet.title")} {t("complaints.sheet.number")} {sheet.reference}
        </h2>
      </header>
      <p>
        {t("complaints.sheet.date")}: {date(sheet.filedAt)}
        <br />
        {t("complaints.registered")}: {date(sheet.registeredAt)}
        <br />
        {t("complaints.responseDeadline")}: {sheet.dueDate} ({sheet.timeZone})
      </p>
      <p>
        {sheet.provider.legalName} / RUC {sheet.provider.ruc}
        <br />
        {sheet.provider.address} / {t("complaints.sheet.identificationCode")}: {sheet.bookId}
        <br />
        {sheet.establishmentId}
      </p>
      {section(
        t("complaints.sheet.consumer"),
        <dl className="grid gap-3">
          {(
            [
              "fullName",
              "address",
              "documentType",
              "documentNumber",
              "phone",
              "email",
              "minor",
              "representative",
            ] as const
          ).map(field)}
        </dl>,
      )}
      {section(
        t("complaints.sheet.goods"),
        <dl className="grid gap-3">
          {field("product")}
          <div>
            <dt className="font-semibold">{labels.amount}</dt>
            <dd>
              {sheet.input.amountCents === null
                ? t("complaints.unknownNotApplicable")
                : `${(sheet.input.amountCents / 100).toFixed(2)} ${sheet.currency}`}
            </dd>
          </div>
          {field("reservationReference")}
        </dl>,
      )}
      {section(
        t("complaints.sheet.detail"),
        <dl className="grid gap-3">
          {(["category", "description", "requestedRemedy", "responseChannel"] as const).map(field)}
          <div>
            <dt className="font-semibold">{t("complaints.privacyPolicyVersion")}</dt>
            <dd>{sheet.input.policyVersion}</dd>
          </div>
        </dl>,
      )}
      {section(t("complaints.sheet.provider"), <p>{t("complaints.sheet.responseDate")}:</p>)}
      <p className="print:hidden">
        {sheet.email.status === "sent"
          ? t("complaints.emailSubmittedDeliveryIsNotConfirmed")
          : sheet.email.status === "pending"
            ? t("complaints.emailQueuedDeliveryIsNotConfirmed")
            : sheet.email.status === "failed"
              ? t("complaints.emailFailedYourSheetRemainsRegisteredDo")
              : t("complaints.noAutomaticEmailRequested")}
      </p>
      <footer className="flex flex-col gap-1 border-t border-stone-300 pt-4 text-sm">
        <p>{t("complaints.sheet.reclamoDefinition")}</p>
        <p>{t("complaints.sheet.quejaDefinition")}</p>
        <p>{t("complaints.sheet.otherRemedies")}</p>
        <p>{t("complaints.sheet.deadline")}</p>
        <p>{t("complaints.sheet.recipient")}</p>
      </footer>
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
