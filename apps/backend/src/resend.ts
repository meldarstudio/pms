import type { Env } from "./env";
import { loopbackUrl } from "./loopback";

const API = "https://api.resend.com";
const TIMEOUT_MS = 20_000;

export const QUOTA_BACKOFF_MS = 15 * 60 * 1000;

export type ResendFailureCode = "quota" | "configuration" | "rejected";

export type ResendSendResult =
  | { kind: "accepted"; id: string }
  | { kind: "uncertain"; failureCode: ResendFailureCode | null; minimumBackoffMs: number }
  | { kind: "attention"; failureCode: "invalid_idempotent_request" };

export type Resend = {
  configured: boolean;
  emailsUrl: string;
  send(request: {
    endpoint: string;
    idempotencyKey: string;
    body: string;
  }): Promise<ResendSendResult>;
  getEmail(id: string): Promise<{ id: string } | null>;
};

type CallResult = { status: number; body: Record<string, unknown> | null };

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
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
    return { status: response.status, body: parsed };
  }

  return {
    configured: Boolean(options.secretKey),
    emailsUrl,
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
    async getEmail(id) {
      try {
        const response = await call("GET", `${emailsUrl}/${encodeURIComponent(id)}`);
        const messageId = present(response?.body?.id);
        if (!response || response.status < 200 || response.status >= 300 || !messageId) return null;
        return { id: messageId };
      } catch {
        return null;
      }
    },
  };
}

function mapSend(response: CallResult): ResendSendResult {
  const name = present(response.body?.name);
  if (response.status === 409 && name === "invalid_idempotent_request")
    return { kind: "attention", failureCode: "invalid_idempotent_request" };
  if (response.status === 429)
    return { kind: "uncertain", failureCode: "quota", minimumBackoffMs: QUOTA_BACKOFF_MS };
  if (response.status === 401 || response.status === 403)
    return { kind: "uncertain", failureCode: "configuration", minimumBackoffMs: 0 };
  if (
    response.status === 422 ||
    (response.status >= 400 && response.status < 500 && response.status !== 409)
  )
    return { kind: "uncertain", failureCode: "rejected", minimumBackoffMs: 0 };
  const id = present(response.body?.id);
  if (response.status >= 200 && response.status < 300 && id) return { kind: "accepted", id };
  return { kind: "uncertain", failureCode: null, minimumBackoffMs: 0 };
}

export const resendForEnv = (env: Pick<Env["Bindings"], "RESEND_API_KEY" | "RESEND_API_URL">) =>
  resendClient({ secretKey: env.RESEND_API_KEY, localApiUrl: env.RESEND_API_URL });
