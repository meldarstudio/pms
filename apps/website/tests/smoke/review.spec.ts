import { expect, test, type Page } from "@playwright/test";
import { fillContact, payButton, reviewPath, serverCheckout } from "../support/checkout";
import { daysFromToday, doubleSoldOutStay, openStay } from "../support/local-api";
import { closeCardFormWithoutPaying, stubPaymentScripts, useOwnSourceIp } from "../support/payment";

test.beforeEach(async ({ page }) => {
  await stubPaymentScripts(page);
  await useOwnSourceIp(page, test.info().workerIndex);
});

async function acceptTerms(page: Page) {
  await fillContact(page);
  const agree = page.getByRole("checkbox", { name: /Acepto las condiciones/ });
  await agree.press("Space");
  await expect(agree).toBeChecked();
  await closeCardFormWithoutPaying(page, payButton(page));
}

test("a chosen offer is reviewed with server amounts and its terms are accepted", async ({
  page,
  request,
}) => {
  const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
  await page.goto(`/habitaciones/?${params.toString()}`);
  await page
    .getByRole("link", { name: "Continuar con Suite Matrimonial, tarifa Flexible" })
    .click();

  await expect(page).toHaveURL(/\/reservar\/revisar\/\?/);
  expect([...new URL(page.url()).searchParams.keys()].toSorted()).toEqual(
    ["adults", "checkIn", "checkOut", "children", "plan", "types"].toSorted(),
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

  const country = page.getByRole("button", { name: /^País y código:/ });
  const countrySearch = page.getByRole("combobox", { name: "Buscar país" });
  await country.click();
  await countrySearch.pressSequentially("México");
  await page.getByRole("option", { name: "México +52" }).click();
  await country.click();
  await countrySearch.pressSequentially("Perú");
  await page.getByRole("option", { name: "Perú +51" }).click();

  await acceptTerms(page);
  const checkout = await serverCheckout(page, request);
  expect(checkout.acceptance?.quoteId).toBe(checkout.quote.id);
});

test("a room lost before review returns to the rooms without picking another", async ({ page }) => {
  await page.goto(reviewPath(doubleSoldOutStay(), { types: "double", plan: "flexible" }));

  await expect(
    page.getByRole("heading", { name: "Esta habitación ya no está disponible para estas fechas" }),
  ).toBeFocused();
  await expect(page.getByText(/Doble Premium ya no está disponible/)).toBeVisible();
  await expect(page.getByRole("form")).toBeHidden();

  await page
    .getByRole("navigation", { name: "Pasos de la reserva" })
    .getByRole("link", { name: "Habitación", exact: true })
    .click();
  await expect(page).toHaveURL(/\/habitaciones\/\?.*room=double$/);
  await expect(
    page.getByText(/Su habitación preferida, Doble Premium, no está disponible/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Continuar con Doble Premium, tarifa/ }),
  ).toHaveCount(0);
});
