import { expect, test, type Page } from "@playwright/test";
import {
  checkoutToken,
  fillContact,
  payButton,
  reviewPath,
  serverCheckout,
} from "../support/checkout";
import { LOCAL_API_URL, daysFromToday, doubleSoldOutStay, openStay } from "../support/local-api";
import { closeCardFormWithoutPaying, stubPaymentScripts, useOwnSourceIp } from "../support/payment";
import { selectRoomRate } from "../support/room-rate";

const checkoutsRoute = `${LOCAL_API_URL}/public/checkouts`;
const acceptanceRoute = `${LOCAL_API_URL}/public/checkout/acceptances`;

test.beforeEach(async ({ page }) => {
  await stubPaymentScripts(page);
  await useOwnSourceIp(page, test.info().workerIndex);
});

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

  await expect(payButton(page)).toHaveText(/^Pagar S\/\s100\.00$/);
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

test("a restored overlong note opens and receives focus when paying with notes collapsed", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "hm.reservation.contact",
      JSON.stringify({
        fullName: "Ana Torres",
        email: "ana@example.com",
        phone: { country: "PE", text: "987654321" },
        notes: "a".repeat(2001),
      }),
    ),
  );
  await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
  const notes = page.locator("#notes");
  await expect(notes).toHaveValue("a".repeat(2001));
  await page.getByRole("button", { name: "Notas (opcional)", exact: true }).click();
  await expect(notes).toBeHidden();
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
  const acceptances = countAcceptances(page);

  await payButton(page).click();

  await expect(notes).toBeVisible();
  await expect(notes).toBeFocused();
  await expect(notes).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Las notas no pueden superar los 2000 caracteres.")).toBeVisible();
  expect(acceptances.count).toBe(0);
});

test("the Flexible checkout warns when free cancellation has ended", async ({ page }) => {
  await page.goto(
    reviewPath(
      { checkIn: daysFromToday(1), checkOut: daysFromToday(3) },
      { room: "king", plan: "flexible" },
    ),
  );
  const policy = page.locator("[data-cancellation]");
  await expect(policy.locator("strong")).toHaveText("El plazo de cancelación gratuita terminó");
  await expect(policy).toContainText("Si cancela o no llega, se cobra la primera noche:");
});

test("the mobile review keeps the charge and cancellation visible and opens terms without losing contact details", async ({
  page,
}) => {
  const stay = openStay();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(reviewPath(stay, { room: "king", plan: "flexible" }));
  const summary = page.getByRole("complementary", { name: "Su estadía" });
  const payment = page.getByRole("region", { name: "Pago", exact: true });
  await expect(summary.locator('[data-amount="total"]')).toHaveText(/S\/\s200\.00/);
  await expect(payment.locator('[data-amount="now"]')).toHaveText(/S\/\s100\.00/);
  await expect(payment.locator('[data-amount="remaining"]')).toHaveText(/S\/\s100\.00/);
  await expect(payment.locator("[data-cancellation] time")).toHaveAttribute(
    "datetime",
    daysFromToday(118),
  );
  await expect(summary.locator('[data-stay="compact-guests-rate"]')).toHaveText(
    "2 adultos · Flexible",
  );
  await expect(summary.locator('[data-stay="checkIn"]')).toHaveAttribute("datetime", stay.checkIn);
  await expect(summary.locator('[data-stay="checkOut"]')).toHaveAttribute(
    "datetime",
    stay.checkOut,
  );
  await expect(summary.getByRole("link", { name: "Cambiar tarifa", exact: true })).toBeVisible();
  await expect(summary.locator("[data-change-choice]")).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Reservar", exact: true }),
  ).toHaveCount(0);
  const help = page.locator("[data-reservation-help]");
  await expect(help).toHaveText("Reservar por WhatsApp");
  await expect(page.getByRole("link", { name: "Llámenos", exact: true })).toHaveAttribute(
    "href",
    "tel:+51992755015",
  );
  const helpMessage = new URL((await help.getAttribute("href"))!).searchParams.get("text")!;
  expect(helpMessage).toContain("Habitación: Suite Matrimonial");
  expect(helpMessage).toContain("Huéspedes: 2 adultos");
  expect(helpMessage).toContain("200.00");
  expect(helpMessage).not.toContain("___");

  const fullName = page.getByLabel("Nombre completo");
  await fullName.fill("Ana María Torres");
  const termsLink = page.getByRole("link", { name: "condiciones de la reserva", exact: true });
  await termsLink.click();
  const terms = page.getByRole("dialog", { name: "Condiciones de la reserva" });
  await expect(terms.getByText("Precio por noche", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(terms).toBeHidden();
  await expect(termsLink).toBeFocused();
  await expect(page.getByRole("checkbox", { name: /Acepto/ })).not.toBeChecked();
  await expect(fullName).toHaveValue("Ana María Torres");
});

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
  await expect(page.getByRole("radio", { name: /Flexible/ })).toBeChecked();
  await page.goBack();
  await expect(page.getByRole("article")).toHaveCount(3);
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
  const token = await checkoutToken(page);
  const { quote } = await serverCheckout(page, request);
  for (let attempt = 1; attempt <= 20; attempt++) {
    const accepted = await request.post(acceptanceRoute, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        quoteId: quote.id,
        language: "es",
        agreed: true,
        contact: { fullName: `Prueba ${attempt}`, email: "ana@example.com", phone: "987654321" },
      },
    });
    expect(accepted.status(), await accepted.text()).toBe(201);
  }
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
  expect(await checkoutToken(page)).not.toBe(token);
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
