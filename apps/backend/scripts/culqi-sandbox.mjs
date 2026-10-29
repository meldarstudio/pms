import { readFileSync } from "node:fs";

function devVars() {
  try {
    const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    return Object.fromEntries(
      text
        .split("\n")
        .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map((match) => [match[1], match[2].replace(/^["']|["']$/g, "")]),
    );
  } catch {
    return {};
  }
}

const vars = { ...devVars(), ...process.env };
const secretKey = vars.CULQI_SECRET_KEY ?? "";
const publicKey = vars.CULQI_PUBLIC_KEY ?? "";
if (!secretKey.startsWith("sk_test_") || !publicKey.startsWith("pk_test_")) {
  console.error(
    "Set CULQI_SECRET_KEY=sk_test_... and CULQI_PUBLIC_KEY=pk_test_...; live keys are refused.",
  );
  process.exit(1);
}

const email = `sandbox+${Date.now()}@example.com`;
const amount = 1000 + Math.floor(Math.random() * 9000);

async function call(base, path, key, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "x-api-version": "2",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, body: json };
}
const api = (path, method, body) => call("https://api.culqi.com/v2", path, secretKey, method, body);

async function token(cardNumber) {
  const { status, body } = await call("https://secure.culqi.com/v2", "/tokens", publicKey, "POST", {
    card_number: cardNumber,
    cvv: vars.CULQI_TEST_CVV ?? "123",
    expiration_month: "09",
    expiration_year: "2030",
    email,
  });
  if (status !== 201 || typeof body?.id !== "string") throw new Error(`token: HTTP ${status}`);
  return body.id;
}

const charge = (sourceId, attemptId) =>
  api("/charges", "POST", {
    amount,
    currency_code: "PEN",
    email,
    source_id: sourceId,
    capture: true,
    metadata: { attempt_id: attemptId },
    antifraud_details: { first_name: "Ana", last_name: "Torres", phone_number: "51999777666" },
  });

function report(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const attemptId = crypto.randomUUID();
const startedAt = Date.now();
const sourceId = await token(vars.CULQI_TEST_CARD ?? "4111111111111111");
const charged = await charge(sourceId, attemptId);
if (charged.status === 200 && charged.body?.action_code === "REVIEW") {
  report("charge", true, "REVIEW: this card needs 3DS; finish it in a browser with Culqi3DS");
  process.exit();
}
const chargeId = charged.body?.id;
report(
  "charge succeeds with AUT0000",
  charged.status === 201 && charged.body?.outcome?.code === "AUT0000",
  `HTTP ${charged.status}, paid=${charged.body?.paid}, capture=${charged.body?.capture}`,
);

let found;
for (let tries = 0; tries < 8 && !found; tries++) {
  const query = new URLSearchParams({
    amount: String(amount),
    email,
    creation_date_from: String(Math.floor((startedAt - 60_000) / 1000)),
  });
  const listed = await api(`/charges?${query.toString()}`);
  found = listed.body?.data?.find((c) => c.metadata?.attempt_id === attemptId);
  if (!found) await new Promise((done) => setTimeout(done, 2_000));
}
report("lookup finds the charge by attempt ID", found?.id === chargeId);
report(
  "the charge keeps the guest's antifraud details",
  found?.antifraud_details?.first_name === "Ana",
  JSON.stringify(found?.antifraud_details ?? null),
);

const reused = await charge(sourceId, crypto.randomUUID());
report(
  "a used token is refused",
  reused.status === 400,
  `HTTP ${reused.status} ${reused.body?.code ?? ""}`,
);

if (vars.CULQI_DECLINE_CARD) {
  const declined = await charge(await token(vars.CULQI_DECLINE_CARD), crypto.randomUUID());
  report(
    "a decline is a 400 error",
    declined.status === 400 && declined.body?.object === "error",
    `${declined.body?.code ?? ""} ${declined.body?.user_message ?? ""}`,
  );
} else {
  console.log("skip decline: set CULQI_DECLINE_CARD to a declining test card");
}

if (chargeId) {
  const refunded = await api("/refunds", "POST", {
    amount: 100,
    charge_id: chargeId,
    reason: "solicitud_comprador",
  });
  report(
    "refund completes",
    refunded.status === 201 && String(refunded.body?.status).toLowerCase() === "completa",
    `HTTP ${refunded.status} ${refunded.body?.status ?? ""}`,
  );
  let refundedCents;
  for (let tries = 0; tries < 5 && refundedCents !== 100; tries++) {
    refundedCents = (await api(`/charges/${chargeId}`)).body?.amount_refunded;
    if (refundedCents !== 100) await new Promise((done) => setTimeout(done, 1_000));
  }
  report("the charge shows the refunded amount", refundedCents === 100, `${refundedCents}`);
}
