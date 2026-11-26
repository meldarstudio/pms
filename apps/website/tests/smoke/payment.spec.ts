import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { executeSql, localDatabase } from "../../../backend/scripts/d1.mjs";
import {
  FAKE_PAYMENT_SERVICES_URL,
  LOCAL_API_URL,
  daysFromToday,
  openStay,
  WEBSITE_URL,
} from "../support/local-api";
import {
  checkoutToken,
  fillContact,
  payButton,
  reviewPath,
  serverCheckout,
} from "../support/checkout";
import {
  closeCardFormWithoutPaying,
  nextCulqiCharge,
  recordedCulqi,
  stubPaymentScripts,
  useOwnSourceIp,
} from "../support/payment";

declare global {
  interface Window {
    culqiCards: (string | null)[];
    culqiConfigs: { settings: { amount: number }; options: { paymentMethods: object } }[];
    culqi3DS?: {
      devices: unknown[];
      authentications: string[];
      parameters: Record<string, string> | null;
      error: string | null;
      closes?: boolean;
    };
  }
}

test.beforeEach(async ({ page }) => {
  await stubPaymentScripts(page);
  await useOwnSourceIp(page, test.info().workerIndex);
});

const kingReview = (plan: string, lang = "") =>
  reviewPath(openStay(), { types: "king", plan }, lang);

const payerEmail = () => `payer-${crypto.randomUUID().slice(0, 8)}@example.com`;

async function fillCheckout(page: Page, plan: string, email: string) {
  await page.goto(kingReview(plan));
  await fillContact(page, email);
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
}

async function acceptTerms(page: Page, email: string) {
  await fillCheckout(page, "flexible", email);
  await closeCardFormWithoutPaying(page, payButton(page, "100.00"));
}

const outcome = (page: Page) => page.locator("[data-outcome]");

const confirmation = outcome;

async function expectConfirmed(page: Page, lang = "") {
  await expect(page).toHaveURL(new RegExp(`${lang}/reservar/revisar/\\?`));
  await expect(
    page.getByRole("heading", {
      name: lang ? "See you in Churín." : "Nos vemos en Churín.",
    }),
  ).toBeVisible();
}

async function serverPayment(page: Page, request: APIRequestContext) {
  const response = await request.get(`${LOCAL_API_URL}/public/checkout/payment`, {
    headers: { authorization: `Bearer ${await checkoutToken(page)}` },
  });
  return (
    (await response.json()) as {
      payment: { attemptId: string; state: string; delayed: boolean } | null;
    }
  ).payment;
}

const localState = fileURLToPath(new URL("../../.local-api/state", import.meta.url));

test("the complete English Non-refundable journey sends its saved confirmation and opens the same private summary", async ({
  page,
  request,
  browser,
}) => {
  const email = payerEmail();
  const stay = new URLSearchParams({
    checkIn: daysFromToday(250),
    checkOut: daysFromToday(252),
    adults: "2",
    children: "0",
  });
  await page.goto(`/en/habitaciones/?${stay.toString()}`);
  await page.getByRole("link", { name: "Continue with King room, Non-refundable rate" }).click();
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s180\.00/);
  await expect(page.locator('[data-amount="now"]')).toHaveText(/S\/\s180\.00/);
  await expect(page.locator('[data-amount="remaining"]')).toBeHidden();
  await page.getByLabel("Full name").fill("Ana Torres");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Phone", { exact: true }).fill("987 654 321");
  await page.getByRole("checkbox", { name: /I accept/ }).check();
  await payButton(page, "180.00").click();
  await expectConfirmed(page, "/en");
  const reference = await page.locator("[data-confirmation-reference]").innerText();
  expect(reference).toBeTruthy();
  await expect(page.locator("[data-access-view]")).toBeVisible();
  const savedLink = new URL((await page.locator("[data-access-view]").getAttribute("href"))!);
  await expect(page.getByRole("button", { name: "Print confirmation" })).toBeEnabled();

  let message: { text: string; subject: string; to: string[] } | undefined;
  await expect
    .poll(async () => {
      expect((await request.get(`${LOCAL_API_URL}/cdn-cgi/local/scheduled`)).status()).toBe(200);
      const sent = await request.get(
        `${FAKE_PAYMENT_SERVICES_URL}/__resend/emails?recipient=${encodeURIComponent(email)}`,
      );
      expect(sent.status()).toBe(200);
      const messages = (await sent.json()) as { text: string; subject: string; to: string[] }[];
      message = messages[0];
      return messages.length;
    })
    .toBe(1);
  expect(message!.to).toEqual([email]);
  expect(message!.subject).toContain("Reservation confirmation");
  expect(message!.text).toContain(reference!);
  expect(message!.text).toContain("Total: PEN 180.00");
  expect(message!.text).toContain("Paid: PEN 180.00");
  const mailed = new URL(message!.text.match(/https:\/\/www\.hotelmanantialchurin\.com\/\S+/)![0]);
  expect(mailed.pathname).toBe(savedLink.pathname);
  expect(mailed.hash === savedLink.hash).toBe(true);
  const fresh = await browser.newContext();
  try {
    const summary = await fresh.newPage();
    await summary.goto(`${WEBSITE_URL}${mailed.pathname}${mailed.hash}`);
    await expect(summary.getByRole("heading", { name: "Reservation summary" })).toBeVisible();
    await expect(summary.getByText(reference!)).toBeVisible();
    await expect(summary.locator("[data-summary]")).toContainText(/S\/\s180\.00/);
    await expect(summary.locator("[data-summary]")).not.toContainText(email);
    await expect(() =>
      executeSql(
        localDatabase(localState),
        `UPDATE reservation_access SET expires_on = '${daysFromToday(-1)}' WHERE reservation_id = (SELECT id FROM reservations WHERE code = '${reference!}');`,
      ),
    ).toPass();
    await summary.reload();
    await expect(
      summary.getByRole("heading", { name: "The hotel can help with this reservation" }),
    ).toBeVisible();
    await expect(summary.locator("[data-summary]")).toBeHidden();
    await expect(summary.getByText(reference!)).toHaveCount(0);
  } finally {
    await fresh.close();
  }
});

test("a two-room Flexible stay is chosen room by room and paid once as one reservation", async ({
  page,
  request,
}) => {
  const stay = new URLSearchParams({
    checkIn: daysFromToday(260),
    checkOut: daysFromToday(262),
    adults: "2,1",
    children: "0,1",
  });
  await page.goto(`/habitaciones/?${stay.toString()}`);
  await expect(page.locator("#stay-check-in")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Habitación 1 de 2", level: 2 })).toBeVisible();
  await page
    .getByRole("article", { name: "Suite Matrimonial" })
    .getByRole("button", { name: "Elegir esta habitación" })
    .click();
  await expect(page.getByRole("heading", { name: "Habitación 2 de 2", level: 2 })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Flexible/ })).toHaveCount(0);
  await page
    .getByRole("article", { name: "Doble Premium" })
    .getByRole("button", { name: "Ver tarifas" })
    .click();
  await page.getByRole("radio", { name: /Flexible/ }).check();
  const summary = page.getByRole("complementary", { name: "Su estadía" });
  await expect(summary).toContainText("Suite Matrimonial");
  await expect(summary).toContainText("Doble Premium");
  await expect(summary).toContainText("1 adulto, 1 niño");
  await page
    .getByRole("link", { name: "Continuar con Suite Matrimonial y Doble Premium, tarifa Flexible" })
    .click();

  const review = page.getByRole("complementary", { name: "Su estadía" });
  await expect(review.locator('[data-stay="room"]')).toHaveText([
    "Suite Matrimonial",
    "Doble Premium",
  ]);
  await fillContact(page, payerEmail());
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
  const checkout = await serverCheckout(page, request);
  await payButton(page).click();
  await expectConfirmed(page);

  const reference = await page.locator("[data-confirmation-reference]").innerText();
  expect(await serverPayment(page, request)).toMatchObject({ state: "confirmed" });
  expect(checkout.quote.requiredInitialPaymentCents).toBeLessThan(checkout.quote.totalCents);
  await expect(page.locator("[data-confirmation] [data-stay='room']")).toHaveText([
    "Suite Matrimonial",
    "Doble Premium",
  ]);
  expect(reference).toMatch(/^[A-Z0-9]{6}$/);
});

function expireQuote(quoteId: string, checkIn?: string) {
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) throw new Error("unexpected quote id");
  if (checkIn && !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) throw new Error("unexpected check-in");
  const cheaper = checkIn
    ? `DELETE FROM room_type_rates WHERE room_type_id = '935c7f23-8acc-4c78-b456-9bc588cccc2d' AND date = '${checkIn}';
       INSERT INTO room_type_rates (id, room_type_id, date, price_cents)
         VALUES ('refresh-${quoteId}', '935c7f23-8acc-4c78-b456-9bc588cccc2d', '${checkIn}', 8000);`
    : "";
  executeSql(
    localDatabase(localState),
    `${cheaper}UPDATE quotes SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = '${quoteId}';`,
  );
}

test("paying the accepted Flexible quote confirms it with the paid amount and the balance", async ({
  page,
}) => {
  await fillCheckout(page, "flexible", payerEmail());

  await payButton(page, "100.00").click();

  await expectConfirmed(page);
  await expect(confirmation(page)).toContainText(/Referencia\s*[A-Z0-9]{6}/);
  await expect(confirmation(page)).toContainText(/Pagado\s*S\/\s100\.00/);
  await expect(confirmation(page)).toContainText(/Saldo pendiente\s*S\/\s100\.00/);
  const print = page.getByRole("button", { name: "Imprimir confirmación" });
  await expect(print).toBeEnabled();
  const title = await page.title();
  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printedTitle = document.title;
    };
  });
  await print.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-printed-title",
    /Confirmación de reserva/,
  );
  await expect(page).toHaveTitle(title);
  await page.emulateMedia({ media: "print" });
  const printed = page.locator("[data-print-confirmation]");
  await expect(printed).toBeVisible();
  await expect(printed).toContainText(/Pagado\s*S\/\s100\.00/);
  await expect(printed).toContainText(/Saldo pendiente\s*S\/\s100\.00/);
  await expect(page.locator("[data-access-view]")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  expect((await recordedCulqi(page)).configs).toMatchObject([
    {
      settings: { amount: 10000, currency: "PEN" },
      options: {
        paymentMethods: { tarjeta: true, yape: true },
        paymentMethodsSort: ["yape", "tarjeta"],
      },
    },
  ]);

  await page.reload();
  await expectConfirmed(page);
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
});

test("confirmation survives unavailable access, reload and manual retry without another charge", async ({
  page,
}) => {
  let reads = 0;
  let charges = 0;
  let available = false;
  let release: (() => void) | undefined;
  page.on("request", (request) => {
    if (request.url().endsWith("/public/checkout/payments") && request.method() === "POST")
      charges++;
  });
  await page.route(`${LOCAL_API_URL}/public/checkout/access`, async (route) => {
    reads++;
    if (!available) return route.fulfill({ status: 503, body: "{}" });
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.continue();
  });
  await fillCheckout(page, "flexible", payerEmail());
  await payButton(page, "100.00").click();
  await expectConfirmed(page);
  await expect(page.locator("[data-outcome-title]")).toBeFocused();
  const reference = await page.locator("[data-confirmation-reference]").innerText();
  expect(reference).toBeTruthy();
  await expect(confirmation(page)).toContainText(/Pagado\s*S\/\s100\.00/);
  await expect(confirmation(page)).toContainText(/Saldo pendiente\s*S\/\s100\.00/);
  await expect(page.locator("[data-stay=room]")).toHaveText("Suite Matrimonial");
  await expect(page.locator("[data-reservation-call]")).toBeVisible();
  await expect(page.locator("[data-reservation-help]")).toBeVisible();
  const retry = page.locator("[data-access-retry]");
  await expect(retry).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir confirmación" })).toBeEnabled();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-print-confirmation]")).toContainText(reference!);
  await expect(page.locator("[data-print-confirmation]")).toContainText(/Pagado\s*S\/\s100\.00/);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(retry).toBeVisible();
  expect(reads).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("hm.reservation.contact"))).toBeNull();
  await page.reload();
  await expectConfirmed(page);
  await expect(confirmation(page)).toContainText(reference!);
  await expect(retry).toBeVisible();
  expect(reads).toBe(2);
  available = true;
  await retry.click();
  await expect(page.locator("[data-access-status]")).toContainText("Cargando");
  await expect(retry).toHaveCount(0);
  const loading = page.locator("[data-access-loading]");
  await expect(loading).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => release !== undefined).toBe(true);
  release!();
  await expect(page.locator("[data-access-view]")).toBeFocused();
  await expect(page).toHaveURL(/\/reservar\/revisar\/\?/);
  expect(reads).toBe(3);
  expect(charges).toBe(1);
});

test("a declined card lets the guest pay with another card without re-entering details", async ({
  page,
}) => {
  await fillCheckout(page, "flexible", payerEmail());
  await page.evaluate(() => {
    window.culqiCards = ["tkn_test_decline"];
  });

  await payButton(page, "100.00").click();

  await expect(page.getByRole("heading", { name: "Su tarjeta fue rechazada" })).toBeFocused();
  await expect(page.getByLabel("Nombre completo")).toHaveValue("Ana Torres");
  await page.getByRole("button", { name: "Pagar con otra tarjeta" }).click();
  await payButton(page, "100.00").click();
  await expectConfirmed(page);
});

test("an uncertain charge stays processing across reload and language change without paying again", async ({
  page,
  request,
}) => {
  await fillCheckout(page, "flexible", payerEmail());
  await nextCulqiCharge(request, "timeout");

  await payButton(page, "100.00").click();

  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeFocused();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
  await expect(page.locator("[data-contact-form]")).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeVisible();
  await page.goto(kingReview("flexible", "/en"));
  await expect(page.getByRole("heading", { name: "Confirming your payment" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pay/ })).toHaveCount(0);
  expect(await serverPayment(page, request)).toMatchObject({ state: "processing" });
});

test("paying an expired unchanged quote refreshes it and charges once without asking again", async ({
  page,
  request,
}) => {
  await acceptTerms(page, payerEmail());
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

  await expectConfirmed(page);
  await expect(page.getByText("acéptelas de nuevo")).toHaveCount(0);
  const after = await serverCheckout(page, request);
  expect(after.quote.id).not.toBe(before.quote.id);
  expect(after.acceptance?.quoteId).toBe(after.quote.id);
  expect(after.quote.requiredInitialPaymentCents).toBe(10000);
  expect(await serverPayment(page, request)).toMatchObject({ state: "confirmed" });
  expect(refreshes).toBe(1);
  expect((await recordedCulqi(page)).configs).toHaveLength(1);
});

test("a cheaper refreshed quote is shown for a new acceptance and is not charged until then", async ({
  page,
  request,
}) => {
  const stay = { checkIn: daysFromToday(200), checkOut: daysFromToday(202) };
  await page.goto(
    `/reservar/revisar/?${new URLSearchParams({ ...stay, adults: "2", children: "0", types: "king", plan: "flexible" }).toString()}`,
  );
  await page.getByLabel("Nombre completo").fill("Ana Torres");
  await page.getByLabel("Correo electrónico").fill(payerEmail());
  await page.getByLabel("Teléfono").fill("987 654 321");
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
  await closeCardFormWithoutPaying(page, payButton(page, "100.00"));
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
  await payButton(page, "80.00").click();
  await expectConfirmed(page);
  await expect(confirmation(page)).toContainText(/Pagado\s*S\/\s80\.00/);
});

test("a lost payment response says the payment was sent and never invites paying again", async ({
  page,
}) => {
  await fillCheckout(page, "flexible", payerEmail());
  let paymentsSent = 0;
  await page.route(`${LOCAL_API_URL}/public/checkout/payments`, (route) => {
    paymentsSent += 1;
    return route.abort();
  });

  await payButton(page, "100.00").click();

  const sent = page.getByRole("heading", { name: "Pago enviado, consultando su estado" });
  await expect(sent).toBeFocused();
  expect(paymentsSent).toBe(1);
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
  await fillCheckout(page, "flexible", payerEmail());
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

  await expectConfirmed(page);
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
  expect((await recordedCulqi(page)).authentications).toEqual([sourceId]);
});

test("a bank refusing authentication declines the payment and the guest pays with another card", async ({
  page,
  request,
}) => {
  const failures: unknown[] = [];
  page.on("request", (req) => {
    if (
      req.method() === "POST" &&
      req.url().endsWith("/public/checkout/payment/authentication/failure")
    )
      failures.push(req.postDataJSON());
  });
  const sourceId = `tkn_test_3ds_${crypto.randomUUID()}`;
  await fillCheckout(page, "flexible", payerEmail());
  await page.evaluate((sourceId) => {
    window.culqiCards = [sourceId];
    window.culqi3DS = {
      devices: [],
      authentications: [],
      parameters: null,
      error: "Ha fallado la autenticación. Intente otro método de pago u otra tarjeta",
    };
  }, sourceId);

  await payButton(page, "100.00").click();

  await expect(page.getByRole("heading", { name: "Su tarjeta fue rechazada" })).toBeFocused();
  await expect(outcome(page)).toContainText("No se cobró nada");
  await expect(page.getByRole("button", { name: "Abrir la verificación del banco" })).toHaveCount(
    0,
  );
  expect(failures).toEqual([{ attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/i) }]);
  expect(await serverPayment(page, request)).toMatchObject({ state: "declined" });
  await expect(page.getByLabel("Nombre completo")).toBeHidden();
  await expect(page.locator("[data-outcome-contact]")).toContainText("Ana Torres");
  expect(
    await page.evaluate(() => sessionStorage.getItem("hm.reservation.card-sources") ?? ""),
  ).not.toContain(sourceId);

  await page.getByRole("button", { name: "Pagar con otra tarjeta" }).click();
  await expect(page.getByLabel("Nombre completo")).toHaveValue("Ana Torres");
  await payButton(page, "100.00").click();

  await expectConfirmed(page);
  expect(await page.evaluate(() => window.culqi3DS?.authentications)).toEqual([sourceId]);
});

test("a confirmed reservation opens and prints without putting its token in support links", async ({
  page,
  browser,
}) => {
  await fillCheckout(page, "flexible", payerEmail());
  await payButton(page, "100.00").click();
  await expectConfirmed(page);
  const reference = await page.locator("[data-confirmation-reference]").innerText();
  expect(reference).toBeTruthy();
  await expect(page.locator("[data-access-view]")).toBeVisible();
  const savedLink = new URL((await page.locator("[data-access-view]").getAttribute("href"))!);
  expect(savedLink.pathname).toBe("/reservar/resumen/");
  expect(savedLink.search).toBe("");
  expect(savedLink.hash).toMatch(/^#[\w-]{43}$/);
  const token = savedLink.hash.slice(1);
  expect(savedLink.href.replace(savedLink.hash, "")).not.toContain(token);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-print-confirmation]")).toContainText(reference!);
  await expect(page.locator("[data-print-confirmation]")).not.toContainText(token);
  const printLinks = await page
    .locator("[data-print-confirmation] a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  for (const href of printLinks) expect(href).not.toContain(token);
  await page.emulateMedia({ media: "screen" });
  await page.locator("[data-access-view]").click();
  await expect(page).toHaveURL(savedLink.href);
  await expect(page.getByRole("heading", { name: "Resumen de la reserva" })).toBeVisible();

  const fresh = await browser.newContext();
  const summary = await fresh.newPage();
  await summary.goto(savedLink.href);
  await expect(summary.getByRole("heading", { name: "Resumen de la reserva" })).toBeVisible();
  await expect(summary.getByText(reference!)).toBeVisible();
  await expect(summary.getByText(/Pagado\s*S\/\s100\.00/)).toBeVisible();
  const hrefs = await summary
    .locator("[data-summary-whatsapp], [data-summary-email]")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).not.toContain(token);
    expect(href).not.toContain(reference!);
  }
  expect(summary.url()).toContain(savedLink.hash);

  await summary.locator("#lang-select").selectOption({ label: "English" });
  await expect(summary.getByRole("heading", { name: "Reservation summary" })).toBeVisible();
  await expect(summary.getByRole("heading", { name: "King room" })).toBeVisible();
  await expect(summary.getByText(reference!)).toBeVisible();
  expect(summary.url()).toContain(`/en/reservar/resumen/${savedLink.hash}`);
  await summary.goBack();
  await expect(summary.getByRole("heading", { name: "Resumen de la reserva" })).toBeVisible();
  await expect(summary.getByText(reference!)).toBeVisible();

  await summary.keyboard.press("Tab");
  await expect(summary.getByRole("link", { name: "Saltar al contenido principal" })).toBeFocused();
  await summary.keyboard.press("Enter");
  expect(summary.url()).toContain(savedLink.hash);
  expect(summary.url()).not.toContain("main-content");
  expect(new URL(summary.url()).search).toBe("");
  await expect(summary.getByText(reference!)).toBeVisible();
  await expect(
    summary.getByRole("heading", { name: "El hotel puede ayudarle con esta reserva" }),
  ).toHaveCount(0);
  await summary.evaluate(() => {
    location.hash = "not-a-token";
  });
  await expect(
    summary.getByRole("heading", { name: "El hotel puede ayudarle con esta reserva" }),
  ).toBeVisible();
  await expect(summary.getByText(reference!)).toHaveCount(0);
  await fresh.close();
});

test("an invalid reservation link shows hotel assistance and no reservation details", async ({
  page,
}) => {
  await page.goto(`/reservar/resumen/#${"a".repeat(43)}`);
  await expect(
    page.getByRole("heading", { name: "El hotel puede ayudarle con esta reserva" }),
  ).toBeVisible();
  await expect(page.getByText("no se muestran datos de la reserva")).toBeVisible();
  await expect(page.locator("[data-assistance]").getByText(/992\s*755\s*015/)).toBeVisible();
  await expect(page.locator("[data-summary]")).toBeHidden();
  await expect(page.getByText(/Referencia\s*[A-Z0-9]{6}/)).toHaveCount(0);
});
