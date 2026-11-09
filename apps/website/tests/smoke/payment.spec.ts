import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { LOCAL_API_URL, openStay } from "../support/local-api";
import { nextCulqiCharge, stubPaymentScripts, useOwnSourceIp } from "../support/payment";

declare global {
  interface Window {
    culqiCards: string[];
    culqiConfigs: { settings: { amount: number }; options: { paymentMethods: object } }[];
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

async function serverPayment(page: Page, request: APIRequestContext) {
  const token = await page.evaluate(() => {
    const checkouts = JSON.parse(
      sessionStorage.getItem("hm.reservation.checkouts") ?? "{}",
    ) as Record<string, { token: string }>;
    return Object.values(checkouts).at(-1)!.token;
  });
  const response = await request.get(`${LOCAL_API_URL}/public/checkout/payment`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return ((await response.json()) as { payment: { state: string } | null }).payment;
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
