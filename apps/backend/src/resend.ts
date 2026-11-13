import type { Env } from "./env";
import { loopbackUrl } from "./loopback";

const API = "https://api.resend.com";
const TIMEOUT_MS = 20_000;

export type ResendSendResult =
  | { kind: "sent"; id: string }
  | { kind: "retry"; error: string; retryAfterMs: number }
  | { kind: "failed"; error: string };

export type Resend = {
  configured: boolean;
  send(request: { idempotencyKey: string; body: string }): Promise<ResendSendResult>;
};

const present = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export function resendClient(options: {
  secretKey: string | undefined;
  localApiUrl?: string;
  fetch?: typeof globalThis.fetch;
}): Resend {
  const send = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const emailsUrl = `${loopbackUrl(options.localApiUrl) ?? API}/emails`;
  return {
    configured: Boolean(options.secretKey),
    async send({ idempotencyKey, body }) {
      if (!options.secretKey) return { kind: "retry", error: "not_configured", retryAfterMs: 0 };
      let response: Response;
      let parsed: Record<string, unknown> | null = null;
      try {
        response = await send(emailsUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.secretKey}`,
            "content-type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        parsed = parseObject(await response.text());
      } catch {
        return { kind: "retry", error: "network_error", retryAfterMs: 0 };
      }
      return sendResult(response.status, parsed, retryAfterMs(response.headers.get("retry-after")));
    },
  };
}

function parseObject(raw: string) {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function sendResult(
  status: number,
  body: Record<string, unknown> | null,
  retryAfter: number,
): ResendSendResult {
  const name = present(body?.name);
  const id = present(body?.id);
  if (status >= 200 && status < 300 && id && /^[A-Za-z0-9_-]{1,256}$/.test(id))
    return { kind: "sent", id };
  const error = name ?? `http_${status}`;
  const transient =
    status < 400 ||
    status >= 500 ||
    status === 429 ||
    (status === 409 && name === "concurrent_idempotent_requests");
  return transient
    ? { kind: "retry", error: status < 300 ? "invalid_response" : error, retryAfterMs: retryAfter }
    : { kind: "failed", error };
}

function retryAfterMs(value: string | null) {
  if (!value) return 0;
  const delay = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

export const resendForEnv = (env: Pick<Env["Bindings"], "RESEND_API_KEY" | "RESEND_API_URL">) =>
  resendClient({ secretKey: env.RESEND_API_KEY, localApiUrl: env.RESEND_API_URL });
