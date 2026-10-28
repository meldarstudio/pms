import type { CulqiCharge } from "../culqi";

/**
 * A fake Culqi API v2 at the HTTP level, shaped like the recorded sandbox responses
 * (meldarstudio/pms#114). The token picks the card:
 * `tkn_test_decline` is declined, `tkn_test_3ds` needs 3DS authentication and any
 * other token succeeds. `next` scripts the following call to a path.
 */
export type FakeCulqi = ReturnType<typeof fakeCulqi>;

type Scripted = "lose" | "timeout" | 500 | 429 | 401 | "decline";

type FakeRefund = { id: string; charge_id: string; amount: number; status: string };

export function fakeCulqi() {
  const charges: (CulqiCharge & { source_id: string })[] = [];
  const refunds: FakeRefund[] = [];
  const requests: {
    method: string;
    path: string;
    headers: Headers;
    body: Record<string, unknown> | null;
  }[] = [];
  const usedTokens = new Set<string>();
  const scripts = new Map<string, Scripted[]>();
  let sequence = 0;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const decline = (code: string, message: string) =>
    json(400, {
      object: "error",
      type: "operacion_denegada",
      code,
      decline_code: code === "card_declined" ? "insufficient_funds" : undefined,
      merchant_message: message,
      user_message: message,
    });

  function charge(body: Record<string, unknown>, outcome: CulqiCharge["outcome"]) {
    const created = {
      object: "charge" as const,
      id: `chr_test_${++sequence}`,
      amount: Number(body.amount),
      currency_code: String(body.currency_code),
      email: String(body.email),
      source_id: String(body.source_id),
      creation_date: Date.now(),
      outcome,
      metadata: (body.metadata as Record<string, string>) ?? null,
      amount_refunded: 0,
      // The sandbox reports captured charges as unpaid; success never reads these.
      capture: null,
      paid: false,
    };
    charges.push(created);
    return created;
  }

  function createCharge(body: Record<string, unknown>) {
    const token = String(body.source_id);
    if (usedTokens.has(token)) return decline("DNGA9999", "El token ya fue utilizado.");
    if (token === "tkn_test_decline") {
      charge(body, { type: "venta_denegada", code: "card_declined" });
      return decline("card_declined", "Tu tarjeta fue rechazada.");
    }
    if (token === "tkn_test_3ds" && !body.authentication_3DS)
      return json(200, { action_code: "REVIEW", user_message: "Autenticación requerida." });
    usedTokens.add(token);
    return json(201, charge(body, { type: "venta_exitosa", code: "AUT0000" }));
  }

  function createRefund(body: Record<string, unknown>) {
    const target = charges.find((c) => c.id === body.charge_id);
    if (!target) return json(404, { object: "error", type: "parameter_error" });
    // Culqi allows over-refunds; the API refuses them before calling.
    const refund = {
      object: "refund",
      id: `ref_test_${++sequence}`,
      charge_id: target.id,
      amount: Number(body.amount),
      reason: body.reason,
      status: "completa",
    };
    refunds.push(refund);
    target.amount_refunded = (target.amount_refunded ?? 0) + refund.amount;
    return json(201, refund);
  }

  function route(method: string, url: URL, body: Record<string, unknown> | null) {
    const path = url.pathname.replace(/^\/v2/, "");
    if (method === "POST" && path === "/charges") return createCharge(body ?? {});
    if (method === "POST" && path === "/refunds") return createRefund(body ?? {});
    if (method === "GET" && path === "/charges") {
      const from = Number(url.searchParams.get("creation_date_from")) * 1000;
      const data = charges.filter(
        (c) =>
          c.amount === Number(url.searchParams.get("amount")) &&
          c.email === url.searchParams.get("email") &&
          c.creation_date >= from,
      );
      return json(200, { data, paging: { cursors: {} } });
    }
    const found = method === "GET" && charges.find((c) => path === `/charges/${c.id}`);
    return found ? json(200, found) : json(404, { object: "error", type: "parameter_error" });
  }

  return {
    charges,
    refunds,
    requests,
    /** Script the next call to `method path`, for example `next("POST /charges", "lose")`. */
    next(call: string, ...outcomes: Scripted[]) {
      scripts.set(call, [...(scripts.get(call) ?? []), ...outcomes]);
    },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      const headers = new Headers(init?.headers);
      const authorization = headers.get("authorization");
      if (url.origin !== "https://api.culqi.com" || !authorization?.startsWith("Bearer sk_test_"))
        throw new Error(`unexpected request to ${url.href}`);
      requests.push({ method, path: url.pathname, headers, body });
      const key = `${method} ${url.pathname.replace(/^\/v2/, "")}`;
      const scripted = scripts.get(key)?.shift();
      if (scripted === 500 || scripted === 429 || scripted === 401)
        return json(scripted, { object: "error", type: "api_error" });
      if (scripted === "decline") return decline("refund_denied", "Devolución denegada.");
      if (scripted === "timeout")
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      const response = route(method, url, body);
      // A lost response still made the change in Culqi.
      if (scripted === "lose") throw new TypeError("Network connection lost.");
      return response;
    }) as typeof fetch,
  };
}

export const CULQI_TEST_KEY = "sk_test_fake";
