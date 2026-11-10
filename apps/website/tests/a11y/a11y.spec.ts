import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LOCAL_API_URL, doubleSoldOutStay, openStay } from "../support/local-api";
import { stubPaymentScripts, useOwnSourceIp } from "../support/payment";

const pages = [
  "/",
  "/habitaciones/",
  "/churin/",
  "/404",
  "/en/",
  "/en/habitaciones/",
  "/en/churin/",
  "/en/404",
  "/reservar/",
  "/en/reservar/",
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
    const response = await page.goto(path);
    expect(response?.ok() || response?.status() === 404).toBeTruthy();
    await runAxe(page, path);
  });
}

for (const lang of ["", "/en"]) {
  test(`a11y: ${lang}/reservar/habitacion/ with offers and a choice`, async ({ page }) => {
    const params = new URLSearchParams({ ...doubleSoldOutStay(), adults: "2", children: "0" });
    await page.goto(`${lang}/reservar/habitacion/?${params.toString()}&room=king&plan=flexible`);
    await expect(page.locator("[data-choice]")).toBeVisible();
    await runAxe(page, `${lang}/reservar/habitacion/`);
  });

  test(`a11y: ${lang}/reservar/revisar/ with a quote and contact errors`, async ({ page }) => {
    const params = new URLSearchParams({ ...openStay(), adults: "2", children: "1" });
    await page.goto(`${lang}/reservar/revisar/?${params.toString()}&room=king&plan=flexible`);
    await expect(page.locator('[data-amount="total"]')).toHaveText(/S\//);
    await page.locator("[data-submit]").click();
    await expect(page.locator("#fullName")).toHaveAttribute("aria-invalid", "true");
    await page.locator("details summary").click();
    await runAxe(page, `${lang}/reservar/revisar/`);
  });

  test(`a11y: ${lang}/reservar/revisar/ when the room was lost`, async ({ page }) => {
    const params = new URLSearchParams({ ...doubleSoldOutStay(), adults: "2", children: "0" });
    await page.goto(`${lang}/reservar/revisar/?${params.toString()}&room=double&plan=flexible`);
    await expect(page.locator("[data-problem]")).toBeVisible();
    await runAxe(page, `${lang}/reservar/revisar/ (lost)`);
  });

  test(`a11y: ${lang}/reservar/habitacion/ when the search service fails`, async ({ page }) => {
    await page.route(`${LOCAL_API_URL}/public/offers*`, (route) => route.abort());
    const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
    await page.goto(`${lang}/reservar/habitacion/?${params.toString()}`);
    await expect(page.locator("[data-problem]")).toBeVisible();
    await runAxe(page, `${lang}/reservar/habitacion/ (failure)`);
  });

  test(`a11y: ${lang}/reservar/revisar/ ready to pay`, async ({ page }) => {
    await stubPaymentScripts(page);
    await useOwnSourceIp(page, test.info().workerIndex);
    const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
    await page.goto(`${lang}/reservar/revisar/?${params.toString()}&room=king&plan=flexible`);
    await page.locator("#fullName").fill("Ana Torres");
    await page.locator("#email").fill("ana@example.com");
    await page.locator("#phone").fill("987 654 321");
    await page.locator("#agree").check();
    await page.locator("[data-submit]").click();
    await expect(page.locator("[data-pay-button]")).toBeVisible();
    await runAxe(page, `${lang}/reservar/revisar/ (pay)`);
  });

  test(`a11y: ${lang}/reservar/revisar/ with money received but unconfirmed`, async ({ page }) => {
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
    await page.goto(`${lang}/reservar/revisar/?${params.toString()}&room=king&plan=flexible`);
    await expect(page.locator("[data-outcome]")).toBeVisible();
    await runAxe(page, `${lang}/reservar/revisar/ (unfulfilled)`);
  });
}
