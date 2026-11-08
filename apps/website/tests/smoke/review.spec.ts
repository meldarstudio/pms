import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { LOCAL_API_URL, daysFromToday, doubleSoldOutStay, openStay } from "../support/local-api";

const checkoutsRoute = `${LOCAL_API_URL}/public/checkouts`;
const acceptanceRoute = `${LOCAL_API_URL}/public/checkout/acceptances`;

function reviewPath(
  stay: { checkIn: string; checkOut: string },
  extra: Record<string, string>,
  lang = "",
) {
  const params = new URLSearchParams({ ...stay, adults: "2", children: "0", ...extra });
  return `${lang}/reservar/revisar/?${params.toString()}`;
}

async function serverCheckout(page: Page, request: APIRequestContext) {
  const token = await page.evaluate(
    () =>
      (JSON.parse(sessionStorage.getItem("hm.reservation.checkout") ?? "{}") as { token?: string })
        .token,
  );
  const response = await request.get(`${LOCAL_API_URL}/public/checkout`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    quote: { id: string };
    acceptance: { quoteId: string } | null;
  };
}

async function fillContact(page: Page) {
  await page.getByLabel("Nombre completo").fill("Ana Torres");
  await page.getByLabel("Correo electrónico").fill("ana@example.com");
  await page.getByLabel("Teléfono").fill("987 654 321");
}

test("a chosen offer is reviewed with server amounts and its terms are accepted", async ({
  page,
  request,
}) => {
  const stay = openStay();
  const params = new URLSearchParams({ ...stay, adults: "2", children: "0" });
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
  await expect(page.getByText(/\d+:\d+|minutos restantes|sin reservar/)).toHaveCount(0);

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

  await fillContact(page);
  await agree.check();
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();

  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
  await expect(page.getByText(/El pago con tarjeta en línea aún no está disponible/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Pagar/ })).toHaveCount(0);
  const checkout = await serverCheckout(page, request);
  expect(checkout.acceptance?.quoteId).toBe(checkout.quote.id);
});

test("language changes and back navigation keep the draft, choice and accepted offer", async ({
  page,
  request,
}) => {
  await page.goto(reviewPath(openStay(), { room: "double", plan: "non_refundable" }));
  await fillContact(page);
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
  const accepted = await serverCheckout(page, request);

  await page.locator("#lang-select").selectOption({ label: "English" });

  await expect(page).toHaveURL(/\/en\/reservar\/revisar\/\?.*room=double&plan=non_refundable/);
  await expect(page.getByLabel("Full name")).toHaveValue("Ana Torres");
  await expect(page.getByLabel("Phone")).toHaveValue("987 654 321");
  await expect(page.getByRole("checkbox", { name: /I accept/ })).toBeChecked();
  await expect(page.getByText("Terms accepted")).toBeVisible();
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s216\.00/);
  expect((await serverCheckout(page, request)).quote.id).toBe(accepted.quote.id);

  await page.getByRole("link", { name: "Change room or rate" }).click();
  await expect(page.getByRole("region", { name: "Your choice" })).toContainText(
    "Premium double · Non-refundable rate",
  );
  await page.getByRole("link", { name: "Continue to review" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("ana@example.com");
  await expect(page.getByText("Terms accepted")).toBeVisible();
  expect((await serverCheckout(page, request)).quote.id).toBe(accepted.quote.id);

  await page.getByLabel("Full name").fill("Ana María Torres");
  await expect(page.getByText("Terms accepted")).toBeHidden();
  await expect(page.getByRole("button", { name: "Accept terms" })).toBeVisible();

  await page.goBack();
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/^[^?]*\/reservar\/revisar\/\?/);
  await expect(page).not.toHaveURL(/\/en\//);
  await expect(page.getByLabel("Nombre completo")).toHaveValue("Ana María Torres");
});

test("a room lost before review returns to the kept choice without picking another", async ({
  page,
}) => {
  await page.goto(reviewPath(doubleSoldOutStay(), { room: "double", plan: "flexible" }));

  await expect(
    page.getByRole("heading", { name: "Esta habitación ya no está disponible para estas fechas" }),
  ).toBeFocused();
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
  await expect(page.getByText(/No pudimos preparar su precio/)).toBeHidden();

  await page.unroute(checkoutsRoute);
  await page.getByRole("button", { name: "Intentar de nuevo" }).click();
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\/\s180\.00/);
});

test("a throttled or failed acceptance keeps the details for a safe retry", async ({ page }) => {
  await page.goto(reviewPath(openStay(), { room: "king", plan: "flexible" }));
  await fillContact(page);
  await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();

  await page.route(acceptanceRoute, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 429,
          headers: { "access-control-allow-origin": "*", "retry-after": "60" },
          contentType: "application/json",
          body: JSON.stringify({ error: "too many requests" }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByRole("alert")).toContainText("Demasiados intentos desde su conexión");

  await page.unroute(acceptanceRoute);
  await page.route(acceptanceRoute, (route) =>
    route.request().method() === "POST" ? route.abort("connectionrefused") : route.continue(),
  );
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByRole("alert")).toContainText("No pudimos guardar su aceptación");
  await expect(page.getByLabel("Correo electrónico")).toHaveValue("ana@example.com");
  await expect(page.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeChecked();
  await expect(page.getByText("Esta habitación ya no está disponible")).toBeHidden();

  await page.unroute(acceptanceRoute);
  await page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(page.getByText("Condiciones aceptadas")).toBeVisible();
});
