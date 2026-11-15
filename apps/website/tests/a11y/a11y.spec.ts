import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LOCAL_API_URL, doubleSoldOutStay, openStay } from "../support/local-api";
import { stubPaymentScripts, useOwnSourceIp } from "../support/payment";
import { reservationSummary } from "../support/summary";
import { selectRoomRate } from "../support/room-rate";

const pages = [
  "/",
  "/habitaciones/",
  "/churin/",
  "/libro-de-reclamaciones/",
  "/en/libro-de-reclamaciones/",
  "/privacidad/",
  "/condiciones-de-reserva/",
  "/en/privacidad/",
  "/en/condiciones-de-reserva/",
  "/404",
  "/en/",
  "/en/habitaciones/",
  "/en/churin/",
  "/en/404",
] as const;

function formatViolation(
  pagePath: string,
  violation: {
    id: string;
    help: string;
    nodes: { target: unknown }[];
  },
): string {
  const selectors = violation.nodes
    .map((node) => (Array.isArray(node.target) ? node.target.join(" ") : String(node.target)))
    .join(", ");
  return `[${pagePath}] ${violation.id}: ${violation.help} (selector: ${selectors})`;
}

async function runAxe(page: Page, pagePath: string) {
  const search = page.locator(".stay-search form");
  if (await search.count()) await expect(search).toHaveAttribute("aria-busy", "false");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const failing = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const warnings = results.violations.filter(
    (v) => v.impact === "moderate" || v.impact === "minor",
  );

  for (const warning of warnings) {
    console.warn(formatViolation(pagePath, warning));
  }

  if (failing.length > 0) {
    const details = failing.map((v) => formatViolation(pagePath, v)).join("\n");
    expect(failing, `Serious/critical a11y violations:\n${details}`).toEqual([]);
  }
}

for (const path of pages) {
  test(`a11y: ${path}`, async ({ page }) => {
    if (path.includes("libro-de-reclamaciones")) await stubPaymentScripts(page);
    const response = await page.goto(path);
    expect(response?.ok() || response?.status() === 404).toBeTruthy();
    if (path.includes("libro-de-reclamaciones")) {
      await expect(page.locator("#complaint-fullName")).toBeVisible();
      await page.getByRole("button", { name: /privacidad|privacy/ }).click();
    }
    await runAxe(page, path);
  });
}

test(`a11y: / with the mobile calendar drawer open`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`/`);
  await page.locator("#stay-check-in").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await runAxe(page, `/ (calendar drawer)`);
});

test(`a11y: /habitaciones/ with offers`, async ({ page }) => {
  const params = new URLSearchParams({ ...doubleSoldOutStay(), adults: "2", children: "0" });
  await page.goto(`/habitaciones/?${params.toString()}&room=king`);
  await expect(
    page
      .getByRole("article", { name: "Suite Matrimonial" })
      .getByRole("button", { name: /Ver tarifas/ }),
  ).toBeVisible();
  await runAxe(page, `/habitaciones/ (offers)`);
  await selectRoomRate(page, "Suite Matrimonial", "Flexible");
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: /^Continuar con / })
      .first(),
  ).toBeVisible();
  for (const title of [
    "Cancelación",
    "Entrada y salida",
    "Desayuno",
    "Mascotas",
    "Pago en el hotel",
  ]) {
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(page.getByRole("region", { name: title, exact: true })).toBeVisible();
  }
  await runAxe(page, `/habitaciones/ (rates)`);
});

test(`a11y: /habitaciones/ rates on a phone with the Continue bar`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
  await page.goto(`/habitaciones/?${params.toString()}&room=king&plan=flexible`);
  await expect(page.getByRole("radio", { name: /Flexible/ })).toBeChecked();
  await expect(
    page.locator("[data-continue-bar]").getByRole("link", { name: /^Continuar con / }),
  ).toBeInViewport();
  await runAxe(page, `/habitaciones/ (phone rates)`);
});

test(`a11y: /habitaciones/ with the photo lightbox open`, async ({ page }) => {
  await page.goto(`/habitaciones/`);
  await page
    .getByRole("button", { name: /: Abrir .*2 / })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await runAxe(page, `/habitaciones/ (lightbox)`);
});

test(`a11y: /reservar/revisar/ with a quote and contact errors`, async ({ page }) => {
  const params = new URLSearchParams({ ...openStay(), adults: "2", children: "1" });
  await page.goto(`/reservar/revisar/?${params.toString()}&room=king&plan=flexible`);
  await expect(page.locator('[data-amount="total"]')).toHaveText(/S\//);
  await page.locator("[data-pay-button]").click();
  await expect(page.locator("#fullName")).toHaveAttribute("aria-invalid", "true");
  await runAxe(page, `/reservar/revisar/`);
  await page.locator("[data-open-terms]").click();
  await expect(page.locator("[data-terms]")).toBeVisible();
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
  await runAxe(page, `/reservar/revisar/ (terms)`);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-terms]")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-reservation-notes] [data-slot="accordion-trigger"]').click();
  await runAxe(page, `/reservar/revisar/ (mobile compact)`);
});

test(`a11y: /reservar/revisar/ when the room was lost`, async ({ page }) => {
  const params = new URLSearchParams({ ...doubleSoldOutStay(), adults: "2", children: "0" });
  await page.goto(`/reservar/revisar/?${params.toString()}&room=double&plan=flexible`);
  await expect(page.locator("[data-problem]")).toBeVisible();
  await runAxe(page, `/reservar/revisar/ (lost)`);
});

test(`a11y: /habitaciones/ when the search service fails`, async ({ page }) => {
  await page.route(`${LOCAL_API_URL}/public/offers*`, (route) => route.abort());
  const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
  await page.goto(`/habitaciones/?${params.toString()}`);
  await expect(page.getByRole("button", { name: "Intentar de nuevo" })).toBeVisible();
  await runAxe(page, `/habitaciones/ (failure)`);
});

test(`a11y: /reservar/revisar/ ready to pay`, async ({ page }) => {
  await stubPaymentScripts(page);
  await useOwnSourceIp(page, test.info().workerIndex);
  const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
  await page.goto(`/reservar/revisar/?${params.toString()}&room=king&plan=flexible`);
  await page.locator("#fullName").fill("Ana Torres");
  await page.locator("#email").fill("ana@example.com");
  await page.locator("#phone").fill("987 654 321");
  await page.locator("#agree").check();
  await expect(page.locator("[data-pay-button]")).toBeEnabled();
  await expect(page.locator("[data-security-check]")).toContainText("Security check complete");
  await runAxe(page, `/reservar/revisar/ (pay)`);
  await page.getByRole("combobox", { name: /^País y código:/ }).click();
  await expect(page.getByRole("combobox", { name: "Buscar país" })).toBeVisible();
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished),
    );
  });
  await runAxe(page, `/reservar/revisar/ (phone country picker)`);
});

test(`a11y: /reservar/revisar/ with money received but unconfirmed`, async ({ page }) => {
  await stubPaymentScripts(page);
  await useOwnSourceIp(page, test.info().workerIndex);
  await page.route(`${LOCAL_API_URL}/public/checkout/payment`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        payment: {
          state: "unfulfilled",
          amountCents: 10000,
          currency: "PEN",
          delayed: false,
          reservation: {
            code: "AB12CD",
            paidCents: 10000,
            outstandingCents: 0,
            refundDueCents: 10000,
          },
        },
      }),
    }),
  );
  const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
  await page.goto(`/reservar/revisar/?${params.toString()}&room=king&plan=flexible`);
  await expect(page.locator("[data-outcome]")).toBeVisible();
  await runAxe(page, `/reservar/revisar/ (unfulfilled)`);
});

test("a11y: confirmed Review with unavailable and available access", async ({ page }) => {
  await stubPaymentScripts(page);
  await useOwnSourceIp(page, test.info().workerIndex);
  await page.route(`${LOCAL_API_URL}/public/checkout/payment`, (route) =>
    route.fulfill({
      json: {
        payment: {
          attemptId: "confirmed-attempt",
          state: "confirmed",
          amountCents: 10000,
          currency: "PEN",
          delayed: false,
          reservation: {
            code: "AB12CD",
            paidCents: 10000,
            outstandingCents: 10000,
            refundDueCents: 0,
          },
        },
      },
    }),
  );
  let available = false;
  await page.route(`${LOCAL_API_URL}/public/checkout/access`, (route) =>
    route.fulfill({ json: available ? { token: "a".repeat(43), expiresOn: "2027-12-01" } : {} }),
  );
  const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
  await page.goto(`/reservar/revisar/?${params.toString()}&room=king&plan=flexible`);
  await expect(page.locator("[data-access-retry]")).toBeVisible();
  await runAxe(page, "Review (confirmed, link unavailable)");
  available = true;
  await page.locator("[data-access-retry]").click();
  await expect(page.locator("[data-access-view]")).toBeVisible();
  await runAxe(page, "Review (confirmed, link available)");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-print-confirmation]")).toBeVisible();
  await runAxe(page, "Review (printed confirmation)");
});

test(`a11y: /reservar/resumen/ ordinary summary`, async ({ page }) => {
  await page.route(`${LOCAL_API_URL}/public/reservation`, (route) =>
    route.fulfill({ json: reservationSummary() }),
  );
  const title = "Su reserva está confirmada";
  await page.goto(`/reservar/resumen/#${"a".repeat(43)}`);
  await expect(page.getByText("AB12CD")).toBeVisible();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  await runAxe(page, `/reservar/resumen/`);
});

for (const locale of ["", "/en"]) {
  test(`a11y: ${locale}/reservar/resumen/ unavailable and invalid`, async ({ page }) => {
    await page.route(`${LOCAL_API_URL}/public/reservation`, (route) =>
      route.fulfill({ status: 503, json: {} }),
    );
    await page.goto(`${locale}/reservar/resumen/#${"a".repeat(43)}`);
    const retry = page.getByRole("button", { name: locale ? "Try again" : "Intentar de nuevo" });
    await expect(retry).toBeVisible();
    await retry.focus();
    await expect(retry).toBeFocused();
    await runAxe(page, `${locale}/reservar/resumen/ (unavailable)`);
    await page.evaluate(() => {
      location.hash = "invalid";
    });
    await expect(page.locator("[data-assistance]")).toBeVisible();
    await expect(retry).toBeHidden();
    await runAxe(page, `${locale}/reservar/resumen/ (invalid)`);
  });
}

for (const outcome of ["authentication_required", "declined", "authentication_expired"] as const) {
  test(`a11y: Review card outcome ${outcome}`, async ({ page }) => {
    await stubPaymentScripts(page);
    await useOwnSourceIp(page, test.info().workerIndex);
    const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
    await page.goto(`/reservar/revisar/?${params}&room=king&plan=flexible`);
    await page.getByLabel("Nombre completo").fill("Ana Torres");
    await page.getByLabel("Correo electrónico").fill("ana@example.com");
    await page.getByLabel("Teléfono").fill("987654321");
    await page.getByRole("checkbox", { name: /Acepto las condiciones/ }).check();
    await page.route(`${LOCAL_API_URL}/public/checkout/payment`, (route) =>
      route.fulfill({
        json: {
          payment: {
            attemptId: "card-outcome-attempt",
            state: outcome === "authentication_expired" ? "declined" : outcome,
            ...(outcome === "authentication_expired"
              ? { declineReason: "authentication_expired" }
              : {}),
            amountCents: 10000,
            currency: "PEN",
            delayed: false,
            reservation: null,
          },
        },
      }),
    );
    await page.reload();
    await expect(page.locator("[data-outcome]")).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await runAxe(page, `Review (${outcome}, desktop)`);
    await page.setViewportSize({ width: 390, height: 844 });
    await runAxe(page, `Review (${outcome}, phone)`);
    if (outcome !== "authentication_required") {
      await page.getByRole("button", { name: "Pagar con otra tarjeta" }).click();
      await expect(page.locator("[data-pay-button]")).toBeFocused();
      await expect(page.getByLabel("Nombre completo")).toHaveValue("Ana Torres");
    }
  });
}
