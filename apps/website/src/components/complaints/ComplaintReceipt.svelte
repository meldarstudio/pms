<script lang="ts">
  import { Button } from "@ui-sdk/svelte/button";
  import { useTranslations, type Lang } from "@/i18n/utils";
  import { complaintLabels, type ComplaintReceipt as Receipt } from "@/lib/complaints";
  import type { Snippet } from "svelte";

  let { sheet, language }: { sheet: Receipt; language: Lang } = $props();
  const t = $derived(useTranslations(language));
  const labels = $derived(complaintLabels(language));
  const dates = $derived(
    new Intl.DateTimeFormat(language === "en" ? "en-GB" : "es-PE", {
      timeZone: sheet.timeZone,
      dateStyle: "long",
      timeStyle: "long",
    }),
  );
  const shown = $derived({
    ...sheet.input,
    minor: t(sheet.input.minor ? "complaints.sheet.yes" : "complaints.sheet.no"),
    category: sheet.input.category === "reclamo" ? "Reclamo" : "Queja",
    responseChannel: t(
      sheet.input.responseChannel === "email"
        ? "complaints.email"
        : "complaints.letterToTheAddressProvided",
    ),
  });
  const consumerFields = [
    "fullName",
    "address",
    "documentType",
    "documentNumber",
    "phone",
    "email",
    "minor",
    "representative",
  ] as const;
  const detailFields = ["category", "description", "requestedRemedy", "responseChannel"] as const;
</script>

{#snippet field(key: Exclude<keyof typeof labels, "amount">)}
  <div>
    <dt class="font-semibold">{labels[key]}</dt>
    <dd class="whitespace-pre-wrap wrap-break-word">{String(shown[key] ?? "")}</dd>
  </div>
{/snippet}

{#snippet section(title: string, children: Snippet)}
  <section class="flex flex-col gap-3 border-t border-stone-300 pt-4">
    <h3 class="font-semibold uppercase">{title}</h3>
    {@render children()}
  </section>
{/snippet}

<article class="complaint-sheet flex flex-col gap-4">
  <header class="flex flex-col gap-1">
    <p class="font-semibold uppercase">Libro de Reclamaciones</p>
    <h2 {@attach (node) => node.focus()} tabindex="-1" class="text-2xl font-semibold">
      {t("complaints.sheet.title")}
      {t("complaints.sheet.number")}
      {sheet.reference}
    </h2>
  </header>
  <p>
    {t("complaints.sheet.date")}: {dates.format(new Date(sheet.filedAt))}
    <br />
    {t("complaints.registered")}: {dates.format(new Date(sheet.registeredAt))}
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
  {#snippet consumer()}
    <dl class="grid gap-3">
      {#each consumerFields as key (key)}{@render field(key)}{/each}
    </dl>
  {/snippet}
  {@render section(t("complaints.sheet.consumer"), consumer)}
  {#snippet goods()}
    <dl class="grid gap-3">
      {@render field("product")}
      <div>
        <dt class="font-semibold">{labels.amount}</dt>
        <dd>
          {sheet.input.amountCents === null
            ? t("complaints.unknownNotApplicable")
            : `${(sheet.input.amountCents / 100).toFixed(2)} ${sheet.currency}`}
        </dd>
      </div>
      {@render field("reservationReference")}
    </dl>
  {/snippet}
  {@render section(t("complaints.sheet.goods"), goods)}
  {#snippet detail()}
    <dl class="grid gap-3">
      {#each detailFields as key (key)}{@render field(key)}{/each}
      <div>
        <dt class="font-semibold">{t("complaints.privacyPolicyVersion")}</dt>
        <dd>{sheet.input.policyVersion}</dd>
      </div>
    </dl>
  {/snippet}
  {@render section(t("complaints.sheet.detail"), detail)}
  {#snippet provider()}<p>{t("complaints.sheet.responseDate")}:</p>{/snippet}
  {@render section(t("complaints.sheet.provider"), provider)}
  <p class="print:hidden">
    {sheet.email.status === "sent"
      ? t("complaints.emailSubmittedDeliveryIsNotConfirmed")
      : sheet.email.status === "pending"
        ? t("complaints.emailQueuedDeliveryIsNotConfirmed")
        : sheet.email.status === "failed"
          ? t("complaints.emailFailedYourSheetRemainsRegisteredDo")
          : t("complaints.noAutomaticEmailRequested")}
  </p>
  <footer class="flex flex-col gap-1 border-t border-stone-300 pt-4 text-sm">
    <p>{t("complaints.sheet.reclamoDefinition")}</p>
    <p>{t("complaints.sheet.quejaDefinition")}</p>
    <p>{t("complaints.sheet.otherRemedies")}</p>
    <p>{t("complaints.sheet.deadline")}</p>
    <p>{t("complaints.sheet.recipient")}</p>
  </footer>
  <Button
    type="button"
    class="complaint-button print:hidden"
    data-variant="outline"
    onclick={() => window.print()}
  >
    {t("complaints.printSheet")}
  </Button>
</article>
