import "./complaints.css";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldError,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n/utils";
import { useEffect, useState } from "react";
import { reservationApiUrl } from "@/lib/reservation/api";
import {
  complaintLabels,
  complaintProblem,
  type ComplaintConfig,
  type ComplaintInput,
  type ComplaintSubmission,
  type ComplaintReceipt as Receipt,
} from "@/lib/complaints";
import { ComplaintSecurity } from "./ComplaintSecurity";
import { ComplaintReceipt } from "./ComplaintReceipt";

const storageKey = "hm.complaint.development";
type Draft = { token: string; input: ComplaintInput; attempted: boolean; saved: boolean };
const emptyInput = (language: "es" | "en"): ComplaintInput => ({
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
  policyVersion: "",
});

export function ComplaintBook({
  language,
  turnstileSiteKey,
}: {
  language: "es" | "en";
  turnstileSiteKey: string | null;
}) {
  const t = useTranslations(language);
  const labels = complaintLabels(language);
  const [config, setConfig] = useState<ComplaintConfig | null>(null);
  const [draft, setDraft] = useState<Draft>({
    token: "",
    input: emptyInput(language),
    attempted: false,
    saved: false,
  });
  const [sheet, setSheet] = useState<Receipt | null>(null);
  const [problem, setProblem] = useState("");
  const [invalid, setInvalid] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [securityToken, setSecurityToken] = useState("");
  const [securityVersion, setSecurityVersion] = useState(0);
  function remember(next: Draft) {
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    setDraft(next);
  }
  async function request(path: string, token?: string, body?: ComplaintSubmission) {
    const response = await fetch(`${reservationApiUrl}/public/complaints${path}`, {
      method: body ? "POST" : "GET",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error: string };
      const error = new Error(
        complaintProblem(data.error, language) ?? t("complaints.couldNotRegisterTheSheetYourDraft"),
      );
      Object.assign(error, {
        status: response.status,
        field: response.headers.get("X-Error-Field"),
      });
      throw error;
    }
    return response;
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(reservationApiUrl).hostname))
          throw new Error(complaintProblem("complaint book unavailable", language));
        const loaded = (await (await request("/config")).json()) as ComplaintConfig;
        if (!active) return;
        setConfig(loaded);
        let previous: Draft | null = null;
        try {
          previous = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Draft | null;
        } catch {
          sessionStorage.removeItem(storageKey);
        }
        if (previous?.token && previous.input) {
          setDraft(
            previous.attempted
              ? previous
              : { ...previous, input: { ...previous.input, policyVersion: loaded.policyVersion } },
          );
          if (previous.attempted || previous.saved) {
            try {
              const saved = (await (await request("/receipt", previous.token)).json()) as Receipt;
              if (active) setSheet(saved);
            } catch (error) {
              if (
                active &&
                (error as Error & { status?: number }).status === 401 &&
                previous.input.policyVersion !== loaded.policyVersion &&
                !previous.saved
              ) {
                const refreshed = {
                  ...previous,
                  attempted: false,
                  input: { ...previous.input, policyVersion: loaded.policyVersion },
                };
                remember(refreshed);
              }
              if (active) setProblem(t("complaints.yourDraftIsRetainedRetryTheSame"));
            }
          }
        } else
          setDraft({
            token: crypto.randomUUID() + crypto.randomUUID(),
            input: { ...emptyInput(language), policyVersion: loaded.policyVersion },
            attempted: false,
            saved: false,
          });
      } catch (error) {
        if (active) setProblem(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  function update(key: keyof ComplaintInput, value: string | boolean | number | null) {
    remember({ ...draft, input: { ...draft.input, [key]: value } });
  }
  async function submit() {
    if (busy || !securityToken) return;
    setBusy(true);
    setProblem("");
    setInvalid("");
    const next = { ...draft, attempted: true };
    try {
      remember(next);
      const saved = (await (
        await request("", draft.token, { ...draft.input, turnstileToken: securityToken })
      ).json()) as Receipt;
      setSheet(saved);
      sessionStorage.setItem(storageKey, JSON.stringify({ ...next, saved: true }));
    } catch (error) {
      const failure = error as Error & { status?: number; field?: string };
      setProblem(
        (failure.status ? failure.message : undefined) ??
          t("complaints.networkErrorYourDraftIsRetainedRetry"),
      );
      setInvalid(failure.field ?? "");
      if (!draft.attempted && (failure.status === 400 || failure.status === 403))
        remember({ ...next, attempted: false });
    } finally {
      setSecurityToken("");
      setSecurityVersion((version) => version + 1);
      setBusy(false);
    }
  }
  if (sheet)
    return (
      <>
        <ComplaintReceipt sheet={sheet} language={language} />
        <Button
          type="button"
          variant="outline"
          className="mt-6 h-auto min-h-11 py-2 whitespace-normal print:hidden"
          onClick={() => {
            remember({
              token: crypto.randomUUID() + crypto.randomUUID(),
              input: { ...emptyInput(language), policyVersion: config!.policyVersion },
              attempted: false,
              saved: false,
            });
            setSheet(null);
            setProblem("");
          }}
        >
          {t("complaints.startAnotherSheetSaveOrPrintThis")}
        </Button>
      </>
    );
  const fieldsDisabled = busy || draft.attempted;
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
  function textField(key: keyof typeof limits, fullWidth = false) {
    const required = key !== "email" || draft.input.responseChannel === "email";
    const multiline = ["product", "description", "requestedRemedy", "representative"].includes(key);
    const props = {
      id: `complaint-${key}`,
      disabled: fieldsDisabled,
      required,
      maxLength: limits[key],
      value: draft.input[key],
      "aria-invalid": invalid === key,
      "aria-describedby":
        invalid === key
          ? "complaint-error"
          : key === "email" && !required
            ? "complaint-email-optional"
            : key === "reservationReference"
              ? "complaint-reference-hint"
              : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        update(key, event.target.value),
    };
    return (
      <Field
        key={key}
        className={cn(fullWidth && "sm:col-span-2")}
        data-invalid={invalid === key}
        data-disabled={fieldsDisabled}
      >
        <FieldLabel htmlFor={props.id}>
          {key === "email" && !required ? t("complaints.optionalEmailLabel") : labels[key]}
        </FieldLabel>
        {multiline ? (
          <Textarea {...props} rows={key === "product" ? 2 : 4} />
        ) : (
          <Input {...props} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} />
        )}
        {key === "reservationReference" && (
          <FieldDescription id="complaint-reference-hint">
            {t("complaints.referenceHint")}
          </FieldDescription>
        )}
        {key === "email" && !required && (
          <FieldDescription id="complaint-email-optional">
            {t("complaints.optionalEmail")}
          </FieldDescription>
        )}
      </Field>
    );
  }
  return (
    <section className="complaint-book flex flex-col gap-6">
      <p className="complaint-intro">{t("complaints.reclamoAProblemWithAProductOr")}</p>
      {!ready && <p role="status">{t("complaints.loading")}</p>}
      {problem && <FieldError id="complaint-error">{problem}</FieldError>}
      {config && (
        <>
          <div className="complaint-provider">
            <p className="font-semibold">
              {config.provider.legalName} · RUC {config.provider.ruc}
            </p>
            <p>
              {config.provider.address} · {config.establishmentId}
            </p>
          </div>
          <form
            className="flex flex-col gap-8"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <FieldSet disabled={fieldsDisabled}>
              <FieldLegend>{t("complaints.consumerDetails")}</FieldLegend>
              <FieldGroup className="grid gap-x-6 sm:grid-cols-2">
                {textField("fullName", true)}
                {textField("documentType")}
                {textField("documentNumber")}
                {textField("address", true)}
                {textField("phone", true)}
                <Field
                  orientation="horizontal"
                  data-disabled={fieldsDisabled}
                  className="min-h-11 sm:col-span-2"
                >
                  <Checkbox
                    id="complaint-minor"
                    disabled={fieldsDisabled}
                    checked={draft.input.minor}
                    onCheckedChange={(checked) => update("minor", checked)}
                  />
                  <FieldLabel htmlFor="complaint-minor">{labels.minor}</FieldLabel>
                </Field>
                {draft.input.minor && textField("representative", true)}
              </FieldGroup>
            </FieldSet>
            <FieldSet disabled={fieldsDisabled}>
              <FieldLegend>{t("complaints.complaintDetails")}</FieldLegend>
              <FieldGroup className="grid gap-x-6 sm:grid-cols-2">
                <Field data-disabled={fieldsDisabled} className="sm:col-span-2">
                  <FieldLabel htmlFor="complaint-category">{labels.category}</FieldLabel>
                  <NativeSelect
                    id="complaint-category"
                    className="w-full"
                    disabled={fieldsDisabled}
                    value={draft.input.category}
                    onChange={(event) => update("category", event.target.value)}
                  >
                    <NativeSelectOption value="reclamo">Reclamo</NativeSelectOption>
                    <NativeSelectOption value="queja">Queja</NativeSelectOption>
                  </NativeSelect>
                </Field>
                {textField("product", true)}
                <Field data-invalid={invalid === "amountCents"} data-disabled={fieldsDisabled}>
                  <FieldLabel htmlFor="complaint-amountCents">
                    {t("complaints.amountLabel")} (PEN)
                  </FieldLabel>
                  <Input
                    disabled={fieldsDisabled}
                    id="complaint-amountCents"
                    aria-invalid={invalid === "amountCents"}
                    aria-describedby={invalid === "amountCents" ? "complaint-error" : undefined}
                    type="number"
                    min="0"
                    max="10000000"
                    step="0.01"
                    value={draft.input.amountCents === null ? "" : draft.input.amountCents / 100}
                    onChange={(event) =>
                      update(
                        "amountCents",
                        event.target.value === ""
                          ? null
                          : Math.round(Number(event.target.value) * 100),
                      )
                    }
                  />
                  <FieldDescription>{t("complaints.amountHint")}</FieldDescription>
                </Field>
                {textField("reservationReference")}
                {textField("description", true)}
                {textField("requestedRemedy", true)}
              </FieldGroup>
            </FieldSet>
            <FieldSet disabled={fieldsDisabled}>
              <FieldLegend>{t("complaints.writtenResponse")}</FieldLegend>
              <FieldGroup>
                <Field data-disabled={fieldsDisabled}>
                  <FieldLabel htmlFor="complaint-responseChannel">
                    {labels.responseChannel}
                  </FieldLabel>
                  <NativeSelect
                    id="complaint-responseChannel"
                    className="w-full"
                    disabled={fieldsDisabled}
                    value={draft.input.responseChannel}
                    onChange={(event) => update("responseChannel", event.target.value)}
                  >
                    <NativeSelectOption value="email">{t("complaints.email")}</NativeSelectOption>
                    <NativeSelectOption value="letter">
                      {t("complaints.letterToTheAddressProvided")}
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                {textField("email")}
              </FieldGroup>
            </FieldSet>
            <div className="flex flex-col gap-3">
              <p className="complaint-hint whitespace-pre-wrap">
                {config.collectionNotice[language]}
              </p>
              <Accordion>
                <AccordionItem value="privacy">
                  <AccordionTrigger variant="compact">
                    {t("complaints.fullPrivacyInformation")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="whitespace-pre-wrap">{config.privacyInformation[language]}</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            <div className="flex flex-col gap-3 sm:items-start">
              <ComplaintSecurity
                key={securityVersion}
                siteKey={turnstileSiteKey}
                language={language}
                onToken={setSecurityToken}
              />
              <p role="status" aria-live="polite" hidden={!busy}>
                {busy ? t("complaints.registering") : ""}
              </p>
              <Button className="w-full sm:w-auto" disabled={busy || !securityToken} type="submit">
                {draft.attempted
                  ? t("complaints.retrySameSubmission")
                  : t("complaints.registerSheet")}
              </Button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
