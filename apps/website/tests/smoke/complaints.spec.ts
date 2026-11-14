import { expect, test } from "@playwright/test";

test("keeps the complaint draft and retry credential after a lost response, then prints the saved receipt", async ({
  page,
}) => {
  const input: Record<string, unknown> = {};
  let credential = "";
  let submissions = 0;
  await page.route("**/public/complaints/config", (route) =>
    route.fulfill({
      json: {
        development: true,
        provider: {
          legalName: "Development operator",
          ruc: "00000000000",
          address: "Development address",
        },
        establishmentId: "DEMO",
        collectionNotice: { es: "Datos de prueba", en: "Test data only" },
        privacyInformation: { es: "Privacidad de prueba", en: "Test privacy information" },
        policyVersion: "development-1",
      },
    }),
  );
  await page.route("**/public/complaints", async (route) => {
    const token = route.request().headers().authorization;
    if (credential) expect(token).toBe(credential);
    credential = token;
    Object.assign(input, route.request().postDataJSON());
    if (++submissions === 1) return route.abort();
    return route.fulfill({
      json: {
        id: "sheet-1",
        reference: "DEMO-000041",
        provider: {
          legalName: "Development operator",
          ruc: "00000000000",
          address: "Development address",
        },
        establishmentId: "DEMO",
        filedAt: "2026-11-13T15:00:00Z",
        registeredAt: "2026-11-13T15:00:00Z",
        dueDate: "2026-12-04",
        timeZone: "America/Lima",
        currency: "PEN",
        source: "virtual",
        originalReference: null,
        input,
        email: { status: "pending" },
        responses: [],
      },
    });
  });
  await page.goto("/en/libro-de-reclamaciones/");
  await page.getByLabel("Full name", { exact: true }).fill("Ana Torres");
  await page.getByLabel("Address", { exact: true }).fill("Lima");
  await page.getByLabel("Document type", { exact: true }).fill("Passport");
  await page.getByLabel("Document number", { exact: true }).fill("AB123456");
  await page.getByLabel("Email", { exact: true }).fill("ana@example.com");
  await page.getByLabel("Product or service", { exact: true }).fill("Accommodation");
  await page.getByLabel("Description", { exact: true }).fill("Service unavailable");
  await page.getByLabel("Requested remedy", { exact: true }).fill("Please respond");
  await page.getByRole("button", { name: "Register sheet" }).click();
  await expect(page.getByRole("alert")).toContainText("retry");
  await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveValue(
    "Service unavailable",
  );
  await page.getByRole("button", { name: "Retry same submission" }).click();
  await expect(page.getByRole("heading", { name: "Registered: DEMO-000041" })).toBeVisible();
  await expect(page.getByText("Email queued; delivery is not confirmed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print sheet" })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("Service unavailable")).toBeVisible();
  await expect(page.getByText("Development operator", { exact: false }).last()).toBeVisible();
});

test("registers a minor's queja without a reservation, email or amount through the local backend", async ({
  page,
}) => {
  await page.goto("/libro-de-reclamaciones/");
  await page.getByLabel("Canal de respuesta escrita").selectOption("letter");
  await page.getByLabel("Nombre completo", { exact: true }).fill("Consumidor de prueba");
  await page.getByLabel("Domicilio", { exact: true }).fill("Dirección de prueba");
  await page.getByLabel("Tipo de documento", { exact: true }).fill("Pasaporte extranjero");
  await page.getByLabel("Número de documento", { exact: true }).fill("TEST123");
  await page.getByLabel("Consumidor menor de edad").check();
  await page
    .getByLabel("Padre o representante: nombre, documento, domicilio y contacto")
    .fill("Representante de prueba, TEST456, Dirección de prueba, 999999999");
  await page.getByLabel("Producto o servicio", { exact: true }).fill("Alojamiento de prueba");
  await page.getByLabel("Detalle", { exact: true }).fill("Atención de prueba");
  await page.getByLabel("Pedido", { exact: true }).fill("Respuesta escrita de prueba");
  await page.getByLabel("Tipo", { exact: true }).selectOption("queja");
  await page.getByRole("button", { name: "Registrar hoja" }).click();
  await expect(page.getByRole("heading", { name: /Registrado: DEMO-/ })).toBeVisible();
  await expect(page.getByText("No conocido / no aplica", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin correo automático.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Registrado: DEMO-/ })).toBeVisible();
});
