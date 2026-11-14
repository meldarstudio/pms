import { useTranslations } from "@/i18n/utils";
import { useEffect, useState } from "react";
import { reservationApiUrl } from "@/lib/reservation/api";
import {
  complaintLabels,
  complaintProblem,
  type ComplaintConfig,
  type ComplaintInput,
  type ComplaintReceipt as Receipt,
} from "@/lib/complaints";
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

export function ComplaintBook({ language }: { language: "es" | "en" }) {
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
  function remember(next: Draft) {
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    setDraft(next);
  }
  async function request(path: string, token?: string, body?: ComplaintInput) {
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
    setBusy(true);
    setProblem("");
    setInvalid("");
    const next = { ...draft, attempted: true };
    try {
      remember(next);
      const saved = (await (await request("", draft.token, draft.input)).json()) as Receipt;
      setSheet(saved);
      sessionStorage.setItem(storageKey, JSON.stringify({ ...next, saved: true }));
    } catch (error) {
      const failure = error as Error & { status?: number; field?: string };
      setProblem(
        (failure.status ? failure.message : undefined) ??
          t("complaints.networkErrorYourDraftIsRetainedRetry"),
      );
      setInvalid(failure.field ?? "");
      if (failure.status === 400) remember({ ...next, attempted: false });
    } finally {
      setBusy(false);
    }
  }
  if (sheet)
    return (
      <>
        <ComplaintReceipt sheet={sheet} language={language} />
        <button
          type="button"
          className="mt-6 min-h-11 rounded border px-4 print:hidden"
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
        </button>
      </>
    );
  const fields = [
    "fullName",
    "address",
    "documentType",
    "documentNumber",
    "phone",
    "email",
    "representative",
    "product",
    "description",
    "requestedRemedy",
    "reservationReference",
  ] as const;
  return (
    <section className="flex flex-col gap-6">
      <p className="rounded border p-4">{t("complaints.developmentOnlyDoNotEnterRealPersonal")}</p>
      <p>{t("complaints.reclamoAProblemWithAProductOr")}</p>
      {!ready && <p role="status">{t("complaints.loading")}</p>}
      {problem && (
        <p role="alert" id="complaint-error">
          {problem}
        </p>
      )}
      {config && (
        <>
          <p>
            {config.provider.legalName} · RUC {config.provider.ruc}
            <br />
            {config.provider.address}
            <br />
            {config.establishmentId}
          </p>
          <p>{config.collectionNotice[language]}</p>
          <details>
            <summary className="min-h-11 cursor-pointer underline">
              {t("complaints.fullPrivacyInformation")}
            </summary>
            <p className="whitespace-pre-wrap">{config.privacyInformation[language]}</p>
          </details>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <fieldset disabled={busy || draft.attempted} className="flex flex-col gap-4">
              <legend className="mb-4">{t("complaints.consumerAndComplaintDetails")}</legend>
              {fields
                .filter((key) => key !== "representative" || draft.input.minor)
                .map((key) => (
                  <label className="flex flex-col gap-1" key={key} htmlFor={`complaint-${key}`}>
                    {labels[key]}
                    {key === "description" ||
                    key === "requestedRemedy" ||
                    key === "product" ||
                    key === "representative" ? (
                      <textarea
                        id={`complaint-${key}`}
                        className="min-h-24 rounded border p-3"
                        required
                        maxLength={
                          key === "description"
                            ? 10000
                            : key === "requestedRemedy"
                              ? 5000
                              : key === "product"
                                ? 2000
                                : 1000
                        }
                        value={draft.input[key]}
                        aria-invalid={invalid === key}
                        aria-describedby={invalid === key ? "complaint-error" : undefined}
                        onChange={(event) => update(key, event.target.value)}
                      />
                    ) : (
                      <input
                        id={`complaint-${key}`}
                        className="min-h-11 rounded border p-3"
                        type={key === "email" ? "email" : "text"}
                        required={
                          !["phone", "reservationReference"].includes(key) &&
                          (key !== "email" || draft.input.responseChannel === "email")
                        }
                        maxLength={
                          key === "address"
                            ? 500
                            : key === "documentNumber" || key === "reservationReference"
                              ? 100
                              : key === "documentType"
                                ? 80
                                : key === "phone"
                                  ? 60
                                  : 200
                        }
                        value={draft.input[key]}
                        aria-invalid={invalid === key}
                        aria-describedby={invalid === key ? "complaint-error" : undefined}
                        onChange={(event) => update(key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.input.minor}
                  onChange={(event) => update("minor", event.target.checked)}
                />
                {labels.minor}
              </label>
              <label className="flex flex-col gap-1">
                {labels.amount} (PEN)
                <input
                  className="min-h-11 rounded border p-3"
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
              </label>
              <label className="flex flex-col gap-1">
                {labels.category}
                <select
                  className="min-h-11 rounded border p-3"
                  value={draft.input.category}
                  onChange={(event) => update("category", event.target.value)}
                >
                  <option value="reclamo">Reclamo</option>
                  <option value="queja">Queja</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                {labels.responseChannel}
                <select
                  className="min-h-11 rounded border p-3"
                  value={draft.input.responseChannel}
                  onChange={(event) => update("responseChannel", event.target.value)}
                >
                  <option value="email">{t("complaints.email")}</option>
                  <option value="letter">{t("complaints.letterToTheAddressProvided")}</option>
                </select>
              </label>
            </fieldset>
            <p role="status" aria-live="polite">
              {busy ? t("complaints.registering") : ""}
            </p>
            <button className="min-h-11 rounded border px-4 py-2" disabled={busy} type="submit">
              {draft.attempted
                ? t("complaints.retrySameSubmission")
                : t("complaints.registerSheet")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
