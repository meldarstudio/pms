export const RESEND_TEST_KEY = "re_test_fake";
export const RESEND_LOOPBACK = "http://127.0.0.1:9";

type Scripted =
  | "lose"
  | "timeout"
  | "empty"
  | "invalid"
  | "concurrent"
  | 500
  | 429
  | 422
  | 401
  | 403;

export type ResendRequest = {
  method: string;
  url: string;
  headers: Headers;
  body: string;
};

export function fakeResend() {
  const emails: { id: string; key: string; body: string }[] = [];
  const requests: ResendRequest[] = [];
  const scripts: Scripted[] = [];
  let sequence = 0;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  return {
    emails,
    requests,
    next(...outcomes: Scripted[]) {
      scripts.push(...outcomes);
    },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : "";
      const headers = new Headers(init?.headers);
      if (url.hostname !== "127.0.0.1" || !headers.get("authorization")?.startsWith("Bearer "))
        throw new Error(`unexpected request to ${url.href}`);
      requests.push({ method, url: url.href, headers, body });
      const scripted = scripts.shift();
      const key = headers.get("idempotency-key") ?? "";
      if (scripted === "timeout")
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      if (
        scripted === 500 ||
        scripted === 429 ||
        scripted === 422 ||
        scripted === 401 ||
        scripted === 403
      )
        return json(scripted, { name: scripted === 429 ? "rate_limit_exceeded" : "api_error" });
      if (scripted === "empty") return new Response("", { status: 200 });
      if (scripted === "concurrent")
        return json(409, { name: "concurrent_idempotent_requests", message: "in progress" });
      if (scripted === "invalid")
        return json(409, { name: "invalid_idempotent_request", message: "payload changed" });
      const existing = emails.find((email) => email.key === key);
      if (scripted === "lose") {
        if (!existing) emails.push({ id: `email_${++sequence}`, key, body });
        throw new TypeError("Network connection lost.");
      }
      if (existing) return json(200, { id: existing.id });
      const created = { id: `email_${++sequence}`, key, body };
      emails.push(created);
      return json(200, { id: created.id });
    }) as typeof fetch,
  };
}
