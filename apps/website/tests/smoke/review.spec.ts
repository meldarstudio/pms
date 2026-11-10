import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { LOCAL_API_URL, daysFromToday, doubleSoldOutStay, openStay } from "../support/local-api";
import { stubPaymentScripts } from "../support/payment";

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

async function acceptTerms(page: Page) {
  await fillContact(page);
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
}

test("a chosen offer is reviewed with server amounts and its terms are accepted", async ({
  page,
  request,
}) => {
  const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
  await page.goto(`/reservar/habitacion/?${params.toString()}&room=king&plan=flexible`);
  await page.getByRole("link", { name: "Continuar a la revisión" }).click();

  await expect(page).toHaveURL(/\/reservar\/revisar\/\?/);
  expect([...new URL(page.url()).searchParams.keys()].toSorted()).toEqual(
    ["adults", "checkIn", "checkOut", "children", "plan", "room"].toSorted(),
  );
  const stayDetails = page.getByRole("region", { name: "Su estadía" });
  await expect(stayDetails).toContainText("Suite Matrimonial");
  await expect(stayDetails).toContainText("2 noches");
  await expect(stayDetails).toContainText("2 adultos");
  await expect(stayDetails).toContainText("Flexible");
  const price = page.getByRole("region", { name: "Precio y condiciones" });
  await expect(price.locator('[data-amount="total"]')).toHaveText(/S\/\s200\.00/);
  await expect(price.locator('[data-amount="now"]')).toHaveText(/S\/\s100\.00/);
  await expect(price.locator('[data-amount="remaining"]')).toHaveText(/S\/\s100\.00/);
  await expect(price.locator("[data-cancellation] time")).toHaveAttribute(
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

  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByLabel("Nombre completo")).toBeFocused();
  await expect(page.getByText("Ingrese el nombre completo del contacto.")).toBeVisible();
  await expect(page.getByText("Marque la casilla para aceptar las condiciones.")).toBeVisible();

  await acceptTerms(page);
  await expect(page.locator("[data-accepted]")).toContainText("Todavía no se ha cobrado nada");
  await expect(page.locator("[data-accepted]").getByRole("link")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Pagar S\/\s100\.00 con tarjeta$/ }),
  ).toBeVisible();
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

  await expect(page).toHaveURL(/\/en\/reservar\/revisar\/\?.*room=double&plan=non_refundable/);
  await expect(page.getByLabel("Full name")).toHaveValue("Ana Torres");
  await expect(page.getByLabel("Phone")).toHaveValue("987 654 321");
  await expect(page.getByRole("checkbox", { name: /I accept/ })).toBeChecked();
  await expect(page.getByText("Terms accepted")).toBeVisible();
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s216\.00/);
  expect((await serverCheckout(page, request)).quote.id).toBe(accepted.quote.id);
});

test("switching plan and back restores the earlier checkout and acceptance", async ({
  page,
  request,
}) => {
  await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
  await acceptTerms(page);
  const flexible = await serverCheckout(page, request);

  await page.getByRole("link", { name: "Cambiar habitación o tarifa" }).click();
  const king = page.getByRole("article", { name: "Suite Matrimonial" });
  await king.getByRole("radio", { name: /No reembolsable/ }).check();
  await page.getByRole("link", { name: "Continuar a la revisión" }).click();
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s180\.00/);
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).not.toBeChecked();
  await expect(page.getByLabel("Correo electrónico")).toHaveValue("ana@example.com");

  await page.getByRole("link", { name: "Cambiar habitación o tarifa" }).click();
  await king.getByRole("radio", { name: /Flexible/ }).check();
  await page.getByRole("link", { name: "Continuar a la revisión" }).click();
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s200\.00/);
  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
  expect((await serverCheckout(page, request)).quote.id).toBe(flexible.quote.id);
});

test("editing the contact after accepting asks for acceptance again", async ({ page }) => {
  await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
  await acceptTerms(page);

  await page.getByLabel("Nombre completo").fill("Ana María Torres");

  await expect(page.getByText("Condiciones aceptadas")).toBeHidden();
  await expect(page.getByRole("button", { name: "Aceptar condiciones" })).toBeVisible();
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

  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toBeVisible();
  expect(refreshes).toBe(0);
});

test("browser back shows the latest contact draft", async ({ page }) => {
  await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
  await fillContact(page);
  await page.getByRole("link", { name: "Cambiar habitación o tarifa" }).click();
  await page.getByRole("link", { name: "Continuar a la revisión" }).click();
  await page.getByLabel("Nombre completo").fill("Ana María Torres");

  await page.goBack();
  await page.goBack();

  await expect(page).toHaveURL(/\/reservar\/revisar\/\?/);
  await expect(page.getByLabel("Nombre completo")).toHaveValue("Ana María Torres");
});

test("a room lost before review returns to the kept choice without picking another", async ({
  page,
}) => {
  await page.goto(reviewPath(doubleSoldOutStay(), { room: "double", plan: "flexible" }));

  await expect(
    page.getByRole("heading", { name: "Esta habitación ya no está disponible para estas fechas" }),
  ).toBeFocused();
  await expect(page.getByText(/Doble Premium ya no está disponible/)).toBeVisible();
  await expect(page.getByRole("form")).toBeHidden();

  await page.getByRole("link", { name: "Volver a las habitaciones" }).click();
  await expect(page).toHaveURL(/\/reservar\/habitacion\/\?.*room=double&plan=flexible/);
  await expect(
    page.getByText("Su elección anterior, Doble Premium, no está disponible para esta búsqueda."),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Su elección" })).toBeHidden();
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
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();

  await expect(
    page.getByRole("heading", { name: "Esta revisión se modificó demasiadas veces" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "Intentar de nuevo" }).click();
  await expect(page.getByLabel("Correo electrónico")).toHaveValue("ana@example.com");
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeChecked();
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
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

    await page.getByRole("button", { name: "Aceptar condiciones" }).click();

    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByLabel("Correo electrónico")).toHaveValue("ana@example.com");
    await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeChecked();
    await page.unroute(acceptanceRoute);
    await page.getByRole("button", { name: "Aceptar condiciones" }).click();
    await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
  });
}
