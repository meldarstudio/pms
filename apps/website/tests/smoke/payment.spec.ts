import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { executeSql, localDatabase, queryRows } from "../../../backend/scripts/d1.mjs";
import { LOCAL_API_URL, daysFromToday, openStay } from "../support/local-api";
import { nextCulqiCharge, stubPaymentScripts, useOwnSourceIp } from "../support/payment";

declare global {
  interface Window {
    culqiCards: string[];
    culqiConfigs: { settings: { amount: number }; options: { paymentMethods: object } }[];
    culqi3DS?: {
      devices: unknown[];
      authentications: string[];
      parameters: Record<string, string> | null;
      error: string | null;
    };
  }
}

test.beforeEach(async ({ page }) => {
  await stubPaymentScripts(page);
  await useOwnSourceIp(page, test.info().workerIndex);
});

const reviewPath = (plan: string, lang = "") =>
  `${lang}/reservar/revisar/?${new URLSearchParams({ ...openStay(), adults: "2", children: "0", room: "king", plan }).toString()}`;

const payerEmail = () => `payer-${crypto.randomUUID().slice(0, 8)}@example.com`;

async function acceptTerms(page: Page, plan: string, email: string) {
  await page.goto(reviewPath(plan));
  await page.getByLabel("Nombre completo").fill("Ana Torres");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Teléfono").fill("987 654 321");
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
}

const payButton = (page: Page, amount: string) =>
  page.getByRole("button", { name: new RegExp(`^Pagar S/\\s${amount} con tarjeta$`) });

const outcome = (page: Page) => page.locator("[data-outcome]");

async function checkoutToken(page: Page) {
  return page.evaluate(() => {
    const checkouts = JSON.parse(
      sessionStorage.getItem("hm.reservation.checkouts") ?? "{}",
    ) as Record<string, { token: string }>;
    return Object.values(checkouts).at(-1)!.token;
  });
}

async function serverCheckout(page: Page, request: APIRequestContext) {
  const response = await request.get(`${LOCAL_API_URL}/public/checkout`, {
    headers: { authorization: `Bearer ${await checkoutToken(page)}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    quote: {
      id: string;
      expired: boolean;
      totalCents: number;
      requiredInitialPaymentCents: number;
    };
    acceptance: { quoteId: string } | null;
  };
}

async function serverPayment(page: Page, request: APIRequestContext) {
  const response = await request.get(`${LOCAL_API_URL}/public/checkout/payment`, {
    headers: { authorization: `Bearer ${await checkoutToken(page)}` },
  });
  return ((await response.json()) as { payment: { state: string } | null }).payment;
}

const localState = fileURLToPath(new URL("../../.local-api/state", import.meta.url));

function expireQuote(quoteId: string, checkIn?: string) {
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) throw new Error("unexpected quote id");
  if (checkIn && !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) throw new Error("unexpected check-in");
  const cheaper = checkIn
    ? `DELETE FROM room_type_rates WHERE room_type_id = 'type-suite-matrimonial' AND date = '${checkIn}';
       INSERT INTO room_type_rates (id, room_type_id, date, price_cents)
         VALUES ('refresh-${quoteId}', 'type-suite-matrimonial', '${checkIn}', 8000);`
    : "";
  executeSql(
    localDatabase(localState),
    `${cheaper}UPDATE quotes SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = '${quoteId}';`,
  );
}

test("paying the accepted Flexible quote confirms it with the paid amount and the balance", async ({
  page,
}) => {
  await acceptTerms(page, "flexible", payerEmail());

  await payButton(page, "100.00").click();

  await expect(page.getByRole("heading", { name: "Su reserva está confirmada" })).toBeFocused();
  await expect(outcome(page)).toContainText(/Referencia\s*[A-Z0-9]{6}/);
  await expect(outcome(page)).toContainText(/Pagado\s*S\/\s100\.00/);
  await expect(outcome(page)).toContainText(/Saldo pendiente\s*S\/\s100\.00/);
  expect(await page.evaluate(() => window.culqiConfigs)).toMatchObject([
    {
      settings: { amount: 10000, currency: "PEN" },
      options: { paymentMethods: { tarjeta: true, yape: false } },
    },
  ]);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Su reserva está confirmada" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
});

test("a declined card lets the guest pay with another card without re-entering details", async ({
  page,
}) => {
  await acceptTerms(page, "flexible", payerEmail());
  await page.evaluate(() => {
    window.culqiCards = ["tkn_test_decline"];
  });

  await payButton(page, "100.00").click();

  await expect(page.getByRole("heading", { name: "Su tarjeta fue rechazada" })).toBeFocused();
  await expect(page.getByLabel("Nombre completo")).toHaveValue("Ana Torres");
  await page.getByRole("button", { name: "Pagar con otra tarjeta" }).click();
  await payButton(page, "100.00").click();
  await expect(page.getByRole("heading", { name: "Su reserva está confirmada" })).toBeVisible();
});

test("an uncertain charge stays processing across reload and language change without paying again", async ({
  page,
  request,
}) => {
  await acceptTerms(page, "flexible", payerEmail());
  await nextCulqiCharge(request, "timeout");

  await payButton(page, "100.00").click();

  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeFocused();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
  await expect(page.locator("[data-contact-form]")).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeVisible();
  await page.goto(reviewPath("flexible", "/en"));
  await expect(page.getByRole("heading", { name: "Confirming your payment" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pay/ })).toHaveCount(0);
  expect(await serverPayment(page, request)).toMatchObject({ state: "processing" });
});

test("a payment pause keeps the draft and charges nothing", async ({ page, request }) => {
  await acceptTerms(page, "flexible", payerEmail());
  await page.route(`${LOCAL_API_URL}/public/checkout/payments`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "online payments are paused" }),
    }),
  );

  await payButton(page, "100.00").click();

  await expect(page.getByRole("alert").filter({ hasText: "en pausa" })).toBeVisible();
  await expect(page.getByLabel("Correo electrónico")).not.toHaveValue("");
  await expect(payButton(page, "100.00")).toBeEnabled();
  expect(await serverPayment(page, request)).toBeNull();
});

test("money received for dates the same contact already holds is shown as unconfirmed, not reserved", async ({
  page,
}) => {
  const email = payerEmail();
  await acceptTerms(page, "flexible", email);
  await payButton(page, "100.00").click();
  await expect(page.getByRole("heading", { name: "Su reserva está confirmada" })).toBeVisible();

  await acceptTerms(page, "non_refundable", email);
  await payButton(page, "180.00").click();

  await expect(
    page.getByRole("heading", { name: "Pago recibido, pero su reserva no se pudo confirmar" }),
  ).toBeVisible();
  await expect(outcome(page)).toContainText(/Referencia de atención\s*[A-Z0-9]{6}/);
  await expect(outcome(page)).toContainText(/Recibido\s*S\/\s180\.00/);
  await expect(outcome(page)).toContainText(/Por resolver\s*S\/\s180\.00/);
  await expect(outcome(page)).not.toContainText("confirmada");
});

test("paying an expired unchanged quote refreshes it and charges once without asking again", async ({
  page,
  request,
}) => {
  await acceptTerms(page, "flexible", payerEmail());
  const before = await serverCheckout(page, request);
  let refreshes = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/public/checkout/quotes")) refreshes += 1;
  });
  expireQuote(before.quote.id);

  await page.reload();
  expect((await serverCheckout(page, request)).quote.id).toBe(before.quote.id);
  expect(refreshes).toBe(0);

  await payButton(page, "100.00").click();

  await expect(page.getByRole("heading", { name: "Su reserva está confirmada" })).toBeVisible();
  await expect(page.getByText("acéptelas de nuevo")).toHaveCount(0);
  const after = await serverCheckout(page, request);
  expect(after.quote.id).not.toBe(before.quote.id);
  expect(after.acceptance?.quoteId).toBe(after.quote.id);
  expect(after.quote.requiredInitialPaymentCents).toBe(10000);
  expect(await serverPayment(page, request)).toMatchObject({ state: "confirmed" });
  expect(refreshes).toBe(1);
  expect(await page.evaluate(() => window.culqiConfigs)).toHaveLength(1);
});

test("a cheaper refreshed quote is shown for a new acceptance and is not charged until then", async ({
  page,
  request,
}) => {
  const stay = { checkIn: daysFromToday(200), checkOut: daysFromToday(202) };
  await page.goto(
    `/reservar/revisar/?${new URLSearchParams({ ...stay, adults: "2", children: "0", room: "king", plan: "flexible" }).toString()}`,
  );
  await page.getByLabel("Nombre completo").fill("Ana Torres");
  await page.getByLabel("Correo electrónico").fill(payerEmail());
  await page.getByLabel("Teléfono").fill("987 654 321");
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
  const before = await serverCheckout(page, request);
  expireQuote(before.quote.id, stay.checkIn);

  await page.reload();
  await payButton(page, "100.00").click();

  await expect(page.getByText("así que no se cobró nada")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeFocused();
  await expect(page.getByText(/S\/\s*180\.00/)).toBeVisible();
  await expect(page.getByText(/S\/\s*80\.00/).first()).toBeVisible();
  await expect(page.getByLabel("Nombre completo")).toHaveValue("Ana Torres");
  expect(await serverPayment(page, request)).toBeNull();
  const changed = await serverCheckout(page, request);
  expect(changed.quote.id).not.toBe(before.quote.id);
  expect(changed.acceptance?.quoteId).toBe(before.quote.id);
  expect(changed.quote.requiredInitialPaymentCents).toBe(8000);
  expect(await page.evaluate(() => window.culqiConfigs ?? [])).toEqual([]);

  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
  await payButton(page, "80.00").click();
  await expect(page.getByRole("heading", { name: "Su reserva está confirmada" })).toBeVisible();
  await expect(outcome(page)).toContainText(/Pagado\s*S\/\s80\.00/);
});

test("accepting an expired quote charges the contact just submitted, not the one refresh kept", async ({
  page,
  request,
}) => {
  const original = payerEmail();
  const updated = payerEmail();
  await acceptTerms(page, "flexible", original);
  expireQuote((await serverCheckout(page, request)).quote.id);

  await page.getByLabel("Nombre completo").fill("Eva Soto");
  await page.getByLabel("Correo electrónico").fill(updated);
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
  await payButton(page, "100.00").click();
  await expect(page.getByRole("heading", { name: "Su reserva está confirmada" })).toBeVisible();

  const charged = queryRows(
    localDatabase(localState),
    `SELECT email, guest FROM payment_attempts WHERE email = '${updated}'`,
  );
  expect(charged).toHaveLength(1);
  const guest = JSON.parse(String(charged[0]!.guest)) as { fullName: string; email: string };
  expect(guest).toMatchObject({ fullName: "Eva Soto", email: updated });
  expect(
    queryRows(
      localDatabase(localState),
      `SELECT email FROM payment_attempts WHERE email = '${original}'`,
    ),
  ).toEqual([]);
});

test("a replaced quote with different terms is not charged from the card form already open", async ({
  page,
}) => {
  await acceptTerms(page, "flexible", payerEmail());
  let payments = 0;
  await page.route(`${LOCAL_API_URL}/public/checkout/payments`, async (route) => {
    payments += 1;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "quote was replaced by a newer quote" }),
    });
  });
  await page.route(`${LOCAL_API_URL}/public/checkout`, async (route) => {
    if (payments === 0) return route.fallback();
    const response = await route.fetch();
    const view = (await response.json()) as {
      quote: {
        id: string;
        totalCents: number;
        requiredInitialPaymentCents: number;
        nights: { priceCents: number }[];
      };
      acceptance: { quoteId: string; acceptedAt: string } | null;
    };
    view.quote = {
      ...view.quote,
      id: crypto.randomUUID(),
      totalCents: 5000,
      requiredInitialPaymentCents: 5000,
      nights: view.quote.nights.map((night) => ({ ...night, priceCents: 2500 })),
    };
    view.acceptance = { quoteId: view.quote.id, acceptedAt: "2026-11-09T00:00:00.000Z" };
    await route.fulfill({ json: view });
  });

  await payButton(page, "100.00").click();

  await expect(page.getByText("así que no se cobró nada")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).not.toBeChecked();
  await expect(page.getByText(/S\/\s*50\.00/).first()).toBeVisible();
  expect(payments).toBe(1);
});

test("a lost retry of a replaced expired quote stays pending and does not offer Pay again", async ({
  page,
  request,
}) => {
  await acceptTerms(page, "flexible", payerEmail());
  expireQuote((await serverCheckout(page, request)).quote.id);
  await page.reload();
  let payments = 0;
  await page.route(`${LOCAL_API_URL}/public/checkout/payments`, async (route) => {
    payments += 1;
    if (payments === 1) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "quote has expired" }),
      });
      return;
    }
    await route.abort();
  });

  await payButton(page, "100.00").click();

  const sent = page.getByRole("heading", { name: "Pago enviado, consultando su estado" });
  await expect(sent).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
  expect(payments).toBe(2);
  await page.reload();
  await expect(sent).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
});

test("a pay refresh that cannot record another agreement keeps this checkout", async ({
  page,
  request,
}) => {
  await acceptTerms(page, "flexible", payerEmail());
  const token = await checkoutToken(page);
  expireQuote((await serverCheckout(page, request)).quote.id);
  await page.reload();
  let freshCheckouts = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/public/checkouts")) freshCheckouts += 1;
  });
  await page.route(`${LOCAL_API_URL}/public/checkout/quotes`, (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "too many acceptances for this checkout" }),
    }),
  );

  await payButton(page, "100.00").click();

  await expect(page.getByText("no puede registrar otro acuerdo")).toBeVisible();
  await expect(page.getByText(/no se cobró nada/i)).toBeVisible();
  expect(await checkoutToken(page)).toBe(token);
  expect(freshCheckouts).toBe(0);
});

test("a lost payment response says the payment was sent and never invites paying again", async ({
  page,
}) => {
  await acceptTerms(page, "flexible", payerEmail());
  await page.route(`${LOCAL_API_URL}/public/checkout/payments`, (route) => route.abort());

  await payButton(page, "100.00").click();

  const sent = page.getByRole("heading", { name: "Pago enviado, consultando su estado" });
  await expect(sent).toBeFocused();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await expect(sent).toBeVisible();
  await page.reload();
  await expect(sent).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
});

const bankParameters = {
  eci: "05",
  xid: "02010000755f8c81a4db4c848b8c23f6b0196cfd",
  cavv: "63617264696e616c636f6d6d6572636561757468",
  protocolVersion: "2.2.0",
  directoryServerTransactionId: "755f8c81-a4db-4c84-8b8c-23f6b0196cfd",
};

test("bank verification of the same card confirms the reservation once", async ({
  page,
  request,
}) => {
  const continuations: unknown[] = [];
  const payments: { sourceId?: string; deviceFingerprint?: string }[] = [];
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    if (req.url().endsWith("/public/checkout/payment/authentication"))
      continuations.push(req.postDataJSON());
    if (req.url().endsWith("/public/checkout/payments")) payments.push(req.postDataJSON());
  });
  const sourceId = `tkn_test_3ds_${crypto.randomUUID()}`;
  await acceptTerms(page, "flexible", payerEmail());
  await page.evaluate(
    ({ parameters, sourceId }) => {
      window.culqiCards = [sourceId];
      window.culqi3DS = {
        devices: [],
        authentications: [],
        parameters,
        error: null,
      };
    },
    { parameters: bankParameters, sourceId },
  );

  await payButton(page, "100.00").click();

  await expect(page.getByRole("heading", { name: "Su reserva está confirmada" })).toBeFocused();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Abrir la verificación del banco" })).toHaveCount(
    0,
  );
  expect(page.url()).not.toContain("tkn_");
  expect(continuations).toEqual([
    { ...bankParameters, attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/i) },
  ]);
  expect(payments).toMatchObject([{ sourceId, deviceFingerprint: "device-test" }]);
  expect(await serverPayment(page, request)).toMatchObject({ state: "confirmed" });
  expect(await page.evaluate(() => window.culqi3DS?.authentications)).toEqual([sourceId]);
});

test("an unfinished bank window stays pending and can be opened again without paying again", async ({
  page,
  request,
}) => {
  const payments: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/public/checkout/payments"))
      payments.push(req.url());
  });
  const sourceId = `tkn_test_3ds_${crypto.randomUUID()}`;
  await acceptTerms(page, "flexible", payerEmail());
  await page.evaluate((sourceId) => {
    window.culqiCards = [sourceId];
    window.culqi3DS = {
      devices: [],
      authentications: [],
      parameters: null,
      error: "Ha fallado la autenticación",
    };
  }, sourceId);

  await payButton(page, "100.00").click();

  const bank = page.getByRole("button", { name: "Abrir la verificación del banco" });
  await expect(
    page.getByRole("heading", { name: "Su banco necesita verificar este pago" }),
  ).toBeVisible();
  await expect(outcome(page)).toContainText("No fue rechazado");
  await expect(bank).toBeFocused();
  await expect(page.getByRole("button", { name: "Pagar con otra tarjeta" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Pagar S\// })).toHaveCount(0);
  expect(page.url()).not.toContain("tkn_");
  expect(
    await page.evaluate(() => sessionStorage.getItem("hm.reservation.card-sources")),
  ).toContain(sourceId);
  expect(await serverPayment(page, request)).toMatchObject({ state: "authentication_required" });

  await bank.click();

  await expect(bank).toBeFocused();
  expect(payments).toHaveLength(1);
  expect(await page.evaluate(() => window.culqi3DS?.authentications)).toEqual([sourceId, sourceId]);
  expect(await serverPayment(page, request)).toMatchObject({ state: "authentication_required" });
});

test("an existing payment is shown without replacing the card the server charged", async ({
  page,
}) => {
  const first = `tkn_test_3ds_${crypto.randomUUID()}`;
  const second = `tkn_test_${crypto.randomUUID()}`;
  await acceptTerms(page, "flexible", payerEmail());
  await page.evaluate((sourceId) => {
    window.culqiCards = [sourceId];
    window.culqi3DS = {
      devices: [],
      authentications: [],
      parameters: null,
      error: "Ha fallado la autenticación",
    };
  }, first);
  await payButton(page, "100.00").click();
  await expect(
    page.getByRole("heading", { name: "Su banco necesita verificar este pago" }),
  ).toBeVisible();

  await page.route(`${LOCAL_API_URL}/public/checkout/payment`, (route) => {
    if (!route.request().url().endsWith("/public/checkout/payment")) return route.fallback();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ payment: null }),
    });
  });
  await page.reload();
  await expect(payButton(page, "100.00")).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("hm.reservation.card-sources")),
  ).toContain(first);

  await page.evaluate((sourceId) => {
    window.culqiCards = [sourceId];
  }, second);
  await payButton(page, "100.00").click();

  await expect(
    page.getByRole("heading", { name: "Su banco necesita verificar este pago" }),
  ).toBeVisible();
  const stored = await page.evaluate(() => sessionStorage.getItem("hm.reservation.card-sources"));
  expect(stored).toContain(first);
  expect(stored).not.toContain(second);
});

test("a lost payment keeps the stored card, and bank verification can open after processing", async ({
  page,
  request,
}) => {
  const sourceId = `tkn_test_3ds_${crypto.randomUUID()}`;
  await acceptTerms(page, "flexible", payerEmail());
  await page.evaluate((card) => {
    window.culqiCards = [card];
    window.culqi3DS = {
      devices: [],
      authentications: [],
      parameters: null,
      error: "Ha fallado la autenticación",
    };
  }, sourceId);
  await payButton(page, "100.00").click();
  await expect(
    page.getByRole("heading", { name: "Su banco necesita verificar este pago" }),
  ).toBeVisible();
  const attemptId = ((await serverPayment(page, request)) as { attemptId?: string } | null)
    ?.attemptId;
  expect(attemptId).toMatch(/^[0-9a-f-]{36}$/i);

  const status: { payment: Record<string, unknown> | null } = { payment: null };
  await page.route(`${LOCAL_API_URL}/public/checkout/payment`, (route) => {
    if (!route.request().url().endsWith("/public/checkout/payment")) return route.fallback();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(status),
    });
  });
  await page.route(`${LOCAL_API_URL}/public/checkout/payments`, (route) => route.abort());
  await page.reload();
  await payButton(page, "100.00").click();
  await expect(
    page.getByRole("heading", { name: "Pago enviado, consultando su estado" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("hm.reservation.card-sources")),
  ).toContain(sourceId);

  status.payment = {
    attemptId: attemptId!,
    state: "processing",
    amountCents: 10000,
    currency: "PEN",
    delayed: false,
    reservation: null,
  };
  await page.reload();
  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir la verificación del banco" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem("hm.reservation.card-sources")),
  ).toContain(sourceId);

  status.payment = { ...status.payment, state: "authentication_required" };
  await page.reload();
  await expect(page.getByRole("button", { name: "Abrir la verificación del banco" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.culqi3DS?.authentications ?? []))
    .toEqual([sourceId]);
});
