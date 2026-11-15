import { holdSecurityCheck, passSecurityCheck, stubPaymentScripts } from "../support/payment";
import { expect, test } from "@playwright/test";

for (const { path, provider, category, notices, field } of [
  {
    path: "/libro-de-reclamaciones/",
    provider: "Hotel Manantial de Churin E.I.R.L. · RUC 20552108028",
    category: "Tipo",
    notices: ["quince (15) días hábiles, el cual es improrrogable", "denuncia ante el INDECOPI"],
    field: "Nombre completo",
  },
  {
    path: "/en/libro-de-reclamaciones/",
    provider: "Hotel Manantial de Churin E.I.R.L. · RUC 20552108028",
    category: "Category",
    notices: ["fifteen (15) business days, which cannot be extended", "complaint with INDECOPI"],
    field: "Full name",
  },
]) {
  test(`prerenders the complaint form and its notices at ${path}`, async ({ page, request }) => {
    const html = await (await request.get(path)).text();
    expect(html).toContain("Hotel Manantial de Churin E.I.R.L.");
    expect(html).toContain("20552108028");
    expect(html).toContain("hotelmanantialchurinperu@gmail.com");
    expect(html).toContain('id="complaint-fullName"');
    await stubPaymentScripts(page);
    await page.route("**/public/complaints/config", (route) => route.abort());
    await page.goto(path);
    await expect(page.getByText(provider)).toBeVisible();
    await expect(page.getByLabel(field, { exact: true })).toBeEnabled();
    await expect(
      page.getByRole("combobox", { name: category, exact: true }),
    ).toHaveAccessibleDescription(/^Reclamo: .+ Queja: .+$/);
    for (const notice of notices) await expect(page.getByText(notice)).toBeVisible();
  });
}

test("keeps what the guest typed before the form became interactive", async ({ page }) => {
  await stubPaymentScripts(page);
  let hydrate = () => {};
  const held = new Promise<void>((resolve) => (hydrate = resolve));
  await page.route(/ComplaintBook.*\.js/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/en/libro-de-reclamaciones/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Full name", { exact: true }).fill("Ana Torres");
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("queja");
  hydrate();
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  await page.getByLabel("Address", { exact: true }).fill("Lima");
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Ana Torres");
  await expect(page.getByLabel("Address", { exact: true })).toHaveValue("Lima");
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveValue("queja");
});

test("keeps the complaint draft and retry credential after a lost response, then prints the saved receipt", async ({
  page,
}) => {
  await stubPaymentScripts(page);
  const input: Record<string, unknown> = {};
  let credential = "";
  let submissions = 0;
  const configRequests: string[] = [];
  await page.route("**/public/complaints/config", (route) => {
    configRequests.push(route.request().url());
    return route.abort();
  });
  await page.route("**/public/complaints", async (route) => {
    const token = route.request().headers().authorization;
    if (credential) expect(token).toBe(credential);
    credential = token;
    const { turnstileToken, ...submitted } = route.request().postDataJSON();
    expect(turnstileToken).toBe("complaint-turnstile-pass");
    Object.assign(input, submitted);
    if (++submissions === 1) return route.abort();
    return route.fulfill({
      json: {
        id: "sheet-1",
        bookId: "DEMO",
        reference: "000000041-2026",
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
  await expect(
    page.getByText("Hotel Manantial de Churin E.I.R.L. · RUC 20552108028"),
  ).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("Ana Torres");
  await page.getByLabel("Address", { exact: true }).fill("Lima");
  await page.getByLabel("Document type", { exact: true }).fill("Passport");
  await page.getByLabel("Document number", { exact: true }).fill("AB123456");
  await page.getByLabel("Phone", { exact: true }).fill("+51999999999");
  await page.getByLabel("Reservation reference", { exact: true }).fill("BOOK-123");
  await page.getByLabel("Email", { exact: true }).fill("ana@example.com");
  await page.getByLabel("Product or service", { exact: true }).fill("Accommodation");
  await page.getByLabel("Description", { exact: true }).fill("Service unavailable");
  await page.getByLabel("Requested remedy", { exact: true }).fill("Please respond");
  await page.getByRole("button", { name: "Register sheet" }).click();
  await expect(page.getByRole("alert")).toContainText("retry");
  await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveValue(
    "Service unavailable",
  );
  await expect(page.getByLabel("Full name", { exact: true })).toBeDisabled();
  await expect(page.getByRole("checkbox")).toBeDisabled();
  await expect(page.getByLabel("Written response channel", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry same submission" }).click();
  await expect(
    page.getByRole("heading", { name: "Hoja de Reclamación (complaint sheet) No. 000000041-2026" }),
  ).toBeVisible();
  await expect(page.getByText("Identification code: DEMO")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "4. Provider's observations and actions taken" }),
  ).toBeVisible();
  await expect(page.getByText("Recipient: consumer")).toBeVisible();
  await expect(page.getByText("Email queued; delivery is not confirmed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print sheet" })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("Service unavailable")).toBeVisible();
  await expect(page.getByText("Development operator", { exact: false }).last()).toBeVisible();
  expect(configRequests).toEqual([]);
});

test("registers a minor's queja without a reservation, email or amount through the local backend", async ({
  page,
}) => {
  await stubPaymentScripts(page);
  await holdSecurityCheck(page);
  await page.goto("/libro-de-reclamaciones/");
  await expect(
    page.getByText("Hotel Manantial de Churin E.I.R.L. · RUC 20552108028"),
  ).toBeVisible();
  const privacy = page.getByRole("button", { name: "Información completa de privacidad" });
  await privacy.click();
  await expect(privacy).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("region")).toContainText("hotelmanantialchurinperu@gmail.com");
  await privacy.press("Enter");
  await expect(privacy).toHaveAttribute("aria-expanded", "false");
  await page.getByLabel("Canal de respuesta escrita").selectOption("letter");
  await page.getByLabel("Nombre completo", { exact: true }).fill("Consumidor de prueba");
  await page.getByLabel("Domicilio", { exact: true }).fill("Dirección de prueba");
  await page.getByLabel("Tipo de documento", { exact: true }).fill("Pasaporte extranjero");
  await page.getByLabel("Número de documento", { exact: true }).fill("TEST123");
  await expect(page.getByLabel("Teléfono", { exact: true })).toHaveAttribute("required", "");
  await page.getByLabel("Teléfono", { exact: true }).fill("+51999999999");
  await expect(page.getByLabel("Referencia de reserva", { exact: true })).toHaveAttribute(
    "required",
    "",
  );
  await page.getByLabel("Referencia de reserva", { exact: true }).fill("No aplica");
  await expect(
    page.getByLabel("Correo electrónico (opcional)", { exact: true }),
  ).not.toHaveAttribute("required", "");
  await page.getByRole("checkbox", { name: "Consumidor menor de edad" }).check();
  await page
    .getByLabel("Padre o representante: nombre, documento, domicilio y contacto")
    .fill("Representante de prueba, TEST456, Dirección de prueba, 999999999");
  await page.getByLabel("Producto o servicio", { exact: true }).fill("Alojamiento de prueba");
  await page.getByLabel("Detalle", { exact: true }).fill("Atención de prueba");
  await page.getByLabel("Pedido", { exact: true }).fill("Respuesta escrita de prueba");
  await page.getByRole("combobox", { name: "Tipo", exact: true }).selectOption("queja");
  const submit = page.getByRole("button", { name: "Registrar hoja" });
  await expect(submit).toBeDisabled();
  await passSecurityCheck(page);
  await expect(submit).toBeEnabled();
  await page.evaluate(() =>
    (window as unknown as { expireSecurityCheck: () => void }).expireSecurityCheck(),
  );
  await expect(submit).toBeDisabled();
  await expect(page.getByLabel("Nombre completo", { exact: true })).toHaveValue(
    "Consumidor de prueba",
  );
  await page.evaluate(() =>
    (window as unknown as { failSecurityCheck: () => void }).failSecurityCheck(),
  );
  await expect(page.getByRole("alert")).toContainText(
    "verificación de seguridad no está disponible",
  );
  await page.getByRole("button", { name: "Reintentar verificación" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await passSecurityCheck(page);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(
    page.getByRole("heading", { name: /^Hoja de Reclamación Nº \d{9}-\d{4}$/ }),
  ).toBeVisible();
  await expect(page.getByText("No conocido / no aplica", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin correo automático.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /^Hoja de Reclamación Nº \d{9}-\d{4}$/ }),
  ).toBeVisible();
});

test("refreshes changed privacy information and files the retained draft only on an explicit retry", async ({
  page,
}) => {
  await stubPaymentScripts(page);
  const submitted: { token: string; policyVersion: string }[] = [];
  await page.route("**/public/complaints/config", (route) =>
    route.fulfill({
      json: {
        provider: {
          legalName: "Hotel Manantial de Churin E.I.R.L.",
          ruc: "20552108028",
          address: "Av. Víctor Larco Herrera N°138, Churín",
        },
        establishmentId: "Hotel Manantial · Churín",
        collectionNotice: { es: "Aviso actualizado", en: "Updated collection notice" },
        privacyInformation: { es: "Privacidad actualizada", en: "Updated privacy information" },
        policyVersion: "updated-policy",
      },
    }),
  );
  await page.route("**/public/complaints", async (route) => {
    const { policyVersion } = route.request().postDataJSON();
    submitted.push({ token: route.request().headers().authorization, policyVersion });
    if (submitted.length === 1)
      return route.fulfill({
        status: 409,
        json: { error: "complaint privacy information changed" },
      });
    return route.fulfill({ status: 503, json: { error: "unavailable" } });
  });
  await page.goto("/en/libro-de-reclamaciones/");
  await page.getByLabel("Full name", { exact: true }).fill("Ana Torres");
  await page.getByLabel("Address", { exact: true }).fill("Lima");
  await page.getByLabel("Document type", { exact: true }).fill("Passport");
  await page.getByLabel("Document number", { exact: true }).fill("AB123456");
  await page.getByLabel("Phone", { exact: true }).fill("+51999999999");
  await page.getByLabel("Reservation reference", { exact: true }).fill("BOOK-123");
  await page.getByLabel("Email", { exact: true }).fill("ana@example.com");
  await page.getByLabel("Product or service", { exact: true }).fill("Accommodation");
  await page.getByLabel("Description", { exact: true }).fill("Service unavailable");
  await page.getByLabel("Requested remedy", { exact: true }).fill("Please respond");
  await page.getByRole("button", { name: "Register sheet" }).click();
  await expect(page.getByRole("alert")).toContainText("privacy information was updated");
  await expect(page.getByText("Updated collection notice")).toBeVisible();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Service unavailable");
  await expect(page.getByLabel("Full name", { exact: true })).toBeEnabled();
  expect(submitted).toHaveLength(1);
  await page.getByRole("button", { name: "Register sheet" }).click();
  await expect.poll(() => submitted.length).toBe(2);
  expect(submitted[1]).toEqual({ token: submitted[0].token, policyVersion: "updated-policy" });
  expect(submitted[0].policyVersion).not.toBe("updated-policy");
});
