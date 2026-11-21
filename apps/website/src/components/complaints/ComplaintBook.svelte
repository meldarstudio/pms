<script lang="ts">
  import "./complaints.css";
  import { PUBLIC_PMS_API_URL } from "astro:env/client";
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion";
  import { Button } from "@ui-sdk/svelte/button";
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox";
  import { Effect, Result } from "effect";
  import { Check } from "phosphor-svelte";
  import { onMount } from "svelte";
  import { useTranslations } from "@/i18n/utils";
  import {
    complaintLabels,
    complaintProblem,
    fileComplaint,
    readComplaintReceipt,
    type ComplaintConfig,
    type ComplaintInput,
    type ComplaintReceipt as Receipt,
  } from "@/lib/complaints";
  import { startIsland, type Island } from "@/lib/island";
  import { PmsClient } from "@/lib/pms-client";
  import ComplaintReceipt from "./ComplaintReceipt.svelte";
  import ComplaintSecurity from "./ComplaintSecurity.svelte";

  let {
    language,
    turnstileSiteKey,
    privacyHref,
    config,
  }: {
    language: ComplaintInput["language"];
    turnstileSiteKey: string | null;
    privacyHref: string;
    config: ComplaintConfig;
  } = $props();

  const storageKey = "hm.complaint.draft";
  type Draft = { token: string; input: ComplaintInput; attempted: boolean; saved: boolean };
  const newToken = () => crypto.randomUUID() + crypto.randomUUID();
  const emptyInput = (): ComplaintInput => ({
    language,
    fullName: "",
    address: "",
    documentType: "",
    documentNumber: "",
    phone: "",
    email: "",
    minor: false,
    representative: "",
    product: "",
    amountCents: null,
    category: "reclamo",
    description: "",
    requestedRemedy: "",
    reservationReference: "",
    responseChannel: "email",
    policyVersion: config.policyVersion,
  });

  const limits = {
    fullName: 200,
    address: 500,
    documentType: 80,
    documentNumber: 100,
    phone: 60,
    email: 200,
    representative: 1000,
    product: 2000,
    description: 10000,
    requestedRemedy: 5000,
    reservationReference: 100,
  };

  function inputTypedBeforeHydration(): Partial<ComplaintInput> {
    if (typeof document === "undefined") return {};
    const initial = emptyInput();
    const early: Record<string, string | number | boolean> = {};
    for (const key of [...Object.keys(limits), "category", "responseChannel"] as (
      keyof typeof limits | "category" | "responseChannel"
    )[]) {
      const control = document.getElementById(`complaint-${key}`) as
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (control && control.value !== initial[key]) early[key] = control.value;
    }
    const amount = document.getElementById("complaint-amountCents") as HTMLInputElement | null;
    if (amount?.value) early.amountCents = Math.round(amount.valueAsNumber * 100);
    const minor = document.getElementById("complaint-minor") as HTMLInputElement | null;
    if (minor?.checked) early.minor = true;
    return early as Partial<ComplaintInput>;
  }

  const typedBeforeHydration = inputTypedBeforeHydration();
  let draft = $state<Draft>({
    token: "",
    input: { ...emptyInput(), ...typedBeforeHydration },
    attempted: false,
    saved: false,
  });
  let sheet = $state.raw<Receipt | null>(null);
  let problem = $state("");
  let invalid = $state("");
  let busy = $state(false);
  let ready = $state(false);
  let securityToken = $state("");
  let securityVersion = $state(0);
  const t = $derived(useTranslations(language));
  const labels = $derived(complaintLabels(language));
  const fieldsDisabled = $derived(busy || draft.attempted);

  function remember(next: Draft) {
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    draft = next;
  }

  let complaints: Island<PmsClient> | null = null;

  onMount(() => {
    const island = startIsland(PmsClient.layer(PUBLIC_PMS_API_URL, { cache: "no-store" }));
    complaints = island;
    resumeDraft(island);
    return () => {
      complaints = null;
      island.dispose();
    };
  });

  function resumeDraft(island: Island<PmsClient>) {
    let previous: Draft | null = null;
    try {
      previous = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Draft | null;
    } catch {
      sessionStorage.removeItem(storageKey);
    }

    if (!previous?.token || !previous.input || (!previous.attempted && !previous.saved)) {
      const next =
        previous?.token && previous.input
          ? {
              ...previous,
              input: {
                ...previous.input,
                ...typedBeforeHydration,
                policyVersion: config.policyVersion,
              },
            }
          : { ...draft, token: newToken() };
      if (Object.keys(typedBeforeHydration).length > 0) remember(next);
      else draft = next;
      ready = true;
      return;
    }

    draft = previous;
    island.fork(
      readComplaintReceipt(previous.token).pipe(
        Effect.match({
          onSuccess: (saved) => {
            sheet = saved;
          },
          onFailure: () => {
            problem = t("complaints.yourDraftIsRetainedRetryTheSame");
          },
        }),
        Effect.map(() => {
          ready = true;
        }),
      ),
    );
  }

  function update<Key extends keyof ComplaintInput>(key: Key, value: ComplaintInput[Key]) {
    if (!ready || fieldsDisabled) return;
    draft.input[key] = value;
    sessionStorage.setItem(storageKey, JSON.stringify($state.snapshot(draft)));
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !ready || !securityToken || !complaints) return;
    busy = true;
    problem = "";
    invalid = "";
    const previous = draft;
    const next = { ...previous, attempted: true };
    try {
      remember(next);
      const filed = await complaints.run(
        Effect.result(fileComplaint(next.token, { ...next.input, turnstileToken: securityToken })),
      );
      if (Result.isSuccess(filed)) {
        sheet = filed.success;
        remember({ ...next, saved: true });
        return;
      }
      const failure = filed.failure;
      if (failure._tag === "ComplaintUnreachable") {
        problem = t("complaints.networkErrorYourDraftIsRetainedRetry");
        return;
      }
      problem =
        complaintProblem(failure.code ?? "", language) ??
        t("complaints.couldNotRegisterTheSheetYourDraft");
      invalid = failure.field ?? "";
      if (
        failure.code === "complaint privacy information changed" ||
        (!previous.attempted && (failure.status === 400 || failure.status === 403))
      ) {
        remember({ ...next, attempted: false });
      }
    } catch {
      problem = t("complaints.networkErrorYourDraftIsRetainedRetry");
    } finally {
      securityToken = "";
      securityVersion += 1;
      busy = false;
    }
  }

  function startAnotherSheet() {
    remember({ token: newToken(), input: emptyInput(), attempted: false, saved: false });
    sheet = null;
    problem = "";
  }
</script>

{#snippet textField(key: keyof typeof limits, fullWidth = false)}
  {@const id = `complaint-${key}`}
  {@const required = key !== "email" || draft.input.responseChannel === "email"}
  {@const multiline = ["product", "description", "requestedRemedy", "representative"].includes(key)}
  {@const describedBy =
    invalid === key
      ? "complaint-error"
      : key === "email" && !required
        ? "complaint-email-optional"
        : key === "reservationReference"
          ? "complaint-reference-hint"
          : undefined}
  <div class={["complaint-field", fullWidth && "sm:col-span-2"]} data-invalid={invalid === key}>
    <label for={id}>
      {key === "email" && !required ? t("complaints.optionalEmailLabel") : labels[key]}
    </label>
    {#if multiline}
      <textarea
        {id}
        {required}
        maxlength={limits[key]}
        rows={key === "product" ? 2 : 4}
        aria-invalid={invalid === key}
        aria-describedby={describedBy}
        bind:value={() => draft.input[key], (value) => update(key, value)}
      ></textarea>
    {:else}
      <input
        {id}
        {required}
        type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
        maxlength={limits[key]}
        aria-invalid={invalid === key}
        aria-describedby={describedBy}
        bind:value={() => draft.input[key], (value) => update(key, value)}
      />
    {/if}
    {#if key === "reservationReference"}
      <p class="complaint-hint" id="complaint-reference-hint">{t("complaints.referenceHint")}</p>
    {/if}
    {#if key === "email" && !required}
      <p class="complaint-hint" id="complaint-email-optional">{t("complaints.optionalEmail")}</p>
    {/if}
  </div>
{/snippet}

{#if sheet}
  <ComplaintReceipt {sheet} {language} />
  <Button
    type="button"
    class="complaint-button mt-6 whitespace-normal print:hidden"
    data-variant="outline"
    onclick={startAnotherSheet}
  >
    {t("complaints.startAnotherSheetSaveOrPrintThis")}
  </Button>
{:else}
  <section class="complaint-book flex flex-col gap-6">
    {#if !ready && draft.attempted}<p role="status">{t("complaints.recoveringReceipt")}</p>{/if}
    {#if problem}<p role="alert" id="complaint-error" class="complaint-error">{problem}</p>{/if}
    <div class="complaint-provider">
      <p class="font-semibold">{config.provider.legalName} · RUC {config.provider.ruc}</p>
      <p>{config.provider.address} · {config.establishmentId}</p>
    </div>
    <form class="flex flex-col gap-8" onsubmit={submit}>
      <fieldset disabled={fieldsDisabled}>
        <legend>{t("complaints.consumerDetails")}</legend>
        <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {@render textField("fullName", true)}
          {@render textField("documentType")}
          {@render textField("documentNumber")}
          {@render textField("address", true)}
          {@render textField("phone", true)}
          <div class="flex min-h-11 items-center gap-2 sm:col-span-2">
            <Checkbox
              id="complaint-minor"
              checked={draft.input.minor}
              onCheckedChange={(checked) => update("minor", checked === true)}
            >
              <CheckboxIndicator><Check weight="bold" aria-hidden="true" /></CheckboxIndicator>
            </Checkbox>
            <label for="complaint-minor">{labels.minor}</label>
          </div>
          {#if draft.input.minor}{@render textField("representative", true)}{/if}
        </div>
      </fieldset>
      <fieldset disabled={fieldsDisabled}>
        <legend>{t("complaints.complaintDetails")}</legend>
        <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div class="complaint-field sm:col-span-2">
            <label for="complaint-category">{labels.category}</label>
            <select
              id="complaint-category"
              aria-describedby="complaint-category-reclamo complaint-category-queja"
              bind:value={
                () => draft.input.category,
                (value) => update("category", value === "queja" ? "queja" : "reclamo")
              }
            >
              <option value="reclamo">Reclamo</option>
              <option value="queja">Queja</option>
            </select>
            <p id="complaint-category-reclamo" class="complaint-hint">
              {t("complaints.sheet.reclamoDefinition")}
            </p>
            <p id="complaint-category-queja" class="complaint-hint">
              {t("complaints.sheet.quejaDefinition")}
            </p>
          </div>
          {@render textField("product", true)}
          <div class="complaint-field" data-invalid={invalid === "amountCents"}>
            <label for="complaint-amountCents">{t("complaints.amountLabel")} (PEN)</label>
            <input
              id="complaint-amountCents"
              aria-invalid={invalid === "amountCents"}
              aria-describedby={invalid === "amountCents" ? "complaint-error" : undefined}
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              value={draft.input.amountCents === null ? "" : draft.input.amountCents / 100}
              oninput={(event) =>
                update(
                  "amountCents",
                  event.currentTarget.value === ""
                    ? null
                    : Math.round(event.currentTarget.valueAsNumber * 100),
                )}
            />
            <p class="complaint-hint">{t("complaints.amountHint")}</p>
          </div>
          {@render textField("reservationReference")}
          {@render textField("description", true)}
          {@render textField("requestedRemedy", true)}
        </div>
      </fieldset>
      <fieldset disabled={fieldsDisabled}>
        <legend>{t("complaints.writtenResponse")}</legend>
        <div class="flex flex-col gap-5">
          <div class="complaint-field">
            <label for="complaint-responseChannel">{labels.responseChannel}</label>
            <select
              id="complaint-responseChannel"
              bind:value={
                () => draft.input.responseChannel,
                (value) => update("responseChannel", value === "letter" ? "letter" : "email")
              }
            >
              <option value="email">{t("complaints.email")}</option>
              <option value="letter">{t("complaints.letterToTheAddressProvided")}</option>
            </select>
          </div>
          {@render textField("email")}
        </div>
      </fieldset>
      <div class="flex flex-col gap-3">
        <p class="complaint-hint">{t("complaints.sheet.deadline")}</p>
        <p class="complaint-hint">{t("complaints.sheet.otherRemedies")}</p>
        <p class="complaint-hint whitespace-pre-wrap">{config.collectionNotice[language]}</p>
        <Accordion keepMounted>
          <AccordionItem value="privacy" class="border-b border-stone-200">
            <AccordionHeader>
              <AccordionTrigger class="complaint-privacy-trigger">
                {t("complaints.fullPrivacyInformation")}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  class="size-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="m4 6 4 4 4-4" />
                </svg>
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel class="text-sm leading-relaxed text-stone-700">
              <p class="pb-4 whitespace-pre-wrap wrap-anywhere">
                {config.privacyInformation[language]}
              </p>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
        <a
          href={privacyHref}
          class="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t("complaints.privacyPage")}
        </a>
      </div>
      <div class="flex flex-col gap-3 sm:items-start">
        {#key securityVersion}
          <ComplaintSecurity
            siteKey={turnstileSiteKey}
            {language}
            onToken={(token) => {
              securityToken = token;
            }}
          />
        {/key}
        <p role="status" aria-live="polite" hidden={!busy}>
          {busy ? t("complaints.registering") : ""}
        </p>
        <Button
          class="complaint-button w-full sm:w-auto"
          disabled={busy || !ready || !securityToken}
          type="submit"
        >
          {draft.attempted ? t("complaints.retrySameSubmission") : t("complaints.registerSheet")}
        </Button>
      </div>
    </form>
  </section>
{/if}
