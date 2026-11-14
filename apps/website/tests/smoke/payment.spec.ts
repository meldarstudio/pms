import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { executeSql, localDatabase, queryRows } from "../../../backend/scripts/d1.mjs";
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
  holdSecurityCheck,
  nextCulqiCharge,
  passSecurityCheck,
  recordedCulqi,
  stubPaymentScripts,
  useOwnSourceIp,
} from "../support/payment";
import { reservationSummary, summaryToken } from "../support/summary";
import { selectRoomRate } from "../support/room-rate";

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
  reviewPath(openStay(), { room: "king", plan }, lang);

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

test("the chosen international phone and edited reservation note are accepted and saved", async ({
  page,
}) => {
  const email = payerEmail();
  await fillCheckout(page, "flexible", email);
  await page.getByRole("combobox", { name: /^País y código:/ }).click();
  await page.getByRole("combobox", { name: "Buscar país" }).fill("Reino Unido");
  await page.getByRole("option", { name: "Reino Unido +44", exact: true }).click();
  await page.locator("#phone").fill("02079460018");
  await expect(page.locator("#phone")).toHaveValue("020 7946 0018");
  await page.locator('[data-reservation-notes] [data-slot="accordion-trigger"]').click();
  await page.locator("#notes").fill("  Arriving at 9 pm  ");
  await closeCardFormWithoutPaying(page, payButton(page, "100.00"));
  await page.locator("#notes").fill("  Arriving at 10 pm, quiet room please  ");
  await payButton(page, "100.00").click();
  await expectConfirmed(page);
  expect(
    queryRows(
      localDatabase(localState),
      `SELECT a.phone, a.notes FROM checkout_acceptances a WHERE a.email = '${email}' ORDER BY a.rowid`,
    ),
  ).toEqual([
    { phone: "+442079460018", notes: "Arriving at 9 pm" },
    { phone: "+442079460018", notes: "Arriving at 10 pm, quiet room please" },
  ]);
  expect(
    queryRows(
      localDatabase(localState),
      `SELECT r.notes, g.notes AS guest_notes, g.phone FROM reservations r JOIN guests g ON g.id = r.guest_id WHERE g.email = '${email}'`,
    ),
  ).toEqual([
    { phone: "+442079460018", notes: "Arriving at 10 pm, quiet room please", guest_notes: null },
  ]);
});

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
  await selectRoomRate(page, "King room", "Non-refundable");
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
      options: { paymentMethods: { tarjeta: true, yape: false } },
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

test("paying before the security check finishes shows progress, waits for it, and then pays", async ({
  page,
}) => {
  await holdSecurityCheck(page);
  await fillCheckout(page, "flexible", payerEmail());
  await payButton(page, "100.00").click();

  await expect(page.getByRole("button", { name: "Procesando…" })).toBeDisabled();
  await expect(page.locator("[data-form-error]")).toBeEmpty();

  await passSecurityCheck(page);
  await expectConfirmed(page);
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

test("a dropped status check resumes the same payment when the connection returns", async ({
  page,
  request,
}) => {
  await fillCheckout(page, "flexible", payerEmail());
  await nextCulqiCharge(request, "timeout");
  let payments = 0;
  await page.route(`${LOCAL_API_URL}/public/checkout/payments`, async (route) => {
    payments += 1;
    await route.fallback();
  });
  await payButton(page, "100.00").click();
  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeVisible();
  const pending = await serverPayment(page, request);

  let reads = 0;
  let failNext = true;
  await page.route(`${LOCAL_API_URL}/public/checkout/payment`, async (route) => {
    if (!route.request().url().endsWith("/public/checkout/payment")) return route.fallback();
    reads += 1;
    if (failNext) {
      failNext = false;
      return route.abort();
    }
    return route.fallback();
  });
  await page.waitForRequest(
    (req) => req.url().endsWith("/public/checkout/payment") && req.method() === "GET",
    { timeout: 8_000 },
  );
  const afterFailure = reads;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => reads).toBeGreaterThan(afterFailure);
  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeVisible();
  expect(payments).toBe(1);
  expect(await serverPayment(page, request)).toMatchObject({
    attemptId: pending?.attemptId,
    state: "processing",
  });
});

test("back to review shows the same payment and does not pay again", async ({ page, request }) => {
  await fillCheckout(page, "flexible", payerEmail());
  await nextCulqiCharge(request, "timeout");
  let payments = 0;
  await page.route(`${LOCAL_API_URL}/public/checkout/payments`, async (route) => {
    payments += 1;
    await route.fallback();
  });
  await payButton(page, "100.00").click();
  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeVisible();
  const pending = await serverPayment(page, request);

  await page.getByRole("link", { name: "Cambiar fechas o habitación" }).click();
  await expect(page).toHaveURL(/\/habitaciones\/\?/);
  await page.goBack();

  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeVisible();
  expect(payments).toBe(1);
  expect(await serverPayment(page, request)).toMatchObject({
    attemptId: pending?.attemptId,
    state: "processing",
  });
});

test("a real Turnstile refusal stays distinct from sold-out or an uncertain charge and preserves the accepted draft for retry", async ({
  page,
  request,
}) => {
  const email = payerEmail();
  await fillCheckout(page, "flexible", email);
  await page.route(`${LOCAL_API_URL}/public/checkout/payments`, async (route) => {
    await route.fallback({
      postData: JSON.stringify({
        ...route.request().postDataJSON(),
        turnstileToken: "invalid-test-challenge",
      }),
    });
  });

  await payButton(page, "100.00").click();

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "La verificación de seguridad no se superó y no se cobró nada" }),
  ).toBeVisible();
  await expect(page.getByLabel("Correo electrónico")).toHaveValue(email);
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeChecked();
  expect(await serverPayment(page, request)).toBeNull();
  await page.unroute(`${LOCAL_API_URL}/public/checkout/payments`);
  await payButton(page, "100.00").click();
  await expectConfirmed(page);
});

test("the same contact reserves a second room for dates they already hold", async ({ page }) => {
  const email = payerEmail();
  await fillCheckout(page, "flexible", email);
  await payButton(page, "100.00").click();
  await expectConfirmed(page);
  const first = await confirmation(page).textContent();

  await fillCheckout(page, "non_refundable", email);
  await payButton(page, "180.00").click();

  await expectConfirmed(page);
  await expect(confirmation(page)).toContainText(/Pagado\s*S\/\s180\.00/);
  expect(await confirmation(page).textContent()).not.toBe(first);
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
    `/reservar/revisar/?${new URLSearchParams({ ...stay, adults: "2", children: "0", room: "king", plan: "flexible" }).toString()}`,
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

test("accepting an expired quote charges the contact just submitted, not the one refresh kept", async ({
  page,
  request,
}) => {
  const original = payerEmail();
  const updated = payerEmail();
  await acceptTerms(page, original);
  expireQuote((await serverCheckout(page, request)).quote.id);

  await page.getByLabel("Nombre completo").fill("Eva Soto");
  await page.getByLabel("Correo electrónico").fill(updated);
  await payButton(page, "100.00").click();
  await expectConfirmed(page);

  const charged = queryRows(
    localDatabase(localState),
    `SELECT a.full_name, a.email FROM payment_attempts p JOIN checkout_acceptances a ON a.id = p.acceptance_id WHERE p.email = '${updated}'`,
  );
  expect(charged).toEqual([{ full_name: "Eva Soto", email: updated }]);
  expect(
    queryRows(
      localDatabase(localState),
      `SELECT email FROM payment_attempts WHERE email = '${original}'`,
    ),
  ).toEqual([]);
});

test("a lost payment response says the payment was sent and never invites paying again", async ({
  page,
}) => {
  await fillCheckout(page, "flexible", payerEmail());
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

test("expired bank verification explains the expiry and keeps another-card payment available", async ({
  page,
  request,
}) => {
  await fillCheckout(page, "flexible", payerEmail());
  await page.evaluate(() => {
    window.culqiCards = [`tkn_test_3ds_${crypto.randomUUID()}`];
    window.culqi3DS = {
      devices: [],
      authentications: [],
      parameters: null,
      error: null,
      closes: true,
    };
  });
  await payButton(page, "100.00").click();
  await expect(page.getByRole("button", { name: "Abrir la verificación del banco" })).toBeVisible();
  const payment = await serverPayment(page, request);
  executeSql(
    localDatabase(localState),
    `UPDATE payment_attempts SET called_at = '${new Date(Date.now() - 25 * 60 * 60_000).toISOString()}' WHERE id = '${payment!.attemptId}'`,
  );
  const scheduled = await request.get(`${LOCAL_API_URL}/cdn-cgi/local/scheduled`);
  expect(scheduled.ok()).toBe(true);
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await expect(
    page.getByRole("heading", { name: "La verificación del banco venció" }),
  ).toBeFocused();
  await expect(outcome(page)).toContainText("No se cobró nada");
  await expect(outcome(page)).toContainText("Monto del intento anterior");
  await expect(page.getByRole("button", { name: "Abrir la verificación del banco" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Nombre completo")).toBeHidden();
  await expect(page.locator("[data-outcome-contact]")).toContainText("Ana Torres");
  await page.getByRole("button", { name: "Pagar con otra tarjeta" }).click();
  await expect(page.getByLabel("Nombre completo")).toHaveValue("Ana Torres");
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeChecked();
  await payButton(page, "100.00").click();
  await expectConfirmed(page);
});

test("a closed bank window stays pending and can be opened again without paying again", async ({
  page,
  request,
}) => {
  const payments: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/public/checkout/payments"))
      payments.push(req.url());
  });
  const sourceId = `tkn_test_3ds_${crypto.randomUUID()}`;
  await fillCheckout(page, "flexible", payerEmail());
  await page.evaluate((sourceId) => {
    window.culqiCards = [sourceId];
    window.culqi3DS = {
      devices: [],
      authentications: [],
      parameters: null,
      error: null,
      closes: true,
    };
  }, sourceId);

  await payButton(page, "100.00").click();

  const bank = page.getByRole("button", { name: "Abrir la verificación del banco" });
  await expect(
    page.getByRole("heading", { name: "Su banco necesita verificar este pago" }),
  ).toBeVisible();
  await expect(outcome(page)).toContainText("No vuelva a pagar");
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

for (const failure of ["network", "server", "throttled", "unreadable", "incomplete"] as const) {
  test(`a ${failure} summary failure recovers manually without declaring the link invalid`, async ({
    page,
  }) => {
    let reads = 0;
    await page.route(`${LOCAL_API_URL}/public/reservation`, async (route) => {
      reads++;
      expect(route.request().headers().authorization).toBe(`Bearer ${summaryToken}`);
      expect(route.request().headers().referer).toBeUndefined();
      if (reads > 1) return route.fulfill({ json: reservationSummary() });
      if (failure === "network") return route.abort();
      if (failure === "unreadable")
        return route.fulfill({ body: "{", contentType: "application/json" });
      if (failure === "incomplete")
        return route.fulfill({
          json: {
            code: "PRIVATE",
            status: "confirmed",
            currency: "PEN",
            paidCents: 0,
            rooms: [null],
          },
        });
      return route.fulfill({ status: failure === "server" ? 503 : 429, json: {} });
    });
    await page.goto(`/en/reservar/resumen/#${summaryToken}`);
    await expect(
      page.getByRole("heading", { name: "The reservation summary could not be loaded" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "We could not load your reservation right now",
    );
    await expect(
      page.getByText("This link is invalid or has expired", { exact: false }),
    ).toHaveCount(0);
    await expect(page.locator("[data-assistance] a")).toHaveCount(3);
    for (const href of await page
      .locator("[data-assistance] a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")))) {
      expect(href).not.toContain(summaryToken);
    }
    expect(reads).toBe(1);
    const retry = page.getByRole("button", { name: "Try again" });
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Reservation summary", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("AB12CD")).toBeVisible();
    expect(reads).toBe(2);
  });
}

test("a summary refresh failure clears private details and recovers when the connection returns", async ({
  page,
}) => {
  let reads = 0;
  await page.route(`${LOCAL_API_URL}/public/reservation`, (route) => {
    reads++;
    return reads === 2
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: reservationSummary() });
  });
  await page.goto(`/reservar/resumen/#${summaryToken}`);
  await expect(page.getByText("AB12CD")).toBeVisible();
  expect(reads).toBe(1);
  await page.goto("/habitaciones/");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "No se pudo cargar el resumen de la reserva" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("No pudimos");
  await expect(page.getByText("AB12CD")).toHaveCount(0);
  await expect(page.getByText("Ana Torres")).toHaveCount(0);
  expect(reads).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("heading", { name: "Resumen de la reserva", exact: true }),
  ).toBeVisible();
  expect(reads).toBe(3);
});

test("a cached page restore clears details on failure and reports that refresh failed", async ({
  page,
}) => {
  let available = true;
  await page.route(`${LOCAL_API_URL}/public/reservation`, (route) =>
    available
      ? route.fulfill({ json: reservationSummary() })
      : route.fulfill({ status: 503, json: {} }),
  );
  await page.goto(`/en/reservar/resumen/#${summaryToken}`);
  await expect(page.getByText("AB12CD")).toBeVisible();
  available = false;
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await expect(page.getByRole("status")).toContainText(
    "We could not refresh your reservation summary",
  );
  await expect(page.getByText("AB12CD")).toHaveCount(0);
  await expect(page.getByText("Ana Torres")).toHaveCount(0);
});

test("token changes discard delayed private answers, including a return to the original token", async ({
  page,
}) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route(`${LOCAL_API_URL}/public/reservation`, async (route) => {
    reads++;
    if (reads === 1) {
      await delayed;
      await route.fulfill({ json: { ...reservationSummary(), code: "STALE" } });
    } else if (route.request().headers().authorization === `Bearer ${"b".repeat(43)}`) {
      await route.fulfill({ status: 401, json: {} });
    } else {
      await route.fulfill({ json: reservationSummary() });
    }
  });
  await page.goto(`/en/reservar/resumen/#${summaryToken}`);
  await expect.poll(() => reads).toBe(1);
  await page.evaluate(() => {
    location.hash = "b".repeat(43);
  });
  await expect(
    page.getByRole("heading", { name: "The hotel can help with this reservation" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeHidden();
  await page.evaluate((token) => {
    location.hash = token;
  }, summaryToken);
  await expect(page.getByText("AB12CD")).toBeVisible();
  const staleResponse = page.waitForResponse(
    async (response) =>
      response.url() === `${LOCAL_API_URL}/public/reservation` &&
      response.status() === 200 &&
      (await response.json()).code === "STALE",
  );
  release();
  await staleResponse;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByText("AB12CD")).toBeVisible();
  await expect(page.getByText("STALE")).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = "malformed";
  });
  await expect(
    page.getByRole("heading", { name: "The hotel can help with this reservation" }),
  ).toBeVisible();
  await expect(page.getByText("AB12CD")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  expect(reads).toBe(3);
});
