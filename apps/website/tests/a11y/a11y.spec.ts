import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LOCAL_API_URL, daysFromToday, doubleSoldOutStay, openStay } from "../support/local-api";
import { stubPaymentScripts, useOwnSourceIp } from "../support/payment";
import { selectRoomRate } from "../support/room-rate";

const pages = [
  "/",
  "/habitaciones/",
  "/churin/",
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
  test(`a11y: ${lang}/ with the mobile calendar drawer open`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${lang}/`);
    await page.locator("#stay-check-in").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await runAxe(page, `${lang}/ (calendar drawer)`);
  });

  test(`a11y: ${lang}/habitaciones/ with offers`, async ({ page }) => {
    const params = new URLSearchParams({ ...doubleSoldOutStay(), adults: "2", children: "0" });
    const en = lang === "/en";
    await page.goto(`${lang}/habitaciones/?${params.toString()}&room=king`);
    await expect(
      page
        .getByRole("article", { name: en ? "King room" : "Suite Matrimonial" })
        .getByRole("button", { name: en ? /See rates/ : /Ver tarifas/ }),
    ).toBeVisible();
    await runAxe(page, `${lang}/habitaciones/ (offers)`);
    await selectRoomRate(page, en ? "King room" : "Suite Matrimonial", "Flexible");
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /^(Continuar con|Continue with) / })
        .first(),
    ).toBeVisible();
    for (const title of en
      ? ["Cancellation", "Check-in and check-out", "Breakfast", "Pets", "Paying at the hotel"]
      : ["Cancelación", "Entrada y salida", "Desayuno", "Mascotas", "Pago en el hotel"]) {
      await page.getByRole("button", { name: title, exact: true }).click();
      await expect(page.getByRole("region", { name: title, exact: true })).toBeVisible();
    }
    await runAxe(page, `${lang}/habitaciones/ (rates)`);
  });

  test(`a11y: ${lang}/habitaciones/ with the photo lightbox open`, async ({ page }) => {
    await page.goto(`${lang}/habitaciones/`);
    await page
      .getByRole("button", { name: /: (Abrir|Open) .*2 / })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await runAxe(page, `${lang}/habitaciones/ (lightbox)`);
  });

  test(`a11y: ${lang}/reservar/revisar/ with a quote and contact errors`, async ({ page }) => {
    const params = new URLSearchParams({ ...openStay(), adults: "2", children: "1" });
    await page.goto(`${lang}/reservar/revisar/?${params.toString()}&room=king&plan=flexible`);
    await expect(page.locator('[data-amount="total"]')).toHaveText(/S\//);
    await page.locator("[data-pay-button]").click();
    await expect(page.locator("#fullName")).toHaveAttribute("aria-invalid", "true");
    await runAxe(page, `${lang}/reservar/revisar/`);
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
    await runAxe(page, `${lang}/reservar/revisar/ (terms)`);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-terms]")).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-summary-toggle]").click();
    await runAxe(page, `${lang}/reservar/revisar/ (mobile compact)`);
  });

  test(`a11y: ${lang}/reservar/revisar/ when the room was lost`, async ({ page }) => {
    const params = new URLSearchParams({ ...doubleSoldOutStay(), adults: "2", children: "0" });
    await page.goto(`${lang}/reservar/revisar/?${params.toString()}&room=double&plan=flexible`);
    await expect(page.locator("[data-problem]")).toBeVisible();
    await runAxe(page, `${lang}/reservar/revisar/ (lost)`);
  });

  test(`a11y: ${lang}/habitaciones/ when the search service fails`, async ({ page }) => {
    await page.route(`${LOCAL_API_URL}/public/offers*`, (route) => route.abort());
    const params = new URLSearchParams({ ...openStay(), adults: "2", children: "0" });
    await page.goto(`${lang}/habitaciones/?${params.toString()}`);
    await expect(
      page.getByRole("button", { name: /^(Intentar de nuevo|Try again)$/ }),
    ).toBeVisible();
    await runAxe(page, `${lang}/habitaciones/ (failure)`);
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
    await expect(page.locator("[data-pay-button]")).toBeEnabled();
    await expect(page.locator("[data-security-check]")).toContainText("Security check complete");
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

  test(`a11y: ${lang}/reservar/resumen/ reopened and just confirmed`, async ({ page }) => {
    const stay = openStay();
    await page.route(`${LOCAL_API_URL}/public/reservation`, (route) =>
      route.fulfill({
        headers: { "access-control-allow-origin": "*" },
        contentType: "application/json",
        body: JSON.stringify({
          status: "confirmed",
          code: "AB12CD",
          ...stay,
          nights: 2,
          currency: "PEN",
          fullName: "Ana Torres",
          rooms: [
            {
              roomTypeId: "type-suite-matrimonial",
              name: "Suite Matrimonial",
              adults: 2,
              children: 0,
              nights: [
                { date: stay.checkIn, priceCents: 10000 },
                { date: daysFromToday(121), priceCents: 10000 },
              ],
            },
          ],
          ratePlan: "flexible",
          totalCents: 20000,
          paidCents: 10000,
          outstandingCents: 10000,
          refundDueCents: 0,
          refundedCents: 0,
        }),
      }),
    );
    const title = lang ? "Your reservation is confirmed" : "Su reserva está confirmada";
    await page.goto(`${lang}/reservar/resumen/#${"a".repeat(43)}`);
    await expect(page.getByText("AB12CD")).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
    await runAxe(page, `${lang}/reservar/resumen/`);

    await page.evaluate(() => sessionStorage.setItem("hm.reservation.confirmed", '"AB12CD"'));
    await page.reload();
    await expect(page.getByRole("heading", { name: title })).toBeFocused();
    await runAxe(page, `${lang}/reservar/resumen/ (just confirmed)`);
  });
}
