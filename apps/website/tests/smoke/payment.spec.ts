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
  closeCardFormWithoutPaying,
  nextCulqiCharge,
  recordedCulqi,
  stubPaymentScripts,
  useOwnSourceIp,
} from "../support/payment";
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

async function fillCheckout(page: Page, plan: string, email: string) {
  await page.goto(reviewPath(plan));
  await page.getByLabel("Nombre completo").fill("Ana Torres");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Teléfono").fill("987 654 321");
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
}

const payButton = (page: Page, amount: string) =>
  page.getByRole("button", { name: new RegExp(`^Pagar S/\\s${amount} con tarjeta$`) });

async function acceptTerms(page: Page, email: string) {
  await fillCheckout(page, "flexible", email);
  await closeCardFormWithoutPaying(page, payButton(page, "100.00"));
}

const outcome = (page: Page) => page.locator("[data-outcome]");

const confirmation = (page: Page) => page.locator("[data-summary]");

async function expectConfirmed(page: Page, lang = "") {
  await expect(page).toHaveURL(new RegExp(`${lang}/reservar/resumen/#[\\w-]{43}$`));
  await expect(
    page.getByRole("heading", {
      name: lang ? "Your reservation is confirmed" : "Su reserva está confirmada",
    }),
  ).toBeFocused();
}

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

for (const [language, plan, offset] of [
  ["es", "flexible", 240],
  ["en", "non_refundable", 250],
] as const) {
  test(`the complete ${language} ${plan} journey sends its saved confirmation and opens the same private summary`, async ({
    page,
    request,
    browser,
  }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const en = language === "en";
    const base = en ? "/en" : "";
    const email = payerEmail();
    const total = en ? "180.00" : "200.00";
    const paidAmount = en ? "180.00" : "100.00";
    const stay = new URLSearchParams({
      checkIn: daysFromToday(offset),
      checkOut: daysFromToday(offset + 2),
      adults: "2",
      children: "0",
    });
    await page.goto(`${base}/habitaciones/?${stay.toString()}`);
    await selectRoomRate(
      page,
      en ? "King room" : "Suite Matrimonial",
      en ? "Non-refundable" : "Flexible",
    );
    await page
      .getByRole("link", {
        name: en
          ? "Continue with King room, Non-refundable rate"
          : "Continuar con Suite Matrimonial, tarifa Flexible",
      })
      .click();
    await expect(page.locator('[data-amount="total"]')).toHaveText(new RegExp(`S/\\s${total}`));
    await expect(page.locator('[data-amount="now"]')).toHaveText(new RegExp(`S/\\s${paidAmount}`));
    await expect(page.locator('[data-amount="remaining"]')).toBeVisible({ visible: !en });
    if (!en)
      await expect(page.locator("[data-cancellation] time")).toHaveAttribute(
        "datetime",
        daysFromToday(offset - 2),
      );
    await page.getByLabel(en ? "Full name" : "Nombre completo").fill("Ana Torres");
    await page.getByLabel(en ? "Email" : "Correo electrónico", { exact: true }).fill(email);
    await page.getByLabel(en ? "Phone" : "Teléfono", { exact: true }).fill("987 654 321");
    await page.getByRole("checkbox", { name: /I accept|Acepto las condiciones/ }).check();
    await page
      .getByRole("button", {
        name: new RegExp(
          `^${en ? "Pay" : "Pagar"} S/\\s${paidAmount} ${en ? "by card" : "con tarjeta"}$`,
        ),
      })
      .click();
    await expectConfirmed(page, base);
    const reference = (await confirmation(page).innerText()).match(
      /(?:Reference|Referencia)\s*([A-Z0-9]{6})/,
    )?.[1];
    expect(reference).toBeTruthy();
    await page.getByRole("button", { name: en ? "Copy link" : "Copiar enlace" }).click();
    await expect(page.getByText(en ? "Link copied" : "Enlace copiado")).toBeVisible();
    const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(copied.href).toBe(page.url());

    const login = await request.post(`${LOCAL_API_URL}/login`, {
      headers: { origin: "https://app.hotelmanantialchurin.com" },
      data: { username: "kevin", password: "owner horse battery staple" },
    });
    expect(login.status()).toBe(200);
    const cookie = login
      .headersArray()
      .filter(({ name }) => name.toLowerCase() === "set-cookie")
      .map(({ value }) => value.split(";")[0])
      .join("; ");
    const headers = { cookie, origin: "https://app.hotelmanantialchurin.com" };
    expect(
      (
        await request.put(`${LOCAL_API_URL}/controls/email-submission`, {
          headers,
          data: { admitted: true },
        })
      ).status(),
    ).toBe(200);
    let message: { text: string; subject: string; to: string[] } | undefined;
    try {
      await expect
        .poll(async () => {
          expect((await request.get(`${LOCAL_API_URL}/cdn-cgi/local/scheduled`)).status()).toBe(
            200,
          );
          const sent = await request.get(
            `${FAKE_PAYMENT_SERVICES_URL}/__resend/emails?recipient=${encodeURIComponent(email)}`,
          );
          expect(sent.status()).toBe(200);
          const messages = (await sent.json()) as { text: string; subject: string; to: string[] }[];
          message = messages[0];
          return messages.length;
        })
        .toBe(1);
    } finally {
      expect(
        (
          await request.put(`${LOCAL_API_URL}/controls/email-submission`, {
            headers,
            data: { admitted: false },
          })
        ).status(),
      ).toBe(200);
    }
    expect(message!.to).toEqual([email]);
    expect(message!.subject).toContain(en ? "Reservation confirmation" : "Confirmación de reserva");
    expect(message!.text).toContain(reference!);
    expect(message!.text).toContain(`Total: PEN ${total}`);
    expect(message!.text).toContain(`${en ? "Paid" : "Pagado"}: PEN ${paidAmount}`);
    const mailed = new URL(
      message!.text.match(/https:\/\/www\.hotelmanantialchurin\.com\/\S+/)![0],
    );
    expect(mailed.pathname).toBe(copied.pathname);
    expect(mailed.hash === copied.hash).toBe(true);
    const fresh = await browser.newContext();
    try {
      const summary = await fresh.newPage();
      await summary.goto(`${WEBSITE_URL}${mailed.pathname}${mailed.hash}`);
      await expect(
        summary.getByRole("heading", {
          name: en ? "Reservation summary" : "Resumen de la reserva",
        }),
      ).toBeVisible();
      await expect(summary.getByText(reference!)).toBeVisible();
      await expect(summary.locator("[data-summary]")).toContainText(
        new RegExp(`S/\\s${paidAmount}`),
      );
      await expect(summary.locator("[data-summary]")).not.toContainText(email);
      if (en) {
        executeSql(
          localDatabase(localState),
          `UPDATE reservation_access SET expires_on = '${daysFromToday(-1)}' WHERE reservation_id = (SELECT id FROM reservations WHERE code = '${reference!}');`,
        );
        await summary.reload();
        await expect(
          summary.getByRole("heading", { name: "The hotel can help with this reservation" }),
        ).toBeVisible();
        await expect(summary.locator("[data-summary]")).toBeHidden();
        await expect(summary.getByText(reference!)).toHaveCount(0);
      }
    } finally {
      await fresh.close();
    }
  });
}

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
  await page.goto(reviewPath("flexible", "/en"));
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

test("a payment that is still being verified after two minutes explains that and does not offer to pay again", async ({
  page,
  request,
}) => {
  const email = payerEmail();
  await fillCheckout(page, "flexible", email);
  await nextCulqiCharge(request, "timeout");
  let payments = 0;
  await page.route(`${LOCAL_API_URL}/public/checkout/payments`, async (route) => {
    payments += 1;
    await route.fallback();
  });
  await payButton(page, "100.00").click();
  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Consultar estado" })).toHaveCount(0);
  const pending = await serverPayment(page, request);
  expect(pending).toMatchObject({ state: "processing", delayed: false });

  await page.route(`${LOCAL_API_URL}/public/checkout/payment`, (route) => {
    if (!route.request().url().endsWith("/public/checkout/payment")) return route.fallback();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ payment: { ...pending, delayed: true } }),
    });
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Confirmando su pago" })).toBeVisible();
  await expect(outcome(page)).toContainText(
    "La verificación está tardando más de lo habitual. Continúa aunque cierre esta página, así que no pague de nuevo. Consulte el estado aquí más tarde o escríbanos por WhatsApp o por correo si necesita ayuda.",
  );
  await expect(page.getByRole("button", { name: "Consultar estado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar enlace" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
  expect(payments).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("hm.reservation.contact"))).toContain(
    email,
  );
  await page.unroute(`${LOCAL_API_URL}/public/checkout/payment`);
  expect(await serverPayment(page, request)).toMatchObject({
    attemptId: pending?.attemptId,
    state: "processing",
  });
});

test("a payment pause keeps the draft and charges nothing", async ({ page, request }) => {
  await fillCheckout(page, "flexible", payerEmail());
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

test("money received for dates the same contact already holds is shown as unconfirmed, not reserved", async ({
  page,
}) => {
  const email = payerEmail();
  await fillCheckout(page, "flexible", email);
  await payButton(page, "100.00").click();
  await expectConfirmed(page);

  await fillCheckout(page, "non_refundable", email);
  await payButton(page, "180.00").click();

  await expect(
    page.getByRole("heading", { name: "Pago recibido, pero su reserva no se pudo confirmar" }),
  ).toBeVisible();
  await expect(outcome(page)).toContainText(/Referencia de atención\s*[A-Z0-9]{6}/);
  await expect(outcome(page)).toContainText(/Recibido\s*S\/\s180\.00/);
  await expect(outcome(page)).toContainText(/Por resolver\s*S\/\s180\.00/);
  await expect(outcome(page)).not.toContainText("confirmada");
  await expect(page.getByRole("button", { name: "Copiar enlace" })).toBeVisible();
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
  await fillCheckout(page, "flexible", payerEmail());
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
  await acceptTerms(page, payerEmail());
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
  await acceptTerms(page, payerEmail());
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
  await fillCheckout(page, "flexible", payerEmail());
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
  await fillCheckout(page, "flexible", payerEmail());
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
  await fillCheckout(page, "flexible", payerEmail());
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

test("a saved reservation link can be copied and opened without putting the token in support links", async ({
  page,
  browser,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await fillCheckout(page, "flexible", payerEmail());
  await payButton(page, "100.00").click();
  await expectConfirmed(page);
  const reference = (await confirmation(page).innerText()).match(/Referencia\s*([A-Z0-9]{6})/)?.[1];
  expect(reference).toBeTruthy();
  await expect(
    page.getByText("Quien tenga este enlace puede ver este resumen limitado"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copiar enlace" }).click();
  await expect(page.getByText("Enlace copiado")).toBeVisible();

  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.pathname).toBe("/reservar/resumen/");
  expect(copied.search).toBe("");
  expect(copied.hash).toMatch(/^#[\w-]{43}$/);
  const token = copied.hash.slice(1);
  expect(copied.href.replace(copied.hash, "")).not.toContain(token);
  expect(page.url()).toBe(copied.href);

  const fresh = await browser.newContext();
  const summary = await fresh.newPage();
  await summary.goto(copied.href);
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
  expect(summary.url()).toContain(copied.hash);

  await summary.locator("#lang-select").selectOption({ label: "English" });
  await expect(summary.getByRole("heading", { name: "Reservation summary" })).toBeVisible();
  await expect(summary.getByRole("heading", { name: "King room" })).toBeVisible();
  await expect(summary.getByText(reference!)).toBeVisible();
  expect(summary.url()).toContain(`/en/reservar/resumen/${copied.hash}`);
  await summary.goBack();
  await expect(summary.getByRole("heading", { name: "Resumen de la reserva" })).toBeVisible();
  await expect(summary.getByText(reference!)).toBeVisible();

  await summary.keyboard.press("Tab");
  await expect(summary.getByRole("link", { name: "Saltar al contenido principal" })).toBeFocused();
  await summary.keyboard.press("Enter");
  expect(summary.url()).toContain(copied.hash);
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
