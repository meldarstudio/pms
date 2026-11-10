import type { Env } from "./env";
import { loopbackUrl } from "./loopback";
import { decodeResendLookup, type ResendLookup } from "./resend-reports";

const API = "https://api.resend.com";
const TIMEOUT_MS = 20_000;
const LOOKUP_TIMEOUT_MS = 5_000;

export const QUOTA_BACKOFF_MS = 15 * 60 * 1000;

export type ResendFailureCode = "quota" | "configuration" | "rejected";

export type ResendSendResult =
  | { kind: "accepted"; id: string }
  | { kind: "uncertain"; failureCode: ResendFailureCode | null; minimumBackoffMs: number }
  | { kind: "unsent"; failureCode: ResendFailureCode | null; minimumBackoffMs: number }
  | { kind: "attention"; failureCode: "invalid_idempotent_request" };

export type Resend = {
  configured: boolean;
  emailsUrl: string;
  credentialFingerprint(): Promise<string | null>;
  send(request: {
    endpoint: string;
    idempotencyKey: string;
    body: string;
  }): Promise<ResendSendResult>;
  getEmail(endpoint: string, id: string): Promise<ResendLookup | null>;
};

type CallResult = { status: number; body: Record<string, unknown> | null; retryAfterMs: number };

const present = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export function resendEmailsUrl(localApiUrl: string | undefined) {
  return `${loopbackUrl(localApiUrl) ?? API}/emails`;
}

export function resendClient(options: {
  secretKey: string | undefined;
  localApiUrl?: string;
  fetch?: typeof globalThis.fetch;
}): Resend {
  const send = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const emailsUrl = resendEmailsUrl(options.localApiUrl);

  async function call(
    method: string,
    url: string,
    body?: string,
    idempotencyKey?: string,
    timeoutMs = TIMEOUT_MS,
  ): Promise<CallResult | null> {
    if (!options.secretKey) return null;
    const response = await send(url, {
      method,
      headers: {
        authorization: `Bearer ${options.secretKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await response.text();
    let parsed: Record<string, unknown> | null = null;
    if (raw.trim()) {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }
    return {
      status: response.status,
      body: parsed,
      retryAfterMs: retryAfterMs(response.headers.get("retry-after")),
    };
  }

  return {
    configured: Boolean(options.secretKey),
    emailsUrl,
    async credentialFingerprint() {
      if (!options.secretKey) return null;
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(options.secretKey),
      );
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    },
    async send(request) {
      let response: CallResult | null;
      try {
        response = await call("POST", request.endpoint, request.body, request.idempotencyKey);
      } catch {
        return { kind: "uncertain", failureCode: null, minimumBackoffMs: 0 };
      }
      if (!response)
        return { kind: "uncertain", failureCode: "configuration", minimumBackoffMs: 0 };
      return mapSend(response);
    },
    async getEmail(endpoint, id) {
      try {
        const response = await call(
          "GET",
          `${endpoint}/${encodeURIComponent(id)}`,
          undefined,
          undefined,
          LOOKUP_TIMEOUT_MS,
        );
        const messageId = present(response?.body?.id);
        if (!response || response.status < 200 || response.status >= 300 || messageId !== id)
          return null;
        return decodeResendLookup(response.body);
      } catch {
        return null;
      }
    },
  };
}

function mapSend(response: CallResult): ResendSendResult {
  const name = present(response.body?.name);
  const minimumBackoffMs = response.retryAfterMs;
  if (response.status === 409 && name === "invalid_idempotent_request")
    return { kind: "attention", failureCode: "invalid_idempotent_request" };
  if (response.status === 429)
    return {
      kind: "unsent",
      failureCode: "quota",
      minimumBackoffMs: Math.max(QUOTA_BACKOFF_MS, minimumBackoffMs),
    };
  if (response.status === 401 || response.status === 403)
    return { kind: "unsent", failureCode: "configuration", minimumBackoffMs };
  if (response.status === 422) return { kind: "unsent", failureCode: "rejected", minimumBackoffMs };
  if (response.status >= 400 && response.status < 500 && response.status !== 409)
    return { kind: "uncertain", failureCode: "rejected", minimumBackoffMs };
  const candidateId = present(response.body?.id);
  const id = candidateId && /^[A-Za-z0-9_-]{1,256}$/.test(candidateId) ? candidateId : undefined;
  if (response.status >= 200 && response.status < 300 && id) return { kind: "accepted", id };
  return { kind: "uncertain", failureCode: null, minimumBackoffMs };
}

function retryAfterMs(value: string | null) {
  if (!value) return 0;
  const delay = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay)
    ? Math.min(8_640_000_000_000_000 - Date.now(), Math.max(0, delay))
    : 0;
}

export const resendForEnv = (env: Pick<Env["Bindings"], "RESEND_API_KEY" | "RESEND_API_URL">) =>
  resendClient({ secretKey: env.RESEND_API_KEY, localApiUrl: env.RESEND_API_URL });
