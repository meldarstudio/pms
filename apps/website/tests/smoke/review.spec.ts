import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { LOCAL_API_URL, daysFromToday, doubleSoldOutStay, openStay } from "../support/local-api";
import { closeCardFormWithoutPaying, stubPaymentScripts } from "../support/payment";
import { selectRoomRate } from "../support/room-rate";

const checkoutsRoute = `${LOCAL_API_URL}/public/checkouts`;
const acceptanceRoute = `${LOCAL_API_URL}/public/checkout/acceptances`;

let sourceIps = 0;

test.beforeEach(async ({ page }) => {
  await stubPaymentScripts(page);
  const address = `10.0.${test.info().workerIndex % 250}.${(sourceIps += 1) % 250}`;
  await page.route(`${LOCAL_API_URL}/public/**`, (route) =>
    route.fallback({ headers: { ...route.request().headers(), "cf-connecting-ip": address } }),
  );
});

function reviewPath(
  stay: { checkIn: string; checkOut: string },
  extra: Record<string, string>,
  lang = "",
) {
  const params = new URLSearchParams({ ...stay, adults: "2", children: "0", ...extra });
  return `${lang}/reservar/revisar/?${params.toString()}`;
}

async function storedToken(page: Page) {
  return page.evaluate(() => {
    const checkouts = JSON.parse(
      sessionStorage.getItem("hm.reservation.checkouts") ?? "{}",
    ) as Record<string, { token: string }>;
    return Object.values(checkouts).at(-1)!.token;
  });
}

async function serverCheckout(page: Page, request: APIRequestContext) {
  const response = await request.get(`${LOCAL_API_URL}/public/checkout`, {
    headers: { authorization: `Bearer ${await storedToken(page)}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    language: string;
    quote: { id: string };
    acceptance: { quoteId: string } | null;
  };
}

async function fillContact(page: Page) {
  await page.getByLabel("Nombre completo").fill("Ana Torres");
  await page.getByLabel("Correo electrónico").fill("ana@example.com");
  await page.getByLabel("Teléfono").fill("987 654 321");
}

const payButton = (page: Page) =>
  page.getByRole("button", { name: /^(Pagar|Pay) S\/\s[\d.]+ (con tarjeta|by card)$/ });

async function acceptTerms(page: Page) {
  await fillContact(page);
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
  await closeCardFormWithoutPaying(page, payButton(page));
}

function countAcceptances(page: Page) {
  const sent = { count: 0 };
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url() === acceptanceRoute) sent.count += 1;
  });
  return sent;
}

test("a chosen offer is reviewed with server amounts and its terms are accepted", async ({
  page,
  request,
}) => {
  const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
  await page.goto(`/habitaciones/?${params.toString()}`);
  await selectRoomRate(page, "Suite Matrimonial", "Flexible");
  await page
    .getByRole("link", { name: "Continuar con Suite Matrimonial, tarifa Flexible" })
    .click();

  await expect(page).toHaveURL(/\/reservar\/revisar\/\?/);
  expect([...new URL(page.url()).searchParams.keys()].toSorted()).toEqual(
    ["adults", "checkIn", "checkOut", "children", "plan", "room"].toSorted(),
  );
  const stayDetails = page.getByRole("complementary", { name: "Su estadía" });
  await expect(stayDetails).toContainText("Suite Matrimonial");
  await expect(stayDetails).toContainText("2 noches");
  await expect(stayDetails).toContainText("2 adultos");
  await expect(stayDetails).toContainText("Flexible");
  const payment = page.getByRole("region", { name: "Pago", exact: true });
  await expect(stayDetails.locator('[data-amount="total"]')).toHaveText(/S\/\s200\.00/);
  await expect(payment.locator('[data-amount="now"]')).toHaveText(/S\/\s100\.00/);
  await expect(payment.locator('[data-amount="remaining"]')).toHaveText(/S\/\s100\.00/);
  await expect(payment.locator("[data-cancellation] time")).toHaveAttribute(
    "datetime",
    daysFromToday(118),
  );

  const agree = page.getByRole("checkbox", { name: /Acepto las condiciones/ });
  await expect(agree).not.toBeChecked();
  await expect(page.getByLabel("Nombre completo")).toHaveAttribute("autocomplete", "name");
  await expect(page.getByLabel("Correo electrónico")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Correo electrónico")).toHaveAttribute("autocomplete", "email");
  await expect(page.getByLabel("Teléfono")).toHaveAttribute("type", "tel");
  await expect(page.getByLabel("Teléfono")).toHaveAttribute("autocomplete", "tel");

  await expect(payButton(page)).toHaveText(/^Pagar S\/\s100\.00 con tarjeta$/);
  await payButton(page).click();
  await expect(page.getByLabel("Nombre completo")).toBeFocused();
  await expect(page.getByText("Ingrese el nombre completo del contacto.")).toBeVisible();
  await expect(page.getByText("Marque la casilla para aceptar las condiciones.")).toBeVisible();

  await acceptTerms(page);
  const checkout = await serverCheckout(page, request);
  expect(checkout.acceptance?.quoteId).toBe(checkout.quote.id);
});

test("a language change keeps the draft and the accepted offer's quote", async ({
  page,
  request,
}) => {
  await page.goto(reviewPath(openStay(), { room: "double", plan: "non_refundable" }));
  await acceptTerms(page);
  const accepted = await serverCheckout(page, request);

  await page.locator("#lang-select").selectOption({ label: "English" });
  const acceptances = countAcceptances(page);

  await expect(page).toHaveURL(/\/en\/reservar\/revisar\/\?.*room=double&plan=non_refundable/);
  await expect(page.getByLabel("Full name")).toHaveValue("Ana Torres");
  await expect(page.getByLabel("Phone")).toHaveValue("987 654 321");
  await expect(page.getByRole("checkbox", { name: /I accept/ })).toBeChecked();
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s216\.00/);
  await closeCardFormWithoutPaying(page, payButton(page));
  expect(acceptances.count).toBe(0);
  expect((await serverCheckout(page, request)).quote.id).toBe(accepted.quote.id);
});

for (const lang of ["", "/en"]) {
  test(`the ${lang ? "English" : "Spanish"} mobile review keeps the charge and cancellation visible and opens terms without losing contact details`, async ({
    page,
  }) => {
    const en = lang === "/en";
    const stay = openStay();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(reviewPath(stay, { room: "king", plan: "flexible" }, lang));
    const summary = page.getByRole("complementary", { name: en ? "Your stay" : "Su estadía" });
    const payment = page.getByRole("region", { name: en ? "Payment" : "Pago", exact: true });
    const toggle = page.getByRole("button", {
      name: en ? /^(View|Hide) reservation details$/ : /^(Ver|Ocultar) detalle de la reserva$/,
    });
    await expect(summary.getByRole("img")).toBeVisible();
    await expect(summary.locator('[data-amount="total"]')).toHaveText(/S\/\s200\.00/);
    await expect(payment.locator('[data-amount="now"]')).toHaveText(/S\/\s100\.00/);
    await expect(payment.locator('[data-amount="remaining"]')).toHaveText(/S\/\s100\.00/);
    await expect(payment.locator("[data-cancellation] time")).toHaveAttribute(
      "datetime",
      daysFromToday(118),
    );
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(summary.locator('[data-stay="checkIn"]')).toBeHidden();

    const fullName = page.getByLabel(en ? "Full name" : "Nombre completo");
    await fullName.fill("Ana María Torres");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(summary.locator('[data-stay="checkIn"]')).toHaveAttribute(
      "datetime",
      stay.checkIn,
    );
    await expect(summary.locator('[data-stay="checkOut"]')).toHaveAttribute(
      "datetime",
      stay.checkOut,
    );
    await toggle.click();

    const termsLink = page.getByRole("link", {
      name: en ? "reservation terms" : "condiciones de la reserva",
      exact: true,
    });
    await termsLink.click();
    const terms = page.getByRole("dialog", {
      name: en ? "Reservation terms" : "Condiciones de la reserva",
    });
    await expect(
      terms.getByText(en ? "Price per night" : "Precio por noche", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(terms).toBeHidden();
    await expect(termsLink).toBeFocused();
    await expect(
      page.getByRole("checkbox", { name: en ? /I accept/ : /Acepto/ }),
    ).not.toBeChecked();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(fullName).toHaveValue("Ana María Torres");

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(summary.locator('[data-stay="checkIn"]')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(fullName).toHaveValue("Ana María Torres");
  });
}

test("switching plan and back restores the earlier checkout and acceptance", async ({
  page,
  request,
}) => {
  await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
  await acceptTerms(page);
  const flexible = await serverCheckout(page, request);

  await page.getByRole("link", { name: "Volver a tarifas" }).click();
  await expect(page.getByRole("radio", { name: /Flexible/ })).toBeChecked();
  await page.getByRole("radio", { name: /No reembolsable/ }).check();
  await page
    .getByRole("link", { name: "Continuar con Suite Matrimonial, tarifa No reembolsable" })
    .click();
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s180\.00/);
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).not.toBeChecked();
  await expect(page.getByLabel("Correo electrónico")).toHaveValue("ana@example.com");

  await page.getByRole("link", { name: "Volver a tarifas" }).click();
  await expect(page.getByRole("radio", { name: /No reembolsable/ })).toBeChecked();
  await page.getByRole("radio", { name: /Flexible/ }).check();
  await page
    .getByRole("link", { name: "Continuar con Suite Matrimonial, tarifa Flexible" })
    .click();
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s200\.00/);
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeChecked();
  const acceptances = countAcceptances(page);
  await closeCardFormWithoutPaying(page, payButton(page));
  expect(acceptances.count).toBe(0);
  expect((await serverCheckout(page, request)).quote.id).toBe(flexible.quote.id);
});

test("paying again records the acceptance again only after the contact changes", async ({
  page,
}) => {
  await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
  await acceptTerms(page);
  const acceptances = countAcceptances(page);

  await closeCardFormWithoutPaying(page, payButton(page));
  expect(acceptances.count).toBe(0);

  await page.getByLabel("Nombre completo").fill("Ana María Torres");
  await closeCardFormWithoutPaying(page, payButton(page));
  expect(acceptances.count).toBe(1);
});

test("an accepted quote past its lifetime stays payable and is not refreshed until the guest pays", async ({
  page,
}) => {
  await page.clock.install();
  let refreshes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/public/checkout/quotes"))
      refreshes += 1;
  });
  await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
  await acceptTerms(page);

  await page.clock.fastForward("11:00");
  await page.getByLabel("Teléfono").fill("987 654 321");

  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeChecked();
  await expect(payButton(page)).toBeEnabled();
  expect(refreshes).toBe(0);
});

test("browser back shows the latest contact draft", async ({ page }) => {
  await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
  await fillContact(page);
  await page.getByRole("link", { name: "Cambiar fechas o habitación" }).click();
  await selectRoomRate(page, "Suite Matrimonial", "Flexible");
  await page
    .getByRole("link", { name: "Continuar con Suite Matrimonial, tarifa Flexible" })
    .click();
  await page.getByLabel("Nombre completo").fill("Ana María Torres");

  await page.goBack();
  await page.goBack();

  await expect(page).toHaveURL(/\/reservar\/revisar\/\?/);
  await expect(page.getByLabel("Nombre completo")).toHaveValue("Ana María Torres");
});

test("a room lost before review returns to the rooms without picking another", async ({ page }) => {
  await page.goto(reviewPath(doubleSoldOutStay(), { room: "double", plan: "flexible" }));

  await expect(
    page.getByRole("heading", { name: "Esta habitación ya no está disponible para estas fechas" }),
  ).toBeFocused();
  await expect(page.getByText(/Doble Premium ya no está disponible/)).toBeVisible();
  await expect(page.getByRole("form")).toBeHidden();

  await page.getByRole("link", { name: "Volver a las habitaciones" }).click();
  await expect(page).toHaveURL(/\/habitaciones\/\?.*room=double$/);
  await expect(
    page.getByText(/Su habitación preferida, Doble Premium, no está disponible/),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Reservar Doble Premium/ })).toHaveCount(0);
});

test("a quote limit on entering review can be retried", async ({ page }) => {
  await page.route(checkoutsRoute, (route) =>
    route.fulfill({
      status: 429,
      headers: { "access-control-allow-origin": "*", "retry-after": "60" },
      contentType: "application/json",
      body: JSON.stringify({ error: "too many quotes" }),
    }),
  );
  await page.goto(reviewPath(openStay(), { room: "king", plan: "non_refundable" }));

  await expect(
    page.getByRole("heading", { name: "Demasiadas solicitudes de precio desde su conexión" }),
  ).toBeFocused();

  await page.unroute(checkoutsRoute);
  await page.getByRole("button", { name: "Intentar de nuevo" }).click();
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s180\.00/);
});

test("a checkout past its acceptance limit keeps the details and starts a fresh review", async ({
  page,
  request,
}) => {
  await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s200\.00/);
  const token = await storedToken(page);
  const { quote } = await serverCheckout(page, request);
  for (let attempt = 1; attempt <= 20; attempt++)
    await request.post(acceptanceRoute, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        quoteId: quote.id,
        language: "es",
        agreed: true,
        contact: { fullName: `Prueba ${attempt}`, email: "ana@example.com", phone: "987654321" },
      },
    });
  await fillContact(page);
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
  await payButton(page).click();

  await expect(
    page.getByRole("heading", { name: "Esta revisión se modificó demasiadas veces" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "Intentar de nuevo" }).click();
  await expect(page.getByLabel("Correo electrónico")).toHaveValue("ana@example.com");
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeChecked();
  const acceptances = countAcceptances(page);
  await closeCardFormWithoutPaying(page, payButton(page));
  expect(acceptances.count).toBe(1);
  expect(await storedToken(page)).not.toBe(token);
});

for (const [name, fulfil, message] of [
  [
    "a failed connection",
    (route: Parameters<Parameters<Page["route"]>[1]>[0]) => route.abort("connectionrefused"),
    "No pudimos guardar su aceptación",
  ],
  [
    "an unrecognised validation error",
    (route: Parameters<Parameters<Page["route"]>[1]>[0]) =>
      route.fulfill({
        status: 400,
        headers: { "access-control-allow-origin": "*" },
        contentType: "application/json",
        body: JSON.stringify({ error: "contact rejected for a new reason" }),
      }),
    "No pudimos guardar estos datos. Revíselos e intente de nuevo.",
  ],
] as const) {
  test(`${name} while accepting keeps the details for a retry`, async ({ page }) => {
    await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
    await fillContact(page);
    await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
    await page.route(acceptanceRoute, (route) =>
      route.request().method() === "POST" ? fulfil(route) : route.fallback(),
    );

    await payButton(page).click();

    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByLabel("Correo electrónico")).toHaveValue("ana@example.com");
    await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeChecked();
    await page.unroute(acceptanceRoute);
    const acceptances = countAcceptances(page);
    await closeCardFormWithoutPaying(page, payButton(page));
    expect(acceptances.count).toBe(1);
  });
}
