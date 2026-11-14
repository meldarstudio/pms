import type { Env } from "./env";
import { HttpError } from "./http";
import { loopbackUrl } from "./loopback";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;

export const SECURITY_CHECK_FAILED = "payment security check failed";
export const SECURITY_CHECK_UNAVAILABLE = "payment security check is unavailable";

type Siteverify = { success?: unknown; action?: unknown; "error-codes"?: unknown };

export async function requireTurnstile(
  env: Pick<Env["Bindings"], "TURNSTILE_SECRET_KEY" | "TURNSTILE_VERIFY_URL">,
  token: string,
  sourceIp: string,
  options: { action?: string; failed?: string; unavailable?: string } = {},
) {
  const failed = options.failed ?? SECURITY_CHECK_FAILED;
  const unavailable = options.unavailable ?? SECURITY_CHECK_UNAVAILABLE;
  if (!env.TURNSTILE_SECRET_KEY) throw new HttpError(503, unavailable);
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (sourceIp !== "unknown") form.set("remoteip", sourceIp);
  let body: Siteverify | null = null;
  try {
    const response = await fetch(loopbackUrl(env.TURNSTILE_VERIFY_URL) ?? SITEVERIFY, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) body = (await response.json()) as Siteverify;
  } catch {
    body = null;
  }
  if (body?.success === true) {
    if (options.action && body.action !== options.action) throw new HttpError(403, failed);
    return;
  }
  const codes = Array.isArray(body?.["error-codes"]) ? body["error-codes"] : [];
  if (!body || codes.includes("internal-error")) throw new HttpError(503, unavailable);
  throw new HttpError(403, failed);
}
