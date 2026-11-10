export type FakeTurnstile = ReturnType<typeof fakeTurnstile>;

type Scripted = "lose" | 500 | "internal-error";

export const TURNSTILE_TEST_SECRET = "turnstile-test-secret";
export const TURNSTILE_PASS = "turnstile-pass";
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export function fakeTurnstile() {
  const verifications: { secret: string; response: string; remoteip: string | null }[] = [];
  const scripts: Scripted[] = [];

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  return {
    verifications,
    next(...outcomes: Scripted[]) {
      scripts.push(...outcomes);
    },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (
        url.origin !== TURNSTILE_ORIGIN ||
        url.pathname !== "/turnstile/v0/siteverify" ||
        init?.method !== "POST"
      )
        throw new Error(`unexpected request to ${url.href}`);
      const form = new URLSearchParams(init.body as URLSearchParams);
      verifications.push({
        secret: form.get("secret") ?? "",
        response: form.get("response") ?? "",
        remoteip: form.get("remoteip"),
      });
      const scripted = scripts.shift();
      if (scripted === "lose") throw new TypeError("Network connection lost.");
      if (scripted === 500) return json(500, {});
      if (scripted === "internal-error")
        return json(200, { success: false, "error-codes": ["internal-error"] });
      const valid =
        form.get("secret") === TURNSTILE_TEST_SECRET && form.get("response") === TURNSTILE_PASS;
      return json(
        200,
        valid
          ? { success: true, "error-codes": [], action: "payment", hostname: "localhost" }
          : { success: false, "error-codes": ["invalid-input-response"] },
      );
    }) as typeof fetch,
  };
}

export const externalServices =
  (services: {
    culqi: { fetch: typeof fetch };
    turnstile: { fetch: typeof fetch };
  }): typeof fetch =>
  async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    return (url.origin === TURNSTILE_ORIGIN ? services.turnstile : services.culqi).fetch(
      input,
      init,
    );
  };
