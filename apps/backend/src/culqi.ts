import type { Env } from "./env";
import { HttpError } from "./http";
import { loopbackUrl } from "./loopback";

const API = "https://api.culqi.com/v2";
const TIMEOUT_MS = 20_000;
const SUCCESS_CODE = "AUT0000";

const text = (value: unknown) => (typeof value === "string" ? value : undefined);

export type CulqiCharge = {
  object: "charge";
  id: string;
  amount: number;
  currency_code: string;
  email: string;
  source_id?: string;
  creation_date: number;
  outcome?: { type?: string; code?: string };
  metadata?: Record<string, string> | null;
  amount_refunded?: number;
};

export type ChargeRequest = {
  attemptId: string;
  amountCents: number;
  currency: string;
  email: string;
  sourceId: string;
  fullName: string;
  phone?: string | null;
  deviceFingerprint?: string | null;
  authentication3DS?: Record<string, string | undefined>;
};

export type ChargeResult =
  | { kind: "succeeded"; charge: CulqiCharge }
  | { kind: "review" }
  | { kind: "declined"; code: string; message: string }
  | { kind: "unknown"; reason: string };

export type RefundResult =
  | { kind: "completed"; refundId: string }
  | { kind: "unclear"; refundId: string | null; reason: string };

export type Culqi = {
  configured: boolean;
  createCharge(request: ChargeRequest): Promise<ChargeResult>;
  listCharges(filter: { amountCents: number; email: string; from: Date }): Promise<CulqiCharge[]>;
  getCharge(id: string): Promise<CulqiCharge>;
  createRefund(request: { chargeId: string; amountCents: number }): Promise<RefundResult>;
};

export const isSuccessfulCharge = (charge: CulqiCharge) => charge.outcome?.code === SUCCESS_CODE;

type Response = { status: number; body: Record<string, unknown> | null };

const within = (value: string | undefined, min: number, max: number) =>
  value && value.length >= min && value.length <= max ? value : undefined;

function antifraudDetails(request: ChargeRequest) {
  const [first, ...rest] = request.fullName.trim().split(/\s+/);
  const details = Object.entries({
    first_name: within(first, 2, 50),
    last_name: within(rest.join(" "), 2, 50),
    phone_number: within(request.phone?.replace(/\D/g, ""), 5, 15),
    device_finger_print_id: request.deviceFingerprint ?? undefined,
  }).filter(([, value]) => value);
  return details.length ? Object.fromEntries(details) : undefined;
}

export function culqiClient(options: {
  secretKey: string | undefined;
  localApiUrl?: string;
  fetch?: typeof globalThis.fetch;
}): Culqi {
  const send = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const api = loopbackUrl(options.localApiUrl) ?? API;
  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    if (!options.secretKey) throw new HttpError(503, "Culqi is not configured");
    const response = await send(`${api}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${options.secretKey}`,
        "x-api-version": "2",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const raw = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {}
    return { status: response.status, body: parsed };
  }
  async function read(path: string) {
    const response = await call("GET", path);
    if (response.status !== 200 || !response.body)
      throw new Error(`Culqi GET ${path.split("?")[0]} returned ${response.status}`);
    return response.body;
  }
  return {
    configured: Boolean(options.secretKey),
    async createCharge(request) {
      const antifraud = antifraudDetails(request);
      let response: Response;
      try {
        response = await call("POST", "/charges", {
          amount: request.amountCents,
          currency_code: request.currency,
          email: request.email,
          source_id: request.sourceId,
          capture: true,
          metadata: { attempt_id: request.attemptId },
          ...(antifraud ? { antifraud_details: antifraud } : {}),
          ...(request.authentication3DS ? { authentication_3DS: request.authentication3DS } : {}),
        });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        return { kind: "unknown", reason: error instanceof Error ? error.name : "network error" };
      }
      const { status, body } = response;
      if (status === 201 && body?.object === "charge" && isSuccessfulCharge(body as CulqiCharge))
        return { kind: "succeeded", charge: body as CulqiCharge };
      if (status === 200 && body?.action_code === "REVIEW") return { kind: "review" };
      if (status === 400 && body?.object === "error")
        return {
          kind: "declined",
          code: text(body.code) ?? text(body.type) ?? "declined",
          message: text(body.user_message) ?? text(body.merchant_message) ?? "",
        };
      return { kind: "unknown", reason: `HTTP ${status}` };
    },
    async listCharges({ amountCents, email, from }) {
      const query = new URLSearchParams({
        amount: String(amountCents),
        email,
        creation_date_from: String(Math.floor(from.getTime() / 1000)),
        limit: "100",
      });
      const body = await read(`/charges?${query.toString()}`);
      return Array.isArray(body.data) ? (body.data as CulqiCharge[]) : [];
    },
    async getCharge(id) {
      return (await read(`/charges/${encodeURIComponent(id)}`)) as CulqiCharge;
    },
    async createRefund({ chargeId, amountCents }) {
      let response: Response;
      try {
        response = await call("POST", "/refunds", {
          amount: amountCents,
          charge_id: chargeId,
          reason: "solicitud_comprador",
        });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        return {
          kind: "unclear",
          refundId: null,
          reason: error instanceof Error ? error.name : "network error",
        };
      }
      const { status, body } = response;
      const refundId = text(body?.id) ?? null;
      if (status === 201 && refundId && text(body?.status)?.toLowerCase() === "completa")
        return { kind: "completed", refundId };
      return { kind: "unclear", refundId, reason: `HTTP ${status}` };
    },
  };
}

export const culqiForEnv = (env: Pick<Env["Bindings"], "CULQI_SECRET_KEY" | "CULQI_API_URL">) =>
  culqiClient({ secretKey: env.CULQI_SECRET_KEY, localApiUrl: env.CULQI_API_URL });
